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

export interface NavigationItem {
  view: View;
  label: string;
  icon: string;
  scope: "workspace" | "project";
}

/** Un solo catalogo para sidebar, contexto y paleta de comandos. */
export function navigationItems(freeMarkdown = false): NavigationItem[] {
  return [
    { view: "inicio", label: "Inicio", icon: "ti-home", scope: "workspace" },
    { view: "proyectos", label: "Proyectos", icon: "ti-folder", scope: "workspace" },
    {
      view: "editor",
      label: freeMarkdown ? "Contenido" : "Hallazgos",
      icon: freeMarkdown ? "ti-markdown" : "ti-bug",
      scope: "project",
    },
    { view: "reporte", label: "Reporte", icon: "ti-file-text", scope: "project" },
    { view: "preview", label: "Vista previa", icon: "ti-eye", scope: "project" },
    { view: "historial", label: "Historial", icon: "ti-history", scope: "project" },
    { view: "plantillas", label: "Plantillas", icon: "ti-template", scope: "workspace" },
    { view: "portada", label: "Portada y marca", icon: "ti-layout-cards", scope: "workspace" },
    { view: "ajustes", label: "Ajustes", icon: "ti-settings", scope: "workspace" },
  ];
}
