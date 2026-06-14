import { Link, useNavigate } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import type { ComponentRow, VariantRow } from "@/lib/storage/schema";
import type { ProjectType } from "@/lib/data/types";

export function ComponentSideCard({
  component,
  variant,
  projectId,
  type,
  linked = false,
  onRequestDelete,
  onOpenCanvas,
  onFastEdit,
  onMoveTo,
  onMakeGlobal,
}: {
  component: ComponentRow;
  variant: VariantRow | null;
  projectId: string;
  type: ProjectType;
  // True when shown inside a version's detail: the component belongs to the main and
  // is referenced as a linked instance — rendered with a purple border and read-only
  // (no destructive actions).
  linked?: boolean;
  onRequestDelete: (component: ComponentRow) => void;
  onOpenCanvas: (variantId: string) => void;
  onFastEdit: (component: ComponentRow) => void;
  onMoveTo: (component: ComponentRow) => void;
  onMakeGlobal: (component: ComponentRow) => void;
}) {
  const navigate = useNavigate();
  const href = `/project/${encodeURIComponent(projectId)}/c/${component.id}`;
  return (
    <Link
      to={href}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div
        className={[
          "preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border p-4 transition-colors",
          linked
            ? "border-[#9b6dff] group-hover:border-[#b69cff]"
            : "border-[var(--border)] group-hover:border-[var(--border-strong)]",
        ].join(" ")}
      >
        {variant ? (
          <Snapshot
            kind="component"
            ownerType="variant"
            ownerId={variant.id}
            seedKey={variant.seedKey}
            type={type}
            display="card"
          />
        ) : null}
        <CardMenu
          buttons={[
            {
              key: "canvas",
              label: "Open in canvas",
              icon: CardMenuIcons.Canvas,
              onClick: () => {
                if (variant) onOpenCanvas(variant.id);
                else navigate(href);
              },
            },
            {
              key: "fast-edit",
              label: "Fast edit",
              icon: CardMenuIcons.FastEdit,
              onClick: () => onFastEdit(component),
            },
            // A linked instance references the main's component — no destructive
            // actions from a version's view.
            ...(linked
              ? []
              : [
                  {
                    key: "more",
                    label: "More",
                    icon: CardMenuIcons.More,
                    menuItems: [
                      { key: "move-to", label: "Move to", icon: CardMenuIcons.MoveTo, onClick: () => onMoveTo(component) },
                      { key: "make-global", label: "Make global", icon: CardMenuIcons.MakeGlobal, onClick: () => onMakeGlobal(component) },
                      { key: "delete", label: "Delete component", icon: CardMenuIcons.Trash, destructive: true, onClick: () => onRequestDelete(component) },
                    ],
                  },
                ]),
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
            {component.name}
          </span>
          {linked ? (
            <span className="flex-shrink-0 rounded border border-[#9b6dff] bg-[rgba(155,109,255,0.1)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[#c9b3ff]">
              linked
            </span>
          ) : component.kind ? (
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">
              {component.kind}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
