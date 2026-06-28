import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import { SmallButton } from "./ui";

type GroupSaveInput = { name: string; description?: string };

type ReferenceGroupConfig =
  | { mode: "create"; group?: undefined; onSave: (input: GroupSaveInput) => void }
  | { mode: "edit"; group: ReferenceGroup; onSave: (input: GroupSaveInput) => void };

export interface ReferenceGroupModalHandle {
  open: (config: ReferenceGroupConfig) => void;
  close: () => void;
}

export const ReferenceGroupModal = forwardRef<ReferenceGroupModalHandle>(
  function ReferenceGroupModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const configRef = useRef<ReferenceGroupConfig | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    useImperativeHandle(ref, () => ({
      open: (config) => {
        configRef.current = config;
        setName(config.mode === "edit" ? config.group.name : "");
        setDescription(config.mode === "edit" ? (config.group.description ?? "") : "");
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    if (!isOpen || !configRef.current) return null;

    const config = configRef.current;
    const trimmedName = name.trim();
    const title = config.mode === "edit" ? "Edit group" : "Create group";

    return (
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(0,0,0,0.65)] p-8 backdrop-blur-[6px]"
      >
        <div
          role="document"
          className="flex w-[min(440px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-[18px] py-3.5">
            <h3 className="m-0 text-[14px] font-semibold text-[var(--text)]">{title}</h3>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setIsOpen(false)}
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-3.5 p-[18px]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
                Name
              </span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mobile checkout project"
                className="h-[36px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context for this set of references..."
                rows={3}
                className="resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
              />
            </label>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-[18px] py-3">
            <SmallButton type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </SmallButton>
            <SmallButton
              type="button"
              primary
              disabled={!trimmedName}
              onClick={() => {
                config.onSave({ name: trimmedName, description: description.trim() || undefined });
                setIsOpen(false);
              }}
            >
              Save group
            </SmallButton>
          </div>
        </div>
      </div>
    );
  },
);

export interface DeleteGroupModalHandle {
  open: (
    group: ReferenceGroup,
    opts: { canKeepImages: boolean; onConfirm: (deleteContents: boolean) => void },
  ) => void;
  close: () => void;
}

export const DeleteGroupModal = forwardRef<DeleteGroupModalHandle>(
  function DeleteGroupModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const groupRef = useRef<ReferenceGroup | null>(null);
    const onConfirmRef = useRef<((deleteContents: boolean) => void) | null>(null);
    const [canKeepImages, setCanKeepImages] = useState(true);
    const [deleteContents, setDeleteContents] = useState(false);

    useImperativeHandle(ref, () => ({
      open: (group, opts) => {
        groupRef.current = group;
        onConfirmRef.current = opts.onConfirm;
        setCanKeepImages(opts.canKeepImages);
        // A lone multi-root image only exists *as* a group, so keeping it would just
        // rebuild this group — force a full delete for that degenerate case.
        setDeleteContents(!opts.canKeepImages);
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    if (!isOpen || !groupRef.current) return null;

    const group = groupRef.current;
    const wipeEverything = canKeepImages ? deleteContents : true;

    return (
      <div
        role="dialog"
        aria-modal
        aria-label="Delete group"
        onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(0,0,0,0.68)] p-8 backdrop-blur-[6px]"
      >
        <div
          role="document"
          className="flex w-[min(420px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <div className="border-b border-[var(--border)] px-[18px] py-4">
            <h3 className="m-0 text-[15px] font-semibold text-[var(--text)]">Delete group?</h3>
            <p className="m-0 mt-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
              {canKeepImages
                ? <>This removes the group "{group.name}" but keeps every screen, stack file, and cut.</>
                : <>"{group.name}" only exists as this group, so deleting it removes the image with every screen, stack, and cut.</>}
            </p>
          </div>

          {canKeepImages ? (
            <label className="flex cursor-pointer items-start gap-2.5 border-b border-[var(--border)] px-[18px] py-3.5">
              <input
                type="checkbox"
                checked={deleteContents}
                onChange={(e) => setDeleteContents(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span className="text-[12px] leading-[1.5] text-[var(--text-muted)]">
                Also delete every screen, stack, and image in this group. This can't be undone.
              </span>
            </label>
          ) : null}

          <div className="flex justify-end gap-2 px-[18px] py-3">
            <SmallButton type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </SmallButton>
            <SmallButton
              type="button"
              onClick={() => {
                onConfirmRef.current?.(wipeEverything);
                setIsOpen(false);
              }}
            >
              {wipeEverything ? "Delete everything" : "Delete group"}
            </SmallButton>
          </div>
        </div>
      </div>
    );
  },
);

/** @deprecated Use `ReferenceGroupModalHandle` instead */
export type { ReferenceGroupConfig };
