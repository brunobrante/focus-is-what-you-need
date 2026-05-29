import { ChevronRight, SquarePen, Trash2 } from "lucide-react";
import type { ComponentProps } from "react";
import type { ComponentTreeNode } from "../engine/types";

function IconButton({
  danger = false,
  className = "",
  ...props
}: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        danger ? "hover:text-[#ff8a8a]" : "",
        className,
      ].join(" ")}
    />
  );
}

export function ComponentTreeItem({
  node,
  activeId,
  hoveredId,
  editingId,
  expandedIds,
  rootId,
  primaryId,
  onOpen,
  onToggle,
  onHover,
  onRemove,
  onEdit,
}: {
  node: ComponentTreeNode;
  activeId: string | null;
  hoveredId: string | null;
  editingId: string | null;
  expandedIds: Set<string>;
  rootId: string;
  primaryId: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { component, children, depth } = node;
  const active = activeId === component.id;
  const hovered = hoveredId === component.id;
  const editing = editingId === component.id;
  const isRoot = component.id === rootId;
  const isPrimary = component.id === primaryId;
  const isProtected = isRoot || isPrimary;
  const canEdit = !isRoot;
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(component.id);

  return (
    <div className="flex flex-col gap-1">
      <div
        onClick={() => onOpen(component.id)}
        onMouseEnter={() => onHover(component.id)}
        onMouseLeave={() => onHover(null)}
        className={[
          "flex h-11 cursor-pointer items-center gap-1.5 rounded-[8px] border bg-[var(--bg-elev)] px-1.5 py-1 transition-colors duration-[120ms]",
          editing
            ? "border-[#4C8DFF]"
            : active || hovered
              ? "border-[var(--text)]"
              : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]",
        ].join(" ")}
        style={{ marginLeft: depth * 10 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? "Fechar filhos" : "Abrir filhos"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(component.id);
            }}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <ChevronRight
              size={13}
              strokeWidth={1.9}
              className={expanded ? "rotate-90 transition-transform duration-[120ms]" : "transition-transform duration-[120ms]"}
            />
          </button>
        ) : (
          <span aria-hidden className="h-6 w-6 shrink-0" />
        )}
        <div
          className="h-8 w-8 shrink-0 rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${component.dataUrl}")` }}
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-[var(--text)]">
          {component.name}
        </span>
        <div className="flex shrink-0">
          <IconButton
            aria-label="Editar recorte"
            disabled={!canEdit}
            className={[
              !canEdit ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
              editing ? "text-[#4C8DFF] hover:text-[#4C8DFF]" : "",
            ].join(" ")}
            onClick={(event) => {
              event.stopPropagation();
              if (canEdit) onEdit(component.id);
            }}
          >
            <SquarePen size={13} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            aria-label="Remover"
            danger
            disabled={isProtected}
            className={isProtected ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : ""}
            onClick={(event) => {
              event.stopPropagation();
              if (!isProtected) onRemove(component.id);
            }}
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </IconButton>
        </div>
      </div>
      {expanded
        ? children.map((child) => (
            <ComponentTreeItem
              key={child.component.id}
              node={child}
              activeId={activeId}
              hoveredId={hoveredId}
              editingId={editingId}
              expandedIds={expandedIds}
              rootId={rootId}
              primaryId={primaryId}
              onOpen={onOpen}
              onToggle={onToggle}
              onHover={onHover}
              onRemove={onRemove}
              onEdit={onEdit}
            />
          ))
        : null}
    </div>
  );
}
