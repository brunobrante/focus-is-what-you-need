import { Fragment, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ListFilter, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SmallButton({
  primary = false,
  className = "",
  ...props
}: ComponentProps<typeof Button> & { primary?: boolean }) {
  return (
    <Button
      {...props}
      className={[
        "h-8 cursor-pointer gap-[7px] rounded-[8px] border px-3 text-[12.5px] font-medium shadow-none transition-colors duration-[120ms]",
        primary
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-white hover:text-[var(--accent-fg)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
        "disabled:cursor-not-allowed disabled:bg-[#2A2A2A] disabled:text-[#6B6B6B]",
        className,
      ].join(" ")}
    />
  );
}

export function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative min-w-[220px] max-w-[420px] flex-1">
      <Search
        size={14}
        className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name or tag..."
        className="h-[34px] w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-0 pl-8 pr-8 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 grid h-[22px] w-[22px] -translate-y-1/2 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

type ChipOption = { value: string; label: string };

type FilterSearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  filterKind: string;
  onFilterKindChange: (v: string) => void;
  kindOptions: ChipOption[];
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  typeOptions: ChipOption[];
  filterSort: string;
  onFilterSortChange: (v: string) => void;
  sortOptions: ChipOption[];
};

export function FilterSearchBar({
  value,
  onChange,
  filterKind,
  onFilterKindChange,
  kindOptions,
  filterType,
  onFilterTypeChange,
  typeOptions,
  filterSort,
  onFilterSortChange,
  sortOptions,
}: FilterSearchBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const activeCount =
    (filterKind !== "all" ? 1 : 0) +
    (filterType !== "all" ? 1 : 0) +
    (filterSort !== "recent" ? 1 : 0);

  const showFormatSection = filterKind !== "all" && typeOptions.length > 1;

  return (
    <div ref={containerRef} className="relative flex min-w-[220px] max-w-[520px] flex-1 items-center gap-1.5">
      <div className="relative flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by name or tag..."
          className="h-[34px] w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-0 pl-8 pr-8 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange("")}
            className="absolute right-1.5 top-1/2 grid h-[22px] w-[22px] -translate-y-1/2 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Filters"
          className={[
            "relative grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[8px] border transition-colors duration-[120ms]",
            open || activeCount > 0
              ? "border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          <ListFilter size={14} />
          {activeCount > 0 && (
            <span className="absolute -right-[5px] -top-[5px] flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[var(--accent)] text-[8px] font-bold leading-none text-[var(--accent-fg)]">
              {activeCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <div className="flex flex-col gap-4">
              <FilterSection
                title="Type"
                options={kindOptions}
                value={filterKind}
                onChange={onFilterKindChange}
              />
              {showFormatSection && (
                <FilterSection
                  title="Format"
                  options={typeOptions}
                  value={filterType}
                  onChange={onFilterTypeChange}
                />
              )}
              <FilterSection
                title="Sort"
                options={sortOptions}
                value={filterSort}
                onChange={onFilterSortChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSection({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              "h-[26px] cursor-pointer rounded-full border px-3 text-[11px] font-medium transition-colors duration-[100ms]",
              value === opt.value
                ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] min-w-[160px] cursor-pointer appearance-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-0 pl-3 pr-[30px] text-[12.5px] font-medium text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-[11px] top-1/2 h-[7px] w-[7px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]"
      />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h5 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
        {title}
      </h5>
      {children}
    </div>
  );
}

export function DetailList({
  items,
}: {
  items: Array<[string, string] | [string, string, boolean]>;
}) {
  return (
    <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-[12px]">
      {items.map(([label, value, mono]) => (
        <Fragment key={label}>
          <dt className="text-[var(--text-muted)]">{label}</dt>
          <dd
            className={[
              "m-0 break-words text-[var(--text)] tabular-nums",
              mono ? "font-mono text-[11px] text-[var(--text-muted)]" : "",
            ].join(" ")}
          >
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function TagEditor({
  tags,
  onAdd,
  onRemove,
  asButton = false,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  asButton?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function commit() {
    const tag = draft
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (tag && !tags.includes(tag)) onAdd(tag);
    setDraft("");
    if (asButton) setEditing(false);
  }

  const chips = tags.map((tag) => (
    <span
      key={tag}
      className="inline-flex items-center gap-[3px] rounded-full border border-[var(--border)] bg-[var(--surface)] pl-1.5 pr-0.5 py-[2px] text-[10px] tracking-[0.3px] text-[var(--text-muted)]"
    >
      #{tag}
      <button
        type="button"
        onClick={() => onRemove(tag)}
        className="grid h-[14px] w-[14px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
      >
        <X size={8} />
      </button>
    </span>
  ));

  if (asButton) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {chips}
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft("");
                setEditing(false);
              }
              if (e.key === "Backspace" && draft === "" && tags.length > 0) {
                onRemove(tags[tags.length - 1]);
              }
            }}
            onBlur={commit}
            placeholder="nome-da-tag"
            className="h-[20px] min-w-[90px] rounded-full border border-dashed border-[var(--border-strong)] bg-transparent px-2 text-[10px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-[20px] cursor-pointer items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] bg-transparent px-2 text-[10px] text-[var(--text-faint)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-muted)]"
          >
            <Plus size={8} />
            tag
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
      {chips}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Backspace" && draft === "" && tags.length > 0) {
            onRemove(tags[tags.length - 1]);
          }
        }}
        onBlur={() => {
          if (draft) commit();
        }}
        placeholder={tags.length === 0 ? "Add tag…" : "+ tag"}
        className="min-w-[70px] flex-1 border-0 bg-transparent py-0 text-[10.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
      />
    </div>
  );
}
