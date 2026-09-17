// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./lib/api";
import type { PdfTemplate, ProjectMeta, ProjectSummary, WorkspaceMeta } from "./lib/types";
import { familyForProject, usesFreeMarkdown } from "./lib/projectTypes";
import type { View } from "./lib/navigation";
import { flushWrites } from "./lib/pendingWrites";
import { AppShell } from "./components/AppShell";
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
  const workspaceGeneration = useRef(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectMeta | null>(null);
  const [projectLoad, setProjectLoad] = useState<"loading" | "ready" | "error">("ready");
  const [projectLoadTick, setProjectLoadTick] = useState(0);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplate[]>([]);
  const [templatesTick, setTemplatesTick] = useState(0);
  const [view, setView] = useState<View>("inicio");
  const [openProjectIds, setOpenProjectIds] = useState<string[]>([]);
  const projectViews = useRef(new Map<string, View>());
  const navigating = useRef(false);

  async function afterSaving(action: () => void) {
    if (navigating.current) return;
    navigating.current = true;
    try {
      const saved = await guard(flushWrites().then(() => true));
      if (saved) action();
    } finally {
      navigating.current = false;
    }
  }

  function navigate(next: View) {
    void afterSaving(() => {
      if (activeProjectId && ["editor", "reporte", "preview", "historial"].includes(next)) {
        projectViews.current.set(activeProjectId, next);
        setOpenProjectIds((ids) =>
          ids.includes(activeProjectId) ? ids : [...ids, activeProjectId],
        );
      }
      setView(next);
    });
  }
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
    const generation = workspaceGeneration.current;
    const list = await guard(api.listProjects());
    if (generation !== workspaceGeneration.current) return;
    if (list) {
      setProjects(list);
      setActiveProjectId((prev) => (list.some((project) => project.id === prev) ? prev : null));
      setOpenProjectIds((ids) => ids.filter((id) => list.some((project) => project.id === id)));
    }
    // Tambien refresca el workspace (ej. project_order del tablero Kanban,
    // que cambia con cada arrastre y no se refleja solo con listProjects).
    const ws = await guard(api.getWorkspaceMeta());
    if (generation !== workspaceGeneration.current) return;
    if (ws) setWorkspace(ws);
  }, [guard]);

  // Al arrancar mostramos el launcher (no auto-abrimos): el usuario elige un
  // workspace reciente o crea/abre uno, como la pantalla de bienvenida de un IDE.
  useEffect(() => {
    setLoading(false);
  }, []);

  function selectProject(id: string) {
    void afterSaving(() => activateProject(id));
  }

  function activateProject(id: string) {
    if (id !== activeProjectId) {
      setActiveProject(null);
      setProjectLoad("loading");
    }
    setActiveProjectId(id);
    setOpenProjectIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setView(projectViews.current.get(id) ?? "editor");
  }

  function closeProjectTab(id: string) {
    void afterSaving(() => {
      const remaining = openProjectIds.filter((item) => item !== id);
      setOpenProjectIds(remaining);
      projectViews.current.delete(id);
      if (id === activeProjectId) {
        const next = remaining[Math.min(openProjectIds.indexOf(id), remaining.length - 1)];
        if (next) activateProject(next);
        else {
          setActiveProjectId(null);
          setActiveProject(null);
          setView("proyectos");
        }
      }
    });
  }

  function updateProjectMeta(meta: ProjectMeta) {
    setActiveProject(meta);
    setProjects((items) =>
      items.map((item) => (item.id === activeProjectId ? { ...item, ...meta } : item)),
    );
  }

  async function deleteProjectById(id: string) {
    const done = await guard(api.deleteProject(id), "Proyecto eliminado");
    if (done === undefined) return;
    setOpenProjectIds((ids) => ids.filter((item) => item !== id));
    projectViews.current.delete(id);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setActiveProject(null);
    }
    await loadProjects();
  }

  // Meta del proyecto activo (tipo, plantilla override, osid...).
  useEffect(() => {
    let cancelled = false;
    if (!activeProjectId) {
      setActiveProject(null);
      setProjectLoad("ready");
      return;
    }
    setActiveProject(null);
    setProjectLoad("loading");
    guard(api.loadProject(activeProjectId)).then((m) => {
      if (cancelled) return;
      setActiveProject(m ?? null);
      setProjectLoad(m ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [guard, activeProjectId, projectLoadTick]);

  // Plantillas PDF del workspace (base + libreria del usuario). Se usan para
  // resolver la familia de render por los tags de la plantilla efectiva.
  useEffect(() => {
    let cancelled = false;
    if (!workspacePath) {
      setPdfTemplates([]);
      return;
    }
    guard(api.listPdfTemplates()).then((t) => {
      if (!cancelled) setPdfTemplates(t ?? []);
    });
    return () => {
      cancelled = true;
    };
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
          workspaceGeneration.current += 1;
          setWorkspace(meta);
          setWorkspacePath(path);
          loadProjects();
          setView("inicio");
        }}
      />
    );
  }

  return (
    <AppShell
      workspaceName={workspace.name}
      workspacePath={workspacePath}
      projects={projects}
      projectId={activeProjectId}
      projectName={activeProject?.name}
      onSelectProject={selectProject}
      openProjectIds={openProjectIds}
      onCloseProject={closeProjectTab}
      view={view}
      onNavigate={navigate}
      freeMarkdown={freeMarkdown}
      dark={dark}
      onToggleTheme={() => setDark((d) => !d)}
      onCloseWorkspace={() => {
        void afterSaving(() => {
          workspaceGeneration.current += 1;
          setWorkspace(null);
          setWorkspacePath(null);
          setActiveProjectId(null);
          setActiveProject(null);
          setProjects([]);
          setOpenProjectIds([]);
          projectViews.current.clear();
          setView("inicio");
        });
      }}
    >
      {activeProjectId &&
      projectLoad !== "ready" &&
      ["editor", "reporte", "preview", "historial", "plantillas"].includes(view) ? (
        <div className="shell-state" role={projectLoad === "error" ? "alert" : "status"}>
          <i
            className={`ti ${projectLoad === "error" ? "ti-alert-circle" : "ti-hourglass"}`}
            aria-hidden="true"
          />
          <h2>{projectLoad === "error" ? "No se pudo abrir el proyecto" : "Abriendo proyecto"}</h2>
          <p>
            {projectLoad === "error"
              ? "Revisa que la carpeta del proyecto siga disponible."
              : "Cargando datos del workspace local..."}
          </p>
          {projectLoad === "error" && (
            <div className="row">
              <button
                className="btn primary"
                onClick={() => setProjectLoadTick((tick) => tick + 1)}
              >
                Reintentar
              </button>
              <button className="btn" onClick={() => navigate("proyectos")}>
                Ir a proyectos
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {(view === "inicio" || view === "proyectos") && (
            <Projects
              workspace={workspace}
              projects={projects}
              welcome={view === "inicio"}
              onOpenBoard={() => navigate("proyectos")}
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
                onGoToPreview={() => navigate("preview")}
                onPickProject={() => navigate("proyectos")}
              />
            ) : (
              <FindingEditor
                key={activeProjectId ?? "none"}
                projectId={activeProjectId}
                assetBase={assetBase}
                projectType={activeProject?.project_type}
                family={activeFamily}
                onGoToPreview={() => navigate("preview")}
                onPickProject={() => navigate("proyectos")}
              />
            ))}
          {view === "reporte" && (
            <ReportBuilder
              key={activeProjectId ?? "none"}
              workspace={workspace}
              projectId={activeProjectId}
              assetBase={assetBase}
              onWorkspaceSaved={setWorkspace}
              onProjectMetaChange={updateProjectMeta}
              onGoToPreview={() => navigate("preview")}
              onPickProject={() => navigate("proyectos")}
            />
          )}
          {view === "plantillas" && (
            <TemplateLibrary
              projectId={activeProjectId}
              project={activeProject}
              onProjectSaved={updateProjectMeta}
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
            <PdfPreview projectId={activeProjectId} onPickProject={() => navigate("proyectos")} />
          )}
          {view === "historial" && (
            <History
              projectId={activeProjectId}
              projectName={activeProject?.name}
              workspacePath={workspacePath}
              onPickProject={() => navigate("proyectos")}
            />
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
        </>
      )}
    </AppShell>
  );
}
