import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectType } from "@/lib/data/types";
import { createProject } from "@/lib/storage/repos/projects.repo";
import { addProjectToWorkspace, getDefaultWorkspace } from "@/lib/storage/repos/workspace.repo";
import { getActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";

const TOTAL_STEPS = 3;

export interface NewProjectState {
  step: 1 | 2 | 3;
  setStep: (step: 1 | 2 | 3) => void;
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
  totalSteps: typeof TOTAL_STEPS;
  next: () => Promise<void>;
  back: () => void;
  finalizeProject: (thumbnail: string | null) => Promise<void>;
}

export function useNewProject(): NewProjectState {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => nameRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [step]);

  const finalizeProject = async (thumbnail: string | null) => {
    if (!name.trim() || !type || creating) return;
    setCreating(true);
    try {
      const project = await createProject({
        name: name.trim(),
        type,
        thumbnailDataUrl: thumbnail,
      });
      // New projects belong to the workspace they were created in (falling back
      // to the default workspace), so they show up under the right workspace.
      const workspaceId =
        getActiveWorkspaceId() ?? (await getDefaultWorkspace())?.id ?? null;
      if (workspaceId) {
        await addProjectToWorkspace(workspaceId, project.id);
      }
      navigate(`/project/${encodeURIComponent(project.id)}`);
    } finally {
      setCreating(false);
    }
  };

  const next = async () => {
    if (step === 1 && type) {
      setStep(2);
      return;
    }
    if (step === 2 && name.trim()) {
      setStep(3);
      return;
    }
    if (step === 3) {
      await finalizeProject(thumbnailDataUrl);
    }
  };

  const back = () => {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const canNext = (step === 1 ? !!type : step === 2 ? !!name.trim() : true) && !creating;
  const footerHint =
    step === 1
      ? type
        ? `formato: ${PROJECT_TYPE_LABEL[type]}`
        : "select a format"
      : step === 2
        ? name.trim()
          ? "configure final details"
          : "informe um nome"
        : thumbnailDataUrl
          ? "thumbnail pronta"
          : "you can skip this step";

  return {
    step,
    setStep,
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
    totalSteps: TOTAL_STEPS,
    next,
    back,
    finalizeProject,
  };
}
