import { Link, useNavigate } from "react-router-dom";

import { IconGrid, IconPlus } from "@/components/icons";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { WorkspaceTile } from "@/components/home/HomeCards";
import { useHome } from "@/application/home/useHome";

/**
 * WorkspacesPage (`/workspaces`) — the dedicated grid of every workspace, reached
 * from the Home sidebar. Renders inside the Home shell (`HomeLayout` supplies the
 * header + sidebar), so this is content only. Opening a card makes that workspace
 * active and jumps to its project browser (`/projects`).
 */
export function WorkspacesPage() {
  const { workspaces, setActiveWorkspaceId } = useHome();
  const navigate = useNavigate();

  const openWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    navigate("/projects");
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Workspaces</h1>
          <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
            Each workspace groups its own projects, design system, and references ·{" "}
            {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
          </p>
        </div>
        <Link to="/new-workspace" className="btn btn-primary no-underline shrink-0">
          <IconPlus size={14} strokeWidth={2} />
          New workspace
        </Link>
      </header>

      {workspaces.length === 0 ? (
        <EmptyMessage
          icon={<IconGrid size={17} strokeWidth={1.7} />}
          title="No workspaces yet"
          description="Create a workspace to group related projects together."
        />
      ) : (
        <div
          className="grid gap-x-[18px] gap-y-[18px]"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {workspaces.map((card) => (
            <WorkspaceTile
              key={card.workspace.id}
              card={card}
              onClick={() => openWorkspace(card.workspace.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkspacesPage;
