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
  readReferenceGroups,
  readRefsMeta,
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

  useEffect(() => {
    if (!referenceId) {
      revokeObjectUrl(diskObjectUrlRef.current);
      diskObjectUrlRef.current = null;
      setDiskReference(null);
      setGroupContext(null);
      setReferenceLoading(false);
      return;
    }

    let cancelled = false;
    revokeObjectUrl(diskObjectUrlRef.current);
    diskObjectUrlRef.current = null;
    setDiskReference(null);
    setGroupContext(null);
    setReferenceLoading(true);
    void readDiskReference(referenceId)
      .then((reference) => {
        if (cancelled) {
          revokeObjectUrl(reference?.url);
          return;
        }
        diskObjectUrlRef.current = reference?.url?.startsWith("blob:") ? reference.url : null;
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
    if (!referenceId || !diskReference) {
      setGroupContext(null);
      return;
    }

    let cancelled = false;
    setGroupContext(null);
    void readToolReferenceGroupContext(referenceId, requestedGroupId, diskReference).then((context) => {
      if (!cancelled) setGroupContext(context);
    });

    return () => {
      cancelled = true;
    };
  }, [diskReference, referenceId, requestedGroupId]);

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
      key={item.id}
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
  activeReference: ToolReference,
): Promise<ToolReferenceGroupContext | null> {
  const [groups, metas] = await Promise.all([readReferenceGroups(), readRefsMeta()]);
  const meta = metas.find((entry) => entry.id === referenceId);
  const group =
    (requestedGroupId ? groups.find((entry) => entry.id === requestedGroupId) : null) ??
    (meta?.groupId ? groups.find((entry) => entry.id === meta.groupId) : null) ??
    groups.find((entry) => entry.referenceIds.includes(referenceId));

  if (!group) return null;
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
        url: entry.id === activeReference.id ? activeReference.url : undefined,
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
