import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { resolveSettingsLayers } from "@/domain/settings/resolve";
import type {
  CanvasElementDefaultsSettings,
  DeepPartial,
  GlobalSettings,
} from "@/domain/settings/types";
import {
  getGlobalSettingsRow,
  getProjectSettingsOverrides,
  getWorkspaceSettingsOverrides,
  putProjectSettingsOverrides,
  putWorkspaceSettingsOverrides,
} from "@/lib/storage/repos/settings.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { TABLES, subscribe } from "@/lib/storage/store";

export type ElementDefaultsOverride = DeepPartial<CanvasElementDefaultsSettings>;

export type ScopedElementDefaults = {
  loading: boolean;
  /** Resolved baseline from the parent scopes (the inherited values to show). */
  inherited: CanvasElementDefaultsSettings;
  /** This scope's own element-defaults override. */
  override: ElementDefaultsOverride;
  /** Persist the next element-defaults override for this scope. */
  save: (next: ElementDefaultsOverride) => void;
};

type Loaded = {
  inherited: CanvasElementDefaultsSettings;
  rowOverrides: DeepPartial<GlobalSettings>;
};

const EMPTY: Loaded = {
  inherited: DEFAULT_GLOBAL_SETTINGS.canvas.elementDefaults,
  rowOverrides: {},
};

function withElementDefaults(
  rowOverrides: DeepPartial<GlobalSettings>,
  next: ElementDefaultsOverride,
): DeepPartial<GlobalSettings> {
  return {
    ...rowOverrides,
    canvas: { ...(rowOverrides.canvas ?? {}), elementDefaults: next },
  };
}

/**
 * Generic loader/saver for one settings scope's element defaults. `loader`
 * resolves the inherited baseline (parent scopes) plus this scope's stored
 * overrides; `persist` writes the merged overrides back. Re-runs on any settings
 * or workspace change.
 */
function useScopedElementDefaults(
  enabled: boolean,
  loader: () => Promise<Loaded>,
  persist: (overrides: DeepPartial<GlobalSettings>) => void,
  depsKey: string,
): ScopedElementDefaults {
  const [state, setState] = useState<{ loading: boolean } & Loaded>({
    loading: true,
    ...EMPTY,
  });
  const rowOverridesRef = useRef<DeepPartial<GlobalSettings>>({});
  rowOverridesRef.current = state.rowOverrides;

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, ...EMPTY });
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await loader();
        if (!cancelled) setState({ loading: false, ...loaded });
      } catch (error) {
        console.error("Failed to load scoped element defaults", error);
        if (!cancelled) setState({ loading: false, ...EMPTY });
      }
    };
    void load();
    const unsubSettings = subscribe(TABLES.settings, () => void load());
    const unsubWorkspaces = subscribe(TABLES.workspaces, () => void load());
    return () => {
      cancelled = true;
      unsubSettings();
      unsubWorkspaces();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, depsKey]);

  const save = useCallback(
    (next: ElementDefaultsOverride) => {
      const merged = withElementDefaults(rowOverridesRef.current, next);
      rowOverridesRef.current = merged;
      setState((s) => ({ ...s, rowOverrides: merged }));
      persist(merged);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [depsKey],
  );

  return {
    loading: state.loading,
    inherited: state.inherited,
    override: state.rowOverrides.canvas?.elementDefaults ?? {},
    save,
  };
}

export function useWorkspaceElementDefaults(
  workspaceId: string | null,
): ScopedElementDefaults {
  const loader = useCallback(async (): Promise<Loaded> => {
    const globalRow = await getGlobalSettingsRow();
    const inherited = resolveSettingsLayers([globalRow?.overrides ?? null]).canvas
      .elementDefaults;
    const rowOverrides =
      (workspaceId ? await getWorkspaceSettingsOverrides(workspaceId) : null) ?? {};
    return { inherited, rowOverrides };
  }, [workspaceId]);

  const persist = useCallback(
    (overrides: DeepPartial<GlobalSettings>) => {
      if (workspaceId) putWorkspaceSettingsOverrides(workspaceId, overrides);
    },
    [workspaceId],
  );

  return useScopedElementDefaults(
    Boolean(workspaceId),
    loader,
    persist,
    workspaceId ?? "",
  );
}

export function useProjectElementDefaults(
  projectId: string | null,
): ScopedElementDefaults {
  const loader = useCallback(async (): Promise<Loaded> => {
    const globalRow = await getGlobalSettingsRow();
    const workspace = projectId ? await getWorkspaceForProject(projectId) : null;
    const workspaceOverrides = workspace
      ? await getWorkspaceSettingsOverrides(workspace.id)
      : null;
    const inherited = resolveSettingsLayers([
      globalRow?.overrides ?? null,
      workspaceOverrides,
    ]).canvas.elementDefaults;
    const rowOverrides =
      (projectId ? await getProjectSettingsOverrides(projectId) : null) ?? {};
    return { inherited, rowOverrides };
  }, [projectId]);

  const persist = useCallback(
    (overrides: DeepPartial<GlobalSettings>) => {
      if (projectId) putProjectSettingsOverrides(projectId, overrides);
    },
    [projectId],
  );

  return useScopedElementDefaults(
    Boolean(projectId),
    loader,
    persist,
    projectId ?? "",
  );
}
