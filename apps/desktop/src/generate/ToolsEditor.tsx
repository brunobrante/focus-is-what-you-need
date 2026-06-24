import { ToolsEditorView } from "./ToolsEditorView";
import type { ToolReference, ToolReferenceGroupContext } from "./types";

import type { ReferenceAttachment } from "@/lib/storage/schema";

type ToolsEditorProps = {
  item: ToolReference;
  referenceId: string | null;
  groupContext: ToolReferenceGroupContext | null;
  onUploadedLocally: (next: ToolReference) => void;
  linkTarget?: ReferenceAttachment | null;
};

export function ToolsEditor({ item, referenceId, groupContext, onUploadedLocally, linkTarget }: ToolsEditorProps) {
  return (
    <ToolsEditorView
      item={item}
      referenceId={referenceId}
      groupContext={groupContext}
      onUploadedLocally={onUploadedLocally}
      linkTarget={linkTarget}
    />
  );
}

