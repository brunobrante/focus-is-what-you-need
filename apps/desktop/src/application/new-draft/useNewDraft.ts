import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ProjectType } from "@/lib/data/types";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import { createComponent } from "@/lib/storage/repos/components.repo";

/** What the user is drafting: a top-level Screen or a free-size Component. */
export type DraftKind = "screen" | "component";

/** Pixel size of each device preset — used to seed a screen draft's scene. */
export const DRAFT_DEVICE_SIZE: Record<ProjectType, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

/** Default frame size offered for a fresh component draft. */
export const DEFAULT_COMPONENT_SIZE = { width: 720, height: 360 };

export type NewDraftStepId = "kind" | "device" | "size" | "name";

export interface NewDraftState {
  stepId: NewDraftStepId;
  stepIndex: number;
  totalSteps: number;
  kind: DraftKind | null;
  setKind: (kind: DraftKind) => void;
  device: ProjectType | null;
  setDevice: (device: ProjectType) => void;
  width: string;
  height: string;
  setWidth: (value: string) => void;
  setHeight: (value: string) => void;
  name: string;
  setName: (name: string) => void;
  creating: boolean;
  error: string | null;
  nameRef: React.RefObject<HTMLInputElement | null>;
  canNext: boolean;
  footerHint: string;
  next: () => Promise<void>;
  back: () => void;
}

function parsedSize(width: string, height: string): { w: number; h: number } | null {
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return null;
  return { w, h };
}

export function useNewDraft(): NewDraftState {
  const [stepId, setStepId] = useState<NewDraftStepId>("kind");
  const [kind, setKindState] = useState<DraftKind | null>(null);
  const [device, setDevice] = useState<ProjectType | null>(null);
  const [width, setWidth] = useState(String(DEFAULT_COMPONENT_SIZE.width));
  const [height, setHeight] = useState(String(DEFAULT_COMPONENT_SIZE.height));
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  // The middle step depends on the kind: a Screen picks a device, a Component
  // sizes its frame. Steps stay at three so the progress bar is stable.
  const steps = useMemo<NewDraftStepId[]>(() => {
    const middle: NewDraftStepId = kind === "component" ? "size" : "device";
    return ["kind", middle, "name"];
  }, [kind]);
  const stepIndex = Math.max(0, steps.indexOf(stepId)) + 1;
  const totalSteps = steps.length;

  // Choosing a kind reroutes the middle step; keep stepId valid.
  const setKind = (next: DraftKind) => {
    setKindState(next);
    if (stepId === "device" || stepId === "size") {
      setStepId(next === "component" ? "size" : "device");
    }
  };

  useEffect(() => {
    if (stepId === "name") {
      const t = setTimeout(() => nameRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [stepId]);

  const sizeValid = parsedSize(width, height) !== null;

  const canNext =
    !creating &&
    (stepId === "kind"
      ? !!kind
      : stepId === "device"
        ? !!device
        : stepId === "size"
          ? sizeValid
          : !!name.trim());

  const finalize = async () => {
    if (!kind || creating) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    let size: { width: number; height: number };
    let draftType: ProjectType;
    if (kind === "screen") {
      if (!device) return;
      size = DRAFT_DEVICE_SIZE[device];
      draftType = device;
    } else {
      const parsed = parsedSize(width, height);
      if (!parsed) return;
      size = { width: parsed.w, height: parsed.h };
      draftType = "desktop";
    }

    setCreating(true);
    setError(null);
    try {
      const { component } = await createComponent({
        parent: { kind: "draft" },
        name: trimmed,
        draftKind: kind,
        draftType,
        width: size.width,
        height: size.height,
      });
      // Drafts open in the global canvas by their variant alone — no project.
      navigate(
        `/canvas?variant=${encodeURIComponent(component.activeVariantId)}&type=${draftType}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create draft");
      setCreating(false);
    }
  };

  const next = async () => {
    if (!canNext) return;
    if (stepId === "name") {
      await finalize();
      return;
    }
    const idx = steps.indexOf(stepId);
    const target = steps[idx + 1];
    if (target) setStepId(target);
  };

  const back = () => {
    const idx = steps.indexOf(stepId);
    const target = steps[idx - 1];
    if (target) setStepId(target);
  };

  const footerHint =
    stepId === "kind"
      ? kind
        ? kind === "screen"
          ? "a top-level screen"
          : "a free-size component"
        : "screen or component?"
      : stepId === "device"
        ? device
          ? `device: ${PROJECT_TYPE_LABEL[device]}`
          : "pick a device"
        : stepId === "size"
          ? sizeValid
            ? `${Math.round(Number(width))} × ${Math.round(Number(height))}`
            : "enter a valid size"
          : name.trim()
            ? "ready to create"
            : "name your draft";

  return {
    stepId,
    stepIndex,
    totalSteps,
    kind,
    setKind,
    device,
    setDevice,
    width,
    height,
    setWidth,
    setHeight,
    name,
    setName,
    creating,
    error,
    nameRef,
    canNext,
    footerHint,
    next,
    back,
  };
}
