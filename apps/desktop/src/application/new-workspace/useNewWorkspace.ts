import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createWorkspace } from "@/lib/storage/repos/workspace.repo";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";

export type NewWorkspaceStepId = "name" | "description";

const STEPS: NewWorkspaceStepId[] = ["name", "description"];

export interface NewWorkspaceState {
  stepId: NewWorkspaceStepId;
  stepIndex: number;
  totalSteps: number;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  creating: boolean;
  error: string | null;
  nameRef: React.RefObject<HTMLInputElement | null>;
  canNext: boolean;
  footerHint: string;
  next: () => Promise<void>;
  back: () => void;
}

/**
 * Drives the workspace creation wizard (name → description), mirroring the
 * project/draft wizards. On finish it creates the workspace, makes it active, and
 * lands in its (empty) project browser.
 */
export function useNewWorkspace(): NewWorkspaceState {
  const navigate = useNavigate();
  const [, setActiveWorkspaceId] = useActiveWorkspaceId();

  const [stepId, setStepId] = useState<NewWorkspaceStepId>("name");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const stepIndex = Math.max(0, STEPS.indexOf(stepId)) + 1;
  const totalSteps = STEPS.length;

  useEffect(() => {
    if (stepId === "name") {
      const t = setTimeout(() => nameRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [stepId]);

  const canNext = stepId === "name" ? Boolean(name.trim()) : !creating;

  const finalize = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createWorkspace({ name, description });
      setActiveWorkspaceId(created.id);
      navigate("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the workspace.");
      setCreating(false);
    }
  };

  const next = async () => {
    if (stepId === "name") {
      if (!name.trim()) return;
      setStepId("description");
      return;
    }
    await finalize();
  };

  const back = () => {
    if (stepId === "description") setStepId("name");
  };

  const footerHint =
    stepId === "name"
      ? name.trim()
        ? "add an optional description next"
        : "name your workspace"
      : "you can skip the description";

  return {
    stepId,
    stepIndex,
    totalSteps,
    name,
    setName,
    description,
    setDescription,
    creating,
    error,
    nameRef,
    canNext,
    footerHint,
    next,
    back,
  };
}
