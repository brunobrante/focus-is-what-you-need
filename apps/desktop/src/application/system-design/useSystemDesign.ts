import { useEffect, useState } from "react";
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

// ─── Token types ───────────────────────────────────────────────────────────────

export type ColorToken = { id: string; name: string; value: string };
export type GradientToken = { id: string; name: string; from: string; to: string; angle: number };
export type TypeToken = { id: string; name: string; family: string; weight: string; size: string; sample: string };
export type FontLibrary = { id: string; name: string; source: string; kind: "variable" | "static" | "system"; description: string; local?: boolean };
export type SpacingToken = { id: string; name: string; value: number };
export type RadiusToken = { id: string; name: string; value: number };
export type IconToken = { id: string; name: string; glyph: string };
export type IconLibrary = { id: string; name: string; source: string; count: number; kind: "outline" | "filled" | "mixed"; local?: boolean; localIcons?: IconToken[] };

export type Tab = "colors" | "typography" | "icons" | "spacing" | "radius" | "assets";

// ─── Helpers ───────────────────────────────────────────────────────────────────

export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

// ─── Seed data ─────────────────────────────────────────────────────────────────

export const SEED_COLORS: ColorToken[] = [
  { id: "c1", name: "Primary", value: "#5B6CFF" },
  { id: "c2", name: "Primary Dark", value: "#2A2F4A" },
  { id: "c3", name: "Accent", value: "#FF6B6B" },
  { id: "c4", name: "Success", value: "#4CAF82" },
  { id: "c5", name: "Warning", value: "#F5A623" },
  { id: "c6", name: "Surface", value: "#1A1A1A" },
  { id: "c7", name: "Border", value: "#2E2E2E" },
  { id: "c8", name: "Text", value: "#EFEFEF" },
];

export const SEED_TYPES: TypeToken[] = [
  { id: "t1", name: "Display", family: "Inter", weight: "700", size: "40px", sample: "The quick brown fox" },
  { id: "t2", name: "Heading 1", family: "Inter", weight: "600", size: "28px", sample: "The quick brown fox" },
  { id: "t3", name: "Heading 2", family: "Inter", weight: "600", size: "22px", sample: "The quick brown fox" },
  { id: "t4", name: "Body", family: "Inter", weight: "400", size: "14px", sample: "The quick brown fox jumps over the lazy dog." },
  { id: "t5", name: "Caption", family: "Inter", weight: "400", size: "11px", sample: "The quick brown fox jumps over the lazy dog." },
  { id: "t6", name: "Label", family: "Inter", weight: "500", size: "12px", sample: "Button label · Tag · Badge" },
  { id: "t7", name: "Mono", family: "JetBrains Mono", weight: "400", size: "13px", sample: "const value = 0x5EA2FF" },
];

export const SEED_SPACING: SpacingToken[] = [
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

export const SEED_RADIUS: RadiusToken[] = [
  { id: "r1", name: "none", value: 0 },
  { id: "r2", name: "sm", value: 4 },
  { id: "r3", name: "md", value: 8 },
  { id: "r4", name: "lg", value: 12 },
  { id: "r5", name: "xl", value: 16 },
  { id: "r6", name: "2xl", value: 20 },
  { id: "r7", name: "full", value: 9999 },
];

export const SEED_FONT_LIBRARIES: FontLibrary[] = [
  { id: "fl1", name: "Inter Variable", source: "rsms.me/inter", kind: "variable", description: "A typeface carefully crafted for computer screens." },
  { id: "fl2", name: "Geist", source: "vercel.com/font", kind: "variable", description: "A typeface created by Vercel for developers and designers." },
  { id: "fl3", name: "JetBrains Mono", source: "jetbrains.com/mono", kind: "static", description: "A monospace typeface for developers." },
];

export const SEED_ICON_LIBRARIES: IconLibrary[] = [
  { id: "il1", name: "Lucide", source: "lucide.dev", count: 1400, kind: "outline" },
  { id: "il2", name: "Heroicons", source: "heroicons.com", count: 292, kind: "outline" },
  { id: "il3", name: "Material Icons", source: "fonts.google.com/icons", count: 2990, kind: "mixed" },
];

// ─── Return type ───────────────────────────────────────────────────────────────

export interface SystemDesignState {
  // Tab
  tab: Tab;
  setTab: (t: Tab) => void;

  // Color tokens
  colors: ColorToken[];
  setColors: React.Dispatch<React.SetStateAction<ColorToken[]>>;
  onUpsertColor: (c: ColorToken) => void;
  onDeleteColor: (id: string) => void;

  // Gradient tokens
  gradients: GradientToken[];
  setGradients: React.Dispatch<React.SetStateAction<GradientToken[]>>;
  onUpsertGradient: (g: GradientToken) => void;
  onDeleteGradient: (id: string) => void;

  // Type tokens
  types: TypeToken[];
  setTypes: React.Dispatch<React.SetStateAction<TypeToken[]>>;
  onUpsertType: (t: TypeToken) => void;
  onDeleteType: (id: string) => void;

  // Font libraries
  fontLibraries: FontLibrary[];
  setFontLibraries: React.Dispatch<React.SetStateAction<FontLibrary[]>>;
  onUpsertFontLibrary: (l: FontLibrary) => void;
  onDeleteFontLibrary: (id: string) => void;

  // Icon tokens
  icons: IconToken[];
  setIcons: React.Dispatch<React.SetStateAction<IconToken[]>>;
  onUpsertIcon: (ic: IconToken) => void;
  onDeleteIcon: (id: string) => void;

  // Icon libraries
  iconLibraries: IconLibrary[];
  setIconLibraries: React.Dispatch<React.SetStateAction<IconLibrary[]>>;
  onUpsertIconLibrary: (l: IconLibrary) => void;
  onDeleteIconLibrary: (id: string) => void;

  // Spacing tokens
  spacing: SpacingToken[];
  setSpacing: React.Dispatch<React.SetStateAction<SpacingToken[]>>;
  onUpsertSpacing: (t: SpacingToken) => void;
  onDeleteSpacing: (id: string) => void;

  // Radius tokens
  radius: RadiusToken[];
  setRadius: React.Dispatch<React.SetStateAction<RadiusToken[]>>;
  onUpsertRadius: (t: RadiusToken) => void;
  onDeleteRadius: (id: string) => void;

  // System designs manager
  activeWorkspaceId: string | null;
  designs: ReturnType<typeof useSystemDesigns>["data"];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: ReturnType<typeof useSystemDesigns>["data"][number] | null;
  newDesignName: string;
  setNewDesignName: (v: string) => void;
  newLibraryName: string;
  setNewLibraryName: (v: string) => void;
  newIconName: string;
  setNewIconName: (v: string) => void;
  createDesign: () => Promise<void>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useSystemDesign(): SystemDesignState {
  const [tab, setTab] = useState<Tab>("colors");

  const [colors, setColors] = useState<ColorToken[]>(SEED_COLORS);
  const [gradients, setGradients] = useState<GradientToken[]>([]);
  const [types, setTypes] = useState<TypeToken[]>(SEED_TYPES);
  const [fontLibraries, setFontLibraries] = useState<FontLibrary[]>(SEED_FONT_LIBRARIES);
  const [icons, setIcons] = useState<IconToken[]>([]);
  const [iconLibraries, setIconLibraries] = useState<IconLibrary[]>(SEED_ICON_LIBRARIES);
  const [spacing, setSpacing] = useState<SpacingToken[]>(SEED_SPACING);
  const [radius, setRadius] = useState<RadiusToken[]>(SEED_RADIUS);

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

  const onUpsertColor = (c: ColorToken) => setColors((prev) => upsertById(prev, c));
  const onDeleteColor = (id: string) => setColors((prev) => prev.filter((x) => x.id !== id));

  const onUpsertGradient = (g: GradientToken) => setGradients((prev) => upsertById(prev, g));
  const onDeleteGradient = (id: string) => setGradients((prev) => prev.filter((x) => x.id !== id));

  const onUpsertType = (t: TypeToken) => setTypes((prev) => upsertById(prev, t));
  const onDeleteType = (id: string) => setTypes((prev) => prev.filter((x) => x.id !== id));

  const onUpsertFontLibrary = (l: FontLibrary) => setFontLibraries((prev) => upsertById(prev, l));
  const onDeleteFontLibrary = (id: string) => setFontLibraries((prev) => prev.filter((x) => x.id !== id));

  const onUpsertIcon = (ic: IconToken) => setIcons((prev) => upsertById(prev, ic));
  const onDeleteIcon = (id: string) => setIcons((prev) => prev.filter((x) => x.id !== id));

  const onUpsertIconLibrary = (l: IconLibrary) => setIconLibraries((prev) => upsertById(prev, l));
  const onDeleteIconLibrary = (id: string) => setIconLibraries((prev) => prev.filter((x) => x.id !== id));

  const onUpsertSpacing = (t: SpacingToken) => setSpacing((prev) => upsertById(prev, t));
  const onDeleteSpacing = (id: string) => setSpacing((prev) => prev.filter((x) => x.id !== id));

  const onUpsertRadius = (t: RadiusToken) => setRadius((prev) => upsertById(prev, t));
  const onDeleteRadius = (id: string) => setRadius((prev) => prev.filter((x) => x.id !== id));

  const handleToggleShared = (shared: boolean) => {
    if (selected) void setSystemDesignShared(selected.id, shared);
  };

  const handleAddLibrary = () => {
    if (selected && newLibraryName.trim()) {
      void addSystemDesignLibrary(selected.id, newLibraryName.trim());
      setNewLibraryName("");
    }
  };

  const handleRemoveLibrary = (id: string) => {
    if (selected) void removeSystemDesignLibrary(selected.id, id);
  };

  const handleAddIcon = () => {
    if (selected && newIconName.trim()) {
      void addSystemDesignIcon(selected.id, newIconName.trim());
      setNewIconName("");
    }
  };

  const handleRemoveIcon = (id: string) => {
    if (selected) void removeSystemDesignIcon(selected.id, id);
  };

  const handleDeleteDesign = () => {
    if (selected) void deleteSystemDesign(selected.id);
  };

  return {
    tab,
    setTab,

    colors,
    setColors,
    onUpsertColor,
    onDeleteColor,

    gradients,
    setGradients,
    onUpsertGradient,
    onDeleteGradient,

    types,
    setTypes,
    onUpsertType,
    onDeleteType,

    fontLibraries,
    setFontLibraries,
    onUpsertFontLibrary,
    onDeleteFontLibrary,

    icons,
    setIcons,
    onUpsertIcon,
    onDeleteIcon,

    iconLibraries,
    setIconLibraries,
    onUpsertIconLibrary,
    onDeleteIconLibrary,

    spacing,
    setSpacing,
    onUpsertSpacing,
    onDeleteSpacing,

    radius,
    setRadius,
    onUpsertRadius,
    onDeleteRadius,

    activeWorkspaceId,
    designs,
    selectedId,
    setSelectedId,
    selected,
    newDesignName,
    setNewDesignName,
    newLibraryName,
    setNewLibraryName,
    newIconName,
    setNewIconName,
    createDesign,
    handleToggleShared,
    handleAddLibrary,
    handleRemoveLibrary,
    handleAddIcon,
    handleRemoveIcon,
    handleDeleteDesign,
  };
}
