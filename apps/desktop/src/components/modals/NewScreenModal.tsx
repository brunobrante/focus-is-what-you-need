import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import { IconCheck } from "@/components/icons";
import { DEFAULT_SCREENS } from "@/lib/data/projects";
import type { ScreenVariant } from "@/lib/data/types";
import { createScreen, findScreenByTitle } from "@/lib/storage/repos/screens.repo";
import type { ScreenRow } from "@/lib/storage/schema";

export interface NewScreenModalHandle {
  open: () => void;
  close: () => void;
}

type Props = {
  projectId: string | null;
  onCreated?: (screen: ScreenRow) => void;
};

export const NewScreenModal = forwardRef<NewScreenModalHandle, Props>(
  function NewScreenModal({ projectId, onCreated }, ref) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [variant, setVariant] = useState<ScreenVariant>("blank");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      open: () => {
        setName("");
        setVariant("blank");
        setError(null);
        setSubmitting(false);
        setOpen(true);
      },
      close: () => setOpen(false),
    }));

    useEffect(() => {
      if (open) {
        const t = setTimeout(() => inputRef.current?.focus(), 60);
        return () => clearTimeout(t);
      }
    }, [open]);

    const close = () => setOpen(false);

    const submit = async () => {
      if (submitting) return;
      const title = name.trim();
      if (!title) {
        setError("Please enter a name.");
        return;
      }
      if (!projectId) {
        setError("Project not found.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const existing = await findScreenByTitle(projectId, title);
        if (existing) {
          setError("A screen with that name already exists.");
          setSubmitting(false);
          return;
        }
        const screen = await createScreen({ projectId, title, variant });
        setOpen(false);
        onCreated?.(screen);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create.");
        setSubmitting(false);
      }
    };

    return (
      <Modal open={open} onClose={close} ariaLabel="New screen">
        <ModalHeader
          title="New screen"
          subtitle="Give a name and choose a visual template for the new screen."
          onClose={close}
        />
        <ModalBody>
          <div className="grid gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Nome
              </span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Ex.: Home, Detalhe, Carrinho"
                className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
              />
              {error ? (
                <span className="text-[12px] text-[#ff7373]">{error}</span>
              ) : null}
            </label>

            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                    Templates
                  </div>
                  <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                    All use the same flow for now. The selection already prepares the visual for future templates.
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ...DEFAULT_SCREENS.map((screen) => ({
                    id: screen.variant,
                    label: screen.title,
                    variant: screen.variant,
                  })),
                  { id: "blank", label: "Empty Screen", variant: "blank" as ScreenVariant },
                ].map((template) => {
                  const selected = variant === template.variant;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setVariant(template.variant)}
                      className={[
                        "cursor-pointer rounded-[14px] border bg-[var(--surface)] p-4 text-left transition-colors",
                        selected
                          ? "border-[var(--text)] bg-[#232323]"
                          : "border-[var(--border)] hover:border-[var(--border-strong)]",
                      ].join(" ")}
                    >
                      <div
                        className="mb-3 grid h-[120px] place-items-center rounded-[10px] border border-[var(--border)] bg-[#161616]"
                        style={{
                          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
                          backgroundSize: "14px 14px",
                        }}
                      >
                        <TemplateMock variant={template.variant} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-semibold text-[var(--text)]">{template.label}</div>
                          <div className="mt-1 text-[12px] text-[var(--text-faint)]">
                            {template.variant === "blank" ? "Blank layout to start from scratch" : "Initial structure ready for editing"}
                          </div>
                        </div>
                        <span
                          className={[
                            "grid h-[18px] w-[18px] place-items-center rounded-full border bg-[#161616]",
                            selected
                              ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                              : "border-[var(--border-strong)]",
                          ].join(" ")}
                        >
                          <IconCheck size={10} strokeWidth={3} className={selected ? "opacity-100" : "opacity-0"} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Creating…" : "Create screen"}
            </button>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);

function TemplateMock({ variant }: { variant: ScreenVariant }) {
  if (variant === "blank") {
    return (
      <div className="grid h-[78px] w-[140px] place-items-center rounded-[14px] border border-dashed border-[#2C2C2C] text-[11px] text-[#8C8C8C]">
        Empty Screen
      </div>
    );
  }

  return (
    <div className="flex h-[84px] w-[150px] flex-col gap-2 rounded-[14px] border border-[#2C2C2C] bg-[#111312] p-3">
      <div className="flex items-center justify-between rounded-[8px] bg-[#1F1F1F] px-3 py-2">
        <span className="h-3 w-3 rounded-[3px] bg-white" />
        <span className="h-2 w-10 rounded-full bg-[#2C2C2C]" />
      </div>
      <div className="flex-1 rounded-[10px] bg-[#181818] p-3">
        <div className="h-2 w-2/3 rounded-full bg-white" />
        <div className="mt-2 h-2 w-full rounded-full bg-[#2C2C2C]" />
        <div className="mt-2 h-2 w-1/2 rounded-full bg-[#2C2C2C]" />
        {variant !== "hero" ? <div className="mt-3 grid grid-cols-3 gap-1.5">{Array.from({ length: 3 }).map((_, idx) => <span key={idx} className="h-5 rounded-[4px] bg-[#202020]" />)}</div> : null}
      </div>
    </div>
  );
}
