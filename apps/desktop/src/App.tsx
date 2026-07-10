import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { HomeLayout } from "@/pages/HomeLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { WorkspacesPage } from "@/pages/WorkspacesPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LandingPage } from "@/pages/LandingPage";
import { NewProjectPage } from "@/pages/NewProjectPage";
import { NewWorkspacePage } from "@/pages/NewWorkspacePage";
import { NewDraftPage } from "@/pages/NewDraftPage";
import { DraftsPage } from "@/pages/DraftsPage";
import { NewsPage } from "@/pages/NewsPage";
import { FeedbackPage } from "@/pages/FeedbackPage";
import { GalleryPage } from "@/pages/GalleryPage";
import { DetailPage } from "@/pages/DetailPage";
import { CanvasPage } from "@/canvas/Canvas";
import { HomeReferencesPage } from "@/pages/HomeReferencesPage";
import { WorkspaceReferencesPage } from "@/pages/WorkspaceReferencesPage";
import { SystemDesignPage } from "@/pages/SystemDesignPage";
import { GlobalComponentsPage } from "@/pages/GlobalComponentsPage";
import { Generate } from "@/generate/Generate";
import { WorkspaceLayout } from "@/pages/WorkspaceLayout";
import { ProjectEditPage } from "@/pages/ProjectEditPage";
import { WorkspaceEditPage } from "@/pages/WorkspaceEditPage";
import { ensureLocalProjectsLoaded } from "@/lib/storage/localProjects";
import { installQuitFlush } from "@/application/persistence/flushOnQuit";
import { SaveStatusIndicator } from "@/components/persistence/SaveStatusIndicator";
import { SearchProvider } from "@/application/search/SearchProvider";

export default function App() {
  useEffect(() => {
    // Storage lives in SQLite (the `records` table). Kick off seeding/migration
    // early; `.figx` files are no longer autosaved — they are an explicit export.
    void ensureLocalProjectsLoaded();
    // Drain debounced edits + the save queue before the app exits so the last
    // edit before Cmd+Q / window close isn't lost (H2).
    installQuitFlush();
  }, []);

  return (
    <SearchProvider>
      <Routes>
      {/* Home shell: one header + sidebar + footer (HomeLayout), with each
          Home-area page rendered through its <Outlet />. */}
      <Route element={<HomeLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/my-projects" element={<ProjectsPage />} />
        <Route path="/drafts" element={<DraftsPage />} />
        <Route path="/references" element={<HomeReferencesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Route>
      <Route path="/workspace/:workspaceId" element={<WorkspaceLayout />}>
        <Route path="projects" element={<LandingPage />} />
        <Route path="components" element={<GlobalComponentsPage />} />
        <Route path="system-design" element={<SystemDesignPage />} />
        <Route path="references" element={<WorkspaceReferencesPage />} />
      </Route>
      <Route path="/workspace/:workspaceId/edit" element={<WorkspaceEditPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId" element={<GalleryPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/screens" element={<GalleryPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/components" element={<GalleryPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/references" element={<GalleryPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/system" element={<GalleryPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/system/:systemCategory" element={<GalleryPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/edit" element={<ProjectEditPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/screen/:screenId" element={<DetailPage />} />
      <Route path="/workspace/:workspaceId/project/:projectId/c/:componentId" element={<DetailPage />} />
      <Route path="/new" element={<NewProjectPage />} />
      <Route path="/new-workspace" element={<NewWorkspacePage />} />
      <Route path="/new-draft" element={<NewDraftPage />} />
      <Route path="/project/:projectId" element={<GalleryPage />} />
      <Route path="/project/:projectId/screens" element={<GalleryPage />} />
      <Route path="/project/:projectId/components" element={<GalleryPage />} />
      <Route path="/project/:projectId/references" element={<GalleryPage />} />
      <Route path="/project/:projectId/system" element={<GalleryPage />} />
      <Route path="/project/:projectId/system/:systemCategory" element={<GalleryPage />} />
      <Route path="/project/:projectId/edit" element={<ProjectEditPage />} />
      <Route path="/project/:projectId/screen/:screenId" element={<DetailPage />} />
      <Route path="/project/:projectId/c/:componentId" element={<DetailPage />} />
      <Route path="/canvas" element={<CanvasPage />} />
      <Route path="/generate" element={<Generate />} />
      <Route path="/tools" element={<Generate />} />
      </Routes>
      <SaveStatusIndicator />
    </SearchProvider>
  );
}
