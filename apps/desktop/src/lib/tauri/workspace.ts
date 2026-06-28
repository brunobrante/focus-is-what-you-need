import { invoke } from "@tauri-apps/api/core";

export type WorkspaceConfig = {
  base_folder: string;
  workspace_name: string;
};

export async function getWorkspaceConfig(): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("get_workspace_config");
}

export async function setWorkspaceFolder(baseFolder: string): Promise<void> {
  return invoke("set_workspace_folder", { baseFolder });
}

export async function pickFolderDialog(): Promise<string | null> {
  return invoke<string | null>("pick_folder_dialog");
}

export async function openInFinder(path: string): Promise<void> {
  return invoke("open_in_finder", { path });
}

export async function ensureWorkspaceFolders(): Promise<string> {
  return invoke<string>("ensure_workspace_folders");
}
