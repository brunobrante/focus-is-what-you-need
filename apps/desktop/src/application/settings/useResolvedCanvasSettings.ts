import { useEffect, useState } from "react";

import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { resolveSettingsLayers } from "@/domain/settings/resolve";
import type { DeepPartial, GlobalSettings } from "@/domain/settings/types";
import {
  getGlobalSettingsRow,
  getProjectSettingsOverrides,
  getWorkspaceSettingsOverrides,
} from "@/lib/storage/repos/settings.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { TABLES, subscribe } from "@/lib/storage/store";

type ResolvedCanvasSettingsState = {
  loading: boolean;
  settings: GlobalSettings;
};

/**
 * Resolve the effective settings for a project by cascading
 * `defaults -> global -> workspace -> project`. The global row stores the full
 * tree; the workspace and project rows store only their own overrides, so unset
 * fields keep inheriting from the parent scope. Re-resolves on any settings or
 * workspace change.
 */
export function useResolvedCanvasSettings(
  projectId: string | null,
): ResolvedCanvasSettingsState {
  const [state, setState] = useState<ResolvedCanvasSettingsState>({
    loading: true,
    settings: DEFAULT_GLOBAL_SETTINGS,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const globalRow = await getGlobalSettingsRow();
        const globalOverrides = globalRow?.overrides ?? null;

        let workspaceOverrides: DeepPartial<GlobalSettings> | null = null;
        let projectOverrides: DeepPartial<GlobalSettings> | null = null;

        if (projectId) {
          const workspace = await getWorkspaceForProject(projectId);
          if (workspace) {
            workspaceOverrides = await getWorkspaceSettingsOverrides(workspace.id);
          }
          projectOverrides = await getProjectSettingsOverrides(projectId);
        }

        const settings = resolveSettingsLayers([
          globalOverrides,
          workspaceOverrides,
          projectOverrides,
        ]);
        if (!cancelled) setState({ loading: false, settings });
      } catch (error) {
        console.error("Failed to resolve canvas settings", error);
        if (!cancelled) {
          setState({ loading: false, settings: DEFAULT_GLOBAL_SETTINGS });
        }
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
  }, [projectId]);

  return state;
}
