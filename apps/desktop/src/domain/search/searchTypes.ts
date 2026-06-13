/**
 * Global search domain types.
 *
 * The global search (a VSCode-style command palette) is a single surface shared
 * by every route. Different parts of the app contribute searchable items through
 * registered "sources"; the palette merges, scores, and prioritizes them based
 * on where the user currently is (the active scope).
 *
 * Two modes share the same input box:
 *  - "search" mode (default): finds entities — canvas elements, screens,
 *    components, references, projects.
 *  - "command" mode (query starts with ">"): finds functions and settings,
 *    exactly like VSCode's command palette.
 */

/** Where the user currently is. Drives result prioritization. */
export type SearchScope = "workspace" | "project" | "canvas";

/** What a result represents — only used for the icon/label badge. */
export type SearchItemKind =
  | "element"
  | "screen"
  | "component"
  | "reference"
  | "project"
  | "command";

/** Whether an item belongs to the default search list or the ">" command list. */
export type SearchItemMode = "search" | "command";

export type SearchItem = {
  /** Stable id, unique within the palette result set. */
  id: string;
  kind: SearchItemKind;
  /** Which list this item shows up in. Defaults to "search" when omitted. */
  mode?: SearchItemMode;
  /** The scope this item belongs to, used to boost locally-relevant results. */
  scope: SearchScope;
  name: string;
  subtitle?: string;
  /** Extra terms matched against the query in addition to `name`. */
  keywords?: string[];
  /** Performed when the item is chosen. The palette closes afterwards. */
  run: () => void;
};

/**
 * A producer of search items. Sources return the full set they know about; the
 * palette is responsible for filtering by query and mode. Producers are cheap to
 * call and are re-invoked whenever the palette recomputes, so they should read
 * live state (e.g. the current canvas document) at call time.
 */
export type SearchSource = () => SearchItem[];
