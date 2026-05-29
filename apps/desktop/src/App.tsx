import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { Landing } from "@/routes/Landing";
import { NewProject } from "@/routes/NewProject";
import { Gallery } from "@/routes/Gallery";
import { Components as ComponentsRoute } from "@/routes/Components";
import { ComponentDetail } from "@/routes/ComponentDetail";
import { CanvasPage } from "@/canvas/Canvas";
import { References } from "@/routes/References";
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
      <Route path="/" element={<Landing />} />
      <Route path="/new" element={<NewProject />} />
      <Route path="/project/:projectId" element={<Gallery />} />
      <Route path="/project/:projectId/screen/:screenId" element={<ComponentsRoute />} />
      <Route path="/project/:projectId/c/:componentId" element={<ComponentDetail />} />
      <Route path="/canvas" element={<CanvasPage />} />
      <Route path="/references" element={<References />} />
      <Route path="/generate" element={<Generate />} />
      <Route path="/tools" element={<Generate />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
