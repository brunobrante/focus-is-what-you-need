import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import {
  ConfirmActionModal,
  type ConfirmActionModalHandle,
} from "@/components/modals/ConfirmActionModal";
import { DashedAddTile } from "@/components/DashedAddTile";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { IconPlus, IconDocument, IconFrame, IconDiamond, IconStar } from "@/components/icons";
import { useDeleteComponent } from "@/application/components/useDeleteComponent";
import { useDrafts, useDraftIcons } from "@/lib/storage/hooks";
import { deleteIcon } from "@/lib/storage/repos/icons.repo";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ComponentRow, IconRow } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";

/**
 * DraftsPage (`/drafts`) — the home of loose, project-less drafts: screens and
 * components (`ComponentRow`s) plus icons (`IconRow`s). Drafts live outside the
 * Workspace → Project hierarchy; each opens straight in the global canvas.
 * Sibling to the Global Components page.
 */
export function DraftsPage() {
  const { data: drafts } = useDrafts();
  const { data: iconDrafts } = useDraftIcons();
  const { requestDelete, modal: deleteModal } = useDeleteComponent();
  // Icons aren't components, so they can't go through useDeleteComponent — but
  // they still deserve a confirm before deletion, like the sibling DraftCard (L9).
  const confirmRef = useRef<ConfirmActionModalHandle>(null);

  const total = drafts.length + iconDrafts.length;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Drafts</h1>
          <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
            Loose screens, components and icons, outside any workspace or project ·{" "}
            {total} {total === 1 ? "draft" : "drafts"}
          </p>
        </div>
        <Link to="/new-draft" className="btn btn-primary no-underline shrink-0">
          <IconPlus size={14} strokeWidth={2} />
          New draft
        </Link>
      </header>

      {total === 0 ? (
        <EmptyMessage
          icon={<IconDocument size={17} strokeWidth={1.7} />}
          title="No drafts yet"
          description="Drafts are project-less screens, components and icons to sketch ideas freely."
        />
      ) : (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} onRequestDelete={() => void requestDelete(d)} />
          ))}
          {iconDrafts.map((icon) => (
            <IconDraftCard
              key={icon.id}
              icon={icon}
              onRequestDelete={() =>
                confirmRef.current?.open({
                  title: "Delete draft",
                  message: `"${icon.name}" will be permanently deleted.`,
                  onConfirm: () => void deleteIcon(icon.id),
                })
              }
            />
          ))}
          <AddDraftCard />
        </div>
      )}

      {deleteModal}
      <ConfirmActionModal ref={confirmRef} />
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

function IconDraftCard({ icon, onRequestDelete }: { icon: IconRow; onRequestDelete: () => void }) {
  const navigate = useNavigate();
  // A draft icon opens by its art variant alone (no project), like every draft.
  const canvasHref = `/canvas?variant=${encodeURIComponent(icon.activeVariantId)}&type=desktop`;

  return (
    <Link
      to={canvasHref}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] p-4 transition-colors group-hover:border-[var(--border-strong)]">
        <Snapshot
          kind="component"
          ownerType="variant"
          ownerId={icon.activeVariantId}
          seedKey={null}
          type="desktop"
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
          {icon.name}
        </span>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
          <IconStar size={11} strokeWidth={1.7} className="flex-shrink-0 opacity-90" />
          <span className="min-w-0 truncate">Icon</span>
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
        <div className="text-[11.5px] text-[var(--text-muted)]">screen, component or icon</div>
      </div>
    </Link>
  );
}
