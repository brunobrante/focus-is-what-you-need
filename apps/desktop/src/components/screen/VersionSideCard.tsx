import { CardMenu, CardMenuIcons, type CardMenuButton } from "@/components/screen/CardMenu";
import { getCanvasMockForTemplate } from "@/components/mocks/data/canvasMocks";
import { Snapshot } from "@/components/Snapshot";
import type { ScreenVersion } from "@/lib/data/screenVersions";
import type { ProjectType } from "@/lib/data/types";

/**
 * Standard hover-menu buttons for a version card (screen or component), matching the
 * component card style: open canvas, fast edit (stub), and — for non-main versions —
 * a More menu with Delete version.
 */
export function versionCardButtons(input: {
  isMain: boolean;
  onOpenCanvas: () => void;
  onFastEdit?: () => void;
  onDelete: () => void;
}): CardMenuButton[] {
  const buttons: CardMenuButton[] = [
    {
      key: "canvas",
      label: "Open in canvas",
      icon: CardMenuIcons.Canvas,
      onClick: (e) => { e.stopPropagation(); input.onOpenCanvas(); },
    },
    {
      key: "fastedit",
      label: "Fast edit",
      icon: CardMenuIcons.FastEdit,
      onClick: (e) => { e.stopPropagation(); input.onFastEdit?.(); },
    },
  ];
  if (!input.isMain) {
    buttons.push({
      key: "more",
      label: "More",
      icon: CardMenuIcons.More,
      menuItems: [
        {
          key: "delete",
          label: "Delete version",
          icon: CardMenuIcons.Trash,
          destructive: true,
          onClick: () => input.onDelete(),
        },
      ],
    });
  }
  return buttons;
}

/** The version tag badge: green for "main", purple for "V1"/"V2"… */
export function VersionTagBadge({ tag, isMain }: { tag?: string; isMain: boolean }) {
  if (!tag) return null;
  return isMain ? (
    <span
      className="flex-shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.5px]"
      style={{ color: "#9EE6AE", borderColor: "#3FB950", background: "rgba(63,185,80,0.1)" }}
    >
      {tag}
    </span>
  ) : (
    <span className="flex-shrink-0 rounded border border-[#9b6dff] bg-[rgba(155,109,255,0.1)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.5px] text-[#c9b3ff]">
      {tag}
    </span>
  );
}

export function PreviewMockImage({
  tpl,
  type,
  allowMock,
  compact = false,
}: {
  tpl: ScreenVersion["tpl"];
  type: ProjectType;
  allowMock: boolean;
  compact?: boolean;
}) {
  if (!allowMock) {
    return (
      <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-faint)]">
        Empty screen
      </div>
    );
  }

  const mock = getCanvasMockForTemplate(tpl, type);
  if (!mock) {
    return (
      <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-faint)]">
        Empty screen
      </div>
    );
  }
  return (
    <img
      src={mock.snapshot}
      alt=""
      className={["block h-full w-full object-cover", compact ? "rounded-[4px]" : ""].join(" ")}
      draggable={false}
    />
  );
}

export function VersionSideCard({
  version,
  active,
  type,
  allowMock,
  onSelect,
  onOpenCanvas,
  onFastEdit,
  onDelete,
}: {
  version: ScreenVersion;
  active: boolean;
  type: ProjectType;
  allowMock: boolean;
  onSelect: () => void;
  onOpenCanvas: () => void;
  onFastEdit?: () => void;
  onDelete: () => void;
}) {
  const isMain = version.tag === "main";
  return (
    <div className="group flex flex-col gap-2.5 text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5">
      <div
        className={[
          "relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border bg-[var(--bg)] p-3 transition-colors",
          active ? "border-[var(--text-muted)]" : "border-[var(--border)] group-hover:border-[var(--border-strong)]",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Select version ${version.tag ?? version.title}`}
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
        />
        <div className="h-full w-full overflow-hidden">
          {version.screenId ? (
            <Snapshot kind="screen" ownerType="screen" ownerId={version.screenId} type={type} display="card" />
          ) : (
            <PreviewMockImage tpl={version.tpl} type={type} compact allowMock={allowMock} />
          )}
        </div>
        <CardMenu buttons={versionCardButtons({ isMain, onOpenCanvas, onFastEdit, onDelete })} />
      </div>
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <VersionTagBadge tag={version.tag} isMain={isMain} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
          {version.title}
        </span>
      </div>
    </div>
  );
}
