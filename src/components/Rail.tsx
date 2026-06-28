// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

export type View =
  | "inicio"
  | "proyectos"
  | "editor"
  | "reporte"
  | "plantillas"
  | "portada"
  | "preview"
  | "historial"
  | "ajustes";

interface RailItem {
  view: View;
  icon: string;
  /** Tooltip completo. */
  title: string;
  /** Etiqueta corta debajo del icono. */
  label: string;
}

const TOP: RailItem[] = [
  { view: "inicio", icon: "ti-home", title: "Inicio", label: "Inicio" },
  { view: "proyectos", icon: "ti-folder", title: "Proyectos", label: "Proyectos" },
  { view: "editor", icon: "ti-bug", title: "Hallazgos", label: "Hallazgos" },
  { view: "reporte", icon: "ti-file-text", title: "Reporte", label: "Reporte" },
  { view: "plantillas", icon: "ti-template", title: "Plantillas", label: "Plantillas" },
  { view: "portada", icon: "ti-layout-cards", title: "Portada", label: "Portada" },
  { view: "preview", icon: "ti-eye", title: "Vista previa PDF", label: "Vista previa" },
  { view: "historial", icon: "ti-history", title: "Historial (git)", label: "Historial" },
];

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  /** Si el proyecto activo edita el reporte como markdown libre: "Hallazgos" pasa a "Contenido". */
  freeMarkdown?: boolean;
  dark: boolean;
  onToggleTheme: () => void;
  onCloseWorkspace: () => void;
}

/** Barra de navegacion lateral de iconos (Tabler). */
export function Rail({ view, onNavigate, freeMarkdown, dark, onToggleTheme, onCloseWorkspace }: Props) {
  return (
    <nav className="rail">
      {TOP.map((item) => {
        // El editor cambia de cara segun el tipo: hallazgos o contenido markdown.
        const editorContent = item.view === "editor" && freeMarkdown;
        const icon = editorContent ? "ti-markdown" : item.icon;
        const label = editorContent ? "Contenido" : item.label;
        const title = editorContent ? "Contenido" : item.title;
        return (
          <button
            key={item.view}
            className={`rail-btn ${view === item.view ? "active" : ""}`}
            title={title}
            onClick={() => onNavigate(item.view)}
          >
            <i className={`ti ${icon}`} />
            <span>{label}</span>
          </button>
        );
      })}
      <span className="rail-spacer" />
      <button className="rail-btn" title="Cambiar de workspace" onClick={onCloseWorkspace}>
        <i className="ti ti-layout-grid" />
        <span>Workspace</span>
      </button>
      <button
        className="rail-btn"
        title={dark ? "Modo claro" : "Modo oscuro"}
        onClick={onToggleTheme}
      >
        <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} />
        <span>Tema</span>
      </button>
      <button
        className={`rail-btn ${view === "ajustes" ? "active" : ""}`}
        title="Ajustes"
        onClick={() => onNavigate("ajustes")}
      >
        <i className="ti ti-settings" />
        <span>Ajustes</span>
      </button>
    </nav>
  );
}
