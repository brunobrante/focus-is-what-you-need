import type { CanvasCommandId } from "@/domain/settings/types";

export type AppSettingsTab =
  | "canvas"
  | "projects"
  | "processing"
  | "shortcuts"
  | "storage";

export type RecordingCommand = {
  id: CanvasCommandId;
  type: "key" | "modifier";
} | null;
