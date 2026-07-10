import { Link, useLocation } from "react-router-dom";

import { IconBackArrow } from "@/components/icons";

/**
 * NotFoundPage (`*`) — the Home shell's catch-all. Any route that matches no
 * other page lands here rather than silently rendering the Dashboard, so a typo
 * or a stale link is visible instead of looking like a working destination.
 */
export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <div className="grid min-h-[320px] place-items-center rounded-[14px] border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
        <div className="max-w-[280px]">
          <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-[var(--text-faint)]">
            404
          </p>
          <h1 className="m-0 mb-3 text-[16px] font-semibold text-[var(--text)]">Page not found</h1>
          <p className="m-0 text-[13px] leading-[1.6] text-[var(--text-muted)]">
            Nothing lives at{" "}
            <span className="break-all text-[var(--text-soft)]">{pathname}</span>. It may have been
            moved, or the link is out of date.
          </p>

          <Link
            to="/"
            className="mx-auto mt-6 inline-flex h-9 items-center gap-2 rounded-[10px] border border-dashed border-[var(--border-strong)] px-3.5 text-[12px] font-medium text-[var(--text-muted)] no-underline transition-colors duration-[120ms] hover:border-[var(--text)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <IconBackArrow size={13} strokeWidth={1.8} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
