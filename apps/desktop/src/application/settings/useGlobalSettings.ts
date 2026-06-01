import { useEffect, useState } from "react";

import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import { getGlobalSettings } from "@/lib/storage/repos/settings.repo";
import { TABLES, subscribe } from "@/lib/storage/store";

type GlobalSettingsState = {
  loading: boolean;
  settings: GlobalSettings;
};

export function useGlobalSettings(): GlobalSettingsState {
  const [state, setState] = useState<GlobalSettingsState>({
    loading: true,
    settings: DEFAULT_GLOBAL_SETTINGS,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const settings = await getGlobalSettings();
        if (!cancelled) setState({ loading: false, settings });
      } catch (error) {
        console.error("Failed to load global settings", error);
        if (!cancelled) setState({ loading: false, settings: DEFAULT_GLOBAL_SETTINGS });
      }
    };

    void load();
    const unsubscribe = subscribe(TABLES.settings, () => {
      void load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
