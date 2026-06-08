import { useEffect, useState, type ReactNode } from "react";
import {
  Home, Search, Settings, Bell, Plus as LuPlus, Minus, Check,
  ChevronRight, ChevronDown, ChevronLeft, ChevronUp,
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  Pencil, Trash2, Copy, Download, Upload, Share2, ExternalLink, Link,
  Eye, EyeOff, Lock, Unlock, Star, Heart, Bookmark, Tag,
  Zap, Globe, Info, AlertCircle, AlertTriangle, CheckCircle, XCircle,
  File, Folder, Image as LucideImg, Video, Music, Code, Database,
  LayoutGrid, List, Filter, User, Users, Mail, Phone,
  MessageSquare, Calendar, Clock, MapPin, Layers as LuLayers,
  Package, Send, Smile, Sliders, Terminal, Sun, Moon, Wand2,
  type LucideIcon,
} from "lucide-react";
import { Modal, ModalHeader, ModalBody } from "@/components/modals/Modal";
import { TopBar } from "@/components/layout/TopBar";
import {
  IconColorStyles,
  IconSearch,
  IconText,
  IconGrid,
  IconImage,
  IconPlus,
  IconDiamond,
  IconRectangle,
  IconLayers,
  IconFastEdit,
  IconTrash,
  IconClose,
} from "@/components/icons";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useSystemDesigns } from "@/lib/storage/hooks";
import {
  addSystemDesignIcon,
  addSystemDesignLibrary,
  createSystemDesign,
  deleteSystemDesign,
  removeSystemDesignIcon,
  removeSystemDesignLibrary,
  setSystemDesignShared,
} from "@/lib/storage/repos/systemDesigns.repo";

const LUCIDE_CATALOGUE: Array<{ name: string; component: LucideIcon }> = [
  { name: "home", component: Home },
  { name: "search", component: Search },
  { name: "settings", component: Settings },
  { name: "bell", component: Bell },
  { name: "plus", component: LuPlus },
  { name: "minus", component: Minus },
  { name: "check", component: Check },
  { name: "chevron-right", component: ChevronRight },
  { name: "chevron-down", component: ChevronDown },
  { name: "chevron-left", component: ChevronLeft },
  { name: "chevron-up", component: ChevronUp },
  { name: "arrow-right", component: ArrowRight },
  { name: "arrow-left", component: ArrowLeft },
  { name: "arrow-up", component: ArrowUp },
  { name: "arrow-down", component: ArrowDown },
  { name: "pencil", component: Pencil },
  { name: "trash-2", component: Trash2 },
  { name: "copy", component: Copy },
  { name: "download", component: Download },
  { name: "upload", component: Upload },
  { name: "share-2", component: Share2 },
  { name: "external-link", component: ExternalLink },
  { name: "link", component: Link },
  { name: "eye", component: Eye },
  { name: "eye-off", component: EyeOff },
  { name: "lock", component: Lock },
  { name: "unlock", component: Unlock },
  { name: "star", component: Star },
  { name: "heart", component: Heart },
  { name: "bookmark", component: Bookmark },
  { name: "tag", component: Tag },
  { name: "zap", component: Zap },
  { name: "globe", component: Globe },
  { name: "info", component: Info },
  { name: "alert-circle", component: AlertCircle },
  { name: "alert-triangle", component: AlertTriangle },
  { name: "check-circle", component: CheckCircle },
  { name: "x-circle", component: XCircle },
  { name: "file", component: File },
  { name: "folder", component: Folder },
  { name: "image", component: LucideImg },
  { name: "video", component: Video },
  { name: "music", component: Music },
  { name: "code", component: Code },
  { name: "database", component: Database },
  { name: "layout-grid", component: LayoutGrid },
  { name: "list", component: List },
  { name: "filter", component: Filter },
  { name: "user", component: User },
  { name: "users", component: Users },
  { name: "mail", component: Mail },
  { name: "phone", component: Phone },
  { name: "message-square", component: MessageSquare },
  { name: "calendar", component: Calendar },
  { name: "clock", component: Clock },
  { name: "map-pin", component: MapPin },
  { name: "layers", component: LuLayers },
  { name: "package", component: Package },
  { name: "send", component: Send },
  { name: "smile", component: Smile },
  { name: "sliders", component: Sliders },
  { name: "terminal", component: Terminal },
  { name: "sun", component: Sun },
  { name: "moon", component: Moon },
  { name: "wand-2", component: Wand2 },
];

// ─── Token types ──────────────────────────────────────────────────────────────

type ColorToken = { id: string; name: string; value: string };
type GradientToken = { id: string; name: string; from: string; to: string; angle: number };
type TypeToken = { id: string; name: string; family: string; weight: string; size: string; sample: string };
type FontLibrary = { id: string; name: string; source: string; kind: "variable" | "static" | "system"; description: string; local?: boolean };
type SpacingToken = { id: string; name: string; value: number };
type RadiusToken = { id: string; name: string; value: number };
type IconToken = { id: string; name: string; glyph: string };
type IconLibrary = { id: string; name: string; source: string; count: number; kind: "outline" | "filled" | "mixed"; local?: boolean; localIcons?: IconToken[] };

type Tab = "colors" | "typography" | "icons" | "spacing" | "radius" | "assets";

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "colors", label: "Colors", icon: <IconColorStyles size={12} strokeWidth={1.8} /> },
  { id: "typography", label: "Typography", icon: <IconText size={12} strokeWidth={1.8} /> },
  { id: "icons", label: "Icons", icon: <IconGrid size={12} strokeWidth={1.7} /> },
  { id: "spacing", label: "Spacing", icon: <IconDiamond size={10} strokeWidth={2.4} /> },
  { id: "radius", label: "Radius", icon: <IconRectangle size={12} strokeWidth={1.6} /> },
  { id: "assets", label: "Assets", icon: <IconImage size={12} strokeWidth={1.7} /> },
];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

// ─── Initial seed data ────────────────────────────────────────────────────────

const SEED_COLORS: ColorToken[] = [
  { id: "c1", name: "Primary", value: "#5B6CFF" },
  { id: "c2", name: "Primary Dark", value: "#2A2F4A" },
  { id: "c3", name: "Accent", value: "#FF6B6B" },
  { id: "c4", name: "Success", value: "#4CAF82" },
  { id: "c5", name: "Warning", value: "#F5A623" },
  { id: "c6", name: "Surface", value: "#1A1A1A" },
  { id: "c7", name: "Border", value: "#2E2E2E" },
  { id: "c8", name: "Text", value: "#EFEFEF" },
];

const SEED_TYPES: TypeToken[] = [
  { id: "t1", name: "Display", family: "Inter", weight: "700", size: "40px", sample: "The quick brown fox" },
  { id: "t2", name: "Heading 1", family: "Inter", weight: "600", size: "28px", sample: "The quick brown fox" },
  { id: "t3", name: "Heading 2", family: "Inter", weight: "600", size: "22px", sample: "The quick brown fox" },
  { id: "t4", name: "Body", family: "Inter", weight: "400", size: "14px", sample: "The quick brown fox jumps over the lazy dog." },
  { id: "t5", name: "Caption", family: "Inter", weight: "400", size: "11px", sample: "The quick brown fox jumps over the lazy dog." },
  { id: "t6", name: "Label", family: "Inter", weight: "500", size: "12px", sample: "Button label · Tag · Badge" },
  { id: "t7", name: "Mono", family: "JetBrains Mono", weight: "400", size: "13px", sample: "const value = 0x5EA2FF" },
];

const SEED_SPACING: SpacingToken[] = [
  { id: "s1", name: "xs", value: 4 },
  { id: "s2", name: "sm", value: 8 },
  { id: "s3", name: "md", value: 12 },
  { id: "s4", name: "base", value: 16 },
  { id: "s5", name: "lg", value: 20 },
  { id: "s6", name: "xl", value: 24 },
  { id: "s7", name: "2xl", value: 32 },
  { id: "s8", name: "3xl", value: 40 },
  { id: "s9", name: "4xl", value: 48 },
  { id: "s10", name: "5xl", value: 64 },
];

const SEED_RADIUS: RadiusToken[] = [
  { id: "r1", name: "none", value: 0 },
  { id: "r2", name: "sm", value: 4 },
  { id: "r3", name: "md", value: 8 },
  { id: "r4", name: "lg", value: 12 },
  { id: "r5", name: "xl", value: 16 },
  { id: "r6", name: "2xl", value: 20 },
  { id: "r7", name: "full", value: 9999 },
];

const SEED_FONT_LIBRARIES: FontLibrary[] = [
  { id: "fl1", name: "Inter Variable", source: "rsms.me/inter", kind: "variable", description: "A typeface carefully crafted for computer screens." },
  { id: "fl2", name: "Geist", source: "vercel.com/font", kind: "variable", description: "A typeface created by Vercel for developers and designers." },
  { id: "fl3", name: "JetBrains Mono", source: "jetbrains.com/mono", kind: "static", description: "A monospace typeface for developers." },
];

const SEED_ICON_LIBRARIES: IconLibrary[] = [
  { id: "il1", name: "Lucide", source: "lucide.dev", count: 1400, kind: "outline" },
  { id: "il2", name: "Heroicons", source: "heroicons.com", count: 292, kind: "outline" },
  { id: "il3", name: "Material Icons", source: "fonts.google.com/icons", count: 2990, kind: "mixed" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SystemDesign() {
  const [tab, setTab] = useState<Tab>("colors");

  const [colors, setColors] = useState<ColorToken[]>(SEED_COLORS);
  const [gradients, setGradients] = useState<GradientToken[]>([]);
  const [types, setTypes] = useState<TypeToken[]>(SEED_TYPES);
  const [fontLibraries, setFontLibraries] = useState<FontLibrary[]>(SEED_FONT_LIBRARIES);
  const [icons, setIcons] = useState<IconToken[]>([]);
  const [iconLibraries, setIconLibraries] = useState<IconLibrary[]>(SEED_ICON_LIBRARIES);
  const [spacing, setSpacing] = useState<SpacingToken[]>(SEED_SPACING);
  const [radius, setRadius] = useState<RadiusToken[]>(SEED_RADIUS);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] px-7 pt-8 pb-0">
          <div className="pb-5">
            <h1 className="m-0 mb-1 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
              System Design
            </h1>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">
              Global tokens, styles, and assets shared across all projects.
            </p>
          </div>
        </header>

        <SystemDesignManager />

        <TabBar active={tab} onChange={setTab} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1100px] px-7 py-10">
            {tab === "colors" && (
              <ColorsTab
                colors={colors}
                gradients={gradients}
                onUpsertColor={(c) => setColors((prev) => upsertById(prev, c))}
                onDeleteColor={(id) => setColors((prev) => prev.filter((x) => x.id !== id))}
                onUpsertGradient={(g) => setGradients((prev) => upsertById(prev, g))}
                onDeleteGradient={(id) => setGradients((prev) => prev.filter((x) => x.id !== id))}
              />
            )}
            {tab === "typography" && (
              <TypographyTab
                types={types}
                libraries={fontLibraries}
                onUpsert={(t) => setTypes((prev) => upsertById(prev, t))}
                onDelete={(id) => setTypes((prev) => prev.filter((x) => x.id !== id))}
                onUpsertLibrary={(l) => setFontLibraries((prev) => upsertById(prev, l))}
                onDeleteLibrary={(id) => setFontLibraries((prev) => prev.filter((x) => x.id !== id))}
              />
            )}
            {tab === "icons" && (
              <IconsTab
                icons={icons}
                libraries={iconLibraries}
                onUpsert={(ic) => setIcons((prev) => upsertById(prev, ic))}
                onDelete={(id) => setIcons((prev) => prev.filter((x) => x.id !== id))}
                onUpsertLibrary={(l) => setIconLibraries((prev) => upsertById(prev, l))}
                onDeleteLibrary={(id) => setIconLibraries((prev) => prev.filter((x) => x.id !== id))}
              />
            )}
            {tab === "spacing" && (
              <SpacingTab
                tokens={spacing}
                onUpsert={(t) => setSpacing((prev) => upsertById(prev, t))}
                onDelete={(id) => setSpacing((prev) => prev.filter((x) => x.id !== id))}
              />
            )}
            {tab === "radius" && (
              <RadiusTab
                tokens={radius}
                onUpsert={(t) => setRadius((prev) => upsertById(prev, t))}
                onDelete={(id) => setRadius((prev) => prev.filter((x) => x.id !== id))}
              />
            )}
            {tab === "assets" && <AssetsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Persisted system designs (per workspace) ──────────────────────────────────

function SystemDesignManager() {
  const [activeWorkspaceId] = useActiveWorkspaceId();
  const { data: designs } = useSystemDesigns("workspace", activeWorkspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDesignName, setNewDesignName] = useState("");
  const [newLibraryName, setNewLibraryName] = useState("");
  const [newIconName, setNewIconName] = useState("");

  useEffect(() => {
    if (designs.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !designs.some((d) => d.id === selectedId)) {
      setSelectedId(designs[0]!.id);
    }
  }, [designs, selectedId]);

  const selected = designs.find((d) => d.id === selectedId) ?? null;

  const createDesign = async () => {
    const name = newDesignName.trim();
    if (!activeWorkspaceId || !name) return;
    const created = await createSystemDesign({
      name,
      ownerScope: "workspace",
      ownerId: activeWorkspaceId,
    });
    setSelectedId(created.id);
    setNewDesignName("");
  };

  if (!activeWorkspaceId) {
    return (
      <div className="border-b border-[var(--border)] px-7 py-3 text-[12px] text-[var(--text-faint)]">
        Select or create a workspace to manage its system designs.
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--border)] px-7 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
          Designs
        </span>
        {designs.map((design) => (
          <button
            key={design.id}
            type="button"
            onClick={() => setSelectedId(design.id)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              design.id === selectedId
                ? "border-[var(--text)] bg-[var(--surface)] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
            ].join(" ")}
          >
            {design.name}
            {design.shared && (
              <span className="text-[9px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                shared
              </span>
            )}
          </button>
        ))}
        <input
          type="text"
          value={newDesignName}
          placeholder="New design name…"
          onChange={(e) => setNewDesignName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createDesign();
          }}
          className="h-7 w-[160px] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
        <button
          type="button"
          onClick={() => void createDesign()}
          disabled={!newDesignName.trim()}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
        >
          <IconPlus size={12} strokeWidth={2} />
          New
        </button>
      </div>

      {selected && (
        <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={selected.shared}
              onChange={(e) => void setSystemDesignShared(selected.id, e.target.checked)}
            />
            Shared with projects
          </label>

          <NameListEditor
            label="Libraries"
            items={selected.libraries}
            value={newLibraryName}
            onValueChange={setNewLibraryName}
            onAdd={() => {
              void addSystemDesignLibrary(selected.id, newLibraryName);
              setNewLibraryName("");
            }}
            onRemove={(id) => void removeSystemDesignLibrary(selected.id, id)}
          />

          <NameListEditor
            label="Icons"
            items={selected.icons}
            value={newIconName}
            onValueChange={setNewIconName}
            onAdd={() => {
              void addSystemDesignIcon(selected.id, newIconName);
              setNewIconName("");
            }}
            onRemove={(id) => void removeSystemDesignIcon(selected.id, id)}
          />

          <button
            type="button"
            onClick={() => void deleteSystemDesign(selected.id)}
            className="ml-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-2.5 text-[12px] text-[#ffb0b0] transition-colors hover:bg-[rgba(255,80,80,0.12)]"
          >
            <IconTrash size={12} />
            Delete design
          </button>
        </div>
      )}
    </div>
  );
}

function NameListEditor({
  label,
  items,
  value,
  onValueChange,
  onAdd,
  onRemove,
}: {
  label: string;
  items: { id: string; name: string }[];
  value: string;
  onValueChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="min-w-[220px]">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] py-0.5 pl-2 pr-1 text-[12px] text-[var(--text)]"
          >
            {item.name}
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => onRemove(item.id)}
              className="inline-grid h-4 w-4 cursor-pointer place-items-center rounded text-[var(--text-faint)] hover:text-[var(--text)]"
            >
              <IconClose size={10} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={value}
          placeholder={`Add ${label.toLowerCase().replace(/s$/, "")}…`}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          className="h-7 w-[140px] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav role="tablist" className="flex gap-1 border-b border-[var(--border)] px-7">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            onClick={() => onChange(t.id)}
            aria-selected={isActive}
            className={[
              "relative inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3.5 py-3 text-[13px] font-medium tracking-[0.1px]",
              isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <span className="opacity-75">{t.icon}</span>
            {t.label}
            {isActive && (
              <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Shared section block ─────────────────────────────────────────────────────

function SectionBlock({
  title,
  icon,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actionLabel: string;
  onAction: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
        <div className="flex items-center gap-2 text-[var(--text-faint)]">
          {icon}
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.5px]">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconPlus size={12} strokeWidth={2} />
          {actionLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] text-[var(--text-faint)]">
      <IconPlus size={18} strokeWidth={1.5} />
      <span className="text-[12px]">{label}</span>
    </div>
  );
}

// ─── Shared modal field ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-[var(--text-muted)]">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]";

// ─── Colors tab ───────────────────────────────────────────────────────────────

function ColorsTab({
  colors,
  gradients,
  onUpsertColor,
  onDeleteColor,
  onUpsertGradient,
  onDeleteGradient,
}: {
  colors: ColorToken[];
  gradients: GradientToken[];
  onUpsertColor: (c: ColorToken) => void;
  onDeleteColor: (id: string) => void;
  onUpsertGradient: (g: GradientToken) => void;
  onDeleteGradient: (id: string) => void;
}) {
  const [colorModal, setColorModal] = useState<{ open: boolean; token?: ColorToken }>({ open: false });
  const [gradientModal, setGradientModal] = useState<{ open: boolean; token?: GradientToken }>({ open: false });

  return (
    <>
      <div className="flex flex-col gap-10">
        <SectionBlock
          title="Palette"
          icon={<IconColorStyles size={13} strokeWidth={1.7} />}
          actionLabel="New color"
          onAction={() => setColorModal({ open: true })}
        >
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {colors.map((c) => (
              <div
                key={c.id}
                className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
              >
                <div
                  className="relative h-16 w-full rounded-lg border border-white/10"
                  style={{ background: c.value }}
                >
                  <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                    <TokenAction icon={<IconFastEdit size={11} />} onClick={() => setColorModal({ open: true, token: c })} />
                    <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDeleteColor(c.id)} />
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] font-medium text-[var(--text)]">{c.name}</div>
                  <div className="font-mono text-[11px] text-[var(--text-faint)]">{c.value}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title="Gradients"
          icon={<IconLayers size={13} strokeWidth={1.7} />}
          actionLabel="New gradient"
          onAction={() => setGradientModal({ open: true })}
        >
          {gradients.length === 0 ? (
            <EmptySlot label="No gradients yet" />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {gradients.map((g) => (
                <div key={g.id} className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]">
                  <div
                    className="relative h-16 w-full rounded-lg border border-white/10"
                    style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
                  >
                    <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                      <TokenAction icon={<IconFastEdit size={11} />} onClick={() => setGradientModal({ open: true, token: g })} />
                      <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDeleteGradient(g.id)} />
                    </div>
                  </div>
                  <div className="text-[12.5px] font-medium text-[var(--text)]">{g.name}</div>
                </div>
              ))}
            </div>
          )}
        </SectionBlock>
      </div>

      <ColorModal
        open={colorModal.open}
        token={colorModal.token}
        onClose={() => setColorModal({ open: false })}
        onSave={(c) => { onUpsertColor(c); setColorModal({ open: false }); }}
      />
      <GradientModal
        open={gradientModal.open}
        token={gradientModal.token}
        onClose={() => setGradientModal({ open: false })}
        onSave={(g) => { onUpsertGradient(g); setGradientModal({ open: false }); }}
      />
    </>
  );
}

// ─── Typography tab ───────────────────────────────────────────────────────────

const FONT_KIND_LABEL: Record<FontLibrary["kind"], string> = {
  variable: "Variable",
  static: "Static",
  system: "System",
};

function TypographyTab({
  types,
  libraries,
  onUpsert,
  onDelete,
  onUpsertLibrary,
  onDeleteLibrary,
}: {
  types: TypeToken[];
  libraries: FontLibrary[];
  onUpsert: (t: TypeToken) => void;
  onDelete: (id: string) => void;
  onUpsertLibrary: (l: FontLibrary) => void;
  onDeleteLibrary: (id: string) => void;
}) {
  const [styleModal, setStyleModal] = useState<{ open: boolean; token?: TypeToken }>({ open: false });
  const [libModal, setLibModal] = useState<{ open: boolean; library?: FontLibrary }>({ open: false });
  const [browsing, setBrowsing] = useState<FontLibrary | null>(null);

  return (
    <>
      <div className="flex flex-col gap-10">
        <SectionBlock
          title="Type Styles"
          icon={<IconText size={13} strokeWidth={1.8} />}
          actionLabel="Add style"
          onAction={() => setStyleModal({ open: true })}
        >
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {types.map((t) => (
              <div
                key={t.id}
                className="group -mx-3 flex cursor-pointer items-center gap-5 rounded-lg px-3 py-4 transition-colors hover:bg-[var(--surface)]"
              >
                <div className="w-28 shrink-0">
                  <div className="text-[12.5px] font-medium text-[var(--text)]">{t.name}</div>
                  <div className="text-[11px] text-[var(--text-faint)]">{t.family} · {t.weight} · {t.size}</div>
                </div>
                <div
                  className="min-w-0 flex-1 truncate text-[var(--text)]"
                  style={{ fontFamily: t.family, fontWeight: t.weight, fontSize: t.size, lineHeight: "1.3" }}
                >
                  {t.sample}
                </div>
                <div className="hidden gap-1 group-hover:flex">
                  <TokenAction icon={<IconFastEdit size={11} />} onClick={() => setStyleModal({ open: true, token: t })} />
                  <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDelete(t.id)} />
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock
          title="Libraries"
          icon={<IconLayers size={13} strokeWidth={1.7} />}
          actionLabel="Add library"
          onAction={() => setLibModal({ open: true })}
        >
          {libraries.length === 0 ? (
            <EmptySlot label="No font libraries added" />
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {libraries.map((lib) => (
                <div
                  key={lib.id}
                  onClick={() => setBrowsing(lib)}
                  className="group -mx-3 flex cursor-pointer items-center gap-4 rounded-lg px-3 py-3.5 transition-colors hover:bg-[var(--surface)]"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[15px] font-semibold text-[var(--text)]"
                    style={{ fontFamily: lib.name }}
                  >
                    Aa
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--text)]">{lib.name}</span>
                      <span className="rounded border border-[var(--border)] px-1.5 py-px text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                        {lib.local ? "Local" : FONT_KIND_LABEL[lib.kind]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11.5px] text-[var(--text-faint)]">
                      <span>{lib.source || "Local library"}</span>
                      {lib.description && <span className="truncate">· {lib.description}</span>}
                    </div>
                  </div>
                  <div className="hidden items-center gap-1 group-hover:flex">
                    <span className="mr-1 text-[11px] text-[var(--text-faint)]">Browse</span>
                    <TokenAction icon={<IconFastEdit size={11} />} onClick={() => setLibModal({ open: true, library: lib })} />
                    <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDeleteLibrary(lib.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionBlock>
      </div>

      <TypeModal
        open={styleModal.open}
        token={styleModal.token}
        onClose={() => setStyleModal({ open: false })}
        onSave={(t) => { onUpsert(t); setStyleModal({ open: false }); }}
      />
      <FontLibraryModal
        open={libModal.open}
        library={libModal.library}
        onClose={() => setLibModal({ open: false })}
        onSave={(l) => { onUpsertLibrary(l); setLibModal({ open: false }); }}
      />
      <FontBrowserModal
        library={browsing}
        onClose={() => setBrowsing(null)}
      />
    </>
  );
}

// ─── Icons tab ────────────────────────────────────────────────────────────────

const ICON_KIND_LABEL: Record<IconLibrary["kind"], string> = {
  outline: "Outline",
  filled: "Filled",
  mixed: "Mixed",
};

function IconsTab({
  icons,
  libraries,
  onUpsert,
  onDelete,
  onUpsertLibrary,
  onDeleteLibrary,
}: {
  icons: IconToken[];
  libraries: IconLibrary[];
  onUpsert: (ic: IconToken) => void;
  onDelete: (id: string) => void;
  onUpsertLibrary: (l: IconLibrary) => void;
  onDeleteLibrary: (id: string) => void;
}) {
  const [iconModal, setIconModal] = useState<{ open: boolean; token?: IconToken }>({ open: false });
  const [libModal, setLibModal] = useState<{ open: boolean; library?: IconLibrary }>({ open: false });
  const [browsing, setBrowsing] = useState<IconLibrary | null>(null);

  return (
    <>
      <div className="flex flex-col gap-10">
        <SectionBlock
          title="Custom Icons"
          icon={<IconGrid size={12} strokeWidth={1.7} />}
          actionLabel="Add icon"
          onAction={() => setIconModal({ open: true })}
        >
          {icons.length === 0 ? (
            <EmptySlot label="No icons added yet" />
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
              {icons.map((ic) => (
                <div
                  key={ic.id}
                  className="group relative grid aspect-square gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                >
                  <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                    <TokenAction icon={<IconFastEdit size={10} />} onClick={() => setIconModal({ open: true, token: ic })} />
                    <TokenAction icon={<IconTrash size={10} />} danger onClick={() => onDelete(ic.id)} />
                  </div>
                  <div className="grid place-items-center text-[22px]">{ic.glyph}</div>
                  <div className="truncate text-center text-[11px] text-[var(--text-muted)]">{ic.name}</div>
                </div>
              ))}
            </div>
          )}
        </SectionBlock>

        <SectionBlock
          title="Libraries"
          icon={<IconLayers size={13} strokeWidth={1.7} />}
          actionLabel="Add library"
          onAction={() => setLibModal({ open: true })}
        >
          {libraries.length === 0 ? (
            <EmptySlot label="No icon libraries added" />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {libraries.map((lib) => (
                <div
                  key={lib.id}
                  onClick={() => setBrowsing(lib)}
                  className="group relative flex cursor-pointer items-center gap-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[18px] text-[var(--text-muted)]">
                    ⬡
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--text)]">{lib.name}</span>
                      <span className="rounded border border-[var(--border)] px-1.5 py-px text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                        {lib.local ? "Local" : ICON_KIND_LABEL[lib.kind]}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[var(--text-faint)]">
                      {lib.local
                        ? `${(lib.localIcons ?? []).length} icons · local`
                        : `${lib.count.toLocaleString()} icons · ${lib.source}`}
                    </div>
                  </div>
                  <div className="absolute right-2.5 top-2.5 hidden items-center gap-1 group-hover:flex">
                    <span className="mr-0.5 text-[11px] text-[var(--text-faint)]">Browse</span>
                    <TokenAction icon={<IconFastEdit size={10} />} onClick={() => setLibModal({ open: true, library: lib })} />
                    <TokenAction icon={<IconTrash size={10} />} danger onClick={() => onDeleteLibrary(lib.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionBlock>
      </div>

      <IconModal
        open={iconModal.open}
        token={iconModal.token}
        onClose={() => setIconModal({ open: false })}
        onSave={(ic) => { onUpsert(ic); setIconModal({ open: false }); }}
      />
      <IconLibraryModal
        open={libModal.open}
        library={libModal.library}
        onClose={() => setLibModal({ open: false })}
        onSave={(l) => { onUpsertLibrary(l); setLibModal({ open: false }); }}
      />
      <IconBrowserModal
        library={browsing}
        onClose={() => setBrowsing(null)}
        onUpsertLibrary={onUpsertLibrary}
      />
    </>
  );
}

// ─── Spacing tab ──────────────────────────────────────────────────────────────

function SpacingTab({
  tokens,
  onUpsert,
  onDelete,
}: {
  tokens: SpacingToken[];
  onUpsert: (t: SpacingToken) => void;
  onDelete: (id: string) => void;
}) {
  const [modal, setModal] = useState<{ open: boolean; token?: SpacingToken }>({ open: false });

  return (
    <>
      <div className="flex flex-col gap-10">
        <SectionBlock
          title="Spacing Scale"
          icon={<IconDiamond size={10} strokeWidth={2.4} />}
          actionLabel="Add token"
          onAction={() => setModal({ open: true })}
        >
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {tokens.map((s) => (
              <div
                key={s.id}
                className="group -mx-3 flex cursor-pointer items-center gap-5 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
              >
                <span className="w-14 shrink-0 font-mono text-[12px] text-[var(--text-faint)]">{s.name}</span>
                <div
                  className="shrink-0 rounded-[2px] bg-[var(--text-muted)] transition-all"
                  style={{ width: Math.min(s.value * 2, 200), height: 10 }}
                />
                <span className="font-mono text-[12px] text-[var(--text-muted)]">{s.value}px</span>
                <div className="ml-auto hidden gap-1 group-hover:flex">
                  <TokenAction icon={<IconFastEdit size={11} />} onClick={() => setModal({ open: true, token: s })} />
                  <TokenAction icon={<IconTrash size={11} />} danger onClick={() => onDelete(s.id)} />
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>

      <SpacingModal
        open={modal.open}
        token={modal.token}
        onClose={() => setModal({ open: false })}
        onSave={(t) => { onUpsert(t); setModal({ open: false }); }}
      />
    </>
  );
}

// ─── Radius tab ───────────────────────────────────────────────────────────────

function RadiusTab({
  tokens,
  onUpsert,
  onDelete,
}: {
  tokens: RadiusToken[];
  onUpsert: (t: RadiusToken) => void;
  onDelete: (id: string) => void;
}) {
  const [modal, setModal] = useState<{ open: boolean; token?: RadiusToken }>({ open: false });

  return (
    <>
      <div className="flex flex-col gap-10">
        <SectionBlock
          title="Border Radius"
          icon={<IconRectangle size={12} strokeWidth={1.6} />}
          actionLabel="Add token"
          onAction={() => setModal({ open: true })}
        >
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
            {tokens.map((r) => (
              <div
                key={r.id}
                className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-[var(--border)] p-3.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
              >
                <div className="relative">
                  <div
                    className="h-14 w-full border border-[var(--border-strong)] bg-[var(--surface-hover)]"
                    style={{ borderRadius: Math.min(r.value, 28) }}
                  />
                  <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                    <TokenAction icon={<IconFastEdit size={10} />} onClick={() => setModal({ open: true, token: r })} />
                    <TokenAction icon={<IconTrash size={10} />} danger onClick={() => onDelete(r.id)} />
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] font-medium text-[var(--text)]">{r.name}</div>
                  <div className="font-mono text-[11px] text-[var(--text-faint)]">
                    {r.value === 9999 ? "9999px" : `${r.value}px`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>

      <RadiusModal
        open={modal.open}
        token={modal.token}
        onClose={() => setModal({ open: false })}
        onSave={(t) => { onUpsert(t); setModal({ open: false }); }}
      />
    </>
  );
}

// ─── Assets tab ───────────────────────────────────────────────────────────────

function AssetsTab() {
  return (
    <div className="flex flex-col gap-10">
      <SectionBlock
        title="Images"
        icon={<IconImage size={13} strokeWidth={1.7} />}
        actionLabel="Upload"
        onAction={() => {}}
      >
        <EmptySlot label="No images uploaded" />
      </SectionBlock>
    </div>
  );
}

// ─── Token action button (edit/delete overlay) ────────────────────────────────

function TokenAction({
  icon,
  danger,
  onClick,
}: {
  icon: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={[
        "grid h-6 w-6 cursor-pointer place-items-center rounded-md border backdrop-blur-md transition-colors",
        danger
          ? "border-[var(--border-strong)] bg-[rgba(20,20,20,0.9)] text-[#ff8080] hover:bg-[rgba(255,60,60,0.18)]"
          : "border-[var(--border-strong)] bg-[rgba(20,20,20,0.9)] text-[var(--text-muted)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ColorModal({
  open,
  token,
  onClose,
  onSave,
}: {
  open: boolean;
  token?: ColorToken;
  onClose: () => void;
  onSave: (c: ColorToken) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("#5EA2FF");

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? "");
    setValue(token?.value ?? "#5EA2FF");
  }, [token, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={token ? "Edit color" : "New color"}>
      <ModalHeader
        title={token ? "Edit color" : "New color"}
        subtitle="Name the token and pick a color value."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Primary" />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-11 w-16 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1"
              />
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={`${inputCls} flex-1 font-mono uppercase`}
                placeholder="#5EA2FF"
              />
            </div>
          </Field>
          <div
            className="h-24 w-full rounded-xl border border-white/10"
            style={{ background: value }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: token?.id ?? uid(), name: name.trim() || "Custom", value })}
              className="btn btn-primary"
            >
              Save color
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function GradientModal({
  open,
  token,
  onClose,
  onSave,
}: {
  open: boolean;
  token?: GradientToken;
  onClose: () => void;
  onSave: (g: GradientToken) => void;
}) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("#5B6CFF");
  const [to, setTo] = useState("#FF6B6B");
  const [angle, setAngle] = useState(135);

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? "");
    setFrom(token?.from ?? "#5B6CFF");
    setTo(token?.to ?? "#FF6B6B");
    setAngle(token?.angle ?? 135);
  }, [token, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={token ? "Edit gradient" : "New gradient"}>
      <ModalHeader
        title={token ? "Edit gradient" : "New gradient"}
        subtitle="Define a two-stop linear gradient token."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Hero gradient" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <div className="flex items-center gap-2">
                <input type="color" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 w-12 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" />
                <input value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} flex-1 font-mono uppercase`} />
              </div>
            </Field>
            <Field label="To">
              <div className="flex items-center gap-2">
                <input type="color" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 w-12 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" />
                <input value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} flex-1 font-mono uppercase`} />
              </div>
            </Field>
          </div>
          <Field label={`Angle — ${angle}°`}>
            <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full" />
          </Field>
          <div
            className="h-20 w-full rounded-xl border border-white/10"
            style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: token?.id ?? uid(), name: name.trim() || "Gradient", from, to, angle })}
              className="btn btn-primary"
            >
              Save gradient
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function TypeModal({
  open,
  token,
  onClose,
  onSave,
}: {
  open: boolean;
  token?: TypeToken;
  onClose: () => void;
  onSave: (t: TypeToken) => void;
}) {
  const [name, setName] = useState("");
  const [family, setFamily] = useState("Inter");
  const [weight, setWeight] = useState("400");
  const [size, setSize] = useState("14px");
  const [sample, setSample] = useState("The quick brown fox");

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? "");
    setFamily(token?.family ?? "Inter");
    setWeight(token?.weight ?? "400");
    setSize(token?.size ?? "14px");
    setSample(token?.sample ?? "The quick brown fox");
  }, [token, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={token ? "Edit type style" : "New type style"}>
      <ModalHeader
        title={token ? "Edit type style" : "New type style"}
        subtitle="Define a named typography token with font, size, and weight."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Heading 1" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Family">
              <input value={family} onChange={(e) => setFamily(e.target.value)} className={inputCls} placeholder="Inter" />
            </Field>
            <Field label="Weight">
              <input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} placeholder="400" />
            </Field>
            <Field label="Size">
              <input value={size} onChange={(e) => setSize(e.target.value)} className={inputCls} placeholder="14px" />
            </Field>
          </div>
          <Field label="Sample text">
            <input value={sample} onChange={(e) => setSample(e.target.value)} className={inputCls} placeholder="The quick brown fox" />
          </Field>
          <div
            className="min-h-[56px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text)]"
            style={{ fontFamily: family, fontWeight: weight, fontSize: size, lineHeight: "1.3" }}
          >
            {sample || "Preview"}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: token?.id ?? uid(), name: name.trim() || "Style", family, weight, size, sample })}
              className="btn btn-primary"
            >
              Save style
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function IconModal({
  open,
  token,
  onClose,
  onSave,
}: {
  open: boolean;
  token?: IconToken;
  onClose: () => void;
  onSave: (ic: IconToken) => void;
}) {
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? "");
    setGlyph(token?.glyph ?? "");
  }, [token, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={token ? "Edit icon" : "Add icon"}>
      <ModalHeader
        title={token ? "Edit icon" : "Add icon"}
        subtitle="Paste an emoji, unicode character, or a short symbol that represents this icon."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Bell" />
          </Field>
          <Field label="Glyph or emoji">
            <input value={glyph} onChange={(e) => setGlyph(e.target.value)} className={`${inputCls} text-[22px]`} placeholder="🔔" maxLength={4} />
          </Field>
          {glyph && (
            <div className="grid h-20 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[40px]">
              {glyph}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: token?.id ?? uid(), name: name.trim() || "Icon", glyph })}
              className="btn btn-primary"
            >
              Save icon
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function SpacingModal({
  open,
  token,
  onClose,
  onSave,
}: {
  open: boolean;
  token?: SpacingToken;
  onClose: () => void;
  onSave: (t: SpacingToken) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState(16);

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? "");
    setValue(token?.value ?? 16);
  }, [token, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={token ? "Edit spacing token" : "Add spacing token"}>
      <ModalHeader
        title={token ? "Edit spacing token" : "Add spacing token"}
        subtitle="Name the token and set its value in pixels."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. lg" />
          </Field>
          <Field label={`Value — ${value}px`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={256}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                max={512}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="h-11 w-24 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]"
              />
            </div>
          </Field>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div
              className="shrink-0 rounded-[2px] bg-[var(--text-muted)]"
              style={{ width: Math.min(value * 2, 400), height: 12 }}
            />
            <span className="font-mono text-[12px] text-[var(--text-muted)]">{value}px</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: token?.id ?? uid(), name: name.trim() || `${value}px`, value })}
              className="btn btn-primary"
            >
              Save token
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function RadiusModal({
  open,
  token,
  onClose,
  onSave,
}: {
  open: boolean;
  token?: RadiusToken;
  onClose: () => void;
  onSave: (t: RadiusToken) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState(8);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(token?.name ?? "");
    const full = token ? token.value === 9999 : false;
    setIsFull(full);
    setValue(full ? 8 : (token?.value ?? 8));
  }, [token, open]);

  const effectiveValue = isFull ? 9999 : value;

  return (
    <Modal open={open} onClose={onClose} ariaLabel={token ? "Edit radius token" : "Add radius token"}>
      <ModalHeader
        title={token ? "Edit radius token" : "Add radius token"}
        subtitle="Name the token and define a corner radius in pixels."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. md" />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={isFull}
              onChange={(e) => setIsFull(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--text)]"
            />
            Full / pill (9999px)
          </label>
          {!isFull && (
            <Field label={`Value — ${value}px`}>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={64}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={256}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="h-11 w-24 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]"
                />
              </div>
            </Field>
          )}
          <div
            className="h-20 w-full border border-[var(--border-strong)] bg-[var(--surface)]"
            style={{ borderRadius: Math.min(effectiveValue, 40) }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: token?.id ?? uid(), name: name.trim() || `${effectiveValue}px`, value: effectiveValue })}
              className="btn btn-primary"
            >
              Save token
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

// ─── Font browser modal ───────────────────────────────────────────────────────

const FONT_WEIGHTS: Array<{ label: string; value: string }> = [
  { label: "Thin", value: "100" },
  { label: "Light", value: "300" },
  { label: "Regular", value: "400" },
  { label: "Medium", value: "500" },
  { label: "Semibold", value: "600" },
  { label: "Bold", value: "700" },
  { label: "Extrabold", value: "800" },
  { label: "Black", value: "900" },
];

function FontBrowserModal({
  library,
  onClose,
}: {
  library: FontLibrary | null;
  onClose: () => void;
}) {
  const [sample, setSample] = useState("The quick brown fox jumps over the lazy dog.");
  const [size, setSize] = useState(32);
  const [query, setQuery] = useState("");

  useEffect(() => { if (library) { setSample("The quick brown fox jumps over the lazy dog."); setQuery(""); } }, [library]);

  if (!library) return null;

  const filteredWeights = FONT_WEIGHTS.filter((w) =>
    !query || w.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Modal open onClose={onClose} size="wide" ariaLabel={`Browse ${library.name}`}>
      <ModalHeader title={library.name} subtitle={library.source || "Local font library"} onClose={onClose} />
      <ModalBody className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <IconSearch size={13} strokeWidth={1.7} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter weights…"
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
            />
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <span>{size}px</span>
            <input type="range" min={12} max={96} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24" />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            rows={2}
            className="w-full resize-none border-0 bg-transparent text-[var(--text)] outline-none"
            style={{ fontFamily: library.name, fontSize: size, lineHeight: 1.25 }}
          />
        </div>

        <div className="flex flex-col divide-y divide-[var(--border)]">
          {filteredWeights.map((w) => (
            <div key={w.value} className="flex items-baseline gap-5 py-4">
              <span className="w-24 shrink-0 text-[11.5px] text-[var(--text-faint)]">
                {w.label} · {w.value}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[var(--text)]"
                style={{ fontFamily: library.name, fontWeight: w.value, fontSize: size * 0.7, lineHeight: 1.25 }}
              >
                {sample || "Type something above"}
              </span>
            </div>
          ))}
        </div>

        {filteredWeights.length === 0 && (
          <div className="py-8 text-center text-[13px] text-[var(--text-faint)]">No weights match "{query}"</div>
        )}
      </ModalBody>
    </Modal>
  );
}

// ─── Icon browser modal ───────────────────────────────────────────────────────

function IconBrowserModal({
  library,
  onClose,
  onUpsertLibrary,
}: {
  library: IconLibrary | null;
  onClose: () => void;
  onUpsertLibrary: (l: IconLibrary) => void;
}) {
  const [query, setQuery] = useState("");
  const [addGlyph, setAddGlyph] = useState("");
  const [addName, setAddName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { if (library) setQuery(""); }, [library]);

  if (!library) return null;

  const isLucide = library.source.includes("lucide");
  const isLocal = !!library.local;

  const lucideFiltered = LUCIDE_CATALOGUE.filter((ic) =>
    !query || ic.name.toLowerCase().includes(query.toLowerCase()),
  );
  const localFiltered = (library.localIcons ?? []).filter((ic) =>
    !query || ic.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleCopy = (name: string) => {
    void navigator.clipboard.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleAddLocal = () => {
    if (!addGlyph.trim()) return;
    const newIcon: IconToken = { id: uid(), name: addName.trim() || addGlyph.trim(), glyph: addGlyph.trim() };
    onUpsertLibrary({ ...library, localIcons: [...(library.localIcons ?? []), newIcon] });
    setAddGlyph("");
    setAddName("");
  };

  return (
    <Modal open onClose={onClose} size="wide" ariaLabel={`Browse ${library.name}`}>
      <ModalHeader
        title={library.name}
        subtitle={isLocal ? `${(library.localIcons ?? []).length} icons · local library` : `${library.count.toLocaleString()} icons · ${library.source}`}
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-5">
        <div className="relative">
          <IconSearch size={13} strokeWidth={1.7} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${isLucide ? "Lucide" : library.name} icons…`}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text)]">
              <IconClose size={10} strokeWidth={2} />
            </button>
          )}
        </div>

        {isLucide && (
          <>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
              {lucideFiltered.map((ic) => {
                const Icon = ic.component;
                const isCopied = copied === ic.name;
                return (
                  <button
                    key={ic.name}
                    type="button"
                    onClick={() => handleCopy(ic.name)}
                    title={ic.name}
                    className={[
                      "group flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                      isCopied ? "border-[var(--text-muted)] bg-[var(--surface)] text-[var(--text)]" : "border-transparent",
                    ].join(" ")}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span className="w-full truncate text-center text-[10px]">
                      {isCopied ? "Copied!" : ic.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {lucideFiltered.length === 0 && (
              <div className="py-8 text-center text-[13px] text-[var(--text-faint)]">No icons match "{query}"</div>
            )}
            <p className="text-center text-[11px] text-[var(--text-faint)]">Click any icon to copy its name · {lucideFiltered.length} of {LUCIDE_CATALOGUE.length} shown</p>
          </>
        )}

        {isLocal && (
          <>
            {localFiltered.length > 0 ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
                {localFiltered.map((ic) => (
                  <div
                    key={ic.id}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-[var(--text)]"
                  >
                    <span className="text-[22px]">{ic.glyph}</span>
                    <span className="w-full truncate text-center text-[10px] text-[var(--text-muted)]">{ic.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[13px] text-[var(--text-faint)]">
                {query ? `No icons match "${query}"` : "No icons in this library yet"}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-1 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[var(--text-faint)]">Glyph / emoji</label>
                  <input
                    value={addGlyph}
                    onChange={(e) => setAddGlyph(e.target.value)}
                    maxLength={4}
                    placeholder="🔔"
                    className="h-9 w-16 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-center text-[18px] outline-none focus:border-[var(--text-muted)]"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-[11px] text-[var(--text-faint)]">Name</label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. bell"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddLocal}
                disabled={!addGlyph.trim()}
                className="h-9 rounded-lg border border-[var(--border)] bg-transparent px-3 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add icon
              </button>
            </div>
          </>
        )}

        {!isLucide && !isLocal && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="text-[32px]">⬡</span>
            <div>
              <p className="mb-1 text-[14px] font-medium text-[var(--text)]">{library.name}</p>
              <p className="text-[13px] text-[var(--text-muted)]">
                This library is registered externally.{" "}
                <a href={`https://${library.source}`} target="_blank" rel="noreferrer" className="underline hover:text-[var(--text)]">
                  Browse online ↗
                </a>
              </p>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}

function FontLibraryModal({
  open,
  library,
  onClose,
  onSave,
}: {
  open: boolean;
  library?: FontLibrary;
  onClose: () => void;
  onSave: (l: FontLibrary) => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<FontLibrary["kind"]>("variable");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(library?.name ?? "");
    setSource(library?.source ?? "");
    setKind(library?.kind ?? "variable");
    setDescription(library?.description ?? "");
  }, [library, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={library ? "Edit font library" : "Add font library"}>
      <ModalHeader
        title={library ? "Edit font library" : "Add font library"}
        subtitle="Register a typeface family or a font collection used in your design system."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Inter Variable" />
          </Field>
          <Field label="Source / URL">
            <input value={source} onChange={(e) => setSource(e.target.value)} className={inputCls} placeholder="e.g. rsms.me/inter" />
          </Field>
          <Field label="Kind">
            <div className="flex gap-2">
              {(["variable", "static", "system"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={[
                    "flex-1 rounded-lg border py-2 text-[12.5px] font-medium capitalize transition-colors",
                    kind === k
                      ? "border-[var(--text)] bg-[var(--surface)] text-[var(--text)]"
                      : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  {FONT_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Description">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Optional short description" />
          </Field>
          {name && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <div
                className="text-[22px] font-semibold text-[var(--text)]"
                style={{ fontFamily: name }}
              >
                Aa Bb Cc 123
              </div>
              <div className="ml-auto text-[11px] text-[var(--text-faint)]">{name}</div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: library?.id ?? uid(), name: name.trim() || "Library", source, kind, description })}
              className="btn btn-primary"
            >
              Save library
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function IconLibraryModal({
  open,
  library,
  onClose,
  onSave,
}: {
  open: boolean;
  library?: IconLibrary;
  onClose: () => void;
  onSave: (l: IconLibrary) => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [count, setCount] = useState(0);
  const [kind, setKind] = useState<IconLibrary["kind"]>("outline");

  useEffect(() => {
    if (!open) return;
    setName(library?.name ?? "");
    setSource(library?.source ?? "");
    setCount(library?.count ?? 0);
    setKind(library?.kind ?? "outline");
  }, [library, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={library ? "Edit icon library" : "Add icon library"}>
      <ModalHeader
        title={library ? "Edit icon library" : "Add icon library"}
        subtitle="Register an icon pack or icon set used across your projects."
        onClose={onClose}
      />
      <ModalBody>
        <div className="grid gap-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Lucide" />
          </Field>
          <Field label="Source / URL">
            <input value={source} onChange={(e) => setSource(e.target.value)} className={inputCls} placeholder="e.g. lucide.dev" />
          </Field>
          <Field label="Style">
            <div className="flex gap-2">
              {(["outline", "filled", "mixed"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={[
                    "flex-1 rounded-lg border py-2 text-[12.5px] font-medium capitalize transition-colors",
                    kind === k
                      ? "border-[var(--text)] bg-[var(--surface)] text-[var(--text)]"
                      : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  {ICON_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Icon count (optional)">
            <input
              type="number"
              min={0}
              value={count || ""}
              onChange={(e) => setCount(Number(e.target.value))}
              className={inputCls}
              placeholder="e.g. 1400"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button
              type="button"
              onClick={() => onSave({ id: library?.id ?? uid(), name: name.trim() || "Library", source, count, kind })}
              className="btn btn-primary"
            >
              Save library
            </button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
