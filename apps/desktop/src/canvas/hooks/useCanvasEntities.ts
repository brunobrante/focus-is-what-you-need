import { useMemo } from "react";
import {
  useComponent,
  useComponentsByProject,
  useProject,
  useProjectByName,
  useScene,
  useScreen,
  useScreenByTitle,
  useScreens,
  useScreenVariants,
  useVariant,
} from "@/lib/storage/hooks";
import { findComponentByPath } from "../canvasUtils";
import type { ComponentRow, SceneOwnerType } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";

interface Params {
  projectIdParam: string;
  legacyProjectName: string;
  queryProjectType: ProjectType;
  screenParam: string;
  variantParam: string;
  componentParam: string;
  legacyElementName: string;
}

export function useCanvasEntities({
  projectIdParam,
  legacyProjectName,
  queryProjectType,
  screenParam,
  variantParam,
  componentParam,
  legacyElementName,
}: Params) {
  const { data: projectById, loading: projectByIdLoading } = useProject(projectIdParam || null);
  const { data: legacyProject, loading: legacyProjectLoading } = useProjectByName(
    projectById ? null : legacyProjectName || null,
  );
  const project = projectById ?? legacyProject;
  const projectLoading =
    projectByIdLoading || (!projectById && Boolean(legacyProjectName) && legacyProjectLoading);

  const { data: screenById, loading: screenByIdLoading } = useScreen(screenParam || null);
  const { data: screenByTitle, loading: screenByTitleLoading } = useScreenByTitle(
    project?.id ?? null,
    screenById ? null : screenParam || null,
  );
  const { data: projectScreens, loading: projectScreensLoading } = useScreens(project?.id ?? null);
  const { data: projectComponents, loading: projectComponentsLoading } = useComponentsByProject(
    project?.id ?? null,
  );

  const resolvedScreen = screenById ?? screenByTitle;
  const screen =
    resolvedScreen && project?.id && resolvedScreen.projectId !== project.id
      ? null
      : resolvedScreen;
  const screenLoading =
    screenByIdLoading || (!screenById && Boolean(screenParam) && screenByTitleLoading);

  // The canvas Current window always edits a screen's MAIN variant (its canonical
  // "home"), never whichever version is active in the detail page. Versions are
  // browsed in the dedicated Versions window. `useScreenVariants` is ordered, so
  // the first entry (order 0) is the main. While it loads we resolve to null (Current
  // waits) rather than `activeVariantId`, which could momentarily be a version.
  const { data: screenVariants } = useScreenVariants(screen?.id ?? null);
  const screenMainVariantId = screenVariants[0]?.id ?? null;

  const legacyComponent = useMemo(() => {
    if (!screen?.id || !componentParam) return null;
    const path = legacyElementName ? [componentParam, legacyElementName] : [componentParam];
    return findComponentByPath(projectComponents, screen.id, path);
  }, [componentParam, legacyElementName, projectComponents, screen?.id]);

  const { data: componentById, loading: componentByIdLoading } = useComponent(
    !variantParam && componentParam ? componentParam : null,
  );
  const activeVariantId =
    variantParam || componentById?.activeVariantId || legacyComponent?.activeVariantId || "";
  const { data: variant, loading: variantLoading } = useVariant(activeVariantId || null);
  const variantComponentId =
    variant?.ownerKind === "component" ? variant.ownerId : null;
  const { data: loadedComponent, loading: loadedComponentLoading } = useComponent(
    variantComponentId,
  );
  const component: ComponentRow | null = loadedComponent ?? componentById ?? legacyComponent;
  const componentLoading =
    loadedComponentLoading || componentByIdLoading || Boolean(componentParam && projectComponentsLoading);

  const projectType: ProjectType = project?.type ?? queryProjectType;
  const projectId = project?.id ?? projectIdParam;
  const projectName = project?.name ?? (legacyProjectName || "Untitled Project");
  const canUseFactoryMocks = project?.source === "mock";

  const sceneOwner = useMemo<{ ownerType: SceneOwnerType; ownerId: string } | null>(() => {
    if (variant?.id) return { ownerType: "variant", ownerId: variant.id };
    if (legacyComponent?.activeVariantId)
      return { ownerType: "variant", ownerId: legacyComponent.activeVariantId };
    // A screen's Current scene is its main variant (the canonical "home").
    if (screenMainVariantId)
      return { ownerType: "variant", ownerId: screenMainVariantId };
    return null;
  }, [legacyComponent?.activeVariantId, screenMainVariantId, variant?.id]);

  const { data: scene, loading: sceneLoading } = useScene(sceneOwner?.ownerType, sceneOwner?.ownerId);

  const entityLoading =
    projectLoading ||
    Boolean(screenParam && screenLoading) ||
    Boolean(componentParam && projectComponentsLoading) ||
    Boolean(activeVariantId && variantLoading) ||
    Boolean(variantComponentId && componentLoading) ||
    Boolean(component && (projectComponentsLoading || projectScreensLoading));

  return {
    project,
    screen,
    component,
    variant,
    scene,
    sceneOwner,
    projectScreens,
    projectComponents,
    projectScreensLoading,
    projectComponentsLoading,
    sceneLoading,
    entityLoading,
    projectType,
    projectId,
    projectName,
    canUseFactoryMocks,
  };
}
