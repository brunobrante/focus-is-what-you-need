import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  removeReferenceFile,
  extFromName,
  type ExtractedFrame,
  type StoredRefMeta,
} from "@/lib/tauri/referenceStorage";
import {
  loadReferenceLibrary,
  replaceReferenceLibraryMeta,
  replaceReferenceLibraryGroups,
} from "@/lib/storage/repos/referenceLibrary.repo";
import { removeReferenceLinksForLibraryId } from "@/lib/storage/repos/references.repo";
import { clearReferenceUrlCache } from "@/lib/references/referenceUrlCache";
import { ensureWorkspaceFolders } from "@/lib/tauri/workspace";
import {
  newReferenceGroupId,
  type ReferenceGroup,
} from "@/lib/references/groupTypes";
import type {
  FilterKind,
  FilterSort,
  FilterType,
  ReferenceItem,
  SelectedSubject,
} from "../types";
import {
  applyGroupsToLibrary,
  normalizeGroupsForLibrary,
  addReferencesToGroup,
  removeReferenceFromGroups,
  moveReferenceToGroup,
} from "../lib/groupHelpers";
import { releaseReferenceItemUrls } from "../lib/fileHelpers";
import { loadStackThumbnailBatch } from "../lib/stackHelpers";
import {
  cancelIdle,
  requestIdle,
  typeOptionsForKind,
} from "../lib/utils";
import type { FramePickerVideo } from "../../import/VideoFramePicker";
import { createFrameGroup as createFrameGroupUseCase } from "@/application/references/createFrameGroup";

// A stable signature of the stack state a cached cover was baked from. Drifts when
// the main screen (`primaryComponentId`) or the stack itself (`updatedAt`) changes.
function stackThumbVersion(item: ReferenceItem | undefined): string {
  const stack = item?.stack;
  if (!stack) return "";
  return `${stack.updatedAt ?? ""}~${stack.primaryComponentId ?? ""}`;
}

async function loadLibrary(): Promise<{ items: ReferenceItem[]; groups: ReferenceGroup[] }> {
  await ensureWorkspaceFolders().catch(() => {});
  const { metas, groups } = await loadReferenceLibrary();
  // URLs are resolved lazily on demand (see useReferenceUrl); the catalog renders
  // immediately and each file is only read from disk when its card is shown.
  const items: ReferenceItem[] = metas.map((meta) => ({
    ...meta,
    type: meta.type as ReferenceItem["type"],
    ext: meta.ext || extFromName(meta.name),
    url: "",
  }));
  return { items, groups };
}

function persistMeta(library: ReferenceItem[]): void {
  const metas: StoredRefMeta[] = library.map(({ url: _url, ...rest }) => ({
    ...rest,
    ext: rest.ext ?? extFromName(rest.name),
  }));
  void replaceReferenceLibraryMeta(metas).catch((err) => {
    console.error("[references] failed to persist metadata:", err);
  });
}

export function useReferenceLibrary() {
  const [library, setLibrary] = useState<ReferenceItem[]>([]);
  const [groups, setGroups] = useState<ReferenceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterSort, setFilterSort] = useState<FilterSort>("recent");
  const [selectedSubject, setSelectedSubject] = useState<SelectedSubject>(null);
  const [stackThumbnailUrls, setStackThumbnailUrls] = useState<Record<string, string>>({});
  const [frameVideo, setFrameVideo] = useState<FramePickerVideo | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);

  const libraryRef = useRef<ReferenceItem[]>([]);
  libraryRef.current = library;
  const groupsRef = useRef<ReferenceGroup[]>([]);
  groupsRef.current = groups;
  const stackThumbnailUrlsRef = useRef<Record<string, string>>({});
  stackThumbnailUrlsRef.current = stackThumbnailUrls;
  // The stack identity baked into each cached thumbnail. When a reference's stack
  // changes (e.g. the Builder picks a new main screen), this version drifts and the
  // card thumbnail is regenerated instead of serving the stale cover.
  const stackThumbVersionRef = useRef<Record<string, string>>({});

  useEffect(() => {
    void loadLibrary().then(({ items, groups: storedGroups }) => {
      const libraryWithGroups = applyGroupsToLibrary(items, storedGroups);
      const nextGroups = normalizeGroupsForLibrary(storedGroups, libraryWithGroups);
      setLibrary(libraryWithGroups);
      setGroups(nextGroups);
      setLoading(false);
    });
    return () => {
      clearReferenceUrlCache();
      for (const url of Object.values(stackThumbnailUrlsRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    persistMeta(library);
  }, [library, loading]);

  useEffect(() => {
    if (loading) return;
    void replaceReferenceLibraryGroups(groups).catch((err) => {
      console.error("[references] failed to persist groups:", err);
    });
  }, [groups, loading]);

  useEffect(() => {
    if (!selectedSubject) return;
    if (selectedSubject.kind === "reference") {
      if (!library.some((item) => item.id === selectedSubject.id)) setSelectedSubject(null);
      return;
    }
    if (!groups.some((group) => group.id === selectedSubject.id)) setSelectedSubject(null);
  }, [groups, library, selectedSubject]);

  useEffect(() => {
    if (loading) return;
    const candidateIds = new Set<string>();
    const referencesById = new Map(library.map((item) => [item.id, item]));

    for (const item of library) {
      if (!item.groupId) candidateIds.add(item.id);
    }
    for (const group of groups) {
      const coverId = group.coverReferenceId ?? group.referenceIds[0] ?? null;
      if (coverId) candidateIds.add(coverId);
    }
    const selectedGroup =
      selectedSubject?.kind === "group"
        ? groups.find((g) => g.id === selectedSubject.id)
        : null;
    if (selectedGroup) {
      for (const id of selectedGroup.referenceIds) candidateIds.add(id);
    }

    const missing = Array.from(candidateIds).filter((id) => {
      const item = referencesById.get(id);
      if (!(item?.mediaKind === "image" && item.stack?.enabled)) return false;
      // Reload when there is no cached cover yet, or when the cached cover was baked
      // from an older stack version (a different main screen or a later edit).
      return (
        !stackThumbnailUrls[id] ||
        stackThumbVersionRef.current[id] !== stackThumbVersion(item)
      );
    });
    if (missing.length === 0) return;

    let cancelled = false;
    const run = () => {
      void loadStackThumbnailBatch(missing).then((entries) => {
        if (entries.length === 0) return;
        if (cancelled) {
          for (const [, url] of entries) URL.revokeObjectURL(url);
          return;
        }
        setStackThumbnailUrls((current) => {
          const next = { ...current };
          for (const [id, url] of entries) {
            // Replace a stale cover; revoke the old object URL to avoid a leak.
            if (next[id] && next[id] !== url) URL.revokeObjectURL(next[id]);
            next[id] = url;
            stackThumbVersionRef.current[id] = stackThumbVersion(referencesById.get(id));
          }
          return next;
        });
      });
    };

    const idleId = requestIdle(run);
    return () => {
      cancelled = true;
      cancelIdle(idleId);
    };
  }, [groups, library, loading, selectedSubject, stackThumbnailUrls]);

  const typeOptions = useMemo(() => typeOptionsForKind(filterKind), [filterKind]);

  const groupNameById = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (filterKind !== "all" || filterType !== "all") return [];
    return groups
      .filter((group) => {
        if (!q) return true;
        const hay = `${group.name} ${group.description ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [groups, query, filterKind, filterType]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = library.filter((r) => {
      if (r.groupId) return false;
      if (filterKind !== "all" && r.mediaKind !== filterKind) return false;
      if (filterType !== "all" && r.type !== filterType) return false;
      if (q) {
        const hay = `${r.name} ${(r.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list];
    switch (filterSort) {
      case "old":
        list.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "size":
        list.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      default:
        list.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
    }
    return list;
  }, [library, query, filterKind, filterType, filterSort]);

  const selected = useMemo(
    () =>
      selectedSubject?.kind === "reference"
        ? library.find((item) => item.id === selectedSubject.id) ?? null
        : null,
    [library, selectedSubject],
  );

  const selectedGroup = useMemo(
    () =>
      selectedSubject?.kind === "group"
        ? groups.find((g) => g.id === selectedSubject.id) ?? null
        : null,
    [groups, selectedSubject],
  );

  const selectedGroupReferences = useMemo(() => {
    if (!selectedGroup) return [];
    const referencesById = new Map(library.map((item) => [item.id, item]));
    return selectedGroup.referenceIds
      .map((id) => referencesById.get(id))
      .filter((item): item is ReferenceItem => item != null);
  }, [library, selectedGroup]);

  const looseGroupCandidates = useMemo(
    () =>
      library
        .filter((item) => item.mediaKind === "image" && !item.groupId)
        .sort((a, b) => {
          const delta = Number(Boolean(b.stack?.enabled)) - Number(Boolean(a.stack?.enabled));
          if (delta !== 0) return delta;
          return a.name.localeCompare(b.name);
        }),
    [library],
  );

  const addItems = useCallback(
    (items: ReferenceItem[], targetGroupId?: string | null) => {
      if (items.length === 0) return;
      const resolvedGroupId = targetGroupId ?? null;
      const nextItems = resolvedGroupId
        ? items.map((item) => ({ ...item, groupId: resolvedGroupId }))
        : items;
      setLibrary((prev) => [...nextItems, ...prev]);
      if (resolvedGroupId) {
        setGroups((prev) =>
          addReferencesToGroup(prev, resolvedGroupId, nextItems.map((item) => item.id)),
        );
      }
      if (resolvedGroupId) {
        setSelectedSubject({ kind: "group", id: resolvedGroupId });
      } else if (nextItems[0]) {
        setSelectedSubject({ kind: "reference", id: nextItems[0].id });
      }
    },
    [],
  );

  const addItemsAsGroup = useCallback((items: ReferenceItem[]) => {
    if (items.length === 0) return;
    const now = new Date().toISOString();
    const group: ReferenceGroup = {
      id: newReferenceGroupId(),
      name: "New group",
      referenceIds: [],
      coverReferenceId: null,
      createdAt: now,
      updatedAt: now,
    };
    const withGroup = items.map((item) => ({ ...item, groupId: group.id }));
    setLibrary((prev) => [...withGroup, ...prev]);
    setGroups((prev) =>
      addReferencesToGroup([group, ...prev], group.id, withGroup.map((item) => item.id)),
    );
    setSelectedSubject({ kind: "group", id: group.id });
  }, []);

  const createFrameGroup = useCallback(
    (video: FramePickerVideo, frames: ExtractedFrame[]) =>
      createFrameGroupUseCase(video, frames, {
        libraryRef,
        groupsRef,
        setFrameBusy,
        setLibrary,
        setGroups,
        setSelectedSubject,
        setFrameVideo,
      }),
    [],
  );

  const removeItem = useCallback((id: string, opts?: { keepFile?: boolean }) => {
    setLibrary((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) releaseReferenceItemUrls(item);
      return prev.filter((i) => i.id !== id);
    });
    setGroups((prev) => removeReferenceFromGroups(prev, id));
    setStackThumbnailUrls((current) => {
      const url = current[id];
      if (!url) return current;
      URL.revokeObjectURL(url);
      const { [id]: _removed, ...next } = current;
      return next;
    });
    // Preserve the underlying blob when at least one place kept a detached copy:
    // those copies resolve their image from this id's file (see `detachReference`).
    // The library meta is dropped regardless (persistMeta on the `library` change),
    // so the entry stays out of the gallery — only the orphaned blob lingers.
    if (!opts?.keepFile) void removeReferenceFile(id);
    // The library entry is the single source of truth, so deleting it cascades to
    // every project/screen/component that only links to it (whole image + cuts).
    void removeReferenceLinksForLibraryId(id);
    setSelectedSubject((current) =>
      current?.kind === "reference" && current.id === id ? null : current,
    );
  }, []);

  const updateName = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLibrary((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
    );
  }, []);

  const updateDescription = useCallback((id: string, description: string) => {
    setLibrary((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, description: description.trim() || undefined } : item,
      ),
    );
  }, []);

  const updateTags = useCallback((id: string, tags: string[]) => {
    setLibrary((prev) =>
      prev.map((item) => (item.id === id ? { ...item, tags } : item)),
    );
  }, []);

  const updateSourceUrl = useCallback((id: string, sourceUrl: string) => {
    setLibrary((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, sourceUrl: sourceUrl.trim() || undefined } : item,
      ),
    );
  }, []);

  const updateReferenceGroup = useCallback((id: string, groupId: string | null) => {
    setLibrary((prev) =>
      prev.map((item) => (item.id === id ? { ...item, groupId: groupId || null } : item)),
    );
    setGroups((prev) => moveReferenceToGroup(prev, id, groupId));
  }, []);

  const createGroup = useCallback((input: { name: string; description?: string }) => {
    const now = new Date().toISOString();
    const group: ReferenceGroup = {
      id: newReferenceGroupId(),
      name: input.name,
      description: input.description,
      referenceIds: [],
      coverReferenceId: null,
      createdAt: now,
      updatedAt: now,
    };
    setGroups((prev) => [group, ...prev]);
  }, []);

  const updateGroup = useCallback((groupId: string, input: { name: string; description?: string }) => {
    const now = new Date().toISOString();
    setGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, name: input.name, description: input.description, updatedAt: now }
          : group,
      ),
    );
  }, []);

  const confirmDeleteGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setLibrary((prev) =>
      prev.map((item) => (item.groupId === groupId ? { ...item, groupId: null } : item)),
    );
  }, []);

  return {
    library,
    groups,
    loading,
    query,
    setQuery,
    filterKind,
    setFilterKind,
    filterType,
    setFilterType,
    filterSort,
    setFilterSort,
    typeOptions,
    selectedSubject,
    setSelectedSubject,
    stackThumbnailUrls,
    frameVideo,
    setFrameVideo,
    frameBusy,
    visible,
    visibleGroups,
    groupNameById,
    selected,
    selectedGroup,
    selectedGroupReferences,
    looseGroupCandidates,
    addItems,
    addItemsAsGroup,
    createFrameGroup,
    removeItem,
    updateName,
    updateDescription,
    updateTags,
    updateSourceUrl,
    updateReferenceGroup,
    createGroup,
    updateGroup,
    confirmDeleteGroup,
  };
}
