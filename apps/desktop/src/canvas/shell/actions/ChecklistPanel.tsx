import { useState } from "react";
import { IconChevronLeft, IconClose, IconPlus } from "@/components/icons";
import { useChecklist } from "@/application/checklists/useChecklist";
import type { ChecklistOwner } from "@/lib/storage/repos/checklists.repo";

export function ChecklistPanel({
  checklistOwner,
  onBack,
}: {
  checklistOwner: ChecklistOwner | null;
  onBack: () => void;
}) {
  const { items, addItem, toggleItem, removeItem } = useChecklist(checklistOwner);
  const [input, setInput] = useState("");

  const submit = () => {
    if (!input.trim()) return;
    addItem(input);
    setInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex h-7 shrink-0 items-center justify-between px-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">Checklist</span>
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
        >
          <IconChevronLeft />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-px pb-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-[90ms] hover:bg-[#252525]"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleItem(item.id)}
                className="h-3.5 w-3.5 shrink-0 rounded accent-[#0D99FF]"
              />
              <span className={`min-w-0 flex-1 truncate text-[12px] ${item.checked ? "text-[#555] line-through" : "text-[#CFCFCF]"}`}>
                {item.label}
              </span>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => removeItem(item.id)}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-[#505050] opacity-0 transition-all duration-100 hover:text-[#E4A1A1] group-hover:opacity-100"
              >
                <IconClose size={9} strokeWidth={2} />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-[#555]">No items yet.</div>
          )}
        </div>
      </div>

      <div className="-mx-2 shrink-0 border-t border-[#252525] px-2 pb-2 pt-2">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2E2E2E] bg-[#252525] px-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Add item..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
          />
          <button
            type="button"
            aria-label="Add item"
            onClick={submit}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#505050] transition-colors duration-100 hover:bg-[#333] hover:text-[#CFCFCF]"
          >
            <IconPlus size={12} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
