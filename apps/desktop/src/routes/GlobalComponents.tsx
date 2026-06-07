import { useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { IconPlus, IconSearch, IconLayers } from "@/components/icons";

type ComponentKind = "action" | "form" | "display" | "overlay" | "feedback" | "navigation" | "layout";

type GlobalComponent = {
  id: string;
  name: string;
  kind: ComponentKind;
  description: string;
  variants: number;
};

const KIND_COLOR: Record<ComponentKind, string> = {
  action: "#5b6cff",
  form: "#32b3a0",
  display: "#e0a050",
  overlay: "#9f6ef5",
  feedback: "#e05050",
  navigation: "#50a0e0",
  layout: "#708090",
};

const COMPONENTS: GlobalComponent[] = [
  { id: "gc-button", name: "Button", kind: "action", description: "Trigger actions and submit forms", variants: 5 },
  { id: "gc-input", name: "Input", kind: "form", description: "Single-line text entry field", variants: 4 },
  { id: "gc-badge", name: "Badge", kind: "display", description: "Short status labels and counters", variants: 6 },
  { id: "gc-checkbox", name: "Checkbox", kind: "form", description: "Binary on/off selection control", variants: 3 },
  { id: "gc-select", name: "Select", kind: "form", description: "Choose one option from a list", variants: 3 },
  { id: "gc-modal", name: "Modal", kind: "overlay", description: "Focused dialog overlay", variants: 4 },
  { id: "gc-toast", name: "Toast", kind: "feedback", description: "Brief non-blocking notifications", variants: 4 },
  { id: "gc-dropdown", name: "Dropdown", kind: "overlay", description: "Contextual menu anchored to a trigger", variants: 2 },
  { id: "gc-tabs", name: "Tabs", kind: "navigation", description: "Switch between related views", variants: 3 },
  { id: "gc-avatar", name: "Avatar", kind: "display", description: "User identity representation", variants: 4 },
  { id: "gc-card", name: "Card", kind: "layout", description: "Contained grouping surface", variants: 5 },
  { id: "gc-toggle", name: "Toggle", kind: "form", description: "Boolean switch with visual state", variants: 2 },
];

const KIND_FILTERS: Array<{ value: ComponentKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "action", label: "Action" },
  { value: "form", label: "Form" },
  { value: "display", label: "Display" },
  { value: "overlay", label: "Overlay" },
  { value: "feedback", label: "Feedback" },
  { value: "navigation", label: "Navigation" },
  { value: "layout", label: "Layout" },
];

function ComponentCard({ component }: { component: GlobalComponent }) {
  return (
    <div
      id={component.id}
      className="group flex flex-col gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]"
    >
      <div
        className="flex h-28 items-center justify-center"
        style={{ background: `${KIND_COLOR[component.kind]}0d` }}
      >
        <ComponentThumb id={component.id} large />
      </div>
      <div className="flex flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] font-semibold text-[var(--text)]">{component.name}</span>
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize"
            style={{ color: KIND_COLOR[component.kind], background: `${KIND_COLOR[component.kind]}18` }}
          >
            {component.kind}
          </span>
        </div>
        <p className="m-0 text-[12px] leading-[1.45] text-[var(--text-muted)]">{component.description}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--text-faint)]">
            {component.variants} {component.variants === 1 ? "variant" : "variants"}
          </span>
          <button
            type="button"
            className="rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--text-muted)] opacity-0 transition-all group-hover:opacity-100 hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

function ComponentThumb({ id, large = false }: { id: string; large?: boolean }) {
  const s = large ? 1.6 : 1;
  const base = "rounded-[3px] border border-[var(--border-strong)] bg-[var(--border)]";

  const scale = (v: number) => Math.round(v * s);

  switch (id) {
    case "gc-button":
      return (
        <div className="flex items-center justify-center">
          <div
            className="flex items-center justify-center rounded-[7px] border border-[var(--border-strong)]"
            style={{ height: scale(16), width: scale(56) }}
          >
            <div className="rounded-full bg-[var(--text-muted)]" style={{ height: scale(4), width: scale(28) }} />
          </div>
        </div>
      );
    case "gc-input":
      return (
        <div className="flex items-center justify-center">
          <div
            className="flex items-center rounded-[7px] border border-[var(--border-strong)] px-2"
            style={{ height: scale(16), width: scale(64) }}
          >
            <div className="rounded-full bg-[var(--text-faint)]" style={{ height: scale(4), width: scale(24) }} />
            <div className="ml-0.5 bg-[var(--text-muted)]" style={{ height: scale(12), width: 1 }} />
          </div>
        </div>
      );
    case "gc-badge":
      return (
        <div className="flex items-center justify-center gap-1.5">
          <div className="rounded-full border border-[var(--border-strong)]" style={{ height: scale(12), width: scale(36) }} />
          <div className="rounded-full border border-[var(--border-strong)]" style={{ height: scale(12), width: scale(24) }} />
        </div>
      );
    case "gc-checkbox":
      return (
        <div className="flex items-center justify-center gap-2">
          <div
            className="grid shrink-0 place-items-center rounded-[3px] border border-[var(--border-strong)]"
            style={{ height: scale(14), width: scale(14) }}
          >
            <div className="rounded-[1px] bg-[var(--text-muted)]" style={{ height: scale(6), width: scale(6) }} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="rounded-full bg-[var(--border-strong)]" style={{ height: scale(4), width: scale(32) }} />
            <div className="rounded-full bg-[var(--border)]" style={{ height: scale(4), width: scale(20) }} />
          </div>
        </div>
      );
    case "gc-select":
      return (
        <div className="flex items-center justify-center">
          <div
            className="flex items-center justify-between rounded-[7px] border border-[var(--border-strong)] px-1.5"
            style={{ height: scale(16), width: scale(64) }}
          >
            <div className="rounded-full bg-[var(--text-faint)]" style={{ height: scale(4), width: scale(24) }} />
            <div
              className="border-b border-r border-[var(--text-muted)] rotate-45"
              style={{ height: scale(6), width: scale(6), transform: "rotate(45deg) translateY(-1px)" }}
            />
          </div>
        </div>
      );
    case "gc-modal":
      return (
        <div className="flex items-center justify-center">
          <div
            className="flex flex-col overflow-hidden rounded-[7px] border border-[var(--border-strong)]"
            style={{ width: scale(64) }}
          >
            <div
              className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-2"
              style={{ height: scale(12) }}
            >
              <div className="rounded-full bg-[var(--border-strong)]" style={{ height: scale(4), width: scale(20) }} />
              <div className="rounded-full border border-[var(--border-strong)]" style={{ height: scale(6), width: scale(6) }} />
            </div>
            <div className="flex flex-col gap-1 p-1.5">
              <div className="rounded-full bg-[var(--border)]" style={{ height: scale(4), width: "100%" }} />
              <div className="rounded-full bg-[var(--border)]" style={{ height: scale(4), width: "75%" }} />
            </div>
          </div>
        </div>
      );
    case "gc-toast":
      return (
        <div className="flex flex-col items-center justify-center gap-1.5">
          {[1, 0.5].map((opacity, i) => (
            <div
              key={i}
              className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)] px-1.5"
              style={{ height: scale(12), width: scale(i === 0 ? 64 : 48), opacity }}
            >
              <div className="shrink-0 rounded-full bg-[var(--text-muted)]" style={{ height: scale(6), width: scale(6) }} />
              <div className="flex-1 rounded-full bg-[var(--border-strong)]" style={{ height: scale(4) }} />
            </div>
          ))}
        </div>
      );
    case "gc-dropdown":
      return (
        <div className="flex items-center justify-center">
          <div
            className="flex flex-col overflow-hidden rounded-[7px] border border-[var(--border-strong)]"
            style={{ width: scale(56) }}
          >
            {[100, 70, 55].map((w, i) => (
              <div
                key={i}
                className={`flex items-center border-b border-[var(--border)] px-1.5 last:border-0 ${i === 1 ? "bg-[var(--surface)]" : ""}`}
                style={{ height: scale(10) }}
              >
                <div className="rounded-full bg-[var(--border-strong)]" style={{ height: scale(4), width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
      );
    case "gc-tabs":
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="flex" style={{ width: scale(64) }}>
            {["A", "B", "C"].map((label, i) => (
              <div
                key={label}
                className={[
                  "flex flex-1 items-center justify-center rounded-t-[4px] text-[7px]",
                  i === 0
                    ? "border border-b-0 border-[var(--border-strong)] bg-[var(--bg)] font-medium text-[var(--text)]"
                    : "border-b border-[var(--border-strong)] text-[var(--text-faint)]",
                ].join(" ")}
                style={{ height: scale(10) }}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="border border-t-0 border-[var(--border-strong)] rounded-b-[4px]" style={{ height: scale(20), width: scale(64) }} />
        </div>
      );
    case "gc-avatar":
      return (
        <div className="flex items-center justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)]"
              style={{ height: scale(20), width: scale(20), marginLeft: i > 0 ? scale(-6) : 0 }}
            >
              <div className="rounded-full bg-[var(--text-faint)]" style={{ height: scale(10), width: scale(10) }} />
            </div>
          ))}
        </div>
      );
    case "gc-card":
      return (
        <div className="flex items-center justify-center">
          <div
            className={`flex flex-col gap-1 p-1.5 ${base}`}
            style={{ height: scale(48), width: scale(64) }}
          >
            <div className="rounded-[2px] bg-[var(--surface-hover)]" style={{ height: scale(16), width: "100%" }} />
            <div className="rounded-full bg-[var(--surface-hover)]" style={{ height: scale(4), width: "100%" }} />
            <div className="rounded-full bg-[var(--surface-hover)]" style={{ height: scale(4), width: "75%" }} />
            <div className="mt-auto rounded-[3px] bg-[var(--border-strong)]" style={{ height: scale(8), width: scale(32) }} />
          </div>
        </div>
      );
    case "gc-toggle":
      return (
        <div className="flex items-center justify-center gap-2.5">
          <div
            className="flex items-center rounded-full border border-[var(--border-strong)] px-0.5"
            style={{ height: scale(14), width: scale(24) }}
          >
            <div className="rounded-full bg-[var(--text-muted)]" style={{ height: scale(8), width: scale(8) }} />
          </div>
          <div
            className="flex items-center justify-end rounded-full border border-[var(--text-muted)] px-0.5"
            style={{ height: scale(14), width: scale(24), background: "rgba(91,108,255,0.2)" }}
          >
            <div className="rounded-full bg-[var(--text)]" style={{ height: scale(8), width: scale(8) }} />
          </div>
        </div>
      );
    default:
      return <div className={`${base}`} style={{ height: scale(32), width: scale(48) }} />;
  }
}

export function GlobalComponents() {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ComponentKind | "all">("all");

  const filtered = COMPONENTS.filter((c) => {
    const matchKind = kindFilter === "all" || c.kind === kindFilter;
    const matchQ = !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase());
    return matchKind && matchQ;
  });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <TopBar />
      <main className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-14">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <IconLayers size={16} strokeWidth={1.6} className="text-[var(--text-muted)]" />
            </div>
            <div>
              <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Global components</h1>
              <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
                Shared across all projects · {COMPONENTS.length} components
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
          >
            <IconPlus size={14} strokeWidth={2} />
            Add component
          </button>
        </header>

        <div className="mb-6 flex items-center gap-2.5">
          <div className="relative max-w-[280px] flex-1">
            <IconSearch size={14} strokeWidth={1.7} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="search"
              placeholder="Search components..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-0 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
          </div>

          <div
            role="tablist"
            className="inline-flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
          >
            {KIND_FILTERS.map((opt) => {
              const isActive = opt.value === kindFilter;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  onClick={() => setKindFilter(opt.value)}
                  className={[
                    "h-[26px] cursor-pointer rounded-md border-0 bg-transparent px-2.5 text-[12px]",
                    isActive
                      ? "bg-[var(--pill)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  ].join(" ")}
                  style={isActive ? { background: "var(--pill)" } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {filtered.map((c) => (
              <ComponentCard key={c.id} component={c} />
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <p className="text-[14px] font-medium text-[var(--text)]">No components found</p>
            <p className="text-[13px] text-[var(--text-muted)]">Try a different search or filter</p>
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-4 text-center text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
        <Link to="/" className="text-[var(--text-faint)] no-underline hover:text-[var(--text-muted)]">
          ← Back to projects
        </Link>
      </footer>
    </div>
  );
}
