import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./lib/api";
import type { PdfTemplate, ProjectMeta, ProjectSummary, WorkspaceMeta } from "./lib/types";
import { familyForProject, usesFreeMarkdown } from "./lib/projectTypes";
import { Rail, type View } from "./components/Rail";
import { Welcome } from "./screens/Welcome";
import { Projects } from "./screens/Projects";
import { CoverEditor } from "./screens/CoverEditor";
import { PdfPreview } from "./screens/PdfPreview";
import { History } from "./screens/History";
import { Settings } from "./screens/Settings";
import { FindingEditor } from "./views/FindingEditor";
import { ContentEditor } from "./views/ContentEditor";
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
  const [activeProject, setActiveProject] = useState<ProjectMeta | null>(null);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplate[]>([]);
  const [templatesTick, setTemplatesTick] = useState(0);
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

  // Al arrancar mostramos el launcher (no auto-abrimos): el usuario elige un
  // workspace reciente o crea/abre uno, como la pantalla de bienvenida de un IDE.
  useEffect(() => {
    setLoading(false);
  }, []);

  function selectProject(id: string) {
    setActiveProjectId(id);
    setView("editor");
  }

  async function deleteProjectById(id: string) {
    const done = await guard(api.deleteProject(id), "Proyecto eliminado");
    if (done === undefined) return;
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setActiveProject(null);
    }
    await loadProjects();
  }

  // Meta del proyecto activo (tipo, plantilla override, osid...).
  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(null);
      return;
    }
    guard(api.loadProject(activeProjectId)).then((m) => setActiveProject(m ?? null));
  }, [guard, activeProjectId]);

  // Plantillas PDF del workspace (base + libreria del usuario). Se usan para
  // resolver la familia de render por los tags de la plantilla efectiva.
  useEffect(() => {
    if (!workspacePath) {
      setPdfTemplates([]);
      return;
    }
    guard(api.listPdfTemplates()).then((t) => setPdfTemplates(t ?? []));
  }, [guard, workspacePath, templatesTick]);

  // Familia de render efectiva del proyecto activo: la plantilla manda (un
  // override de retest o una copia retest-* se ordenan como retest).
  const activeFamily = familyForProject(activeProject, pdfTemplates);

  // Tipos de lienzo markdown libre (documento, CTI, DFIR): la pestaña de edicion
  // muestra un editor markdown unico (Contenido) en vez de la lista de hallazgos.
  const freeMarkdown = usesFreeMarkdown(activeProject);

  // Directorio absoluto del proyecto activo, para adjuntar evidencias.
  const assetBase = workspacePath && activeProjectId ? `${workspacePath}/${activeProjectId}` : null;

  if (loading) {
    return <div className="center-screen">Cargando...</div>;
  }

  if (!workspace) {
    return (
      <Welcome
        dark={dark}
        onToggleTheme={() => setDark((d) => !d)}
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
      <Rail
        view={view}
        onNavigate={setView}
        freeMarkdown={freeMarkdown}
        dark={dark}
        onToggleTheme={() => setDark((d) => !d)}
        onCloseWorkspace={() => {
          setWorkspace(null);
          setWorkspacePath(null);
          setActiveProjectId(null);
          setView("inicio");
        }}
      />
      <div className="content">
        {(view === "inicio" || view === "proyectos") && (
          <Projects
            workspace={workspace}
            projects={projects}
            welcome={view === "inicio"}
            onReload={loadProjects}
            onSelect={selectProject}
            onDelete={deleteProjectById}
          />
        )}
        {view === "editor" &&
          (freeMarkdown ? (
            <ContentEditor
              key={activeProjectId ?? "none"}
              projectId={activeProjectId}
              assetBase={assetBase}
              onGoToPreview={() => setView("preview")}
              onPickProject={() => setView("proyectos")}
            />
          ) : (
            <FindingEditor
              key={activeProjectId ?? "none"}
              projectId={activeProjectId}
              assetBase={assetBase}
              projectType={activeProject?.project_type}
              family={activeFamily}
              onGoToPreview={() => setView("preview")}
              onPickProject={() => setView("proyectos")}
            />
          ))}
        {view === "reporte" && (
          <ReportBuilder
            key={activeProjectId ?? "none"}
            workspace={workspace}
            projectId={activeProjectId}
            assetBase={assetBase}
            onWorkspaceSaved={setWorkspace}
            onProjectMetaChange={setActiveProject}
            onGoToPreview={() => setView("preview")}
            onPickProject={() => setView("proyectos")}
          />
        )}
        {view === "plantillas" && (
          <TemplateLibrary
            projectId={activeProjectId}
            project={activeProject}
            onProjectSaved={setActiveProject}
            onTemplatesChanged={() => setTemplatesTick((t) => t + 1)}
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
        {view === "historial" && (
          <History projectId={activeProjectId} onPickProject={() => setView("proyectos")} />
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
