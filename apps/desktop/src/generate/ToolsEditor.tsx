import { ToolsEditorView } from "./ToolsEditorView";
import type { ToolReference, ToolReferenceGroupContext } from "./types";

type ToolsEditorProps = {
  item: ToolReference;
  referenceId: string | null;
  groupContext: ToolReferenceGroupContext | null;
  onUploadedLocally: (next: ToolReference) => void;
};

export function ToolsEditor({ item, referenceId, groupContext, onUploadedLocally }: ToolsEditorProps) {
  return (
    <ToolsEditorView
      item={item}
      referenceId={referenceId}
      groupContext={groupContext}
      onUploadedLocally={onUploadedLocally}
    />
  );
}

