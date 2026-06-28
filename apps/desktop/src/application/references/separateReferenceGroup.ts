import {
  loadReferenceFile,
  loadReferenceStackFile,
  saveReferenceFile,
  saveReferenceStackFile,
  writeReferenceStackData,
  readReferenceStackData,
  removeReferenceFile,
} from "@/lib/tauri/referenceStorage";
import {
  stackRootIds,
  stackSummaryFromData,
  type ReferenceStackData,
} from "@/lib/references/stackTypes";
import { primeReferenceUrl } from "@/lib/references/referenceUrlCache";
import { removeReferenceLinksForLibraryId } from "@/lib/storage/repos/references.repo";
import { inferType } from "@/lib/references/mediaTypes";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem, SelectedSubject } from "@/routes/references/types";
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
 * is split — each screen becomes its own reference, a copy of that screen's image
 * carrying its stack (its cuts) — and the bundling reference is removed. It is a
 * plain separation, like duplicating the image once per screen.
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

/**
 * Materialize each screen (stack root) of a multi-root reference as its own
 * reference: a copy of that screen's image plus its cuts. Roots are always full
 * image size, so cut boxes are kept verbatim — they are authored in the original
 * image's coordinate space and the copy is the same size (see StackView).
 */
async function splitMultiRootReference(item: ReferenceItem): Promise<ReferenceItem[]> {
  const data = await readReferenceStackData(item.id);
  const roots = data?.roots ?? [];
  if (!data || roots.length === 0) return [];

  const rootIds = stackRootIds(data);
  const now = new Date().toISOString();
  const baseName = item.name.replace(/\.[^.]+$/, "");
  const width = data.original.w || item.w;
  const height = data.original.h || item.h;
  const created: ReferenceItem[] = [];
  let index = 0;

  for (const root of roots) {
    index += 1;
    const newReferenceId = newId();

    // Use this screen's own pixels: the default root is the original image; a
    // non-default root may have been edited, so it keeps its own rendered PNG —
    // exactly the image shown for that screen in the modal (see loadStackPreview).
    const screenBlob =
      root.isDefault || !root.file
        ? await loadReferenceFile(item.id, item.ext ?? "png")
        : await loadReferenceStackFile(item.id, root.file, "image/png");
    if (!screenBlob) continue;

    const ext = await saveReferenceFile(newReferenceId, screenBlob);
    const url = URL.createObjectURL(screenBlob);
    primeReferenceUrl(newReferenceId, url);

    const cuts = data.components.filter(
      (cut) => !rootIds.has(cut.id) && cut.rootId === root.id,
    );

    let stack: ReferenceItem["stack"];
    if (cuts.length > 0) {
      // Carry this screen's cut PNGs (the active variant of each) into the copy.
      const fileNames = new Set<string>();
      for (const cut of cuts) if (cut.file) fileNames.add(cut.file);
      for (const fileName of fileNames) {
        const blob = await loadReferenceStackFile(item.id, fileName, "image/png");
        if (blob) await saveReferenceStackFile(newReferenceId, fileName, blob);
      }

      const nextData: ReferenceStackData = {
        version: 2,
        referenceId: newReferenceId,
        mediaKind: "image",
        original: { ...data.original, ext },
        // The kept root becomes the default full-image root, sourced from the
        // copied screen image — its cuts stay in the same coordinate space.
        roots: [
          {
            id: root.id,
            name: root.name,
            box: { x: 0, y: 0, w: width, h: height },
            file: null,
            isDefault: true,
            createdAt: root.createdAt,
          },
        ],
        rootComponentId: root.id,
        primaryComponentId: root.id,
        components: cuts.map((cut) => ({ ...cut, rootId: root.id })),
        updatedAt: now,
      };
      await writeReferenceStackData(newReferenceId, nextData);
      stack = stackSummaryFromData(nextData);
    }

    created.push({
      id: newReferenceId,
      name: root.name?.trim() || `${baseName} — Screen ${index}`,
      mediaKind: "image",
      type: inferType(`screen.${ext}`),
      w: width,
      h: height,
      size: Math.max(1, Math.round(screenBlob.size / 1024)),
      ext,
      tags: item.tags ?? [],
      added: now,
      stack,
      url,
    });
  }

  return created;
}
