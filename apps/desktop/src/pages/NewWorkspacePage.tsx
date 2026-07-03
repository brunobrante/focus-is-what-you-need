import { useNewWorkspace } from "@/application/new-workspace/useNewWorkspace";
import { WizardHeader, WizardFooter } from "@/pages/shared/WizardChrome";

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
      <WizardHeader
        title="New workspace"
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        closeHref="/"
      />

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

      <WizardFooter
        stepIndex={stepIndex}
        footerHint={footerHint}
        error={error}
        onBack={back}
        onNext={() => void next()}
        nextDisabled={!canNext}
        primaryLabel={creating ? "Creating…" : stepId === "description" ? "Create workspace" : "Next"}
      />
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
