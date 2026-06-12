import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ToolReference, ToolReferenceGroupContext } from "./engine/types";
import {
  ensureRootComponent,
  sourceRootComponentId,
} from "./engine/componentModel";
import {
  writeSavedComponents,
  writePrimaryComponentId,
  readDiskReference,
  listReferenceLibraryGroups,
  listReferenceLibraryMeta,
  COMPONENT_STORAGE_PREFIX,
} from "./engine/storage";
import { ToolsEditor } from "./ToolsEditor";
import {
  ToolsLoadingShell,
  ToolsNotFoundShell,
  ToolsEmptyShell,
} from "./ui/EmptyShells";

export function Generate() {
  const [searchParams, setSearchParams] = useSearchParams();
  const referenceId = searchParams.get("id");
  const [localSource, setLocalSource] = useState<ToolReference | null>(null);
  const [diskReference, setDiskReference] = useState<ToolReference | null>(null);
  const [groupContext, setGroupContext] = useState<ToolReferenceGroupContext | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const requestedGroupId = searchParams.get("groupId");
  const diskObjectUrlRef = useRef<string | null>(null);
  // Mirror the latest committed reference/group so the loaders can tell an
  // initial load from an in-place switch without re-subscribing the effects.
  const diskReferenceRef = useRef<ToolReference | null>(null);
  const groupContextRef = useRef<ToolReferenceGroupContext | null>(null);

  useEffect(() => {
    if (!referenceId) {
      revokeObjectUrl(diskObjectUrlRef.current);
      diskObjectUrlRef.current = null;
      diskReferenceRef.current = null;
      setDiskReference(null);
      setReferenceLoading(false);
      return;
    }

    let cancelled = false;
    // Only the first load shows the full-screen shell. Switching between images
    // in a group keeps the current editor (and the group navigator) mounted and
    // swaps the image in place once the new one finishes loading.
    if (diskReferenceRef.current == null) setReferenceLoading(true);
    const previousObjectUrl = diskObjectUrlRef.current;
    void readDiskReference(referenceId)
      .then((reference) => {
        if (cancelled) {
          revokeObjectUrl(reference?.url);
          return;
        }
        revokeObjectUrl(previousObjectUrl);
        diskObjectUrlRef.current = reference?.url?.startsWith("blob:") ? reference.url : null;
        diskReferenceRef.current = reference;
        setDiskReference(reference);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [referenceId]);

  useEffect(() => {
    return () => {
      revokeObjectUrl(diskObjectUrlRef.current);
      diskObjectUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!referenceId) {
      groupContextRef.current = null;
      setGroupContext(null);
      return;
    }

    // Moving between images of the same group must not tear down the navigator:
    // if the current reference already belongs to the loaded group, keep it and
    // let `activeReferenceId` move the highlight. Reload only when the group
    // identity actually changes.
    const current = groupContextRef.current;
    const referenceInCurrent = current?.references.some((entry) => entry.id === referenceId);
    if (current && referenceInCurrent && (requestedGroupId == null || requestedGroupId === current.id)) {
      return;
    }

    let cancelled = false;
    void readToolReferenceGroupContext(referenceId, requestedGroupId).then((context) => {
      if (cancelled) return;
      groupContextRef.current = context;
      setGroupContext(context);
    });

    return () => {
      cancelled = true;
    };
  }, [referenceId, requestedGroupId]);

  const item = referenceId ? diskReference : localSource;

  const handleEmptyUpload = useCallback((next: ToolReference) => {
    writeSavedComponents(
      `${COMPONENT_STORAGE_PREFIX}${next.id}`,
      ensureRootComponent([], next),
    );
    writePrimaryComponentId(
      `${COMPONENT_STORAGE_PREFIX}${next.id}`,
      sourceRootComponentId(next.id),
    );
    setLocalSource(next);
  }, []);

  if (referenceId && referenceLoading) {
    return <ToolsLoadingShell />;
  }
  if (referenceId && !diskReference) {
    return <ToolsNotFoundShell />;
  }
  if (!item) {
    return <ToolsEmptyShell onUpload={handleEmptyUpload} />;
  }

  return (
    <ToolsEditor
      item={item}
      referenceId={referenceId}
      groupContext={referenceId ? groupContext : null}
      onUploadedLocally={(next) => {
        setLocalSource(next);
        setSearchParams({});
      }}
    />
  );
}

function revokeObjectUrl(url: string | null | undefined) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

async function readToolReferenceGroupContext(
  referenceId: string,
  requestedGroupId: string | null,
): Promise<ToolReferenceGroupContext | null> {
  const [groups, metas] = await Promise.all([listReferenceLibraryGroups(), listReferenceLibraryMeta()]);
  const meta = metas.find((entry) => entry.id === referenceId);
  const group =
    (requestedGroupId ? groups.find((entry) => entry.id === requestedGroupId) : null) ??
    (meta?.groupId ? groups.find((entry) => entry.id === meta.groupId) : null) ??
    groups.find((entry) => entry.referenceIds.includes(referenceId));

  if (!group) {
    const entry = meta;
    if (!entry || entry.mediaKind !== "image") return null;
    return {
      id: referenceId,
      name: entry.name,
      references: [{ id: entry.id, name: entry.name, type: entry.type, w: Number(entry.w || 0), h: Number(entry.h || 0), ext: entry.ext }],
    };
  }
  const orderedIds = group.referenceIds.includes(referenceId)
    ? group.referenceIds
    : [referenceId, ...group.referenceIds];
  const metasById = new Map(metas.map((entry) => [entry.id, entry]));
  const references = orderedIds
    .map((id) => {
      const entry = metasById.get(id);
      if (!entry || entry.mediaKind !== "image") return null;
      return {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        w: Number(entry.w || 0),
        h: Number(entry.h || 0),
        ext: entry.ext,
      };
    })
    .filter((reference): reference is ToolReferenceGroupContext["references"][number] => reference != null);

  if (references.length === 0) return null;
  return {
    id: group.id,
    name: group.name,
    references,
  };
}
