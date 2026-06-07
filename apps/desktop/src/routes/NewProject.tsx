import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconUpload } from "@/components/icons";
import {
  PROJECT_TYPE_DIMS,
  PROJECT_TYPE_LABEL,
} from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import { readFileAsDataUrl } from "@/lib/utils";
import { createProject } from "@/lib/storage/repos/projects.repo";

const TOTAL_STEPS = 3;

export function NewProject() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => nameRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [step]);

  const finalizeProject = async (thumbnail: string | null) => {
    if (!name.trim() || !type || creating) return;
    setCreating(true);
    try {
      const project = await createProject({
        name: name.trim(),
        type,
        thumbnailDataUrl: thumbnail,
      });
      navigate(`/project/${encodeURIComponent(project.id)}`);
    } finally {
      setCreating(false);
    }
  };

  const next = async () => {
    if (step === 1 && type) {
      setStep(2);
      return;
    }
    if (step === 2 && name.trim()) {
      setStep(3);
      return;
    }
    if (step === 3) {
      await finalizeProject(thumbnailDataUrl);
    }
  };

  const back = () => {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const canNext = (step === 1 ? !!type : step === 2 ? !!name.trim() : true) && !creating;
  const footerHint =
    step === 1
      ? type
        ? `formato: ${PROJECT_TYPE_LABEL[type]}`
        : "select a format"
      : step === 2
        ? name.trim()
          ? "configure final details"
          : "informe um nome"
        : thumbnailDataUrl
          ? "thumbnail pronta"
          : "you can skip this step";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="px-6 pt-[18px]">
        <div className="mb-3.5 flex items-center justify-between text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
          <div>
            <span className="font-medium text-[var(--text)]">New project</span>
            <span>
              {" "}
              · step {step} of {TOTAL_STEPS}
            </span>
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
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </header>

      <main className="grid flex-1 place-items-center px-6 pb-12 pt-8">
        {step === 1 && <StepType type={type} onSelect={setType} />}
        {step === 2 && type && (
          <StepName
            name={name}
            onChange={setName}
            type={type}
            inputRef={nameRef}
            onEnter={() => canNext && void next()}
          />
        )}
        {step === 3 && (
          <StepAdvanced
            thumbnailDataUrl={thumbnailDataUrl}
            onThumbnailChange={setThumbnailDataUrl}
          />
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3.5">
        <div className="text-[12px] tracking-[0.2px] text-[var(--text-faint)]">
          <span>Etapa {step}</span> · <span>{footerHint}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={back} disabled={step === 1}>
            <IconChevronLeft size={14} strokeWidth={1.8} />
            Voltar
          </button>
          {step === 3 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void finalizeProject(null)}
              disabled={creating}
            >
              Save and skip
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => void next()} disabled={!canNext}>
            <span>{creating ? "Creating…" : step === TOTAL_STEPS ? "Create project" : "Next"}</span>
            <IconChevronRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </footer>
    </div>
  );
}

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
          <TypeCard
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
              Remover
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
                  Use a representative artwork, cover or frame. You can skip this step and come back later using “Save and skip”.
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

function TypeCard({
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
        <DeviceMock type={type} />
      </div>
      <div>
        <p className="m-0 text-[15px] font-semibold tracking-[-0.1px]">{PROJECT_TYPE_LABEL[type]}</p>
        <p
          className="mt-0.5 text-[12px] text-[var(--text-faint)]"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
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

function DeviceMock({ type }: { type: ProjectType }) {
  if (type === "desktop") {
    return (
      <div
        className="relative h-20 w-[132px] rounded-md border-[1.5px] border-current"
        style={
          {
            "--after-bg": "currentColor",
          } as React.CSSProperties
        }
      >
        <span className="absolute -bottom-2.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-b bg-current" />
      </div>
    );
  }
  if (type === "tablet") {
    return (
      <div className="relative h-[100px] w-[78px] rounded-lg border-[1.5px] border-current">
        <span className="absolute bottom-1.5 left-1/2 h-0.5 w-[18px] -translate-x-1/2 rounded bg-current" />
      </div>
    );
  }
  return (
    <div className="relative h-[90px] w-[50px] rounded-lg border-[1.5px] border-current">
      <span className="absolute left-1/2 top-1 h-0.5 w-3.5 -translate-x-1/2 rounded bg-current" />
    </div>
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
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Como vai se chamar?</h1>
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
