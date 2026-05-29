import { useEffect, useState } from "react";
import { getCanvasMockBundleForScreen } from "@/components/mocks/data/canvasMocks";
import { componentPathFromRoot, findMockComponentByPath } from "../canvasUtils";
import type { ComponentRow, ScreenRow } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";

interface Params {
  component: ComponentRow | null;
  canUseFactoryMocks: boolean;
  projectType: ProjectType;
  screen: ScreenRow | null;
  projectComponents: ComponentRow[];
  projectScreens: ScreenRow[];
  projectComponentsLoading: boolean;
  projectScreensLoading: boolean;
  currentMockTargetKey: string;
}

export interface MockScene {
  key: string;
  graphJSON: string | null;
  loading: boolean;
}

export function useMockScene({
  component,
  canUseFactoryMocks,
  projectType,
  screen,
  projectComponents,
  projectScreens,
  projectComponentsLoading,
  projectScreensLoading,
  currentMockTargetKey,
}: Params): MockScene {
  const [mockScene, setMockScene] = useState<MockScene>({
    key: "none",
    graphJSON: null,
    loading: false,
  });

  useEffect(() => {
    const key = currentMockTargetKey;
    let cancelled = false;

    if (!screen && !component) {
      setMockScene({ key: "none", graphJSON: null, loading: false });
      return () => { cancelled = true; };
    }

    if (component && (projectComponentsLoading || projectScreensLoading)) {
      setMockScene({ key, graphJSON: null, loading: true });
      return () => { cancelled = true; };
    }

    setMockScene((prev) => ({
      key,
      graphJSON: prev.key === key ? prev.graphJSON : null,
      loading: true,
    }));

    void resolveMockGraphJSON({
      component,
      canUseFactoryMocks,
      projectType,
      screen,
      projectComponents,
      projectScreens,
    }).then((graphJSON) => {
      if (cancelled) return;
      setMockScene({ key, graphJSON, loading: false });
    });

    return () => { cancelled = true; };
  }, [
    component,
    canUseFactoryMocks,
    currentMockTargetKey,
    projectComponents,
    projectComponentsLoading,
    projectScreens,
    projectScreensLoading,
    projectType,
    screen,
  ]);

  return mockScene;
}

async function resolveMockGraphJSON(input: {
  canUseFactoryMocks: boolean;
  component: ComponentRow | null;
  projectType: ProjectType;
  screen: ScreenRow | null;
  projectComponents: ComponentRow[];
  projectScreens: ScreenRow[];
}): Promise<string | null> {
  if (!input.canUseFactoryMocks) return null;

  if (!input.component) {
    if (!input.screen) return null;
    const bundle = await getCanvasMockBundleForScreen(input.screen, input.projectType);
    return bundle?.screen.graphJSON ?? null;
  }

  const path = componentPathFromRoot(input.component, input.projectComponents);
  if (!path?.screenId) return null;
  const originScreen = input.projectScreens.find((s) => s.id === path.screenId);
  if (!originScreen) return null;

  const bundle = await getCanvasMockBundleForScreen(originScreen, input.projectType);
  if (!bundle) return null;

  const mockComponent = findMockComponentByPath(bundle.components, path.names);
  return mockComponent?.canvas.graphJSON ?? null;
}
