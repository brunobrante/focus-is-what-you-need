import { useRef, useState } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";
import {
  IconCheck, IconChevronDownMed, IconChevronLeft, IconClose,
  IconCollapse, IconExpand, IconSearch,
} from "@/components/icons";

export type LibraryMode = "images" | "icons" | "tmb";

const IMAGE_LIBRARY_SOURCES = ["Unsplash", "Pexels", "Getty Images", "iStock"];
const ICON_LIBRARY_SOURCES = ["Lucide", "Heroicons", "Material", "Phosphor"];
const TMB_ASSET_CATEGORIES = ["All", "Logos", "Brand", "UI Kit", "Patterns"];

const LIBRARY_LABEL: Record<LibraryMode, string> = {
  images: "Image library",
  icons: "Icon library",
  tmb: "TMB Assets Library",
};

type MockTmbAsset = { id: string; name: string; category: string; bg: string };
const MOCK_TMB_ASSETS: MockTmbAsset[] = [
  { id: "tmb-logo-primary",  name: "Primary Logo",      category: "Logos",    bg: "linear-gradient(135deg,#0f0f14,#1a1a2e)" },
  { id: "tmb-logo-white",    name: "Logo White",         category: "Logos",    bg: "linear-gradient(135deg,#2a2a2a,#1e1e1e)" },
  { id: "tmb-logo-mark",     name: "Logo Mark",          category: "Logos",    bg: "linear-gradient(135deg,#4a1d8a,#7b4fd8)" },
  { id: "tmb-logo-horiz",    name: "Horizontal",         category: "Logos",    bg: "linear-gradient(135deg,#0f0f14,#1e1e2e)" },
  { id: "tmb-brand-blue",    name: "Primary Blue",       category: "Brand",    bg: "linear-gradient(135deg,#1f7ae0,#0b55c0)" },
  { id: "tmb-brand-dark",    name: "Dark BG",            category: "Brand",    bg: "linear-gradient(135deg,#0f0f10,#1a1a1a)" },
  { id: "tmb-brand-purple",  name: "Accent Purple",      category: "Brand",    bg: "linear-gradient(135deg,#6b21a8,#9333ea)" },
  { id: "tmb-brand-grad",    name: "Brand Gradient",     category: "Brand",    bg: "linear-gradient(135deg,#4a1d8a,#1f7ae0)" },
  { id: "tmb-ui-button",     name: "Button Set",         category: "UI Kit",   bg: "linear-gradient(135deg,#1e1e2e,#2a2a3e)" },
  { id: "tmb-ui-card",       name: "Card",               category: "UI Kit",   bg: "linear-gradient(135deg,#1a1a1e,#242430)" },
  { id: "tmb-ui-input",      name: "Input Field",        category: "UI Kit",   bg: "linear-gradient(135deg,#1e1e1e,#2a2a2a)" },
  { id: "tmb-ui-nav",        name: "Navigation",         category: "UI Kit",   bg: "linear-gradient(135deg,#141418,#1e1e24)" },
  { id: "tmb-pat-dots",      name: "Dot Grid",           category: "Patterns", bg: "radial-gradient(circle,#3a3a4a 1px,transparent 1px) 0 0/8px 8px #0f0f14" },
  { id: "tmb-pat-lines",     name: "Line Grid",          category: "Patterns", bg: "repeating-linear-gradient(0deg,#1e1e2a,#1e1e2a 1px,#0f0f14 0,#0f0f14 12px)" },
  { id: "tmb-pat-noise",     name: "Noise Texture",      category: "Patterns", bg: "linear-gradient(135deg,#1a1a20,#252530)" },
  { id: "tmb-pat-mesh",      name: "Mesh Gradient",      category: "Patterns", bg: "radial-gradient(at 30% 30%,#4a1d8a,transparent 60%),radial-gradient(at 70% 70%,#1f4ae0,transparent 60%) #0f0f14" },
];

type MockImageItem = { id: string; name: string; bg: string };
const MOCK_IMAGES: MockImageItem[] = [
  { id: "img-1",  name: "Abstract",   bg: "linear-gradient(135deg,#1a1a2e,#0f3460)" },
  { id: "img-2",  name: "Forest",     bg: "linear-gradient(135deg,#134e5e,#71b280)" },
  { id: "img-3",  name: "Night city", bg: "linear-gradient(135deg,#0f0c29,#302b63)" },
  { id: "img-4",  name: "Sunset",     bg: "linear-gradient(135deg,#f093fb,#f5576c)" },
  { id: "img-5",  name: "Snow peak",  bg: "linear-gradient(135deg,#c9d6ff,#e2e2e2)" },
  { id: "img-6",  name: "Desert",     bg: "linear-gradient(135deg,#f7971e,#ffd200)" },
  { id: "img-7",  name: "Autumn",     bg: "linear-gradient(135deg,#e65c00,#f9d423)" },
  { id: "img-8",  name: "Rain",       bg: "linear-gradient(135deg,#373b44,#4286f4)" },
  { id: "img-9",  name: "Blossom",    bg: "linear-gradient(135deg,#f8b4c8,#e96d8c)" },
  { id: "img-10", name: "Neon",       bg: "linear-gradient(135deg,#8e2de2,#4a00e0)" },
  { id: "img-11", name: "Meadow",     bg: "linear-gradient(135deg,#56ab2f,#a8e063)" },
  { id: "img-12", name: "Arctic",     bg: "linear-gradient(135deg,#2980b9,#6dd5fa)" },
];

type MockIconItem = { id: string; name: string; d: React.ReactNode };
const MOCK_ICONS: MockIconItem[] = [
  { id: "home",      name: "Home",     d: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
  { id: "user",      name: "User",     d: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></> },
  { id: "bell",      name: "Bell",     d: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></> },
  { id: "heart",     name: "Heart",    d: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /> },
  { id: "star",      name: "Star",     d: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /> },
  { id: "search",    name: "Search",   d: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></> },
  { id: "mail",      name: "Mail",     d: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></> },
  { id: "phone",     name: "Phone",    d: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.22a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.527.265 1.044.42 1.55" /> },
  { id: "camera",    name: "Camera",   d: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></> },
  { id: "map-pin",   name: "Location", d: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></> },
  { id: "folder",    name: "Folder",   d: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /> },
  { id: "file",      name: "File",     d: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></> },
  { id: "lock",      name: "Lock",     d: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></> },
  { id: "calendar",  name: "Calendar", d: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: "clock",     name: "Clock",    d: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
  { id: "trash",     name: "Trash",    d: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></> },
  { id: "edit",      name: "Edit",     d: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /> },
  { id: "download",  name: "Download", d: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></> },
  { id: "share",     name: "Share",    d: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></> },
  { id: "bookmark",  name: "Bookmark", d: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
];

export function LibraryPanel({
  mode,
  expanded,
  onExpandedChange,
  onBack,
}: {
  mode: LibraryMode;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [imageSource, setImageSource] = useState(IMAGE_LIBRARY_SOURCES[0]);
  const [iconSource, setIconSource] = useState(ICON_LIBRARY_SOURCES[0]);
  const [tmbCategory, setTmbCategory] = useState(TMB_ASSET_CATEGORIES[0]);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);

  useDismissable(
    sourceDropdownOpen,
    () => setSourceDropdownOpen(false),
    [sourceDropdownRef],
    { capture: true, escape: false },
  );

  const sources = mode === "images" ? IMAGE_LIBRARY_SOURCES : mode === "icons" ? ICON_LIBRARY_SOURCES : TMB_ASSET_CATEGORIES;
  const activeSource = mode === "images" ? imageSource : mode === "icons" ? iconSource : tmbCategory;
  const setActiveSource = (src: string) => {
    if (mode === "images") setImageSource(src);
    else if (mode === "icons") setIconSource(src);
    else setTmbCategory(src);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex h-7 shrink-0 items-center justify-between px-1">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A] transition-colors duration-100 hover:text-[#8E8E8E]"
        >
          <IconChevronLeft />
          {LIBRARY_LABEL[mode]}
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => onExpandedChange(!expanded)}
            className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
          >
            {expanded ? <IconCollapse /> : <IconExpand />}
          </button>
          <button
            type="button"
            aria-label="Close library"
            onClick={onBack}
            className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
          >
            <IconClose size={11} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-[#2E2E2E] bg-[#252525] px-2.5">
          <IconSearch size={11} strokeWidth={1.8} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={mode === "images" ? "Search images…" : mode === "icons" ? "Search icons…" : "Search assets…"}
            className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#555] transition-colors duration-100 hover:text-[#CFCFCF]"
            >
              <IconClose size={8} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div ref={sourceDropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSourceDropdownOpen((v) => !v)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors duration-100 ${
              sourceDropdownOpen
                ? "border-[#383838] bg-[#2E2E2E] text-[#CFCFCF]"
                : "border-[#2E2E2E] bg-[#252525] text-[#8E8E8E] hover:border-[#333] hover:text-[#CFCFCF]"
            }`}
          >
            {activeSource}
            <IconChevronDownMed />
          </button>

          {sourceDropdownOpen && (
            <div
              className="absolute right-0 z-[60] overflow-hidden rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-1"
              style={{ bottom: "calc(100% + 4px)", minWidth: 128, boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)" }}
            >
              {sources.map((src) => {
                const isActive = activeSource === src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => { setActiveSource(src); setSourceDropdownOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors duration-[90ms] ${
                      isActive ? "bg-[#2A2A2A] text-[#CFCFCF]" : "text-[#8E8E8E] hover:bg-[#252525] hover:text-[#CFCFCF]"
                    }`}
                  >
                    <span className="flex-1">{src}</span>
                    {isActive && <IconCheck />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
        {mode === "images" && <ImageGrid search={search} />}
        {mode === "icons" && <IconGrid search={search} />}
        {mode === "tmb" && <TmbAssetGrid search={search} category={tmbCategory} />}
      </div>
    </div>
  );
}

function ImageGrid({ search }: { search: string }) {
  const filtered = MOCK_IMAGES.filter((img) => img.name.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <div className="px-2 py-2 text-[11px] text-[#555]">No images found.</div>;
  return (
    <div className="grid grid-cols-3 gap-1.5 pb-1">
      {filtered.map((img) => (
        <button key={img.id} type="button" className="group/img flex flex-col gap-1 rounded-md p-0.5 transition-all duration-[90ms] hover:bg-[#2A2A2A]">
          <div className="h-[52px] w-full rounded" style={{ background: img.bg }} />
          <span className="truncate px-0.5 text-[10px] text-[#555] transition-colors duration-100 group-hover/img:text-[#8E8E8E]">
            {img.name}
          </span>
        </button>
      ))}
    </div>
  );
}

function IconGrid({ search }: { search: string }) {
  const filtered = MOCK_ICONS.filter((icon) => icon.name.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <div className="px-2 py-2 text-[11px] text-[#555]">No icons found.</div>;
  return (
    <div className="grid grid-cols-5 gap-0.5 pb-1">
      {filtered.map((icon) => (
        <button key={icon.id} type="button" className="flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 transition-colors duration-[90ms] hover:bg-[#2A2A2A]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFCFCF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {icon.d}
          </svg>
          <span className="w-full truncate text-center text-[9px] text-[#555]">{icon.name}</span>
        </button>
      ))}
    </div>
  );
}

function TmbAssetGrid({ search, category }: { search: string; category: string }) {
  const q = search.toLowerCase();
  const filtered = MOCK_TMB_ASSETS.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(q);
    const matchesCategory = category === "All" || asset.category === category;
    return matchesSearch && matchesCategory;
  });
  if (filtered.length === 0) return <div className="px-2 py-2 text-[11px] text-[#555]">No assets found.</div>;
  return (
    <div className="grid grid-cols-3 gap-1.5 pb-1">
      {filtered.map((asset) => (
        <button key={asset.id} type="button" className="group/asset flex flex-col gap-1 rounded-md p-0.5 transition-all duration-[90ms] hover:bg-[#2A2A2A]">
          <div className="h-[52px] w-full rounded" style={{ background: asset.bg }} />
          <div className="flex items-center gap-1 px-0.5">
            <span className="min-w-0 flex-1 truncate text-[10px] text-[#555] transition-colors duration-100 group-hover/asset:text-[#8E8E8E]">
              {asset.name}
            </span>
            {category === "All" && (
              <span className="shrink-0 rounded px-1 py-px text-[8px] font-medium text-[#3A3A3A] transition-colors duration-100 group-hover/asset:text-[#555]">
                {asset.category}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
