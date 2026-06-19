import { useState } from "react";
import {
  IconAccessibilityCheck, IconChecklist, IconColorStyles, IconDocument,
  IconGlobe, IconGrid, IconImage, IconLightning, IconPlus, IconRenameLayers,
  IconReplace, IconRewrite, IconSearch, IconSparkles, IconStar, IconTmbAssets,
  IconTypeStyles, IconUpload, IconWand,
} from "@/components/icons";
import type { LibraryMode } from "./LibraryPanel";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  "Add components":        <IconGrid size={12} strokeWidth={1.8} />,
  "Checklist":             <IconChecklist />,
  "Make an image":         <IconImage size={12} strokeWidth={1.8} />,
  "Replace content":       <IconReplace />,
  "Translate to...":       <IconGlobe />,
  "Rewrite this...":       <IconRewrite />,
  "Rename layers":         <IconRenameLayers />,
  "Find more like Coupon": <IconSearch size={12} strokeWidth={1.8} />,
  "First Draft":           <IconDocument />,
  "Image library":         <IconImage size={12} strokeWidth={1.8} />,
  "Icon library":          <IconStar size={12} strokeWidth={1.8} />,
  "Color styles":          <IconColorStyles />,
  "Text styles":           <IconTypeStyles />,
  "Local uploads":         <IconUpload />,
  "Shared components":     <IconGrid size={12} strokeWidth={1.8} />,
  "TMB Assets Library":    <IconTmbAssets />,
  "Figma Make":            <IconLightning />,
  "Auto layout helper":    <IconGrid size={12} strokeWidth={1.8} />,
  "Accessibility checker": <IconAccessibilityCheck />,
  "Content generator":     <IconSparkles />,
  "Localization helper":   <IconGlobe />,
};

type TabId = "all" | "assets" | "plugins";

const ITEMS_BY_TAB: Record<TabId, Array<{ title: string }>> = {
  all: [
    { title: "Add components" },
    { title: "Checklist" },
    { title: "Make an image" },
    { title: "Replace content" },
    { title: "Translate to..." },
    { title: "Rewrite this..." },
    { title: "Rename layers" },
    { title: "Find more like Coupon" },
    { title: "First Draft" },
  ],
  assets: [
    { title: "Image library" },
    { title: "Icon library" },
    { title: "TMB Assets Library" },
    { title: "Color styles" },
    { title: "Text styles" },
    { title: "Local uploads" },
    { title: "Shared components" },
  ],
  plugins: [
    { title: "Figma Make" },
    { title: "Auto layout helper" },
    { title: "Accessibility checker" },
    { title: "Content generator" },
    { title: "Localization helper" },
  ],
};

const SECTION_TITLE: Record<TabId, string> = {
  all: "Suggestions",
  assets: "Assets",
  plugins: "Plugins & widgets",
};

export function ActionsMainList({
  onOpenAi,
  onOpenChecklist,
  onOpenComponents,
  onOpenLibrary,
}: {
  onOpenAi: () => void;
  onOpenChecklist: () => void;
  onOpenComponents: () => void;
  onOpenLibrary: (mode: LibraryMode) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [searchValue, setSearchValue] = useState("");
  const [wandHover, setWandHover] = useState(false);

  const visibleItems = ITEMS_BY_TAB[activeTab].filter((item) =>
    item.title.toLowerCase().includes(searchValue.trim().toLowerCase()),
  );

  const handleItemClick = (title: string) => {
    if (title === "Add components") { onOpenComponents(); return; }
    if (title === "Checklist") { onOpenChecklist(); return; }
    if (title === "Image library") { onOpenLibrary("images"); return; }
    if (title === "Icon library") { onOpenLibrary("icons"); return; }
    if (title === "TMB Assets Library") { onOpenLibrary("tmb"); return; }
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "all", label: "All" },
    { id: "assets", label: "Assets" },
    { id: "plugins", label: "Plugins & widgets" },
  ];

  return (
    <>
      <div className="flex h-9 items-center gap-2 rounded-lg border border-[#333] bg-[#2A2A2A] px-2.5">
        <IconSearch size={13} strokeWidth={1.8} />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#666]"
        />
        <button
          type="button"
          aria-label="Open AI chat"
          onClick={onOpenAi}
          onMouseEnter={() => setWandHover(true)}
          onMouseLeave={() => setWandHover(false)}
          className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#CFCFCF] transition-colors duration-100 hover:bg-[#383838]"
        >
          <IconWand size={14} />
          {wandHover && (
            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2 py-1.5 text-[11px] font-medium leading-none tracking-[0.1px] text-[#F5F5F5]">
              AI Chat
            </span>
          )}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-0.5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors duration-100",
                isActive ? "bg-[#2A2A2A] text-[#CFCFCF]" : "text-[#666] hover:bg-[#242424] hover:text-[#999]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">
          {SECTION_TITLE[activeTab]}
        </div>
        <div className="min-h-0 max-h-[160px] flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
          <div className="space-y-px pb-1">
            {visibleItems.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => handleItemClick(item.title)}
                className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-[90ms] hover:bg-[#2A2A2A]"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-[#CFCFCF]">
                  {ACTION_ICONS[item.title] ?? <IconPlus size={12} strokeWidth={1.8} />}
                </span>
                <span className="truncate text-[12px] text-[#CFCFCF]">{item.title}</span>
              </button>
            ))}
            {visibleItems.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-[#555]">No items found.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
