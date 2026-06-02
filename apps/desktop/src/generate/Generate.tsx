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
    void readDiskReference(referenceId)
      .then(async (reference) => {
        const context = reference
          ? await readToolReferenceGroupContext(referenceId, requestedGroupId, reference)
          : null;
        return { reference, context };
      })
      .then(({ reference, context }) => {
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
