import { useNavigate } from "react-router-dom";
import { AppSettingsContent } from "@/components/modals/AppSettingsModal";

/**
 * SettingsPage (`/settings`) — the standalone Settings surface inside the Home
 * shell (header + sidebar from `HomeLayout`). It reuses the exact same
 * `AppSettingsContent` body as the global Settings modal, so the two never drift.
 * Cancel and a successful save return to the Dashboard.
 */
export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-[22px] pt-9 pb-5">
        <h1 className="m-0 mb-1 text-2xl font-semibold tracking-[-0.3px]">Settings</h1>
        <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
          Manage canvas behavior, keyboard shortcuts, and project save location.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <AppSettingsContent onDone={() => navigate("/")} />
      </div>
    </div>
  );
}

export default SettingsPage;
