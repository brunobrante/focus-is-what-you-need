import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  IconChevronRight,
  IconFrame,
  IconGrid,
  IconMinus,
  IconSparkles,
  IconWand,
} from "@/components/icons";

/** No public site exists yet, so both CTAs are inert until one does. */
const DOWNLOAD_URL = "#";
const DOCS_URL = "#";

/**
 * SidebarPromoCard — the announcement card pinned to the bottom of the Home
 * sidebar. It is dismissable for the session only: there is no persisted flag,
 * so it returns on the next launch. Its footer carries the two low-weight links
 * (What's new, Feedback) that have no place in the nav proper.
 *
 * The caller owns the `mt-auto` that pins this to the bottom, so the slot keeps
 * its position once the card is dismissed.
 */
export function SidebarPromoCard() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="pt-6">
      <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface-2)]">
        <PromoIllustration onDismiss={() => setDismissed(true)} />

        <div className="px-3.5 pb-3.5 pt-3">
          <p className="text-[13.5px] font-semibold tracking-[-0.1px] text-[var(--text)]">
            Focus desktop app
          </p>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--text-muted)]">
            Available for macOS, with the full canvas and Builder offline.
          </p>

          <div className="mt-3 flex items-center gap-1.5">
            <a
              href={DOWNLOAD_URL}
              className="flex h-8 flex-1 items-center justify-center rounded-[9px] bg-[var(--accent)] px-2 text-[12px] font-medium text-[var(--accent-fg)] no-underline transition-colors duration-[120ms] hover:bg-white"
            >
              Download
            </a>
            <a
              href={DOCS_URL}
              className="flex h-8 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--surface-hover)] px-2.5 text-[12px] font-medium text-[var(--text-soft)] no-underline transition-colors duration-[120ms] hover:text-[var(--text)]"
            >
              Docs
              <IconChevronRight size={9} strokeWidth={2} className="opacity-60" />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-[var(--text-faint)]">
        <PromoFootLink to="/news">What&apos;s new</PromoFootLink>
        <span aria-hidden>·</span>
        <PromoFootLink to="/feedback">Feedback</PromoFootLink>
      </div>
    </div>
  );
}

function PromoFootLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="no-underline transition-colors duration-[120ms] hover:text-[var(--text-muted)]"
    >
      {children}
    </Link>
  );
}

/**
 * The card's header artwork: concentric dashed orbits behind a row of app
 * tiles, the product mark centred and its neighbours bleeding off both edges.
 * Purely decorative — drawn from tokens so it needs no image asset.
 */
function PromoIllustration({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative h-[104px] overflow-hidden bg-[radial-gradient(120%_100%_at_50%_18%,#232427_0%,var(--surface-2)_72%)]">
      {[168, 122, 78].map((size) => (
        <span
          key={size}
          aria-hidden
          className="absolute left-1/2 top-1/2 rounded-full border border-dashed border-[rgba(255,255,255,0.07)]"
          style={{
            width: size,
            height: size,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      <div className="absolute inset-0 flex items-center justify-center gap-2">
        {/* Two tiles either side, so the product mark lands on the card's axis. */}
        <OrbitTile>
          <IconGrid size={16} strokeWidth={1.7} />
        </OrbitTile>
        <OrbitTile>
          <IconFrame size={16} strokeWidth={1.7} />
        </OrbitTile>
        <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[13px] bg-[var(--text)] text-[19px] font-bold text-[var(--bg)] shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
          F
        </span>
        <OrbitTile>
          <IconWand size={16} strokeWidth={1.7} />
        </OrbitTile>
        <OrbitTile>
          <IconSparkles size={16} strokeWidth={1.7} />
        </OrbitTile>
      </div>

      {/* The tile row runs wider than the card; fade its ends instead of cutting them. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--surface-2)] to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--surface-2)] to-transparent"
      />

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md border-0 bg-transparent text-[var(--text-faint)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        <IconMinus size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}

/** A neighbouring app tile — dimmed, so the centred product mark stays dominant. */
function OrbitTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] border border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text-faint)]">
      {children}
    </span>
  );
}
