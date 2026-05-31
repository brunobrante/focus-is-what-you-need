import { useEffect, useRef, useState, type ReactNode } from "react";

type Role = "user" | "assistant";
type Message = {
  id: string;
  role: Role;
  text: string;
  ts: string;
  context?: string[];
};

const SEED: Message[] = [
  {
    id: "m1",
    role: "assistant",
    text:
      Hi! I can help iterate on this component — suggest variations, write copy, or review the hierarchy. What would you like to do?,
    ts: "agora",
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  componentName?: string;
  screenName?: string;
};

export function Chat({ open, onClose, componentName, screenName }: Props) {
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [draft]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    const ctx = componentName ? [componentName] : screenName ? [screenName] : [];
    setMessages((m) => [
      ...m,
      {
        id: "m" + Date.now(),
        role: "user",
        text,
        ts: "agora",
        context: ctx.length ? ctx : undefined,
      },
    ]);
    setDraft("");
    setThinking(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: "m" + (Date.now() + 1),
          role: "assistant",
          ts: "agora",
          text:
            Cool — here are three variations to explore. I can apply one directly to the canvas or just list the diffs?,
        },
      ]);
      setThinking(false);
    }, 1100);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!open) return null;

  const canSend = draft.trim().length > 0;

  return (
    <>
      <style>{`
        @keyframes chat-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
      <aside
        aria-label="Chat"
        className="pointer-events-auto flex h-full w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] text-[#F2F2F2]"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
      >
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2C2C2C] bg-[#141414] pl-3.5 pr-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] text-[#0E0A1A]"
              style={{ background: "linear-gradient(135deg, #C49BFF 0%, #7E5BF2 100%)" }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l4 4-4 4-4-4 4-4z" />
                <path d="M12 13l4 4-4 4-4-4 4-4z" />
              </svg>
            </span>
            <span
              className="text-[13px] font-semibold text-[#F2F2F2]"
              style={{ letterSpacing: "0.1px" }}
            >
              Assistente
            </span>
            <span
              className="ml-0.5 text-[10.5px] uppercase text-[#6B6B6B]"
              style={{ letterSpacing: "0.4px" }}
            >
              · beta
            </span>
          </div>
          <div className="flex items-center gap-1">
            <IconBtn
              ariaLabel="New conversation"
              title="New conversation"
              onClick={() => {
                setMessages(SEED);
                setDraft("");
                setThinking(false);
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 11-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
            </IconBtn>
            <IconBtn ariaLabel="Close chat" onClick={onClose}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </IconBtn>
          </div>
        </div>

        {/* Context bar */}
        {(componentName || screenName) && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-[#2C2C2C] bg-[#141414] px-3.5 py-2 text-[11.5px] text-[#9A9A9A]">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="text-[#6B6B6B]">contexto</span>
            <span
              className="truncate font-medium"
              style={{ color: componentName ? "#D7C2FF" : "#F2F2F2" }}
            >
              {componentName || screenName}
            </span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto py-2">
          {messages.map((m) => (
            <ChatMessage key={m.id} msg={m} />
          ))}
          {thinking ? <ChatTyping /> : null}
        </div>

        {/* Quick suggestions */}
        {messages.length <= 1 && !thinking ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 px-3.5 pb-2">
            {["Suggest 3 variations", "Review hierarchy", "Write CTA copy"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(s)}
                className="cursor-pointer rounded-full border border-[#2C2C2C] bg-[#1E1E1E] px-2.5 py-[5px] text-[11.5px] text-[#CFCFCF]"
                style={{ letterSpacing: "0.2px" }}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {/* Composer */}
        <div className="shrink-0 border-t border-[#2C2C2C] bg-[#141414] p-2.5">
          <div className="flex flex-col gap-2 rounded-lg border border-[#2C2C2C] bg-[#1E1E1E] px-2.5 py-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Ask or request a change${componentName ? " em " + componentName : ""}…`}
              rows={1}
              className="min-h-[22px] w-full resize-none border-0 bg-transparent p-0 text-[13.5px] leading-[1.5] text-[#F2F2F2] outline-none"
              style={{ maxHeight: 160 }}
            />
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1">
                <IconBtn ariaLabel="Anexar" title="Anexar contexto" size={24}>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                </IconBtn>
                <button
                  type="button"
                  className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[5px] border border-[#2C2C2C] bg-transparent px-2 text-[11px] text-[#9A9A9A]"
                  style={{ letterSpacing: "0.2px" }}
                >
                  Sonnet 4.5
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                aria-label="Send"
                className="grid h-6 w-7 place-items-center rounded-[5px] border-0 transition-colors duration-100"
                style={{
                  background: canSend ? "#F2F2F2" : "#2A2A2A",
                  color: canSend ? "#171717" : "#6B6B6B",
                  cursor: canSend ? "pointer" : "default",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
          <div
            className="mt-1.5 flex justify-between text-[10.5px] text-[#6B6B6B]"
            style={{ letterSpacing: "0.2px" }}
          >
            <span>
              <Kbd>Enter</Kbd> envia · <Kbd>Shift+Enter</Kbd> nova linha
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className="flex flex-row gap-2.5 px-3.5 py-2.5">
      <ChatAvatar role={msg.role} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          className="flex items-baseline gap-2 text-[11.5px] text-[#9A9A9A]"
          style={{ letterSpacing: "0.2px" }}
        >
          <span
            className="font-semibold"
            style={{ color: isUser ? "#CFCFCF" : "#D7C2FF" }}
          >
            {isUser ? "You" : "Assistant"}
          </span>
          <span className="text-[10.5px] text-[#6B6B6B]">{msg.ts}</span>
        </div>
        <div className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.55] text-[#E8E8E8]">
          {msg.text}
        </div>
        {msg.context ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {msg.context.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded border border-[#2C2C2C] bg-[#1E1E1E] px-1.5 py-0.5 text-[11px] text-[#9A9A9A]"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatTyping() {
  return (
    <div className="flex gap-2.5 px-3.5 py-2">
      <ChatAvatar role="assistant" />
      <div className="flex h-[22px] items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full bg-[#7A7A7A]"
            style={{ animation: `chat-dot 1.2s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

function ChatAvatar({ role }: { role: Role }) {
  if (role === "user") {
    return (
      <div
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#383838] bg-[#2A2A2A] text-[11px] font-semibold text-[#CFCFCF]"
        style={{ letterSpacing: "0.3px" }}
      >
        VC
      </div>
    );
  }
  return (
    <div
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#0E0A1A]"
      style={{ background: "linear-gradient(135deg, #C49BFF 0%, #7E5BF2 100%)" }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l4 4-4 4-4-4 4-4z" />
        <path d="M12 13l4 4-4 4-4-4 4-4z" />
      </svg>
    </div>
  );
}

function IconBtn({
  ariaLabel,
  title,
  onClick,
  size = 26,
  children,
}: {
  ariaLabel: string;
  title?: string;
  onClick?: () => void;
  size?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className="grid cursor-pointer place-items-center rounded-[5px] border border-[#2C2C2C] bg-transparent text-[#9A9A9A] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[var(--text)]"
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-block rounded-[3px] border border-[#2C2C2C] bg-[#1E1E1E] px-1 text-[10px] text-[#9A9A9A]"
      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.2px" }}
    >
      {children}
    </span>
  );
}
