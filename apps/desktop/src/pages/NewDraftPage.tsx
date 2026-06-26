import { Link } from "react-router-dom";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconFrame,
  IconDiamond,
} from "@/components/icons";
import { PROJECT_TYPE_DIMS, PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import { DeviceMockTile } from "@/pages/shared/DeviceMockTile";
import { useNewDraft, type DraftKind } from "@/application/new-draft/useNewDraft";

/**
 * NewDraftPage — the "add draft" wizard, sibling to the "add project" flow.
 * A draft is a loose, project-less screen or component created from Home; on
 * finalize it opens straight in the global canvas (by variant, no project).
 * Steps: kind → (device | size) → name.
 */
export function NewDraftPage() {
  const {
    stepId,
    stepIndex,
    totalSteps,
    kind,
    setKind,
    device,
    setDevice,
    width,
    height,
    setWidth,
    setHeight,
    name,
    setName,
    creating,
    error,
    nameRef,
    canNext,
    footerHint,
    next,
    back,
  } = useNewDraft();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="px-6 pt-[18px]">
        <div className="mb-3.5 flex items-center justify-between text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
          <div>
            <span className="font-medium text-[var(--text)]">New draft</span>
            <span>
              {" "}
              · step {stepIndex} of {totalSteps}
            </span>
          </div>
          <Link
            to="/drafts"
            aria-label="Close"
            className="inline-grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-[var(--border)] bg-transparent text-[var(--text-muted)] no-underline hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <IconClose size={14} strokeWidth={1.6} />
          </Link>
        </div>
        <div className="h-[3px] overflow-hidden rounded-[2px] bg-[#1A1A1A]">
          <div
            className="h-full rounded-[2px] bg-[var(--text)] transition-[width] duration-[320ms] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ width: `${(stepIndex / totalSteps) * 100}%` }}
          />
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-6 pb-12 pt-8">
        {stepId === "kind" && <StepKind kind={kind} onSelect={setKind} />}
        {stepId === "device" && <StepDevice device={device} onSelect={setDevice} />}
        {stepId === "size" && (
          <StepSize
            width={width}
            height={height}
            onWidth={setWidth}
            onHeight={setHeight}
            onEnter={() => canNext && void next()}
          />
        )}
        {stepId === "name" && (
          <StepName
            name={name}
            onChange={setName}
            kind={kind}
            inputRef={nameRef}
            onEnter={() => canNext && void next()}
          />
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3.5">
        <div className="text-[12px] tracking-[0.2px] text-[var(--text-faint)]">
          {error ? (
            <span className="text-[var(--danger,#e5484d)]">{error}</span>
          ) : (
            <>
              <span>Step {stepIndex}</span> · <span>{footerHint}</span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={back}
            disabled={stepIndex === 1}
          >
            <IconChevronLeft size={14} strokeWidth={1.8} />
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void next()}
            disabled={!canNext}
          >
            <span>
              {creating ? "Creating…" : stepId === "name" ? "Create draft" : "Next"}
            </span>
            <IconChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default NewDraftPage;

/* ── Step: kind ──────────────────────────────────────────────────────────── */

function StepKind({
  kind,
  onSelect,
}: {
  kind: DraftKind | null;
  onSelect: (k: DraftKind) => void;
}) {
  return (
    <section className="w-full max-w-[640px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">
        What are you drafting?
      </h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        A draft lives outside any project or workspace. Start a full screen or a
        single component — you can always build more inside it.
      </p>
      <div className="grid grid-cols-2 gap-3.5" role="radiogroup">
        <KindCard
          selected={kind === "screen"}
          onSelect={() => onSelect("screen")}
          icon={<IconFrame size={26} strokeWidth={1.5} />}
          title="Screen"
          description="A top-level frame at a device size."
        />
        <KindCard
          selected={kind === "component"}
          onSelect={() => onSelect("component")}
          icon={<IconDiamond size={24} strokeWidth={1.5} />}
          title="Component"
          description="A free-size frame you set yourself."
        />
      </div>
    </section>
  );
}

function KindCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "relative flex cursor-pointer flex-col gap-4 rounded-[14px] border bg-[var(--surface)] px-5 pb-5 pt-[22px] text-left text-inherit transition-[border-color,background] duration-[100ms]",
        selected
          ? "border-[var(--text)] bg-[#232323]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]",
      ].join(" ")}
    >
      <div
        className={[
          "grid h-[120px] place-items-center rounded-[10px] border border-[var(--border)] bg-[#161616]",
          selected ? "text-[var(--text)]" : "text-[var(--text-muted)]",
        ].join(" ")}
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      >
        {icon}
      </div>
      <div>
        <p className="m-0 text-[15px] font-semibold tracking-[-0.1px]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">{description}</p>
      </div>
      <span
        aria-hidden
        className={[
          "absolute right-3.5 top-3.5 grid h-[18px] w-[18px] place-items-center rounded-full border bg-[#161616]",
          selected
            ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
            : "border-[var(--border-strong)]",
        ].join(" ")}
      >
        <IconCheck size={10} strokeWidth={3} className={selected ? "opacity-100" : "opacity-0"} />
      </span>
    </button>
  );
}

/* ── Step: device (screen) ───────────────────────────────────────────────── */

function StepDevice({
  device,
  onSelect,
}: {
  device: ProjectType | null;
  onSelect: (t: ProjectType) => void;
}) {
  const types: ProjectType[] = ["desktop", "tablet", "mobile"];
  return (
    <section className="w-full max-w-[760px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Which device?</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        A screen's size is fixed when it's created. Pick the device frame.
      </p>
      <div className="grid grid-cols-3 gap-3.5" role="radiogroup">
        {types.map((t) => (
          <DeviceCard
            key={t}
            type={t}
            selected={device === t}
            onSelect={() => onSelect(t)}
          />
        ))}
      </div>
    </section>
  );
}

function DeviceCard({
  type,
  selected,
  onSelect,
}: {
  type: ProjectType;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "relative flex cursor-pointer flex-col gap-4 rounded-[14px] border bg-[var(--surface)] px-5 pb-5 pt-[22px] text-left text-inherit transition-[border-color,background] duration-[100ms]",
        selected
          ? "border-[var(--text)] bg-[#232323]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]",
      ].join(" ")}
    >
      <DeviceMockTile type={type} selected={selected} />
      <div>
        <p className="m-0 text-[15px] font-semibold tracking-[-0.1px]">{PROJECT_TYPE_LABEL[type]}</p>
        <p className="mt-0.5 text-[12px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
          {PROJECT_TYPE_DIMS[type]}
        </p>
      </div>
      <span
        aria-hidden
        className={[
          "absolute right-3.5 top-3.5 grid h-[18px] w-[18px] place-items-center rounded-full border bg-[#161616]",
          selected
            ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
            : "border-[var(--border-strong)]",
        ].join(" ")}
      >
        <IconCheck size={10} strokeWidth={3} className={selected ? "opacity-100" : "opacity-0"} />
      </span>
    </button>
  );
}

/* ── Step: size (component) ──────────────────────────────────────────────── */

function StepSize({
  width,
  height,
  onWidth,
  onHeight,
  onEnter,
}: {
  width: string;
  height: string;
  onWidth: (v: string) => void;
  onHeight: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <section className="w-full max-w-[760px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Frame size</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        Set the component's frame in pixels. This is the surface you'll paint on.
      </p>
      <div className="flex items-end gap-3">
        <SizeField label="Width" value={width} onChange={onWidth} onEnter={onEnter} />
        <span className="pb-2.5 text-[16px] text-[var(--text-faint)]">×</span>
        <SizeField label="Height" value={height} onChange={onHeight} onEnter={onEnter} />
        <span className="pb-2.5 text-[12px] text-[var(--text-faint)]">px</span>
      </div>
    </section>
  );
}

function SizeField({
  label,
  value,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="flex w-[140px] flex-col gap-2">
      <label className="text-[12px] tracking-[0.2px] text-[var(--text-muted)]">{label}</label>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] focus:border-[var(--text)]"
      />
    </div>
  );
}

/* ── Step: name ──────────────────────────────────────────────────────────── */

function StepName({
  name,
  onChange,
  kind,
  inputRef,
  onEnter,
}: {
  name: string;
  onChange: (v: string) => void;
  kind: DraftKind | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEnter: () => void;
}) {
  const label = kind === "component" ? "Component" : "Screen";
  return (
    <section className="w-full max-w-[760px]">
      <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
        Draft: <b className="font-medium text-[var(--text)]">{label}</b>
      </div>
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">What's it called?</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        Give your draft a name. You can rename it anytime.
      </p>
      <div className="flex max-w-[460px] flex-col gap-2">
        <label htmlFor="draft-name" className="text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          Draft name
        </label>
        <input
          id="draft-name"
          ref={inputRef}
          type="text"
          placeholder="Ex: Checkout sketch"
          autoComplete="off"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter();
          }}
          className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
        />
      </div>
    </section>
  );
}
