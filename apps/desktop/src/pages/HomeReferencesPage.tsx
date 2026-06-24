import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { References } from "@/routes/references/References";

/**
 * Home's references library: the user's global references with its own standalone
 * chrome and no workspace context — no workspace TopBar or switcher. The
 * workspace-scoped view lives at /workspace/:id/references and reuses the same
 * library body.
 */
export function HomeReferencesPage() {
  return <References header={<ReferencesHomeHeader />} />;
}

function ReferencesHomeHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-6">
      <Link
        to="/"
        aria-label="Home"
        title="Home"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--text-muted)] no-underline transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
      >
        <Home size={16} strokeWidth={1.8} />
      </Link>
      <span className="text-[14px] font-semibold tracking-[-0.2px] text-[var(--text)]">
        References
      </span>
    </header>
  );
}

export default HomeReferencesPage;
