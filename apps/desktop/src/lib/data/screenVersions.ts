export type ScreenVersion = {
  id: string;
  title: string;
  tpl: "hero" | "list" | "detail" | "form" | "profile";
  updated: string;
  author: string;
  initials: string;
};

export const DEFAULT_SCREEN_VERSIONS: ScreenVersion[] = [
  { id: "v3", title: "v3 · atual", tpl: "hero", updated: "agora", author: "Você", initials: "VC" },
  { id: "v2", title: "v2 · ontem", tpl: "hero", updated: "ontem", author: "Você", initials: "VC" },
  { id: "v1", title: "v1 · inicial", tpl: "detail", updated: "3 d", author: "Marina", initials: "MR" },
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
    msg: "Ajuste de espaçamento e tipografia no hero",
    author: "Você",
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
    msg: "Adiciona seção de cards e CTA secundário",
    author: "Você",
    initials: "VC",
    when: "há 2 h",
    changes: [
      { op: "A", file: "cards-grid.tsx", add: 48 },
      { op: "M", file: "hero.tsx", add: 8, rem: 1 },
    ],
  },
  {
    hash: "3e0a112",
    msg: "Refatora header para componente reutilizável",
    author: "Marina",
    initials: "MR",
    when: "ontem",
    changes: [
      { op: "R", file: "header-old.tsx", rem: 64 },
      { op: "A", file: "header.tsx", add: 72 },
      { op: "M", file: "layout.tsx", add: 4, rem: 8 },
    ],
  },
  {
    hash: "9c7e445",
    msg: "Troca paleta para tema escuro",
    author: "Você",
    initials: "VC",
    when: "3 d",
    changes: [{ op: "M", file: "tokens.css", add: 22, rem: 22 }],
  },
  {
    hash: "1d8b09a",
    msg: "Versão inicial da tela",
    author: "Você",
    initials: "VC",
    when: "5 d",
    changes: [
      { op: "A", file: "index.tsx", add: 36 },
      { op: "A", file: "styles.css", add: 18 },
    ],
  },
];
