import { Link, useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/layout/PageFooter";
import { Snapshot } from "@/components/Snapshot";
import { DashedAddTile } from "@/components/DashedAddTile";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { IconPlus, IconChevronLeft, IconDocument, IconFrame, IconDiamond } from "@/components/icons";
import { useDeleteComponent } from "@/application/components/useDeleteComponent";
import { useDrafts } from "@/lib/storage/hooks";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ComponentRow } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";

/**
 * DraftsPage (`/drafts`) — the home of loose, project-less screens and
 * components. Drafts live outside the Workspace → Project hierarchy; each one
 * opens straight in the global canvas. Sibling to the Global Components page.
 */
export function DraftsPage() {
  const { data: drafts } = useDrafts();
  const { requestDelete, modal: deleteModal } = useDeleteComponent();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-6">
        <Link
          to="/"
          aria-label="Back to home"
          className="inline-grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] no-underline hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconChevronLeft size={14} strokeWidth={1.7} />
        </Link>
        <span className="text-[14px] font-semibold tracking-[-0.2px] text-[var(--text)]">Drafts</span>
        <span className="flex-1" />
        <Link to="/new-draft" className="btn btn-primary no-underline">
          <IconPlus size={14} strokeWidth={2} />
          New draft
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
        <header className="mb-8">
          <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Drafts</h1>
          <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
            Loose screens and components, outside any workspace or project ·{" "}
            {drafts.length} {drafts.length === 1 ? "draft" : "drafts"}
          </p>
        </header>

        {drafts.length === 0 ? (
          <EmptyMessage
            icon={<IconDocument size={17} strokeWidth={1.7} />}
            title="No drafts yet"
            description="Drafts are project-less screens and components to sketch ideas freely."
          />
        ) : (
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onRequestDelete={() => void requestDelete(d)} />
            ))}
            <AddDraftCard />
          </div>
        )}
      </main>

      {deleteModal}
      <PageFooter />
    </div>
  );
}

export default DraftsPage;

function draftType(draft: ComponentRow): ProjectType {
  return draft.draftType ?? "desktop";
}

function DraftCard({
  draft,
  onRequestDelete,
}: {
  draft: ComponentRow;
  onRequestDelete: () => void;
}) {
  const navigate = useNavigate();
  const type = draftType(draft);
  const isScreen = draft.draftKind === "screen";
  const canvasHref = `/canvas?variant=${encodeURIComponent(draft.activeVariantId)}&type=${type}`;
  const meta = isScreen ? `Screen · ${PROJECT_TYPE_LABEL[type]}` : "Component";

  return (
    <Link
      to={canvasHref}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] p-4 transition-colors group-hover:border-[var(--border-strong)]">
        <Snapshot
          kind="component"
          ownerType="variant"
          ownerId={draft.activeVariantId}
          seedKey={null}
          type={type}
          display="card"
        />
        <CardMenu
          buttons={[
            {
              key: "canvas",
              label: "Open in canvas",
              icon: CardMenuIcons.Canvas,
              onClick: () => navigate(canvasHref),
            },
            {
              key: "more",
              label: "More",
              icon: CardMenuIcons.More,
              menuItems: [
                {
                  key: "delete",
                  label: "Delete draft",
                  icon: CardMenuIcons.Trash,
                  destructive: true,
                  onClick: onRequestDelete,
                },
              ],
            },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text)]">
          {draft.name}
        </span>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
          {isScreen ? (
            <IconFrame size={11} strokeWidth={1.7} className="flex-shrink-0 opacity-90" />
          ) : (
            <IconDiamond size={11} strokeWidth={1.7} className="flex-shrink-0 opacity-90" />
          )}
          <span className="min-w-0 truncate">{meta}</span>
        </div>
      </div>
    </Link>
  );
}

function AddDraftCard() {
  return (
    <Link
      to="/new-draft"
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <DashedAddTile label="New draft" className="w-full" />
      <div className="flex flex-col gap-[3px] px-0.5">
        <span className="truncate text-[13px] font-medium text-[var(--text-muted)]">New draft</span>
        <div className="text-[11.5px] text-[var(--text-muted)]">screen or component</div>
      </div>
    </Link>
  );
}
