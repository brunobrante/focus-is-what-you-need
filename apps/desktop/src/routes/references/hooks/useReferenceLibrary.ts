import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  saveReferenceFile,
  removeReferenceFile,
  extFromName,
  extractVideoFrameFull,
  deleteReferenceFrames,
  type ExtractedFrame,
  type StoredRefMeta,
} from "@/lib/tauri/referenceStorage";
import {
  loadReferenceLibrary,
  replaceReferenceLibraryMeta,
  replaceReferenceLibraryGroups,
} from "@/lib/storage/repos/referenceLibrary.repo";
import {
  clearReferenceUrlCache,
  primeReferenceUrl,
} from "@/lib/references/referenceUrlCache";
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
import {
  releaseReferenceItemUrls,
  measureImage,
  measureVideo,
  inferType as inferTypeHelper,
} from "../lib/fileHelpers";
import { loadStackThumbnailBatch } from "../lib/stackHelpers";
import {
  cancelIdle,
  formatDuration,
  newId,
  requestIdle,
  typeOptionsForKind,
} from "../lib/utils";
import type { FramePickerVideo } from "../../import/VideoFramePicker";

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
  const [lightboxItem, setLightboxItem] = useState<ReferenceItem | null>(null);
  const [stackThumbnailUrls, setStackThumbnailUrls] = useState<Record<string, string>>({});
  const [frameVideo, setFrameVideo] = useState<FramePickerVideo | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);

  const libraryRef = useRef<ReferenceItem[]>([]);
  libraryRef.current = library;
  const groupsRef = useRef<ReferenceGroup[]>([]);
  groupsRef.current = groups;
  const stackThumbnailUrlsRef = useRef<Record<string, string>>({});
  stackThumbnailUrlsRef.current = stackThumbnailUrls;

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
      return Boolean(item?.mediaKind === "image" && item.stack?.enabled && !stackThumbnailUrls[id]);
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
            if (next[id]) { URL.revokeObjectURL(url); continue; }
            next[id] = url;
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
    async (video: FramePickerVideo, frames: ExtractedFrame[]) => {
      if (frames.length === 0) return;
      setFrameBusy(true);
      try {
        const baseName = video.name.replace(/\.[^.]+$/, "");
        const now = new Date().toISOString();
        const frameItems: ReferenceItem[] = [];

        for (const frame of frames) {
          const blob = await extractVideoFrameFull(video.id, video.ext, frame.timestamp_ms);
          if (!blob) continue;
          const id = newId();
          let ext: string;
          try {
            ext = await saveReferenceFile(id, blob);
          } catch (err) {
            console.error("[frames] saveReferenceFile failed:", err);
            continue;
          }
          const url = URL.createObjectURL(blob);
          primeReferenceUrl(id, url);
          const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
          frameItems.push({
            id,
            name: `${baseName} — ${formatDuration(frame.timestamp_ms / 1000)}`,
            mediaKind: "image",
            type: inferTypeHelper(`frame.${ext}`),
            w: dims.w,
            h: dims.h,
            size: Math.max(1, Math.round(blob.size / 1024)),
            ext,
            tags: ["image", "frame"],
            added: now,
            url,
          });
        }

        await deleteReferenceFrames(video.id).catch(() => {});
        if (frameItems.length === 0) return;

        // A video owns a single group: extracting frames transforms the video
        // into that group (and folds the video into it, so the catalog shows one
        // card). Re-extracting reuses the same group instead of spawning a new
        // one — the new frames are appended.
        const videoItem = libraryRef.current.find((item) => item.id === video.id) ?? null;
        const existingGroup =
          (videoItem?.groupId
            ? groupsRef.current.find((entry) => entry.id === videoItem.groupId)
            : null) ?? null;

        const group: ReferenceGroup = existingGroup ?? {
          id: newReferenceGroupId(),
          name: baseName || "Video frames",
          referenceIds: [],
          coverReferenceId: null,
          createdAt: now,
          updatedAt: now,
        };
        const memberIds = frameItems.map((item) => item.id);
        const withGroup = frameItems.map((item) => ({ ...item, groupId: group.id }));

        setLibrary((prev) =>
          [...withGroup, ...prev].map((item) =>
            item.id === video.id ? { ...item, groupId: group.id } : item,
          ),
        );
        setGroups((prev) => {
          const base = existingGroup ? prev : [group, ...prev];
          // Frames first (so the cover defaults to a frame, not the video),
          // video last but still a member so it stays accessible for re-extract.
          return addReferencesToGroup(base, group.id, [...memberIds, video.id]);
        });
        setSelectedSubject({ kind: "group", id: group.id });
        setFrameVideo(null);
      } finally {
        setFrameBusy(false);
      }
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
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
    void removeReferenceFile(id);
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
    lightboxItem,
    setLightboxItem,
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
