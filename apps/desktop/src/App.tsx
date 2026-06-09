import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { LandingPage } from "@/pages/LandingPage";
import { NewProjectPage } from "@/pages/NewProjectPage";
import { GalleryPage } from "@/pages/GalleryPage";
import { DetailPage } from "@/pages/DetailPage";
import { CanvasPage } from "@/canvas/Canvas";
import { References } from "@/routes/References";
import { SystemDesignPage } from "@/pages/SystemDesignPage";
import { GlobalComponentsPage } from "@/pages/GlobalComponentsPage";
import { Generate } from "@/generate/Generate";
import { ensureLocalProjectsLoaded, startLocalFigxAutosave } from "@/lib/storage/localProjects";

export default function App() {
  useEffect(() => {
    let cancelled = false;
    let stopAutosave: (() => void) | null = null;
    void ensureLocalProjectsLoaded().then(() => {
      if (cancelled) return;
      stopAutosave = startLocalFigxAutosave();
    });
    return () => {
      cancelled = true;
      stopAutosave?.();
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/new" element={<NewProjectPage />} />
      <Route path="/project/:projectId" element={<GalleryPage />} />
      <Route path="/project/:projectId/screen/:screenId" element={<DetailPage />} />
      <Route path="/project/:projectId/c/:componentId" element={<DetailPage />} />
      <Route path="/canvas" element={<CanvasPage />} />
      <Route path="/references" element={<References />} />
      <Route path="/system-design" element={<SystemDesignPage />} />
      <Route path="/components" element={<GlobalComponentsPage />} />
      <Route path="/generate" element={<Generate />} />
      <Route path="/tools" element={<Generate />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
