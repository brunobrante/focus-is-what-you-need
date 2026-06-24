import { Link } from "react-router-dom";
import { IconChevronLeft, IconChevronRight, IconClose } from "@/components/icons";
import { useNewWorkspace } from "@/application/new-workspace/useNewWorkspace";

/**
 * Workspace creation wizard, same shape as the project/draft wizards: stepped
 * windows with a progress bar. Steps: name → description (optional).
 */
export function NewWorkspacePage() {
  const {
    stepId,
    stepIndex,
    totalSteps,
    name,
    setName,
    description,
    setDescription,
    creating,
    error,
    nameRef,
    canNext,
    footerHint,
    next,
    back,
  } = useNewWorkspace();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="px-6 pt-[18px]">
        <div className="mb-3.5 flex items-center justify-between text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
          <div>
            <span className="font-medium text-[var(--text)]">New workspace</span>
            <span> · step {stepIndex} of {totalSteps}</span>
          </div>
          <Link
            to="/"
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
        {stepId === "name" && (
          <StepName
            name={name}
            onChange={setName}
            inputRef={nameRef}
            onEnter={() => canNext && void next()}
          />
        )}
        {stepId === "description" && (
          <StepDescription
            name={name}
            description={description}
            onChange={setDescription}
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
              {creating ? "Creating…" : stepId === "description" ? "Create workspace" : "Next"}
            </span>
            <IconChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default NewWorkspacePage;

/* ── Step: name ──────────────────────────────────────────────────────────── */

function StepName({
  name,
  onChange,
  inputRef,
  onEnter,
}: {
  name: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEnter: () => void;
}) {
  return (
    <section className="w-full max-w-[760px]">
      <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
        New workspace
      </div>
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Name your workspace</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        A workspace groups related projects, components, tokens, and references. You
        can rename it anytime.
      </p>
      <div className="flex max-w-[460px] flex-col gap-2">
        <label htmlFor="workspace-name" className="text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          Workspace name
        </label>
        <input
          id="workspace-name"
          ref={inputRef}
          type="text"
          placeholder="Ex: Acme Design"
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

/* ── Step: description ───────────────────────────────────────────────────── */

function StepDescription({
  name,
  description,
  onChange,
}: {
  name: string;
  description: string;
  onChange: (v: string) => void;
}) {
  return (
    <section className="w-full max-w-[760px]">
      <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
        Workspace: <b className="font-medium text-[var(--text)]">{name.trim() || "Untitled"}</b>
      </div>
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Describe it (optional)</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        A short note about what this workspace is for. You can skip this and add it
        later.
      </p>
      <div className="flex max-w-[460px] flex-col gap-2">
        <label htmlFor="workspace-description" className="text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          Description
        </label>
        <textarea
          id="workspace-description"
          autoFocus
          placeholder="Ex: Brand system and product surfaces for Acme."
          value={description}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="resize-none rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
        />
      </div>
    </section>
  );
}
