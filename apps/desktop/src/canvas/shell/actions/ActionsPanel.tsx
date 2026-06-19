import { useState } from "react";
import type { ChecklistOwner } from "@/lib/storage/repos/checklists.repo";
import type { ComponentPickerContext } from "./ComponentPicker";
import type { LibraryMode } from "./LibraryPanel";
import { ChecklistPanel } from "./ChecklistPanel";
import { ComponentPicker } from "./ComponentPicker";
import { LibraryPanel } from "./LibraryPanel";
import { AiChatPanel } from "./AiChatPanel";
import { ActionsMainList } from "./ActionsMainList";

export function ActionsPanel({
  onClose,
  aiMode,
  onAiModeChange,
  checklistOwner,
  componentPicker,
}: {
  onClose?: () => void;
  aiMode: boolean;
  onAiModeChange: (v: boolean) => void;
  checklistOwner: ChecklistOwner | null;
  componentPicker: ComponentPickerContext | null;
}) {
  const [checklistMode, setChecklistMode] = useState(false);
  const [componentsMode, setComponentsMode] = useState(false);
  const [libraryMode, setLibraryMode] = useState<LibraryMode | null>(null);
  const [libraryExpanded, setLibraryExpanded] = useState(false);

  return (
    <div
      className={`group absolute bottom-[calc(100%+4px)] left-1/2 z-50 flex w-[420px] -translate-x-1/2 flex-col rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-2 pb-0 transition-[height] duration-200 ${libraryExpanded ? "h-[500px]" : "h-[264px]"}`}
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 28px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)" }}
    >
      {checklistMode ? (
        <ChecklistPanel
          checklistOwner={checklistOwner}
          onBack={() => setChecklistMode(false)}
        />
      ) : componentsMode ? (
        <ComponentPicker
          componentPicker={componentPicker}
          onBack={() => setComponentsMode(false)}
          onClose={() => { setComponentsMode(false); onClose?.(); }}
        />
      ) : libraryMode ? (
        <LibraryPanel
          mode={libraryMode}
          expanded={libraryExpanded}
          onExpandedChange={setLibraryExpanded}
          onBack={() => { setLibraryMode(null); setLibraryExpanded(false); }}
        />
      ) : aiMode ? (
        <AiChatPanel onClose={() => onAiModeChange(false)} />
      ) : (
        <ActionsMainList
          onOpenAi={() => onAiModeChange(true)}
          onOpenChecklist={() => setChecklistMode(true)}
          onOpenComponents={() => setComponentsMode(true)}
          onOpenLibrary={(mode) => setLibraryMode(mode)}
        />
      )}
    </div>
  );
}
