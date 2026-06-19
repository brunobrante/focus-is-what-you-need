import { useEffect, useState } from "react";
import {
  IconChevronDoubleUp, IconClose, IconExpand, IconMicrophone,
  IconSend, IconSettings, IconSparkles, IconTrash,
} from "@/components/icons";
import { useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";

const MOCK_CONVERSATION = [
  { role: "user" as const, content: "Rewrite the hero headline" },
  { role: "assistant" as const, content: "Here are a few options:\n\n• \"Track, plan, and deliver on time.\"\n• \"One dashboard. Every metric.\"\n• \"Your operations, simplified.\"" },
];

const TAG_LIMIT = 3;

export function AiChatPanel({ onClose }: { onClose: () => void }) {
  const [aiInput, setAiInput] = useState("");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const selectedNodes = useEditorBridge((v) => {
    if (!v) return [];
    return v.state.selectedIds
      .filter((id) => Boolean(v.state.document.elements[id]))
      .map((id) => ({ id, name: v.state.document.elements[id]!.name }));
  }) ?? [];
  const getEditor = useEditorBridgeReader();

  const deselectNode = (nodeId: string) => {
    const editor = getEditor();
    if (!editor) return;
    editor.dispatch({ type: "setSelected", selectedIds: editor.state.selectedIds.filter((id) => id !== nodeId) });
  };

  useEffect(() => {
    if (!recording) { setRecordingSeconds(0); return; }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex h-7 shrink-0 items-center justify-between px-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">AI Chat</span>
        <div className="flex items-center gap-0.5">
          {tagsExpanded && (
            <button
              type="button"
              aria-label="Collapse tags"
              onClick={() => setTagsExpanded(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            >
              <IconChevronDoubleUp />
            </button>
          )}
          <button
            type="button"
            aria-label="AI chat settings"
            className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
          >
            <IconSettings size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Expand conversation"
            className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
          >
            <IconExpand size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Close AI chat"
            onClick={() => { onClose(); setTagsExpanded(false); }}
            className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
          >
            <IconClose size={11} strokeWidth={2} />
          </button>
        </div>
      </div>

      {tagsExpanded ? (
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
          <div className="flex flex-wrap gap-1 pb-1">
            {selectedNodes.map((node) => (
              <span
                key={node.id}
                className="flex items-center gap-1 rounded-md border border-[#2E2E2E] bg-[#252525] py-[3px] pl-2 pr-1"
              >
                <span className="max-w-[120px] truncate text-[11px] text-[#8E8E8E]">{node.name}</span>
                <button
                  type="button"
                  onClick={() => deselectNode(node.id)}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#505050] transition-colors duration-100 hover:text-[#CFCFCF]"
                >
                  <IconClose size={8} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
          <div className="flex flex-col gap-2.5 pb-1">
            {MOCK_CONVERSATION.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {msg.role === "assistant" && (
                  <div className="mr-2 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0D99FF]">
                    <IconSparkles size={10} strokeWidth={1.8} className="text-white" />
                  </div>
                )}
                <div
                  className={[
                    "max-w-[76%] rounded-xl px-3 py-2 text-[11.5px] leading-[1.55]",
                    msg.role === "user"
                      ? "rounded-tr-sm bg-[#2A2A2A] text-[#CFCFCF]"
                      : "rounded-tl-sm bg-transparent text-[#ABABAB]",
                  ].join(" ")}
                >
                  {msg.content.split("\n").map((line, li) => (
                    <span key={li}>
                      {line}
                      {li < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="-mx-2 shrink-0 border-t border-[#252525] px-2 pb-2 pt-2">
        {selectedNodes.length > 0 && !tagsExpanded && (
          <div className="mb-2 flex items-center gap-1 overflow-hidden">
            {selectedNodes.slice(0, TAG_LIMIT).map((node) => (
              <span
                key={node.id}
                className="flex shrink-0 items-center gap-1 rounded-md border border-[#2E2E2E] bg-[#252525] py-[3px] pl-2 pr-1"
              >
                <span className="max-w-[80px] truncate text-[11px] text-[#8E8E8E]">{node.name}</span>
                <button
                  type="button"
                  onClick={() => deselectNode(node.id)}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#505050] transition-colors duration-100 hover:text-[#CFCFCF]"
                >
                  <IconClose size={8} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {selectedNodes.length > TAG_LIMIT && (
              <button
                type="button"
                onClick={() => setTagsExpanded(true)}
                className="shrink-0 rounded-md border border-[#2E2E2E] bg-[#252525] px-2 py-[3px] text-[11px] text-[#505050] transition-colors duration-100 hover:border-[#3A3A3A] hover:text-[#8E8E8E]"
              >
                +{selectedNodes.length - TAG_LIMIT}
              </button>
            )}
          </div>
        )}
        <div className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 transition-colors duration-150 ${recording ? "border-[#5C2020] bg-[#1E1010]" : "border-[#2E2E2E] bg-[#252525]"}`}>
          <style>{`@keyframes ai-wave{0%,100%{transform:scaleY(0.25)}50%{transform:scaleY(1)}}`}</style>
          {recording ? (
            <>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E05555] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E05555]" />
              </span>
              <span className="w-9 shrink-0 text-[11px] tabular-nums text-[#E05555]">
                {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
              </span>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-[2px]">
                {[0.35, 0.7, 0.5, 1, 0.6, 0.85, 0.4, 0.9, 0.55, 0.75, 0.3, 0.65, 0.45].map((h, i) => (
                  <div
                    key={i}
                    className="w-[2px] rounded-full bg-[#B04040]"
                    style={{
                      height: `${Math.round(h * 14)}px`,
                      transformOrigin: "center",
                      animation: `ai-wave ${0.6 + (i % 3) * 0.15}s ease-in-out ${(i * 0.07).toFixed(2)}s infinite`,
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Cancel recording"
                onClick={() => setRecording(false)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#6B3030] transition-colors duration-100 hover:bg-[#3A1818] hover:text-[#E05555]"
              >
                <IconTrash size={12} strokeWidth={1.8} />
              </button>
            </>
          ) : (
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Ask anything..."
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
            />
          )}
          <button
            type="button"
            aria-label={recording ? "Recording active" : "Record voice message"}
            onClick={() => setRecording((r) => !r)}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 ${recording ? "text-[#E05555] hover:bg-[#3A1818]" : "text-[#505050] hover:bg-[#333] hover:text-[#CFCFCF]"}`}
          >
            <IconMicrophone size={12} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Send"
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 ${recording ? "text-[#E05555] hover:bg-[#3A1818] hover:text-[#FF7070]" : "text-[#505050] hover:bg-[#333] hover:text-[#CFCFCF]"}`}
          >
            <IconSend size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
