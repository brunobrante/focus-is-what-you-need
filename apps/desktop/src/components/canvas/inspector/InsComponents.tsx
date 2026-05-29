import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type CommitResult = boolean | void;

export function updateNumber(value: string, commit: (value: number) => void): boolean {
  if (value.trim() === "") return false;
  const next = Number(value);
  if (!Number.isFinite(next)) return false;
  commit(next);
  return true;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useDeferredCommitField(value: string, onChange: (v: string) => CommitResult) {
  const [draftValue, setDraftValueState] = useState(value);
  const draftValueRef = useRef(value);
  const committedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  committedValueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    draftValueRef.current = value;
    setDraftValueState(value);
  }, [value]);

  const setDraftValue = useCallback((nextValue: string) => {
    draftValueRef.current = nextValue;
    setDraftValueState(nextValue);
  }, []);

  const commitDraft = useCallback(() => {
    const draft = draftValueRef.current;
    const committed = committedValueRef.current;
    if (draft === committed) return;
    const result = onChangeRef.current(draft);
    if (result === false) {
      draftValueRef.current = committed;
      setDraftValueState(committed);
    }
  }, []);

  const resetDraft = useCallback(() => {
    const committed = committedValueRef.current;
    draftValueRef.current = committed;
    setDraftValueState(committed);
  }, []);

  return { draftValue, setDraftValue, commitDraft, resetDraft };
}

export function useCommitOnOutsideInteraction<T extends HTMLElement>(
  ref: { current: T | null },
  commitDraft: () => void,
) {
  useEffect(() => {
    const ownerDocument = globalThis.document;
    if (!ownerDocument) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const element = ref.current;
      const target = event.target;
      if (element && target instanceof Node && element.contains(target)) return;
      commitDraft();
    };
    const handleWindowBlur = () => commitDraft();

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("blur", handleWindowBlur);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("blur", handleWindowBlur);
      commitDraft();
    };
  }, [commitDraft, ref]);
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-5 text-center">
      <div className="text-[13px] font-medium text-[#F2F2F2]">{title}</div>
      <div className="mt-1 text-[11.5px] leading-5 text-[#6B6B6B]">{body}</div>
    </div>
  );
}

export function Readout({ label, value }: { label: string; value: string }) {
  return (
    <InsRow label={label}>
      <div className="h-7 min-w-0 flex-1 truncate rounded-md border border-[#2C2C2C] bg-[#141414] px-2 py-[6px] text-[12px] text-[#9A9A9A]">
        {value}
      </div>
    </InsRow>
  );
}

export function InsSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#2C2C2C]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3.5 py-3 text-[11px] font-medium uppercase text-[#9A9A9A]"
        style={{ letterSpacing: "0.4px" }}
      >
        <span>{title}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="transition-transform duration-[120ms]"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">{children}</div> : null}
    </div>
  );
}

export function InsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="grid min-w-0 items-center gap-2"
      style={{ gridTemplateColumns: "60px minmax(0, 1fr)" }}
    >
      <span className="truncate text-[11px] text-[#9A9A9A]" style={{ letterSpacing: "0.2px" }}>
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

export function InsInput({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: string;
  onChange: (v: string) => CommitResult;
  placeholder?: string;
  suffix?: string;
}) {
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(value, onChange);
  useCommitOnOutsideInteraction(inputWrapperRef, commitDraft);

  return (
    <div
      ref={inputWrapperRef}
      className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2"
    >
      <input
        type="text"
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
          else if (e.key === "Escape") { e.preventDefault(); resetDraft(); }
        }}
        placeholder={placeholder}
        className="w-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#F2F2F2] outline-none placeholder:text-[#6B6B6B]"
        style={{ fontFeatureSettings: '"tnum"' }}
      />
      {suffix ? <span className="ml-1 text-[10.5px] text-[#6B6B6B]">{suffix}</span> : null}
    </div>
  );
}

export function InsTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => CommitResult;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { draftValue, setDraftValue, commitDraft, resetDraft } = useDeferredCommitField(value, onChange);
  useCommitOnOutsideInteraction(textareaRef, commitDraft);

  return (
    <textarea
      ref={textareaRef}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commitDraft(); }
        else if (event.key === "Escape") { event.preventDefault(); resetDraft(); }
      }}
      rows={3}
      className="min-h-[72px] w-full resize-none rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2 py-1.5 text-[12px] leading-5 text-[#F2F2F2] outline-none"
    />
  );
}

export function InsColor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colorInputValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <>
      <label
        className="relative h-[22px] w-[22px] shrink-0 cursor-pointer overflow-hidden rounded-[5px] border border-[#2C2C2C]"
        style={{ background: value }}
      >
        <input
          type="color"
          value={colorInputValue}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <InsInput
        value={value.toUpperCase().replace("#", "")}
        onChange={(v) => onChange("#" + v.replace("#", ""))}
      />
    </>
  );
}

export function InsSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full min-w-0 flex-1 rounded-md border border-[#2C2C2C] bg-[#1E1E1E] px-2 text-[12px] text-[#F2F2F2] outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export function InsToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-0.5 overflow-hidden rounded-md border border-[#2C2C2C] bg-[#1E1E1E] p-0.5">
      {options.map((o) => {
        const isActive = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="h-[22px] min-w-0 flex-1 cursor-pointer truncate rounded border-0 text-[11px]"
            style={{
              letterSpacing: "0.2px",
              background: isActive ? "#383838" : "transparent",
              color: isActive ? "#FFFFFF" : "#9A9A9A",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function InsMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-0.5 overflow-hidden rounded-md border border-[#2C2C2C] bg-[#1E1E1E] p-0.5">
      {options.map((option) => {
        const isActive = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              const next = isActive
                ? value.filter((item) => item !== option.value)
                : [...value, option.value];
              onChange(next);
            }}
            className="h-[22px] min-w-0 flex-1 cursor-pointer truncate rounded border-0 text-[11px]"
            style={{
              letterSpacing: "0.2px",
              background: isActive ? "rgba(13,153,255,0.18)" : "transparent",
              color: isActive ? "#B9E1FF" : "#9A9A9A",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InsSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        "flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border px-2 transition-colors duration-[100ms]",
        checked
          ? "border-[#0D99FF]/50 bg-[#0D99FF]/15 text-[#F2F2F2]"
          : "border-[#2C2C2C] bg-[#1E1E1E] text-[#9A9A9A]",
      ].join(" ")}
    >
      <span className="truncate text-[11.5px] font-medium">{label}</span>
      <span
        aria-hidden
        className={[
          "relative h-4 w-7 shrink-0 rounded-full transition-colors duration-[100ms]",
          checked ? "bg-[#0D99FF]" : "bg-[#383838]",
        ].join(" ")}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-[100ms]"
          style={{ transform: checked ? "translateX(13px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  );
}
