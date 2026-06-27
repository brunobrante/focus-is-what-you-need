import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { IconUpload } from "@/components/icons";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import { readFileAsDataUrl } from "@/lib/utils";
import { setProjectThumbnail, updateProject } from "@/lib/storage/repos/projects.repo";
import { loadAssetDataUrl } from "@/application/persistence/assetDataUrlLoader";
import type { ProjectRow, ScreenRow } from "@/lib/storage/schema";

type SettingsTab = "project" | "advanced";

export interface ProjectSettingsModalHandle {
  open: (
    project: ProjectRow,
    screens: ScreenRow[],
    onSaved?: (project: ProjectRow) => void,
  ) => void;
  close: () => void;
}

export const ProjectSettingsModal = forwardRef<ProjectSettingsModalHandle>(
  function ProjectSettingsModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const projectRef = useRef<ProjectRow | null>(null);
    const screensRef = useRef<ScreenRow[]>([]);
    const onSavedRef = useRef<((project: ProjectRow) => void) | undefined>(undefined);

    const [tab, setTab] = useState<SettingsTab>("project");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [previewScreenId, setPreviewScreenId] = useState("");
    const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      open: (project, screens, onSaved) => {
        projectRef.current = project;
        screensRef.current = screens;
        onSavedRef.current = onSaved;
        setTab("project");
        setName(project.name);
        setDescription(project.description ?? "");
        setPreviewScreenId(project.previewScreenId ?? "");
        // Thumbnail bytes live in the asset store (flip 3b) — resolve for editing.
        setThumbnailDataUrl(null);
        if (project.thumbnailBlobKey) {
          void loadAssetDataUrl(project.thumbnailBlobKey).then((url) => {
            if (projectRef.current?.id === project.id) setThumbnailDataUrl(url);
          });
        }
        setSaving(false);
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    useEffect(() => {
      if (!isOpen) return;
      const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }, [isOpen, tab]);

    const project = projectRef.current;
    const screens = screensRef.current;

    if (!project) return null;

    async function onFile(file: File | null) {
      if (!file) return;
      const next = await readFileAsDataUrl(file);
      setThumbnailDataUrl(next);
    }

    async function save() {
      if (!project || saving || !name.trim()) return;
      setSaving(true);
      try {
        await updateProject(project.id, {
          name: name.trim(),
          description: description.trim() || null,
          previewScreenId: previewScreenId || null,
        });
        // The thumbnail's bytes are stored separately (flip 3b).
        const updated = await setProjectThumbnail(project.id, thumbnailDataUrl);
        if (updated) {
          onSavedRef.current?.(updated);
          setIsOpen(false);
        }
      } finally {
        setSaving(false);
      }
    }

    return (
      <Modal open={isOpen} onClose={() => setIsOpen(false)} ariaLabel="Project settings">
        <ModalHeader
          title="Project settings"
          subtitle="Edit main details and set preview behavior."
          onClose={() => setIsOpen(false)}
        />
        <ModalBody className="!p-0">
          <div className="border-b border-[var(--border)] px-[22px]">
            <div className="flex gap-1 pt-3">
              {[
                { id: "project", label: "Project Settings" },
                { id: "advanced", label: "Advanced Settings" },
              ].map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id as SettingsTab)}
                    className={[
                      "relative cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[13px] font-medium",
                      active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
                    ].join(" ")}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-[22px] pb-[22px] pt-[18px]">
            {tab === "project" ? (
              <div className="grid gap-5">
                <Field label="Project name">
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
                    placeholder="Project name"
                  />
                </Field>

                <Field label="Resumo">
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="min-h-[96px] rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3 text-[14px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
                    placeholder="Briefly describe this project focus."
                  />
                </Field>

                <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                  <ThumbnailField
                    label="Project thumbnail"
                    value={thumbnailDataUrl}
                    onClear={() => setThumbnailDataUrl(null)}
                    onFile={onFile}
                  />
                  <Field label="Preview screen">
                    <select
                      value={previewScreenId}
                      onChange={(event) => setPreviewScreenId(event.target.value)}
                      className="h-11 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors focus:border-[var(--text)]"
                    >
                      <option value="">First screen of the project</option>
                      {screens.map((screen) => (
                        <option key={screen.id} value={screen.id}>
                          {screen.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            ) : (
              <div className="grid gap-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <ReadonlyCard label="Type" value={project.type} />
                  <ReadonlyCard label="Project ID" value={project.id} />
                  <ReadonlyCard label="Screens" value={`${screens.length}`} />
                  <ReadonlyCard label="Last updated" value={new Date(project.updatedAt).toLocaleString("en-US")} />
                </div>

                <Field label="Default preview screen">
                  <select
                    value={previewScreenId}
                    onChange={(event) => setPreviewScreenId(event.target.value)}
                    className="h-11 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors focus:border-[var(--text)]"
                  >
                    <option value="">First screen of the project</option>
                    {screens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.title}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
                  Project preview uses the default screen above. If no screen is selected, the project opens with the first available screen.
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setIsOpen(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button type="button" onClick={() => void save()} disabled={!name.trim() || saving} className="btn btn-primary">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{label}</span>
      {children}
    </label>
  );
}

function ReadonlyCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{label}</div>
      <div className="text-[13.5px] font-medium text-[var(--text)]">{value}</div>
    </div>
  );
}

function ThumbnailField({
  label,
  value,
  onClear,
  onFile,
}: {
  label: string;
  value: string | null;
  onClear: () => void;
  onFile: (file: File | null) => Promise<void>;
}) {
  return (
    <Field label={label}>
      <label
        className="group flex min-h-[220px] cursor-pointer flex-col overflow-hidden rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--bg)] transition-colors hover:border-[var(--text)]"
        style={{
          background:
            "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0) 0 0/20px 20px, var(--bg)",
        }}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
        />
        {value ? (
          <div className="relative flex-1">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }}
              className="absolute right-3 top-3 inline-flex h-8 items-center rounded-md border border-[var(--border-strong)] bg-black/70 px-2.5 text-[12px] text-white backdrop-blur"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div className="flex max-w-[240px] flex-col items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]">
                <IconUpload size={18} strokeWidth={1.8} />
              </span>
              <div className="text-[13px] font-medium text-[var(--text)]">Add thumbnail</div>
              <div className="text-[12px] leading-[1.5] text-[var(--text-muted)]">
                Upload an image to represent the project in the listing and settings.
              </div>
            </div>
          </div>
        )}
      </label>
    </Field>
  );
}
