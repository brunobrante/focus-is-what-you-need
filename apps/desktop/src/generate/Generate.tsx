import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    if (!referenceId) {
      setDiskReference(null);
      setGroupContext(null);
      setReferenceLoading(false);
      return;
    }

    let cancelled = false;
    setDiskReference(null);
    setGroupContext(null);
    setReferenceLoading(true);
    void Promise.all([
      readDiskReference(referenceId),
      readToolReferenceGroupContext(referenceId, requestedGroupId),
    ])
      .then(([reference, context]) => {
        if (cancelled) return;
        setDiskReference(reference);
        setGroupContext(context);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
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

async function readToolReferenceGroupContext(
  referenceId: string,
  requestedGroupId: string | null,
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
  const references = (
    await Promise.all(orderedIds.map((id) => readDiskReference(id)))
  ).filter((reference): reference is ToolReference => reference != null);

  if (references.length === 0) return null;
  return {
    id: group.id,
    name: group.name,
    references,
  };
}
