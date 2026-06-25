import { References } from "@/routes/references/References";

/**
 * Home's references library: the user's full global library with no workspace
 * context. The chrome (header + sidebar) comes from `HomeLayout`, so this route
 * renders the shared library body in `embedded` mode. The workspace-scoped view
 * lives at /workspace/:id/references and reuses the same library body with its
 * own TopBar.
 */
export function HomeReferencesPage() {
  return <References embedded />;
}

export default HomeReferencesPage;
