export type ScreenVersion = {
  id: string;
  title: string;
  device?: string;
  tpl: "hero" | "list" | "detail" | "form" | "profile";
  updated: string;
  author: string;
  initials: string;
  // When set, this version is backed by a real screen row; cards render its real
  // stored snapshot instead of a template mock.
  screenId?: string;
  // The variant that owns this version's editable scene/snapshot. A screen version is
  // a variant of the screen master; cards render this variant's stored snapshot.
  variantId?: string;
  // Stable version tag ("main", "V1", "V2"…). All versions share the screen's title,
  // so the tag is the real identifier.
  tag?: string;
};

export const DEFAULT_SCREEN_VERSIONS: ScreenVersion[] = [
  { id: "v3", title: "v3 · atual", device: "iPhone 15", tpl: "hero", updated: "agora", author: "You", initials: "VC" },
  { id: "v2", title: "v2 · ontem", device: "iPhone XR", tpl: "hero", updated: "yesterday", author: "You", initials: "VC" },
  { id: "v1", title: "v1 · inicial", device: "iPhone SE", tpl: "detail", updated: "3 d", author: "Marina", initials: "MR" },
];

export type GitChange = {
  op: "A" | "M" | "R";
  file: string;
  add?: number;
  rem?: number;
};

export type GitCommit = {
  hash: string;
  msg: string;
  author: string;
  initials: string;
  when: string;
  current?: boolean;
  changes: GitChange[];
};

export const DEFAULT_HISTORY: GitCommit[] = [
  {
    hash: "a1f4c2e",
    msg: "Adjusted spacing and typography in hero",
    author: "You",
    initials: "VC",
    when: "agora",
    current: true,
    changes: [
      { op: "M", file: "hero.tsx", add: 12, rem: 4 },
      { op: "M", file: "styles.css", add: 6, rem: 2 },
    ],
  },
  {
    hash: "7b29d80",
    msg: "Added cards section and secondary CTA",
    author: "You",
    initials: "VC",
    when: "2 hours ago",
    changes: [
      { op: "A", file: "cards-grid.tsx", add: 48 },
      { op: "M", file: "hero.tsx", add: 8, rem: 1 },
    ],
  },
  {
    hash: "3e0a112",
    msg: "Refactor header into reusable component",
    author: "Marina",
    initials: "MR",
    when: "yesterday",
    changes: [
      { op: "R", file: "header-old.tsx", rem: 64 },
      { op: "A", file: "header.tsx", add: 72 },
      { op: "M", file: "layout.tsx", add: 4, rem: 8 },
    ],
  },
  {
    hash: "9c7e445",
    msg: "Switch palette to dark theme",
    author: "You",
    initials: "VC",
    when: "3 d",
    changes: [{ op: "M", file: "tokens.css", add: 22, rem: 22 }],
  },
  {
    hash: "1d8b09a",
    msg: "Initial screen version",
    author: "You",
    initials: "VC",
    when: "5 d",
    changes: [
      { op: "A", file: "index.tsx", add: 36 },
      { op: "A", file: "styles.css", add: 18 },
    ],
  },
];
