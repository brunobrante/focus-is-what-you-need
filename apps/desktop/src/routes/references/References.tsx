import { useRef } from "react";
import { Upload, FolderPlus } from "lucide-react";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { TopBar } from "@/components/layout/TopBar";
import { PageFooter } from "@/components/layout/PageFooter";
import { extFromName, deleteReferenceFrames } from "@/lib/tauri/referenceStorage";
import { typeOptionsForKind } from "./lib/utils";
import { VideoFramePicker } from "../import/VideoFramePicker";
import { useReferenceLibrary } from "./hooks/useReferenceLibrary";
import { ReferenceGrid } from "@/components/references/ReferenceGrid";
import { ImportModal, type ImportModalHandle } from "./components/ImportModal";
import { ReferenceGroupModal, type ReferenceGroupModalHandle, DeleteGroupModal, type DeleteGroupModalHandle } from "./components/GroupDialogs";
import { ReferenceDetailModal, type ReferenceDetailSubject } from "./components/ReferenceDetailModal";
import { SmallButton, FilterSearchBar } from "./components/ui";

export function References() {
  const lib = useReferenceLibrary();
  const importRef = useRef<ImportModalHandle>(null);
  const groupModalRef = useRef<ReferenceGroupModalHandle>(null);
  const deleteGroupRef = useRef<DeleteGroupModalHandle>(null);

  const modalSubject: ReferenceDetailSubject = (() => {
    if (!lib.selectedSubject) return null;
    if (lib.selectedSubject.kind === "reference" && lib.selected) {
      return { kind: "reference", item: lib.selected };
    }
    if (lib.selectedSubject.kind === "group" && lib.selectedGroup) {
      return { kind: "group", group: lib.selectedGroup, references: lib.selectedGroupReferences };
    }
    return null;
  })();

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />

      <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-7 pb-20 pt-8">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="m-0 mb-1.5 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
                  References
                </h1>
                <p className="m-0 text-[13px] text-[var(--text-muted)]">
                  Images, stacks, and groups saved locally.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SmallButton
                  type="button"
                  onClick={() => groupModalRef.current?.open({ mode: "create", onSave: (input) => lib.createGroup(input) })}
                >
                  <FolderPlus size={14} />
                  New group
                </SmallButton>
                <SmallButton
                  type="button"
                  primary
                  onClick={() => {
                    importRef.current?.open({
                      existingItems: lib.library,
                      targetGroupName: null,
                      onAdd: (items, opts) => {
                        if (opts?.groupTogether) lib.addItemsAsGroup(items);
                        else lib.addItems(items, null);
                      },
                      onUseExisting: (item) => {
                        lib.setSelectedSubject({ kind: "reference", id: item.id });
                      },
                    });
                  }}
                >
                  <Upload size={14} />
                  Upload
                </SmallButton>
              </div>
            </header>

            <div className="mb-[22px] flex items-center gap-2.5">
              <FilterSearchBar
                value={lib.query}
                onChange={lib.setQuery}
                filterKind={lib.filterKind}
                onFilterKindChange={(v) => {
                  const next = v as typeof lib.filterKind;
                  lib.setFilterKind(next);
                  lib.setFilterType((current) => {
                    const opts = typeOptionsForKind(next);
                    return opts.some((o) => o.value === current) ? current : "all";
                  });
                }}
                kindOptions={[
                  { value: "all", label: "All" },
                  { value: "image", label: "Images" },
                  { value: "video", label: "Videos" },
                  { value: "figx", label: "Canvas" },
                ]}
                filterType={lib.filterType}
                onFilterTypeChange={(v) => lib.setFilterType(v as typeof lib.filterType)}
                typeOptions={lib.typeOptions}
                filterSort={lib.filterSort}
                onFilterSortChange={(v) => lib.setFilterSort(v as typeof lib.filterSort)}
                sortOptions={[
                  { value: "recent", label: "Mais recentes" },
                  { value: "old", label: "Mais antigos" },
                  { value: "name", label: "Nome (A–Z)" },
                  { value: "size", label: "Maior tamanho" },
                ]}
              />
              <span className="ml-auto shrink-0 text-[12px] tabular-nums text-[var(--text-muted)]">
                {lib.loading
                  ? "…"
                  : `${lib.visibleGroups.length + lib.visible.length} ${
                      lib.visibleGroups.length + lib.visible.length === 1 ? "item" : "itens"
                    }`}
              </span>
            </div>

            {lib.loading ? (
              <LoadingState />
            ) : lib.visibleGroups.length + lib.visible.length === 0 ? (
              <EmptyMessage
                icon={<Upload size={18} aria-hidden />}
                title="No references yet"
                description="Click to upload images or videos"
                onClick={() => {
                  importRef.current?.open({
                    existingItems: lib.library,
                    targetGroupName: null,
                    onAdd: (items, opts) => {
                      if (opts?.groupTogether) lib.addItemsAsGroup(items);
                      else lib.addItems(items, null);
                    },
                    onUseExisting: (item) => {
                      lib.setSelectedSubject({ kind: "reference", id: item.id });
                    },
                  });
                }}
              />
            ) : (
              <ReferenceGrid
                groups={lib.visibleGroups}
                references={lib.visible}
                allReferences={lib.library}
                groupNameById={lib.groupNameById}
                stackThumbnailUrls={lib.stackThumbnailUrls}
                selectedReferenceId={
                  lib.selectedSubject?.kind === "reference" ? lib.selectedSubject.id : null
                }
                selectedGroupId={
                  lib.selectedSubject?.kind === "group" ? lib.selectedSubject.id : null
                }
                onSelectReference={(id) => lib.setSelectedSubject({ kind: "reference", id })}
                onSelectGroup={(id) => lib.setSelectedSubject({ kind: "group", id })}
                onOpenLightbox={(item) => lib.setSelectedSubject({ kind: "reference", id: item.id })}
              />
            )}
          </div>
        </div>

        <PageFooter />
      </main>

      <ImportModal ref={importRef} />

      {lib.frameVideo ? (
        <VideoFramePicker
          video={lib.frameVideo}
          busy={lib.frameBusy}
          onCancel={() => {
            if (lib.frameBusy) return;
            void deleteReferenceFrames(lib.frameVideo!.id);
            lib.setFrameVideo(null);
          }}
          onConfirm={(frames) => void lib.createFrameGroup(lib.frameVideo!, frames)}
        />
      ) : null}

      <ReferenceDetailModal
        subject={modalSubject}
        groups={lib.groups}
        looseReferences={lib.looseGroupCandidates}
        stackThumbnailUrls={lib.stackThumbnailUrls}
        onClose={() => lib.setSelectedSubject(null)}
        onDelete={(id) => lib.removeItem(id)}
        onNameChange={lib.updateName}
        onDescriptionChange={lib.updateDescription}
        onTagsChange={lib.updateTags}
        onSourceUrlChange={lib.updateSourceUrl}
        onGroupChange={lib.updateReferenceGroup}
        onExtractFrames={(video) =>
          lib.setFrameVideo({
            id: video.id,
            ext: video.ext || extFromName(video.name),
            name: video.name,
            duration: video.duration,
          })
        }
        onUpload={() => {
          if (!lib.selectedGroup) return;
          const group = lib.selectedGroup;
          importRef.current?.open({
            existingItems: lib.library,
            targetGroupName: group.name,
            onAdd: (items) => lib.addItems(items, group.id),
            onUseExisting: (item) => {
              lib.updateReferenceGroup(item.id, group.id);
              lib.setSelectedSubject({ kind: "group", id: group.id });
            },
          });
        }}
        onEditGroup={() => {
          if (!lib.selectedGroup) return;
          const group = lib.selectedGroup;
          groupModalRef.current?.open({
            mode: "edit",
            group,
            onSave: (input) => lib.updateGroup(group.id, input),
          });
        }}
        onDeleteGroup={() => {
          if (!lib.selectedGroup) return;
          const group = lib.selectedGroup;
          deleteGroupRef.current?.open(group, () => lib.confirmDeleteGroup(group.id));
        }}
      />

      <ReferenceGroupModal ref={groupModalRef} />
      <DeleteGroupModal ref={deleteGroupRef} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-40 items-center justify-center text-[13px] text-[var(--text-faint)]">
      Carregando…
    </div>
  );
}
