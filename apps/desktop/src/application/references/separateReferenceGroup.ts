import {
  loadReferenceFile,
  loadReferenceStackFile,
  saveReferenceFile,
  removeReferenceFile,
} from "@/lib/tauri/referenceStorage";
import { readReferenceStackData } from "@/lib/tauri/referenceStorage";
import { primeReferenceUrl } from "@/lib/references/referenceUrlCache";
import { removeReferenceLinksForLibraryId } from "@/lib/storage/repos/references.repo";
import { inferType } from "@/lib/references/mediaTypes";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem, SelectedSubject } from "@/routes/references/types";
import { measureImage } from "@/routes/references/lib/fileHelpers";
import { newId } from "@/routes/references/lib/utils";

export interface SeparateGroupDeps {
  libraryRef: { current: ReferenceItem[] };
  groupsRef: { current: ReferenceGroup[] };
  setLibrary: (updater: (prev: ReferenceItem[]) => ReferenceItem[]) => void;
  setGroups: (updater: (prev: ReferenceGroup[]) => ReferenceGroup[]) => void;
  setSelectedSubject: (subject: SelectedSubject) => void;
}

/**
 * Dissolve a group into standalone references. Members that hold a single screen
 * are simply ungrouped; a member that bundles several screens (a multi-root stack)
 * is split — each screen becomes its own plain image, just like a regular upload —
 * and the bundling reference is removed. Cuts are flattened into the screen image;
 * the separated references carry no stack, so they never re-promote into a group.
 */
export async function separateReferenceGroup(
  groupId: string,
  deps: SeparateGroupDeps,
): Promise<void> {
  const { libraryRef, groupsRef, setLibrary, setGroups, setSelectedSubject } = deps;

  const group = groupsRef.current.find((g) => g.id === groupId);
  if (!group) return;

  const members = group.referenceIds
    .map((id) => libraryRef.current.find((item) => item.id === id))
    .filter((item): item is ReferenceItem => item != null);

  const createdItems: ReferenceItem[] = [];
  const removedIds: string[] = [];

  for (const member of members) {
    if ((member.stack?.rootCount ?? 1) <= 1) continue; // a single screen — just ungroup it below
    const screens = await splitMultiRootReference(member);
    if (screens.length === 0) continue; // could not read the stack — leave the member intact, ungrouped
    createdItems.push(...screens);
    removedIds.push(member.id);
  }

  const ungroupIds = new Set(
    members.filter((m) => !removedIds.includes(m.id)).map((m) => m.id),
  );

  setLibrary((prev) => {
    const next = prev
      .filter((item) => !removedIds.includes(item.id))
      .map((item) => (ungroupIds.has(item.id) ? { ...item, groupId: null } : item));
    return [...createdItems, ...next];
  });
  setGroups((prev) => prev.filter((g) => g.id !== groupId));

  // The bundling references are gone; drop their files and any project links.
  for (const id of removedIds) {
    void removeReferenceFile(id);
    void removeReferenceLinksForLibraryId(id);
  }

  setSelectedSubject(null);
}

/** Materialize each root of a multi-root reference as its own plain image. */
async function splitMultiRootReference(item: ReferenceItem): Promise<ReferenceItem[]> {
  const data = await readReferenceStackData(item.id);
  const roots = data?.roots ?? [];
  if (!data || roots.length === 0) return [];

  const now = new Date().toISOString();
  const baseName = item.name.replace(/\.[^.]+$/, "");
  const created: ReferenceItem[] = [];
  let index = 0;

  for (const root of roots) {
    index += 1;
    // A default root's pixels are the original image; other roots are stored as a
    // pre-rendered screen PNG in the reference's stack folder.
    const blob =
      root.isDefault || !root.file
        ? await loadReferenceFile(item.id, item.ext ?? "png")
        : await loadReferenceStackFile(item.id, root.file, "image/png");
    if (!blob) continue;

    const newReferenceId = newId();
    const ext = await saveReferenceFile(newReferenceId, blob);
    const url = URL.createObjectURL(blob);
    primeReferenceUrl(newReferenceId, url);
    const dims = await measureImage(url).catch(() => ({
      w: Math.round(root.box.w),
      h: Math.round(root.box.h),
    }));

    created.push({
      id: newReferenceId,
      name: root.name?.trim() || `${baseName} — Screen ${index}`,
      mediaKind: "image",
      type: inferType(`screen.${ext}`),
      w: dims.w,
      h: dims.h,
      size: Math.max(1, Math.round(blob.size / 1024)),
      ext,
      tags: item.tags ?? [],
      added: now,
      url,
    });
  }

  return created;
}
