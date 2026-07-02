import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PageFooter } from "@/components/layout/PageFooter";
import { useReferences } from "@/lib/storage/hooks";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import {
  AddReferenceModal,
  type AddReferenceModalHandle,
} from "@/components/modals/AddReferenceModal";
import {
  ReferencesModal,
  type ReferencesModalHandle,
} from "@/components/modals/ReferencesModal";
import { ReferenceCard } from "@/components/references/ReferenceCard";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { IconImage, IconPlus } from "@/components/icons";

/**
 * A workspace's references: only the references explicitly added to this
 * workspace (workspace-level links), inside the workspace TopBar. Distinct from
 * Home's `/references`, which is the full global library — adding there does not
 * touch any workspace. New references are picked from the library or uploaded via
 * the shared AddReferenceModal (workspace-global mode), so they land in the
 * library and link here in one step.
 */
export function WorkspaceReferencesPage() {
  // The active workspace is already synced from :workspaceId by WorkspaceLayout,
  // which this page renders under — no need to re-sync it here (D8).
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: references } = useReferences("workspace", workspaceId ?? null);
  const addRef = useRef<AddReferenceModalHandle>(null);
  const lightboxRef = useRef<ReferencesModalHandle>(null);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? references.filter((reference) =>
        `${reference.title} ${reference.source} ${reference.metadata.join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : references;

  const removeOne = (id: string) =>
    workspaceId && void removeReferenceFromOwner(id, "workspace", workspaceId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-7 pb-20 pt-8">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="m-0 mb-1.5 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
                  References
                </h1>
                <p className="m-0 text-[13px] text-[var(--text-muted)]">
                  References added to this workspace.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search references…"
                  className="h-9 w-[220px] rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
                />
                <button
                  type="button"
                  onClick={() => addRef.current?.open()}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--text)] px-3 text-[12.5px] font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
                >
                  <IconPlus size={13} strokeWidth={2.2} />
                  Add reference
                </button>
              </div>
            </header>

            {filtered.length === 0 ? (
              <EmptyMessage
                icon={<IconImage size={17} strokeWidth={1.7} />}
                title={query.trim() ? "No reference found" : "No references yet"}
                description="Add references from your library or upload new ones."
                onClick={() => addRef.current?.open()}
              />
            ) : (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
              >
                {filtered.map((reference, index) => (
                  <ReferenceCard
                    key={reference.id}
                    kind="row"
                    reference={reference}
                    onClick={() => lightboxRef.current?.open(index)}
                    onRemove={() => removeOne(reference.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <PageFooter />
      </main>

      <AddReferenceModal
        ref={addRef}
        projectId={null}
        workspaceId={workspaceId ?? null}
        screens={[]}
        components={[]}
        existingReferences={references}
        onAdd={(input) => createOrAttachReference(input)}
      />
      <ReferencesModal ref={lightboxRef} references={filtered} onRemove={(reference) => removeOne(reference.id)} />
    </div>
  );
}

export default WorkspaceReferencesPage;
