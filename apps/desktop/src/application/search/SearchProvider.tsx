import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SearchItem, SearchScope, SearchSource } from "@/domain/search/searchTypes";
import { PALETTE_COMMANDS } from "@/domain/search/commandPalette";
import {
  useComponentsByProject,
  useProjects,
  useReferencesByProject,
  useScreens,
} from "@/lib/storage/hooks";
import { GlobalSearchPalette } from "./GlobalSearchPalette";

type SearchContextValue = {
  isOpen: boolean;
  /** Full input value, including a leading ">" when in command mode. */
  query: string;
  setQuery: (value: string) => void;
  /** Open in default (entity) search mode. */
  open: () => void;
  /** Open straight into ">" command mode (VSCode's Cmd+Shift+P). */
  openCommand: () => void;
  close: () => void;
  /** Where the user currently is — drives result prioritization. */
  activeScope: SearchScope;
  activeProjectId: string | null;
  /**
   * Register a source of search items. Returns an unregister function. The same
   * `key` overwrites a previous registration, so callers can re-register on
   * dependency changes without leaking stale producers.
   */
  registerSource: (key: string, source: SearchSource) => () => void;
  /** Snapshot of all registered producers; recomputed when the registry changes. */
  sources: SearchSource[];
};

const SearchContext = createContext<SearchContextValue | null>(null);

function deriveContext(pathname: string, search: string): {
  scope: SearchScope;
  projectId: string | null;
} {
  if (pathname.startsWith("/canvas")) {
    const params = new URLSearchParams(search);
    return {
      scope: "canvas",
      projectId: params.get("project") || params.get("projectId") || null,
    };
  }
  const match = pathname.match(/^\/project\/([^/]+)/);
  if (match) {
    return { scope: "project", projectId: decodeURIComponent(match[1]) };
  }
  return { scope: "workspace", projectId: null };
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { scope: activeScope, projectId: activeProjectId } = useMemo(
    () => deriveContext(location.pathname, location.search),
    [location.pathname, location.search],
  );

  // Registered producers live in a ref (mutated synchronously on register) and a
  // version counter forces a fresh `sources` snapshot for consumers.
  const producersRef = useRef(new Map<string, SearchSource>());
  const [registryVersion, setRegistryVersion] = useState(0);

  const registerSource = useCallback((key: string, source: SearchSource) => {
    producersRef.current.set(key, source);
    setRegistryVersion((v) => v + 1);
    return () => {
      if (producersRef.current.get(key) === source) {
        producersRef.current.delete(key);
        setRegistryVersion((v) => v + 1);
      }
    };
  }, []);

  const sources = useMemo(
    () => Array.from(producersRef.current.values()),
    [registryVersion],
  );

  const open = useCallback(() => {
    setQuery("");
    setIsOpen(true);
  }, []);

  const openCommand = useCallback(() => {
    setQuery(">");
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  // Global shortcuts: Cmd/Ctrl+Shift+P opens command mode, Cmd/Ctrl+K (and
  // Cmd/Ctrl+P) opens default search. This is an app-level shortcut, not a
  // canvas-configurable binding, so it reads modifiers directly.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "p" && event.shiftKey) {
        event.preventDefault();
        setQuery((q) => (q.startsWith(">") ? q : ">"));
        setIsOpen(true);
        return;
      }
      if ((key === "k" || key === "p") && !event.shiftKey) {
        event.preventDefault();
        setQuery((q) => (q.startsWith(">") ? q.slice(1) : q));
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<SearchContextValue>(
    () => ({
      isOpen,
      query,
      setQuery,
      open,
      openCommand,
      close,
      activeScope,
      activeProjectId,
      registerSource,
      sources,
    }),
    [isOpen, query, open, openCommand, close, activeScope, activeProjectId, registerSource, sources],
  );

  return (
    <SearchContext.Provider value={value}>
      <BuiltInSearchSources />
      {children}
      <GlobalSearchPalette />
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside SearchProvider");
  return ctx;
}

/**
 * Register a search source for the lifetime of the calling component. The
 * producer is re-registered whenever `deps` change, so it can close over fresh
 * state. Keep `key` stable and unique per logical source.
 */
export function useSearchSource(
  key: string,
  source: SearchSource,
  deps: ReadonlyArray<unknown>,
): void {
  const { registerSource } = useSearch();
  useEffect(
    () => registerSource(key, source),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registerSource, key, ...deps],
  );
}

/**
 * Built-in sources available on every route: the static command palette plus
 * workspace/project entities (projects, screens, components, references) loaded
 * from storage. Canvas elements are contributed separately from within the
 * canvas (it owns the live editor document).
 */
function BuiltInSearchSources() {
  const navigate = useNavigate();
  const { activeScope, activeProjectId } = useSearch();

  const { data: projects } = useProjects();
  const { data: screens } = useScreens(activeProjectId);
  const { data: components } = useComponentsByProject(activeProjectId);
  const { data: references } = useReferencesByProject(activeProjectId);

  // ">" command items, derived from the declarative registry.
  useSearchSource(
    "builtin:commands",
    () =>
      PALETTE_COMMANDS.filter(
        (cmd) => !cmd.scopes || cmd.scopes.includes(activeScope),
      ).map<SearchItem>((cmd) => ({
        id: `command:${cmd.id}`,
        kind: "command",
        mode: "command",
        scope: activeScope,
        name: cmd.title,
        subtitle: cmd.section,
        keywords: cmd.keywords,
        run: () => navigate(cmd.navigateTo),
      })),
    [activeScope, navigate],
  );

  // Workspace entities: every project.
  useSearchSource(
    "builtin:projects",
    () =>
      projects.map<SearchItem>((project) => ({
        id: `project:${project.id}`,
        kind: "project",
        scope: "workspace",
        name: project.name,
        subtitle: project.type ? `Project · ${project.type}` : "Project",
        run: () => navigate(`/project/${encodeURIComponent(project.id)}`),
      })),
    [projects, navigate],
  );

  // Project entities: screens of the active project.
  useSearchSource(
    "builtin:screens",
    () =>
      screens.map<SearchItem>((screen) => ({
        id: `screen:${screen.id}`,
        kind: "screen",
        scope: "project",
        name: screen.title,
        subtitle: "Screen",
        run: () =>
          navigate(
            `/project/${encodeURIComponent(screen.projectId)}/screen/${encodeURIComponent(screen.id)}`,
          ),
      })),
    [screens, navigate],
  );

  // Project entities: components of the active project.
  useSearchSource(
    "builtin:components",
    () =>
      components.map<SearchItem>((component) => ({
        id: `component:${component.id}`,
        kind: "component",
        scope: "project",
        name: component.name,
        subtitle: component.kind ? `Component · ${component.kind}` : "Component",
        keywords: component.category ? [component.category] : undefined,
        run: () => {
          if (component.projectId) {
            navigate(
              `/project/${encodeURIComponent(component.projectId)}/c/${encodeURIComponent(component.id)}`,
            );
          }
        },
      })),
    [components, navigate],
  );

  // Project entities: references attached to the active project.
  useSearchSource(
    "builtin:references",
    () =>
      references.map<SearchItem>((reference) => ({
        id: `reference:${reference.id}`,
        kind: "reference",
        scope: "project",
        name: reference.title,
        subtitle: "Reference",
        keywords: reference.metadata,
        run: () => navigate("/references"),
      })),
    [references, navigate],
  );

  return null;
}
