import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import { IconCheck } from "@/components/icons";
import {
  type ComponentParent,
  createComponent,
  findComponentByName,
} from "@/lib/storage/repos/components.repo";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";

export interface NewComponentModalHandle {
  open: (parent: ComponentParent) => void;
  close: () => void;
}

type Props = {
  projectId: string | null;
  screens: ScreenRow[];
  onCreated?: (result: { component: ComponentRow; defaultVariant: VariantRow }) => void;
};

export const NewComponentModal = forwardRef<NewComponentModalHandle, Props>(
  function NewComponentModal({ projectId, screens = [], onCreated }, ref) {
    const [open, setOpen] = useState(false);
    const [parent, setParent] = useState<ComponentParent | null>(null);
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [assignedScreenIds, setAssignedScreenIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      open: (p: ComponentParent) => {
        setParent(p);
        setName("");
        setCategory("");
        setAssignedScreenIds([]);
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
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Please enter a name.");
        return;
      }
      if (!projectId || !parent) {
        setError("Invalid context.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const existing = await findComponentByName(parent, trimmed);
        if (existing) {
          setError("A component with that name already exists here.");
          setSubmitting(false);
          return;
        }
        const result = await createComponent({
          projectId,
          parent,
          name: trimmed,
          category: category.trim() || null,
          assignedScreenIds,
        });
        setOpen(false);
        onCreated?.(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create.");
        setSubmitting(false);
      }
    };

    return (
      <Modal open={open} onClose={close} ariaLabel="New component">
        <ModalHeader
          title="New component"
          subtitle={
            parent?.kind === "project"
              ? "Create a project component and optionally link it to specific screens."
              : "Give a name to the component. It enters the current hierarchy with a default variant."
          }
          onClose={close}
        />
        <ModalBody>
          <div className="grid gap-4">
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
                placeholder="Ex.: Header, Hero, Card, Logo"
                className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Categoria
              </span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Opcional: Navigation, Commerce, Checkout..."
                className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
              />
            </label>

            <div className="grid gap-2">
              <div className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Link to screens
              </div>
              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-3">
                {screens.length === 0 ? (
                  <div className="text-[13px] text-[var(--text-muted)]">
                    No screens available in this project.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {screens.map((screen) => {
                      const checked = assignedScreenIds.includes(screen.id);
                      return (
                        <label
                          key={screen.id}
                          className={[
                            "flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13px] transition-colors",
                            checked
                              ? "border-[var(--text)] bg-[rgba(255,255,255,0.05)] text-[var(--text)]"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setAssignedScreenIds((current) =>
                                current.includes(screen.id)
                                  ? current.filter((id) => id !== screen.id)
                                  : [...current, screen.id],
                              )
                            }
                            className="sr-only"
                          />
                          <span
                            className={[
                              "grid h-4 w-4 place-items-center rounded-[4px] border",
                              checked
                                ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                                : "border-[var(--border-strong)]",
                            ].join(" ")}
                          >
                            <IconCheck size={9} strokeWidth={3} className={checked ? "opacity-100" : "opacity-0"} />
                          </span>
                          <span>{screen.title}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="text-[12px] text-[var(--text-faint)]">
                If no screen is selected, the component is available only within project scope.
              </div>
            </div>

            {error ? (
              <span className="text-[12px] text-[#ff7373]">{error}</span>
            ) : null}
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
              {submitting ? "Creating…" : "Create component"}
            </button>
          </div>
        </ModalBody>
      </Modal>
    );
  },
);
