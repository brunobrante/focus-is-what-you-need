import { getProject, listProjects, updateProject } from "@/lib/storage/repos/projects.repo";
import { getScreen, listScreensByProject } from "@/lib/storage/repos/screens.repo";
import { getThumbnailByOwner } from "@/lib/storage/repos/thumbnails.repo";
import { getGlobalSettings } from "@/lib/storage/repos/settings.repo";
import { renderProjectThumbnailDataUrl } from "@/lib/storage/projectThumbnail";

/**
 * Project card thumbnails are derived from the first screen's snapshot. The
 * snapshot is produced by the canvas thumbnail pipeline; this module composes it
 * with the project name and a device mockup (see `lib/storage/projectThumbnail`)
 * and writes the result to `ProjectRow.thumbnailDataUrl`.
 *
 * Generation runs off the critical path, debounced per project, and is a no-op
 * when no snapshot exists yet — there is nothing to render around.
 */

const REFRESH_DELAY_MS = 200;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Regenerate one project's thumbnail from its first screen's snapshot. Returns
 * true when the project row was updated. Unconditional: callers gate on the
 * `projectThumbnails.autoGenerate` setting where appropriate.
 */
export async function regenerateProjectThumbnail(projectId: string): Promise<boolean> {
  const project = await getProject(projectId);
  if (!project) return false;

  const screens = await listScreensByProject(projectId);
  const firstScreen = screens[0];
  if (!firstScreen) return false;

  // The snapshot must already exist; we never rasterise the screen here.
  const snapshot = await getThumbnailByOwner("screen", firstScreen.id);
  if (!snapshot?.dataUrl) return false;

  const thumbnailDataUrl = renderProjectThumbnailDataUrl({
    name: project.name,
    type: project.type,
    snapshotDataUrl: snapshot.dataUrl,
  });
  if (thumbnailDataUrl === project.thumbnailDataUrl) return false;

  await updateProject(projectId, { thumbnailDataUrl });
  return true;
}

/** Debounced wrapper so rapid snapshot updates collapse into one regeneration. */
export function scheduleProjectThumbnailRefresh(projectId: string): void {
  const existing = timers.get(projectId);
  if (existing) clearTimeout(existing);
  timers.set(
    projectId,
    setTimeout(() => {
      timers.delete(projectId);
      void regenerateProjectThumbnail(projectId);
    }, REFRESH_DELAY_MS),
  );
}

/**
 * Called when a screen snapshot is (re)generated. Only the first screen of a
 * project drives that project's thumbnail, so edits to any other screen are
 * ignored. Respects the auto-generate setting.
 */
export async function refreshProjectThumbnailForScreenSnapshot(screenId: string): Promise<void> {
  const settings = await getGlobalSettings();
  if (!settings.projectThumbnails.autoGenerate) return;

  const screen = await getScreen(screenId);
  if (!screen) return;

  const screens = await listScreensByProject(screen.projectId);
  if (screens[0]?.id !== screenId) return;

  scheduleProjectThumbnailRefresh(screen.projectId);
}

/**
 * Backfill every project's thumbnail from its current first-screen snapshot.
 * Used when the user turns the feature on so existing projects update at once.
 */
export async function regenerateAllProjectThumbnails(): Promise<void> {
  const projects = await listProjects();
  for (const project of projects) {
    await regenerateProjectThumbnail(project.id);
  }
}
