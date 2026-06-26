import { useEffect, useRef, useState } from "react";
import { PROJECT_TYPE_DIMS, PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectRow, ScreenRow } from "@/lib/storage/schema";
import { updateProject } from "@/lib/storage/repos/projects.repo";
import { IconClose } from "@/components/icons";
import { useProjectElementDefaults } from "@/application/settings/useScopedElementDefaults";
import { ElementDefaultsEditor } from "@/canvas/settings/ElementDefaultsEditor";
import { useWorkspaces } from "@/lib/storage/hooks";
import { readFileAsDataUrl } from "@/lib/utils";
import { projectLogoColor } from "./utils";

const ICON_EMOJIS = [
  "🚀", "🎨", "📱", "💼", "🛍️", "🏠", "🎯", "⚡",
  "🌿", "🔧", "💡", "🎪", "📊", "🌈", "🔮", "🎭",
  "🏪", "🍎", "🎵", "📷", "🎮", "🌍", "💰", "🎓",
];

function emojiToDataUrl(emoji: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "80px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 60, 65);
  return canvas.toDataURL("image/png");
}

// The emoji → PNG data-URL mapping is constant, but each encode allocates a
// canvas + toDataURL. Bake all 24 once (lazily, on first use) instead of on
// every panel render / keystroke (UI-6).
let emojiIconUrlsCache: ReadonlyArray<readonly [string, string]> | null = null;
function emojiIconUrls(): ReadonlyArray<readonly [string, string]> {
  if (!emojiIconUrlsCache) {
    emojiIconUrlsCache = ICON_EMOJIS.map((emoji) => [emoji, emojiToDataUrl(emoji)] as const);
  }
  return emojiIconUrlsCache;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[15px] font-semibold tracking-[-0.2px] text-[var(--text)]">{title}</h2>
      <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

/**
 * Full-page project editor. It opens in place of the project overview and tabs
 * (everything below the breadcrumb header), so editing feels like a dedicated
 * page without any routing. The body stacks two sections: project details and
 * the canvas element defaults for this project's scope.
 */
export function ProjectEditPanel({
  project,
  screens,
  onClose,
  onSaved,
}: {
  project: ProjectRow;
  screens: ScreenRow[];
  onClose: () => void;
  onSaved: (project: ProjectRow) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [previewScreenId, setPreviewScreenId] = useState(project.previewScreenId ?? "");
  // icon: emoji data url — undefined means unchanged
  const [pendingIcon, setPendingIcon] = useState<string | null | undefined>(undefined);
  // thumbnail: project cover image — undefined means unchanged
  const [pendingThumb, setPendingThumb] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  // Element defaults inherit from the workspace (or Global) and are saved on edit,
  // independent of the Save button — same scoped model the old tab used.
  const { inherited, override, save: saveElementDefaults } = useProjectElementDefaults(project.id);
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.projectIds.includes(project.id)) ?? null;
  const parentLabel = workspace ? `${workspace.name} (workspace)` : "Global";

  const logoColor = projectLogoColor(project.name);
  const initial = project.name[0]?.toUpperCase() ?? "P";
  const currentIcon = pendingIcon === undefined ? project.icon : pendingIcon;
  const currentThumb = pendingThumb === undefined ? project.thumbnailDataUrl : pendingThumb;

  useEffect(() => {
    const t1 = window.setTimeout(() => setVisible(true), 10);
    const t2 = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  function handleThumbFile(file: File) {
    readFileAsDataUrl(file)
      .then((dataUrl) => setPendingThumb(dataUrl))
      .catch(() => setPendingThumb(null));
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const patch: Parameters<typeof updateProject>[1] = {
        name: name.trim(),
        description: description.trim() || null,
        previewScreenId: previewScreenId || null,
      };
      if (pendingIcon !== undefined) patch.icon = pendingIcon;
      if (pendingThumb !== undefined) patch.thumbnailDataUrl = pendingThumb;
      const updated = await updateProject(project.id, patch);
      if (updated) {
        onSaved(updated);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = PROJECT_TYPE_LABEL[project.type];
  const typeDims = PROJECT_TYPE_DIMS[project.type];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
        transition: "opacity 160ms ease, transform 160ms ease",
      }}
    >
      {/* Sticky action header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-7 py-3">
        <span className="text-[13px] font-medium text-[var(--text)]">Edit project</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving}
            className="btn btn-primary"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[880px] flex-col gap-9 px-7 py-9">

          {/* Section: Details */}
          <section className="flex flex-col gap-6">
            <SectionHeading
              title="Details"
              subtitle="Identity, icon, and preview for this project."
            />
            <div className="grid gap-8 md:grid-cols-[260px_1fr]">
              {/* Left: Icon + thumbnail */}
              <div className="flex flex-col gap-5 md:border-r md:border-[var(--border)] md:pr-8">
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Icon</span>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-[48px] w-[48px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-[20px] font-semibold text-white"
                      style={{ background: currentIcon ? undefined : logoColor }}
                    >
                      {currentIcon ? (
                        <img src={currentIcon} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initial
                      )}
                    </div>
                    {currentIcon && (
                      <button
                        type="button"
                        onClick={() => setPendingIcon(null)}
                        className="text-[11px] text-[var(--text-faint)] underline underline-offset-2 hover:text-[var(--text-muted)]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {emojiIconUrls().map(([emoji, dataUrl]) => {
                      const isActive = currentIcon === dataUrl;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          title={emoji}
                          onClick={() => setPendingIcon(dataUrl)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[18px] transition-colors hover:bg-[var(--surface-hover)]"
                          style={isActive ? { background: "var(--surface-hover)", outline: "1.5px solid var(--border-strong)" } : {}}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-[var(--border)]" />

                {/* Thumbnail */}
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Thumbnail</span>
                  <div
                    className="group relative flex h-[120px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]"
                    onClick={() => thumbInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file?.type.startsWith("image/")) handleThumbFile(file);
                    }}
                  >
                    {currentThumb ? (
                      <>
                        <img src={currentThumb} alt="" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); thumbInputRef.current?.click(); }}
                            className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm hover:bg-white/20"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPendingThumb(null); }}
                            className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm hover:bg-white/20"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="text-[11px] text-[var(--text-faint)]">Click or drop an image</span>
                    )}
                  </div>
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleThumbFile(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {/* Right: Form */}
              <div className="flex flex-col gap-6">
                {/* Identity */}
                <div className="flex flex-col gap-4">
                  <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Identity</span>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-[var(--text-faint)]">Project name</span>
                      <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void save()}
                        placeholder="Project name"
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-[var(--text-faint)]">Description</span>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void save()}
                        placeholder="Briefly describe this project…"
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
                      />
                    </label>
                  </div>
                </div>

                <div className="border-t border-[var(--border)]" />

                {/* Display */}
                <div className="flex flex-col gap-4">
                  <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Display</span>
                  <label className="flex w-full max-w-[240px] flex-col gap-1.5">
                    <span className="text-[11px] text-[var(--text-faint)]">Preview screen</span>
                    <select
                      value={previewScreenId}
                      onChange={(e) => setPreviewScreenId(e.target.value)}
                      className="h-9 cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--border-strong)]"
                    >
                      <option value="">First screen</option>
                      {screens.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Platform (read-only) */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Platform</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                      {typeLabel}
                    </span>
                    <span className="text-[11px] text-[var(--text-faint)]">{typeDims}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-[var(--border)]" />

          {/* Section: Element defaults */}
          <section className="flex flex-col gap-6">
            <SectionHeading
              title="Element defaults"
              subtitle={`Default styles for elements created on the canvas. Inherited from ${parentLabel}; toggle an element to Custom to override it for this project.`}
            />
            <ElementDefaultsEditor
              scope="project"
              inherited={inherited}
              override={override}
              parentLabel={parentLabel}
              onChange={saveElementDefaults}
            />
          </section>

        </div>
      </div>
    </div>
  );
}
