import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./lib/api";
import type { ProjectSummary, WorkspaceMeta } from "./lib/types";
import { Rail, type View } from "./components/Rail";
import { Onboarding } from "./screens/Onboarding";
import { Projects } from "./screens/Projects";
import { CoverEditor } from "./screens/CoverEditor";
import { PdfPreview } from "./screens/PdfPreview";
import { Settings } from "./screens/Settings";
import { FindingEditor } from "./views/FindingEditor";
import { ReportBuilder } from "./views/ReportBuilder";
import { TemplateLibrary } from "./views/TemplateLibrary";
import { ToastProvider, useToast } from "./components/Toast";

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const { guard } = useToast();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceMeta | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [view, setView] = useState<View>("inicio");
  const [dark, setDark] = useState<boolean>(() => {
    const saved = window.localStorage.getItem("pudu-theme");
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("pudu-theme", dark ? "dark" : "light");
  }, [dark]);

  // Titulo de la ventana nativa con el nombre del workspace.
  useEffect(() => {
    try {
      const title = workspace ? `PuduReport — ${workspace.name}` : "PuduReport";
      getCurrentWindow()
        .setTitle(title)
        .catch(() => {});
    } catch {
      // Fuera de Tauri (preview en navegador): ignorar.
    }
  }, [workspace]);

  const loadProjects = useCallback(async () => {
    const list = await guard(api.listProjects());
    if (list) {
      setProjects(list);
      setActiveProjectId((prev) => prev ?? (list.length > 0 ? list[0].id : null));
    }
  }, [guard]);

  const openAt = useCallback(
    async (path: string) => {
      const meta = await guard(api.openWorkspace(path));
      if (meta) {
        setWorkspace(meta);
        setWorkspacePath(path);
        await loadProjects();
        setView("inicio");
      }
    },
    [guard, loadProjects],
  );

  useEffect(() => {
    (async () => {
      const stored = await guard(api.getStoredWorkspace());
      if (stored) await openAt(stored);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectProject(id: string) {
    setActiveProjectId(id);
    setView("editor");
  }

  // Directorio absoluto del proyecto activo, para adjuntar evidencias.
  const assetBase = workspacePath && activeProjectId ? `${workspacePath}/${activeProjectId}` : null;

  if (loading) {
    return <div className="center-screen">Cargando...</div>;
  }

  if (!workspace) {
    return (
      <Onboarding
        onOpened={(meta, path) => {
          setWorkspace(meta);
          setWorkspacePath(path);
          loadProjects();
          setView("inicio");
        }}
      />
    );
  }

  return (
    <div className="shell">
      <Rail view={view} onNavigate={setView} dark={dark} onToggleTheme={() => setDark((d) => !d)} />
      <div className="content">
        {(view === "inicio" || view === "proyectos") && (
          <Projects
            workspace={workspace}
            projects={projects}
            welcome={view === "inicio"}
            onReload={loadProjects}
            onSelect={selectProject}
          />
        )}
        {view === "editor" && (
          <FindingEditor
            key={activeProjectId ?? "none"}
            projectId={activeProjectId}
            assetBase={assetBase}
            examProfile={workspace.exam_profile}
            onGoToPreview={() => setView("preview")}
            onPickProject={() => setView("proyectos")}
          />
        )}
        {view === "reporte" && (
          <ReportBuilder
            key={activeProjectId ?? "none"}
            workspace={workspace}
            projectId={activeProjectId}
            assetBase={assetBase}
            onWorkspaceSaved={setWorkspace}
            onGoToPreview={() => setView("preview")}
            onPickProject={() => setView("proyectos")}
          />
        )}
        {view === "plantillas" && (
          <TemplateLibrary
            projectId={activeProjectId}
            workspace={workspace}
            onWorkspaceSaved={setWorkspace}
          />
        )}
        {view === "portada" && (
          <CoverEditor
            workspace={workspace}
            workspacePath={workspacePath}
            onWorkspaceSaved={setWorkspace}
          />
        )}
        {view === "preview" && (
          <PdfPreview projectId={activeProjectId} onPickProject={() => setView("proyectos")} />
        )}
        {view === "ajustes" && (
          <Settings
            workspace={workspace}
            workspacePath={workspacePath}
            dark={dark}
            onSetDark={setDark}
            onWorkspaceSaved={setWorkspace}
          />
        )}
      </div>
    </div>
  );
}
