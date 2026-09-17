// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { HintButton } from "./HintButton";
import { navigationItems, type View } from "../lib/navigation";

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  dark: boolean;
  onToggleTheme: () => void;
  onCloseWorkspace: () => void;
}

/** Navegacion global; las herramientas del proyecto viven en el contexto. */
export function Rail({ view, onNavigate, dark, onToggleTheme, onCloseWorkspace }: Props) {
  const projectView = navigationItems().some(
    (item) => item.view === view && item.scope === "project",
  );
  return (
    <nav className="rail" aria-label="Navegacion global">
      <div className="rail-brand" title="PuduReport" aria-label="PuduReport">
        P
      </div>
      {navigationItems()
        .filter((item) => item.scope === "workspace" && item.view !== "ajustes")
        .map((item) => (
          <HintButton
            key={item.view}
            className={`rail-btn ${view === item.view || (item.view === "proyectos" && projectView) ? "active" : ""}`}
            aria-current={view === item.view ? "page" : undefined}
            hint={item.label}
            onClick={() => onNavigate(item.view)}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            <span>{item.view === "portada" ? "Marca" : item.label}</span>
          </HintButton>
        ))}
      <span className="rail-spacer" />
      <HintButton
        className="rail-btn"
        hint="Cambiar de workspace"
        aria-label="Cambiar de workspace"
        onClick={onCloseWorkspace}
      >
        <i className="ti ti-layout-grid" aria-hidden="true" />
        <span>Workspace</span>
      </HintButton>
      <HintButton
        className="rail-btn"
        hint={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        aria-label={dark ? "Modo claro" : "Modo oscuro"}
        onClick={onToggleTheme}
      >
        <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} aria-hidden="true" />
        <span>Tema</span>
      </HintButton>
      <HintButton
        className={`rail-btn ${view === "ajustes" ? "active" : ""}`}
        aria-current={view === "ajustes" ? "page" : undefined}
        hint="Preferencias del workspace"
        onClick={() => onNavigate("ajustes")}
      >
        <i className="ti ti-settings" aria-hidden="true" />
        <span>Ajustes</span>
      </HintButton>
    </nav>
  );
}
