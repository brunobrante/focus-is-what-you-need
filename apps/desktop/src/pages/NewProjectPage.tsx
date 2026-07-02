import { Link, useSearchParams } from "react-router-dom";
import { IconChevronLeft, IconChevronRight, IconClose, IconUpload } from "@/components/icons";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import { DeviceTypeCard } from "@/pages/shared/DeviceTypeCard";
import { IconGlyph } from "@/components/system/IconGlyph";
import { readFileAsDataUrl } from "@/lib/utils";
import { useNewProject } from "@/application/new-project/useNewProject";
import { SYSTEM_DESIGN_CATEGORIES, CATEGORY_LABEL } from "@/domain/system-design/defaults";
import type {
  ColorToken,
  GradientToken,
  IconToken,
  ImageToken,
  RadiusToken,
  SpacingToken,
  SystemDesignCategory,
  SystemDesignTokens,
  TypeStyleToken,
} from "@/lib/storage/schema";

export function NewProjectPage() {
  const {
    stepId,
    stepIndex,
    totalSteps,
    setType,
    type,
    name,
    setName,
    thumbnailDataUrl,
    setThumbnailDataUrl,
    creating,
    nameRef,
    canNext,
    footerHint,
    next,
    back,
    finalizeProject,
    workspaceName,
    workspaceTokens,
    sharedIds,
    toggleShareToken,
    setCategoryShared,
    setAllShared,
    shareByDefault,
    setShareByDefault,
  } = useNewProject();

  // Close returns where the wizard was opened from: the workspace browser when
  // launched from a workspace (?workspace=<id>), otherwise Home.
  const [searchParams] = useSearchParams();
  const workspaceParam = searchParams.get("workspace");
  const closeHref = workspaceParam ? `/workspace/${workspaceParam}/projects` : "/";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="px-6 pt-[18px]">
        <div className="mb-3.5 flex items-center justify-between text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
          <div>
            <span className="font-medium text-[var(--text)]">New project</span>
            <span>
              {" "}
              · step {stepIndex} of {totalSteps}
            </span>
          </div>
          <Link
            to={closeHref}
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
        {stepId === "type" && <StepType type={type} onSelect={setType} />}
        {stepId === "name" && type && (
          <StepName
            name={name}
            onChange={setName}
            type={type}
            inputRef={nameRef}
            onEnter={() => canNext && void next()}
          />
        )}
        {stepId === "share" && workspaceTokens && (
          <StepShare
            workspaceName={workspaceName}
            tokens={workspaceTokens}
            sharedIds={sharedIds}
            onToggleToken={toggleShareToken}
            onSetCategory={setCategoryShared}
            onSetAll={setAllShared}
            shareByDefault={shareByDefault}
            onSetShareByDefault={setShareByDefault}
          />
        )}
        {stepId === "advanced" && (
          <StepAdvanced
            thumbnailDataUrl={thumbnailDataUrl}
            onThumbnailChange={setThumbnailDataUrl}
          />
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3.5">
        <div className="text-[12px] tracking-[0.2px] text-[var(--text-faint)]">
          <span>Etapa {stepIndex}</span> · <span>{footerHint}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={back} disabled={stepIndex === 1}>
            <IconChevronLeft size={14} strokeWidth={1.8} />
            Back
          </button>
          {stepId === "advanced" ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void finalizeProject(null)}
              disabled={creating}
            >
              Save and skip
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => void next()} disabled={!canNext || creating}>
            <span>{creating ? "Creating…" : stepId === "advanced" ? "Create project" : "Next"}</span>
            <IconChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default NewProjectPage;

function StepType({
  type,
  onSelect,
}: {
  type: ProjectType | null;
  onSelect: (t: ProjectType) => void;
}) {
  const cards: Array<{ value: ProjectType; mock: string }> = [
    { value: "desktop", mock: "desktop" },
    { value: "tablet", mock: "tablet" },
    { value: "mobile", mock: "mobile" },
  ];
  return (
    <section className="w-full max-w-[760px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Which format?</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        Choose the project type. You can adjust dimensions later in the canvas.
      </p>
      <div className="grid grid-cols-3 gap-3.5" role="radiogroup">
        {cards.map((c) => (
          <DeviceTypeCard
            key={c.value}
            type={c.value}
            selected={type === c.value}
            onSelect={() => onSelect(c.value)}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Share step ─────────────────────────────────────────────────────────────

function StepShare({
  workspaceName,
  tokens,
  sharedIds,
  onToggleToken,
  onSetCategory,
  onSetAll,
  shareByDefault,
  onSetShareByDefault,
}: {
  workspaceName: string | null;
  tokens: SystemDesignTokens;
  sharedIds: Set<string>;
  onToggleToken: (id: string) => void;
  onSetCategory: (category: SystemDesignCategory, shared: boolean) => void;
  onSetAll: (shared: boolean) => void;
  shareByDefault: boolean;
  onSetShareByDefault: (value: boolean) => void;
}) {
  const categories = SYSTEM_DESIGN_CATEGORIES.filter(
    (category) => (tokens[category] as { id: string }[]).length > 0,
  );

  return (
    <section className="flex w-full max-w-[760px] flex-col">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Share design tokens</h1>
      <p className="m-0 mb-5 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        Pick which of {workspaceName ? <b className="font-medium text-[var(--text)]">{workspaceName}</b> : "the workspace"}'s
        tokens this project starts with. You can change this anytime in the project's System tab.
      </p>

      <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[13px] text-[var(--text)]">
        <input
          type="checkbox"
          checked={shareByDefault}
          onChange={(e) => onSetShareByDefault(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[var(--text)]"
        />
        <span>
          Share workspace tokens with new projects by default
          <span className="ml-2 text-[12px] text-[var(--text-faint)]">global setting</span>
        </span>
      </label>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] text-[var(--text-faint)]">
          {sharedIds.size} token{sharedIds.size === 1 ? "" : "s"} shared
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onSetAll(true)} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]">
            Select all
          </button>
          <button type="button" onClick={() => onSetAll(false)} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]">
            Clear all
          </button>
        </div>
      </div>

      <div className="flex max-h-[44vh] flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        {categories.map((category) => {
          const list = tokens[category] as { id: string }[];
          const allOn = list.every((t) => sharedIds.has(t.id));
          return (
            <div key={category}>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(e) => onSetCategory(category, e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--text)]"
                />
                {CATEGORY_LABEL[category]}
              </label>
              <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {list.map((token) => (
                  <label
                    key={token.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={sharedIds.has(token.id)}
                      onChange={() => onToggleToken(token.id)}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--text)]"
                    />
                    <ShareTokenVisual category={category} token={token} />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShareTokenVisual({ category, token }: { category: SystemDesignCategory; token: { id: string } }) {
  let swatch: React.ReactNode = null;
  let label = "";
  if (category === "colors") {
    const c = token as ColorToken;
    swatch = <span className="h-5 w-5 shrink-0 rounded border border-white/10" style={{ background: c.value }} />;
    label = c.name;
  } else if (category === "gradients") {
    const g = token as GradientToken;
    swatch = <span className="h-5 w-5 shrink-0 rounded border border-white/10" style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }} />;
    label = g.name;
  } else if (category === "typography") {
    const t = token as TypeStyleToken;
    swatch = <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-[var(--border)] text-[11px]" style={{ fontFamily: t.family, fontWeight: t.weight }}>Aa</span>;
    label = t.name;
  } else if (category === "icons") {
    const ic = token as IconToken;
    swatch = <span className="grid h-5 w-5 shrink-0 place-items-center"><IconGlyph icon={ic} size={15} /></span>;
    label = ic.name;
  } else if (category === "spacing") {
    const s = token as SpacingToken;
    swatch = <span className="grid h-5 w-5 shrink-0 place-items-center"><span className="rounded-[1px] bg-[var(--text-muted)]" style={{ width: Math.min(s.value, 16), height: 5 }} /></span>;
    label = `${s.name} · ${s.value}px`;
  } else if (category === "radius") {
    const r = token as RadiusToken;
    swatch = <span className="h-5 w-5 shrink-0 border border-[var(--border-strong)] bg-[var(--surface-hover)]" style={{ borderRadius: Math.min(r.value, 10) }} />;
    label = r.name;
  } else {
    const img = token as ImageToken;
    swatch = <img src={img.previewUrl} alt="" className="h-5 w-5 shrink-0 rounded border border-[var(--border)] object-cover" />;
    label = img.name;
  }
  return (
    <>
      {swatch}
      <span className="truncate text-[12.5px] text-[var(--text)]">{label}</span>
    </>
  );
}

function StepAdvanced({
  thumbnailDataUrl,
  onThumbnailChange,
}: {
  thumbnailDataUrl: string | null;
  onThumbnailChange: (value: string | null) => void;
}) {
  async function handleFile(file: File | null) {
    if (!file) return;
    onThumbnailChange(await readFileAsDataUrl(file));
  }

  return (
    <section className="w-full max-w-[760px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Advanced Settings</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        Add a thumbnail to identify the project more quickly in the gallery.
      </p>

      <label
        className="group flex min-h-[340px] cursor-pointer flex-col overflow-hidden rounded-[16px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] transition-colors hover:border-[var(--text)]"
        style={{
          background:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 0) 0 0/20px 20px, var(--surface)",
        }}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
        {thumbnailDataUrl ? (
          <div className="relative flex-1">
            <img src={thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onThumbnailChange(null);
              }}
              className="absolute right-4 top-4 inline-flex h-9 items-center rounded-lg border border-[var(--border-strong)] bg-black/75 px-3 text-[12px] text-white backdrop-blur"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center px-8 py-12 text-center">
            <div className="flex max-w-[340px] flex-col items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--bg)] text-[var(--text)]">
                <IconUpload size={22} strokeWidth={1.7} />
              </span>
              <div className="space-y-2">
                <div className="text-[16px] font-semibold text-[var(--text)]">Project thumbnail</div>
                <div className="text-[13px] leading-[1.6] text-[var(--text-muted)]">
                  Use a representative artwork, cover or frame. You can skip this step and come back later using "Save and skip".
                </div>
              </div>
              <span className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[12.5px] font-medium text-[var(--text)]">
                Select image
              </span>
            </div>
          </div>
        )}
      </label>
    </section>
  );
}

function StepName({
  name,
  onChange,
  type,
  inputRef,
  onEnter,
}: {
  name: string;
  onChange: (v: string) => void;
  type: ProjectType;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEnter: () => void;
}) {
  return (
    <section className="w-full max-w-[760px]">
      <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
        Formato:{" "}
        <b className="font-medium text-[var(--text)]">{PROJECT_TYPE_LABEL[type]}</b>
      </div>
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">What will it be called?</h1>
      <p className="m-0 mb-8 text-[14px] leading-[1.5] text-[var(--text-muted)]">
        Give a name to your project. You can rename it anytime.
      </p>
      <div className="flex max-w-[460px] flex-col gap-2">
        <label htmlFor="project-name" className="text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          Project name
        </label>
        <input
          id="project-name"
          ref={inputRef}
          type="text"
          placeholder="Ex: Finance App"
          autoComplete="off"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter();
          }}
          className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
        />
        <span className="mt-1 text-[12px] text-[var(--text-faint)]">
          Recommended: something short and memorable.
        </span>
      </div>
    </section>
  );
}
