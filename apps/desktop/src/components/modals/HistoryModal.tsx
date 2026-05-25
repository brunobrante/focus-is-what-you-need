import { forwardRef, useImperativeHandle, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "./Modal";
import type { GitChange, GitCommit } from "@/lib/data/screenVersions";

export interface HistoryModalHandle {
  open: () => void;
  close: () => void;
}

type Props = {
  title?: string;
  subtitle?: string;
  commits: GitCommit[];
};

export const HistoryModal = forwardRef<HistoryModalHandle, Props>(function HistoryModal(
  { title = "Histórico da tela", subtitle, commits },
  ref,
) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }));

  return (
    <Modal open={open} onClose={() => setOpen(false)} ariaLabel={title}>
      <ModalHeader title={title} subtitle={subtitle} onClose={() => setOpen(false)} />
      <ModalBody>
        <GitLog commits={commits} />
      </ModalBody>
    </Modal>
  );
});

function GitLog({ commits }: { commits: GitCommit[] }) {
  return (
    <div className="relative pl-5">
      <div
        aria-hidden
        className="absolute bottom-1.5 left-1.5 top-1.5 w-px bg-[var(--border-strong)]"
      />
      {commits.map((c, i) => (
        <CommitRow key={c.hash} commit={c} isLast={i === commits.length - 1} />
      ))}
    </div>
  );
}

function CommitRow({ commit, isLast }: { commit: GitCommit; isLast: boolean }) {
  return (
    <div
      className={[
        "relative py-3.5",
        !isLast ? "border-b border-dashed border-[var(--border)]" : "",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "absolute left-[-18px] top-[22px] h-[9px] w-[9px] rounded-full border-2 bg-[var(--surface)]",
          commit.current
            ? "border-[#3FB950] shadow-[0_0_0_3px_rgba(63,185,80,0.15)]"
            : "border-[var(--text-muted)]",
        ].join(" ")}
      />
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 text-[13px] font-medium text-[var(--text)]">
          {commit.msg}
        </span>
        <span className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-faint)]">
          {commit.hash}
        </span>
      </div>
      <div className="mb-2 flex items-center gap-2.5 text-[11.5px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--border-strong)] bg-[linear-gradient(135deg,#3a3a3a,#1f1f1f)] text-[9px] text-[var(--text-soft)]">
            {commit.initials}
          </span>
          {commit.author}
        </span>
        <span className="h-[2px] w-[2px] rounded-full bg-[var(--text-faint)]" />
        <span>{commit.when}</span>
      </div>
      <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 font-mono text-[11.5px]">
        {commit.changes.map((ch, idx) => (
          <ChangeRow key={idx} change={ch} />
        ))}
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: GitChange }) {
  const opColor =
    change.op === "A" ? "text-[#3FB950]" : change.op === "R" ? "text-[#E5484D]" : "text-[#E0A33A]";
  return (
    <div className="flex items-center gap-2">
      <span className={["w-3 shrink-0 text-center font-bold", opColor].join(" ")}>{change.op}</span>
      <span className="truncate text-[var(--text-soft)]">{change.file}</span>
      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--text-faint)]">
        {change.add ? <span className="text-[#3FB950]">+{change.add}</span> : null}
        {change.add && change.rem ? " " : null}
        {change.rem ? <span className="text-[#E5484D]">−{change.rem}</span> : null}
      </span>
    </div>
  );
}
