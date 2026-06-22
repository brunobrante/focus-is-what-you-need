import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectType } from "@/lib/data/types";
import { createProject } from "@/lib/storage/repos/projects.repo";
import {
  addProjectToWorkspace,
  getDefaultWorkspace,
} from "@/lib/storage/repos/workspace.repo";
import { getOrCreateSystemDesignByOwner } from "@/lib/storage/repos/systemDesigns.repo";
import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from "@/lib/storage/activeWorkspace";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { setShareWithProjectsByDefault } from "@/lib/storage/repos/settings.repo";
import {
  SYSTEM_DESIGN_CATEGORIES,
  buildLinkedTokens,
} from "@/domain/system-design/defaults";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type {
  SystemDesignCategory,
  SystemDesignRow,
  SystemDesignTokens,
} from "@/lib/storage/schema";

export type NewProjectStepId = "type" | "name" | "share" | "advanced";

function allTokenIds(tokens: SystemDesignTokens): string[] {
  return SYSTEM_DESIGN_CATEGORIES.flatMap((category) =>
    (tokens[category] as { id: string }[]).map((t) => t.id),
  );
}

export interface NewProjectState {
  stepId: NewProjectStepId;
  stepIndex: number;
  totalSteps: number;
  type: ProjectType | null;
  setType: (type: ProjectType) => void;
  name: string;
  setName: (name: string) => void;
  thumbnailDataUrl: string | null;
  setThumbnailDataUrl: (value: string | null) => void;
  creating: boolean;
  nameRef: React.RefObject<HTMLInputElement | null>;
  canNext: boolean;
  footerHint: string;
  next: () => Promise<void>;
  back: () => void;
  finalizeProject: (thumbnail: string | null) => Promise<void>;

  // Sharing step
  shareStepAvailable: boolean;
  workspaceName: string | null;
  workspaceTokens: SystemDesignTokens | null;
  sharedIds: Set<string>;
  toggleShareToken: (id: string) => void;
  setCategoryShared: (category: SystemDesignCategory, shared: boolean) => void;
  setAllShared: (shared: boolean) => void;
  shareByDefault: boolean;
  setShareByDefault: (value: boolean) => void;
}

export function useNewProject(): NewProjectState {
  const [stepId, setStepId] = useState<NewProjectStepId>("type");
  const [type, setType] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  const [activeWsId] = useActiveWorkspaceId();
  const { data: workspaces } = useWorkspaces();
  const { loading: settingsLoading, settings } = useGlobalSettings();
  const shareByDefault = settings.systemDesign.shareWithProjectsByDefault;

  const [workspace, setWorkspace] = useState<{
    id: string;
    design: SystemDesignRow;
  } | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Load the workspace this project will land in, plus its design tokens.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fallback = await getDefaultWorkspace();
      const wsId = activeWsId ?? fallback?.id ?? null;
      if (!wsId) {
        if (!cancelled) setWorkspace(null);
        return;
      }
      const design = await getOrCreateSystemDesignByOwner({
        ownerScope: "workspace",
        ownerId: wsId,
      });
      if (!cancelled) setWorkspace({ id: wsId, design });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWsId]);

  // Seed the per-token selection once the design and the setting are known.
  useEffect(() => {
    if (!workspace || settingsLoading || initializedRef.current) return;
    initializedRef.current = true;
    const ids = allTokenIds(workspace.design.tokens);
    setSharedIds(shareByDefault ? new Set(ids) : new Set());
  }, [workspace, settingsLoading, shareByDefault]);

  const workspaceTokens = workspace?.design.tokens ?? null;
  const shareStepAvailable = Boolean(
    workspaceTokens && allTokenIds(workspaceTokens).length > 0,
  );

  const steps = useMemo<NewProjectStepId[]>(
    () => ["type", "name", ...(shareStepAvailable ? (["share"] as const) : []), "advanced"],
    [shareStepAvailable],
  );
  const stepIndex = Math.max(0, steps.indexOf(stepId)) + 1;
  const totalSteps = steps.length;

  useEffect(() => {
    if (stepId === "share" && !shareStepAvailable) setStepId("name");
  }, [stepId, shareStepAvailable]);

  useEffect(() => {
    if (stepId === "name") {
      const t = setTimeout(() => nameRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [stepId]);

  const toggleShareToken = (id: string) =>
    setSharedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setCategoryShared = (category: SystemDesignCategory, shared: boolean) =>
    setSharedIds((prev) => {
      if (!workspaceTokens) return prev;
      const next = new Set(prev);
      for (const token of workspaceTokens[category] as { id: string }[]) {
        if (shared) next.add(token.id);
        else next.delete(token.id);
      }
      return next;
    });

  const setAllShared = (shared: boolean) =>
    setSharedIds(
      shared && workspaceTokens ? new Set(allTokenIds(workspaceTokens)) : new Set(),
    );

  const setShareByDefault = (value: boolean) => {
    void setShareWithProjectsByDefault(value);
    setAllShared(value);
  };

  const finalizeProject = async (thumbnail: string | null) => {
    if (!name.trim() || !type || creating) return;
    setCreating(true);
    try {
      const project = await createProject({
        name: name.trim(),
        type,
        thumbnailDataUrl: thumbnail,
      });
      const workspaceId =
        getActiveWorkspaceId() ?? (await getDefaultWorkspace())?.id ?? null;
      if (workspaceId) {
        await addProjectToWorkspace(workspaceId, project.id);
        // Eagerly create the project's design with the chosen sharing so the
        // selection is applied before the System tab lazily creates one.
        const parent = await getOrCreateSystemDesignByOwner({
          ownerScope: "workspace",
          ownerId: workspaceId,
        });
        // Seed the project with linked instances of the chosen workspace tokens.
        await getOrCreateSystemDesignByOwner({
          ownerScope: "project",
          ownerId: project.id,
          inheritsFromId: parent.id,
          initialTokens: buildLinkedTokens(parent.id, parent.tokens, sharedIds),
        });
      }
      navigate(`/project/${encodeURIComponent(project.id)}`);
    } finally {
      setCreating(false);
    }
  };

  const goTo = (target: NewProjectStepId) => setStepId(target);
  const stepAt = (offset: number): NewProjectStepId | null => {
    const idx = steps.indexOf(stepId);
    return steps[idx + offset] ?? null;
  };

  const next = async () => {
    if (stepId === "type" && !type) return;
    if (stepId === "name" && !name.trim()) return;
    if (stepId === "advanced") {
      await finalizeProject(thumbnailDataUrl);
      return;
    }
    const target = stepAt(1);
    if (target) goTo(target);
  };

  const back = () => {
    const target = stepAt(-1);
    if (target) goTo(target);
  };

  const canNext =
    (stepId === "type"
      ? !!type
      : stepId === "name"
        ? !!name.trim()
        : true) && !creating;

  const footerHint =
    stepId === "type"
      ? type
        ? `formato: ${PROJECT_TYPE_LABEL[type]}`
        : "select a format"
      : stepId === "name"
        ? name.trim()
          ? "configure final details"
          : "informe um nome"
        : stepId === "share"
          ? "choose what to share"
          : thumbnailDataUrl
            ? "thumbnail pronta"
            : "you can skip this step";

  return {
    stepId,
    stepIndex,
    totalSteps,
    type,
    setType,
    name,
    setName,
    thumbnailDataUrl,
    setThumbnailDataUrl,
    creating,
    nameRef,
    canNext,
    footerHint,
    next,
    back,
    finalizeProject,
    shareStepAvailable,
    workspaceName:
      workspaces.find((w) => w.id === workspace?.id)?.name ?? null,
    workspaceTokens,
    sharedIds,
    toggleShareToken,
    setCategoryShared,
    setAllShared,
    shareByDefault,
    setShareByDefault,
  };
}
