import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ToolReference } from "./engine/types";
import {
  ensureRootComponent,
  sourceRootComponentId,
} from "./engine/componentModel";
import {
  writeSavedComponents,
  writePrimaryComponentId,
  readDiskReference,
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
  const [referenceLoading, setReferenceLoading] = useState(false);

  useEffect(() => {
    if (!referenceId) {
      setDiskReference(null);
      setReferenceLoading(false);
      return;
    }

    let cancelled = false;
    setDiskReference(null);
    setReferenceLoading(true);
    void readDiskReference(referenceId)
      .then((reference) => {
        if (!cancelled) setDiskReference(reference);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [referenceId]);

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
      onUploadedLocally={(next) => {
        setLocalSource(next);
        setSearchParams({});
      }}
    />
  );
}
