// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useRef, useState, type ReactNode } from "react";
import { navigationItems, type View } from "../lib/navigation";
import type { ProjectSummary } from "../lib/types";
import { typeInfo } from "../lib/projectTypes";
import { HintButton } from "./HintButton";
import { Rail } from "./Rail";
import { CommandPalette } from "./CommandPalette";

interface Props {
  workspaceName: string;
  workspacePath: string | null;
  projects: ProjectSummary[];
  projectId: string | null;
  openProjectIds: string[];
  onCloseProject: (id: string) => void;
  projectName?: string;
  view: View;
  freeMarkdown: boolean;
  dark: boolean;
  onNavigate: (view: View) => void;
  onSelectProject: (id: string) => void;
  onToggleTheme: () => void;
  onCloseWorkspace: () => void;
  children: ReactNode;
}

export function AppShell({
  workspaceName,
  workspacePath,
  projects,
  projectId,
  openProjectIds,
  onCloseProject,
  projectName,
  view,
  freeMarkdown,
  dark,
  onNavigate,
  onSelectProject,
  onToggleTheme,
  onCloseWorkspace,
  children,
}: Props) {
  const [contextOpen, setContextOpen] = useState(true);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const previousTabs = useRef(openProjectIds);
  useEffect(() => {
    if (
      openProjectIds.length < previousTabs.current.length &&
      document.activeElement === document.body
    ) {
      document
        .querySelector<HTMLButtonElement>(
          ".project-tab.selected .project-tab-select, .project-tab-select",
        )
        ?.focus();
      if (!openProjectIds.length) document.getElementById("projects-tab")?.focus();
    }
    previousTabs.current = openProjectIds;
  }, [openProjectIds]);
  const items = navigationItems(freeMarkdown);
  const current = items.find((item) => item.view === view);
  const hasProjectContext = !!projectId && (current?.scope === "project" || view === "plantillas");
  const showContext = contextOpen && hasProjectContext;
  const activeName = projectName ?? projects.find((project) => project.id === projectId)?.name;
  const projectInfo = typeInfo(projects.find((project) => project.id === projectId)?.project_type);
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing
      )
        return;
      // No atravesar confirmaciones, calculadoras ni otros overlays existentes.
      if (document.querySelector("dialog[open], .popover-backdrop, .cvss-backdrop")) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandsOpen(true);
      }
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable || !!target.closest("input, textarea, select"));
      // Cmd/Ctrl+B conserva su significado de negrita dentro de los editores.
      if (event.key.toLowerCase() === "b" && !editing) {
        event.preventDefault();
        setContextOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <div className="shell">
      <a className="skip-link" href="#workspace-content">
        Ir al contenido
      </a>
      <Rail
        view={view}
        onNavigate={onNavigate}
        dark={dark}
        onToggleTheme={onToggleTheme}
        onCloseWorkspace={onCloseWorkspace}
      />
      <div className="workspace-shell">
        <header className="workspace-bar">
          {hasProjectContext && (
            <HintButton
              className="icon-btn"
              hint="Mostrar u ocultar navegacion"
              shortcut={`${modifier} B`}
              side="bottom"
              aria-label="Mostrar u ocultar navegacion del proyecto"
              aria-expanded={contextOpen}
              aria-controls="project-navigation"
              onClick={() => setContextOpen((open) => !open)}
            >
              <i className="ti ti-layout-sidebar" aria-hidden="true" />
            </HintButton>
          )}
          <span className="workspace-name" title={workspacePath ?? workspaceName}>
            {workspaceName}
          </span>
          <span className="breadcrumb-divider" aria-hidden="true">
            /
          </span>
          <span className="workspace-location">
            {current?.scope === "project" ? (activeName ?? "Proyecto") : current?.label}
          </span>
          <button
            className="command-trigger"
            onClick={() => setCommandsOpen(true)}
            title={`Buscar comandos y proyectos (${modifier}+K)`}
          >
            <i className="ti ti-search" aria-hidden="true" />
            <span>Buscar o ir a...</span>
            <kbd>{modifier} K</kbd>
          </button>
        </header>
        <nav className="project-tabs" aria-label="Proyectos abiertos">
          <div className={`project-tab ${view === "proyectos" ? "selected" : ""}`}>
            <button
              id="projects-tab"
              className="project-tab-select"
              aria-current={view === "proyectos" ? "page" : undefined}
              onClick={() => onNavigate("proyectos")}
            >
              <i className="ti ti-layout-grid" aria-hidden="true" />
              <span>Proyectos</span>
            </button>
          </div>
          {openProjectIds.map((id) => {
            const project = projects.find((item) => item.id === id);
            if (!project) return null;
            const selected = id === projectId && current?.scope === "project";
            const name = id === projectId ? (projectName ?? project.name) : project.name;
            return (
              <div className={`project-tab ${selected ? "selected" : ""}`} key={id}>
                <button
                  className="project-tab-select"
                  aria-current={selected ? "page" : undefined}
                  title={`${name} · ${project.client || typeInfo(project.project_type).label}`}
                  onClick={() => onSelectProject(id)}
                  ref={(element) => {
                    if (selected) element?.scrollIntoView({ block: "nearest", inline: "nearest" });
                  }}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const buttons = Array.from(
                      event.currentTarget
                        .closest("nav")!
                        .querySelectorAll<HTMLButtonElement>(".project-tab-select"),
                    );
                    const index = buttons.indexOf(event.currentTarget);
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? buttons.length - 1
                          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                            buttons.length;
                    buttons[next]?.focus();
                  }}
                >
                  <i className={`ti ${typeInfo(project.project_type).icon}`} aria-hidden="true" />
                  <span>{name}</span>
                </button>
                <HintButton
                  className="project-tab-close"
                  hint={`Cerrar pestaña: ${name}`}
                  side="bottom"
                  aria-label={`Cerrar pestaña: ${name}`}
                  onClick={() => onCloseProject(id)}
                >
                  <i className="ti ti-x" aria-hidden="true" />
                </HintButton>
              </div>
            );
          })}
          <HintButton
            className="project-tabs-add"
            hint="Abrir otro proyecto"
            side="bottom"
            aria-label="Abrir otro proyecto"
            onClick={() => onNavigate("proyectos")}
          >
            <i className="ti ti-plus" aria-hidden="true" />
          </HintButton>
        </nav>
        <div className="workspace-body">
          <div className={`context-slot ${showContext ? "is-open" : ""}`}>
            <aside
              className="project-navigation"
              id="project-navigation"
              aria-label="Contexto del proyecto"
              aria-hidden={!showContext}
              ref={(element) => {
                element?.toggleAttribute("inert", !showContext);
              }}
            >
              <div className="project-identity">
                <span className="project-emblem">
                  <i className={`ti ${projectInfo.icon}`} aria-hidden="true" />
                </span>
                <div>
                  <strong>{activeName ?? "Tu workspace"}</strong>
                  <span>{projectId ? projectInfo.label : "Sin proyecto activo"}</span>
                </div>
              </div>
              <nav className="context-links" aria-label="Herramientas del proyecto">
                {items
                  .filter((item) => item.scope === "project")
                  .map((item) => (
                    <button
                      key={item.view}
                      className={`context-link ${view === item.view ? "active" : ""}`}
                      disabled={!projectId}
                      aria-current={view === item.view ? "page" : undefined}
                      onClick={() => onNavigate(item.view)}
                      title={item.label}
                    >
                      <i className={`ti ${item.icon}`} aria-hidden="true" />
                      {item.label}
                    </button>
                  ))}
              </nav>
              <button className="context-link" onClick={() => onNavigate("proyectos")}>
                <i className="ti ti-folders" aria-hidden="true" />
                Volver a proyectos
              </button>
              <div className="context-footer" title={workspacePath ?? undefined}>
                <i className="ti ti-device-desktop" aria-hidden="true" />
                Workspace local
                <span>{workspaceName}</span>
              </div>
            </aside>
          </div>
          <main
            className="content"
            id="workspace-content"
            tabIndex={-1}
            aria-label={current?.label}
          >
            {children}
          </main>
        </div>
      </div>
      {commandsOpen && (
        <CommandPalette
          items={items}
          projects={projects}
          projectId={projectId}
          onNavigate={onNavigate}
          onSelectProject={onSelectProject}
          onToggleTheme={onToggleTheme}
          onClose={() => setCommandsOpen(false)}
        />
      )}
    </div>
  );
}
