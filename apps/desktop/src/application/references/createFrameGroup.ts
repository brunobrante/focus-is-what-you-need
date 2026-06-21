import {
  saveReferenceFile,
  extractVideoFrameFull,
  deleteReferenceFrames,
  type ExtractedFrame,
} from "@/lib/tauri/referenceStorage";
import { primeReferenceUrl } from "@/lib/references/referenceUrlCache";
import {
  newReferenceGroupId,
  type ReferenceGroup,
} from "@/lib/references/groupTypes";
import type { ReferenceItem, SelectedSubject } from "@/routes/references/types";
import { addReferencesToGroup } from "@/routes/references/lib/groupHelpers";
import {
  measureImage,
  inferType as inferTypeHelper,
} from "@/routes/references/lib/fileHelpers";
import { formatDuration, newId } from "@/routes/references/lib/utils";
import type { FramePickerVideo } from "@/routes/import/VideoFramePicker";

export interface CreateFrameGroupDeps {
  libraryRef: { current: ReferenceItem[] };
  groupsRef: { current: ReferenceGroup[] };
  setFrameBusy: (busy: boolean) => void;
  setLibrary: (updater: (prev: ReferenceItem[]) => ReferenceItem[]) => void;
  setGroups: (updater: (prev: ReferenceGroup[]) => ReferenceGroup[]) => void;
  setSelectedSubject: (subject: SelectedSubject) => void;
  setFrameVideo: (video: FramePickerVideo | null) => void;
}

export async function createFrameGroup(
  video: FramePickerVideo,
  frames: ExtractedFrame[],
  deps: CreateFrameGroupDeps,
): Promise<void> {
  const {
    libraryRef,
    groupsRef,
    setFrameBusy,
    setLibrary,
    setGroups,
    setSelectedSubject,
    setFrameVideo,
  } = deps;

  if (frames.length === 0) return;
  setFrameBusy(true);
  try {
    const baseName = video.name.replace(/\.[^.]+$/, "");
    const now = new Date().toISOString();
    const frameItems: ReferenceItem[] = [];

    for (const frame of frames) {
      const blob = await extractVideoFrameFull(video.id, video.ext, frame.timestamp_ms);
      if (!blob) continue;
      const id = newId();
      let ext: string;
      try {
        ext = await saveReferenceFile(id, blob);
      } catch (err) {
        console.error("[frames] saveReferenceFile failed:", err);
        continue;
      }
      const url = URL.createObjectURL(blob);
      primeReferenceUrl(id, url);
      const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
      frameItems.push({
        id,
        name: `${baseName} — ${formatDuration(frame.timestamp_ms / 1000)}`,
        mediaKind: "image",
        type: inferTypeHelper(`frame.${ext}`),
        w: dims.w,
        h: dims.h,
        size: Math.max(1, Math.round(blob.size / 1024)),
        ext,
        tags: ["image", "frame"],
        added: now,
        url,
      });
    }

    await deleteReferenceFrames(video.id).catch(() => {});
    if (frameItems.length === 0) return;

    // A video owns a single group: extracting frames transforms the video
    // into that group (and folds the video into it, so the catalog shows one
    // card). Re-extracting reuses the same group instead of spawning a new
    // one — the new frames are appended.
    const videoItem = libraryRef.current.find((item) => item.id === video.id) ?? null;
    const existingGroup =
      (videoItem?.groupId
        ? groupsRef.current.find((entry) => entry.id === videoItem.groupId)
        : null) ?? null;

    const group: ReferenceGroup = existingGroup ?? {
      id: newReferenceGroupId(),
      name: baseName || "Video frames",
      referenceIds: [],
      coverReferenceId: null,
      createdAt: now,
      updatedAt: now,
    };
    const memberIds = frameItems.map((item) => item.id);
    const withGroup = frameItems.map((item) => ({ ...item, groupId: group.id }));

    setLibrary((prev) =>
      [...withGroup, ...prev].map((item) =>
        item.id === video.id ? { ...item, groupId: group.id } : item,
      ),
    );
    setGroups((prev) => {
      const base = existingGroup ? prev : [group, ...prev];
      // Frames first (so the cover defaults to a frame, not the video),
      // video last but still a member so it stays accessible for re-extract.
      return addReferencesToGroup(base, group.id, [...memberIds, video.id]);
    });
    setSelectedSubject({ kind: "group", id: group.id });
    setFrameVideo(null);
  } finally {
    setFrameBusy(false);
  }
}
