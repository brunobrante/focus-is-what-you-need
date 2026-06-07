import { Upload, FolderPlus } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { extFromName, deleteReferenceFrames } from "@/lib/tauri/referenceStorage";
import { typeOptionsForKind } from "./lib/utils";
import { VideoFramePicker } from "../import/VideoFramePicker";
import { useReferenceLibrary } from "./hooks/useReferenceLibrary";
import { CatalogGrid } from "./components/CatalogGrid";
import { Inspector, GroupInspector } from "./components/Inspector";
import { ImportModal } from "./components/ImportModal";
import { Lightbox } from "./components/Lightbox";
import { ReferenceGroupModal, DeleteGroupModal } from "./components/GroupDialogs";
import { SmallButton, SearchInput, SelectControl } from "./components/ui";

export function References() {
  const lib = useReferenceLibrary();

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex flex-1 min-w-0 min-h-0 flex-col">
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
                    onClick={() => lib.setGroupDialog({ mode: "create" })}
                  >
                    <FolderPlus size={14} />
                    New group
                  </SmallButton>
                  <SmallButton
                    type="button"
                    primary
                    onClick={() => {
                      lib.setImportTargetGroupId(null);
                      lib.setImportOpen(true);
                    }}
                  >
                    <Upload size={14} />
                    Upload
                  </SmallButton>
                </div>
              </header>

              <div className="mb-[22px] flex flex-wrap items-center gap-2.5">
                <SearchInput value={lib.query} onChange={lib.setQuery} />
                <SelectControl
                  value={lib.filterKind}
                  onChange={(v) => {
                    const next = v as typeof lib.filterKind;
                    lib.setFilterKind(next);
                    lib.setFilterType((current) => {
                      const opts = typeOptionsForKind(next);
                      return opts.some((o) => o.value === current) ? current : "all";
                    });
                  }}
                  options={[
                    { value: "all", label: "All" },
                    { value: "image", label: "Images" },
                    { value: "video", label: "Videos" },
                    { value: "figx", label: "Canvas" },
                  ]}
                />
                <SelectControl
                  value={lib.filterType}
                  onChange={(v) => lib.setFilterType(v as typeof lib.filterType)}
                  options={lib.typeOptions}
                />
                <SelectControl
                  value={lib.filterSort}
                  onChange={(v) => lib.setFilterSort(v as typeof lib.filterSort)}
                  options={[
                    { value: "recent", label: "Mais recentes" },
                    { value: "old", label: "Mais antigos" },
                    { value: "name", label: "Nome (A–Z)" },
                    { value: "size", label: "Maior tamanho" },
                  ]}
                />
                <span className="ml-auto text-[12px] tabular-nums text-[var(--text-muted)]">
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
                <EmptyState
                  onUpload={() => {
                    lib.setImportTargetGroupId(null);
                    lib.setImportOpen(true);
                  }}
                />
              ) : (
                <CatalogGrid
                  groups={lib.visibleGroups}
                  references={lib.visible}
                  allReferences={lib.library}
                  groupNameById={lib.groupNameById}
                  archiveStatus={lib.archiveStatus}
                  stackThumbnailUrls={lib.stackThumbnailUrls}
                  selectedReferenceId={
                    lib.selectedSubject?.kind === "reference" ? lib.selectedSubject.id : null
                  }
                  selectedGroupId={
                    lib.selectedSubject?.kind === "group" ? lib.selectedSubject.id : null
                  }
                  onSelectReference={(id) =>
                    lib.setSelectedSubject({ kind: "reference", id })
                  }
                  onSelectGroup={(id) => lib.setSelectedSubject({ kind: "group", id })}
                  onOpenLightbox={(item) => lib.setLightboxItem(item)}
                />
              )}
            </div>
          </div>

          <footer className="mt-auto border-t border-[var(--border)] py-4 text-center text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
            v0.1 · design preview
          </footer>
        </main>

        <aside
          className={[
            "shrink-0 overflow-hidden border-l border-[var(--border)]",
            "transition-[width] duration-200",
            lib.selected || lib.selectedGroup ? "w-[320px]" : "w-0",
          ].join(" ")}
          style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}
        >
          {lib.selectedGroup ? (
            <GroupInspector
              group={lib.selectedGroup}
              references={lib.selectedGroupReferences}
              looseReferences={lib.looseGroupCandidates}
              archiveStatus={
                lib.archiveStatus?.groupId === lib.selectedGroup.id ? lib.archiveStatus : null
              }
              stackThumbnailUrls={lib.stackThumbnailUrls}
              onClose={() => lib.setSelectedSubject(null)}
              onOpenLightbox={(item) => lib.setLightboxItem(item)}
              onUpload={() => {
                lib.setImportTargetGroupId(lib.selectedGroup!.id);
                lib.setImportOpen(true);
              }}
              onEdit={() => lib.setGroupDialog({ mode: "edit", group: lib.selectedGroup! })}
              onDelete={() => lib.setDeleteGroup(lib.selectedGroup)}
              onSyncArchive={() => void lib.syncGroupArchive(lib.selectedGroup!)}
              onGroupChange={lib.updateReferenceGroup}
            />
          ) : (
            <Inspector
              item={lib.selected}
              onClose={() => lib.setSelectedSubject(null)}
              onOpenLightbox={(item) => lib.setLightboxItem(item)}
              onDelete={(id) => lib.removeItem(id)}
              onDescriptionChange={lib.updateDescription}
              onTagsChange={lib.updateTags}
              onSourceUrlChange={lib.updateSourceUrl}
              groups={lib.groups}
              onGroupChange={lib.updateReferenceGroup}
              onExtractFrames={(video) =>
                lib.setFrameVideo({
                  id: video.id,
                  ext: video.ext || extFromName(video.name),
                  name: video.name,
                  duration: video.duration,
                })
              }
            />
          )}
        </aside>
      </div>

      <ImportModal
        open={lib.importOpen}
        existingItems={lib.library}
        onClose={() => {
          lib.setImportOpen(false);
          lib.setImportTargetGroupId(null);
        }}
        onAdd={(items, options) => {
          if (options?.groupTogether && !lib.importTargetGroupId) {
            lib.addItemsAsGroup(items);
          } else {
            lib.addItems(items);
          }
          lib.setImportOpen(false);
          lib.setImportTargetGroupId(null);
        }}
        onUseExisting={(item) => {
          if (lib.importTargetGroupId) {
            lib.updateReferenceGroup(item.id, lib.importTargetGroupId);
            lib.setSelectedSubject({ kind: "group", id: lib.importTargetGroupId });
          } else {
            lib.setSelectedSubject({ kind: "reference", id: item.id });
          }
          lib.setImportOpen(false);
          lib.setImportTargetGroupId(null);
        }}
        targetGroupName={lib.importTargetGroup?.name ?? null}
      />

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

      <Lightbox item={lib.lightboxItem} onClose={() => lib.setLightboxItem(null)} />
      <ReferenceGroupModal
        state={lib.groupDialog}
        onCancel={() => lib.setGroupDialog(null)}
        onSave={lib.saveGroupDialog}
      />
      <DeleteGroupModal
        group={lib.deleteGroup}
        onCancel={() => lib.setDeleteGroup(null)}
        onConfirm={lib.confirmDeleteGroup}
      />
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

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <button
      type="button"
      onClick={onUpload}
      className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-[12px] border border-dashed border-[var(--border-strong)] py-20 text-center transition-colors hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.01)]"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
        backgroundSize: "22px 22px",
        backgroundColor: "var(--bg)",
      }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]">
        <Upload size={18} />
      </span>
      <div>
        <p className="m-0 text-[13px] font-medium text-[var(--text)]">No references yet</p>
        <p className="m-0 mt-1 text-[12px] text-[var(--text-faint)]">
          Click to upload images or videos
        </p>
      </div>
    </button>
  );
}
