import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { HomePage } from "@/pages/HomePage";
import { LandingPage } from "@/pages/LandingPage";
import { NewProjectPage } from "@/pages/NewProjectPage";
import { NewDraftPage } from "@/pages/NewDraftPage";
import { DraftsPage } from "@/pages/DraftsPage";
import { GalleryPage } from "@/pages/GalleryPage";
import { DetailPage } from "@/pages/DetailPage";
import { CanvasPage } from "@/canvas/Canvas";
import { HomeReferencesPage } from "@/pages/HomeReferencesPage";
import { WorkspaceReferencesPage } from "@/pages/WorkspaceReferencesPage";
import { SystemDesignPage } from "@/pages/SystemDesignPage";
import { GlobalComponentsPage } from "@/pages/GlobalComponentsPage";
import { Generate } from "@/generate/Generate";
import { ensureLocalProjectsLoaded } from "@/lib/storage/localProjects";
import { SearchProvider } from "@/application/search/SearchProvider";

export default function App() {
  useEffect(() => {
    // Storage lives in SQLite (the `records` table). Kick off seeding/migration
    // early; `.figx` files are no longer autosaved — they are an explicit export.
    void ensureLocalProjectsLoaded();
  }, []);

  return (
    <SearchProvider>
      <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/projects" element={<LandingPage />} />
      <Route path="/new" element={<NewProjectPage />} />
      <Route path="/new-draft" element={<NewDraftPage />} />
      <Route path="/drafts" element={<DraftsPage />} />
      <Route path="/project/:projectId" element={<GalleryPage />} />
      <Route path="/project/:projectId/screen/:screenId" element={<DetailPage />} />
      <Route path="/project/:projectId/c/:componentId" element={<DetailPage />} />
      <Route path="/canvas" element={<CanvasPage />} />
      <Route path="/references" element={<HomeReferencesPage />} />
      <Route path="/workspace/:workspaceId/references" element={<WorkspaceReferencesPage />} />
      <Route path="/system-design" element={<SystemDesignPage />} />
      <Route path="/components" element={<GlobalComponentsPage />} />
      <Route path="/generate" element={<Generate />} />
      <Route path="/tools" element={<Generate />} />
      <Route path="*" element={<HomePage />} />
      </Routes>
    </SearchProvider>
  );
}
