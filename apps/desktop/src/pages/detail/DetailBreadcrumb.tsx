import { Fragment } from "react";
import { Link } from "react-router-dom";
import { IconChevronLeft } from "@/components/icons";
import type { ProjectType } from "@/lib/data/types";

export type Crumb = { label: string; href: string };

/**
 * The single detail-page breadcrumb shared by the screen and component views.
 *
 * Both subjects render the same shape: a back chevron pointing at the immediate
 * parent, a trail of linked ancestors (`Projects / Project / Screen / …`), the
 * current node name in bold, and the project-type badge. The only per-subject
 * data is `backHref`, the `trail`, and the `current` label — everything else
 * (markup, spacing, classes) lives here once so the two can never drift apart.
 */
export function DetailBreadcrumb({
  backHref,
  trail,
  current,
  type,
}: {
  backHref: string;
  trail: Crumb[];
  current: string;
  type: ProjectType;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
      <Link to={backHref} className="text-[var(--text-muted)] hover:text-[var(--text)]">
        <IconChevronLeft size={14} strokeWidth={1.6} />
      </Link>
      {trail.map((c, i) => (
        <Fragment key={`${i}-${c.href}`}>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to={c.href} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            {c.label}
          </Link>
        </Fragment>
      ))}
      <span className="text-[var(--text-faint)]">/</span>
      <span className="text-[13px] font-medium text-[var(--text)]">{current}</span>
      <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
        {type}
      </span>
    </div>
  );
}
