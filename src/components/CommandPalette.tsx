// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useRef, useState } from "react";
import type { NavigationItem, View } from "../lib/navigation";
import type { ProjectSummary } from "../lib/types";
import { Modal } from "./Modal";

interface Props {
  items: NavigationItem[];
  projects: ProjectSummary[];
  projectId: string | null;
  onNavigate: (view: View) => void;
  onSelectProject: (id: string) => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function CommandPalette({
  items,
  projects,
  projectId,
  onNavigate,
  onSelectProject,
  onToggleTheme,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const commands = [
    ...items
      .filter((item) => item.scope === "workspace" || projectId)
      .map((item) => ({
        id: `view-${item.view}`,
        label: item.label,
        detail: item.scope === "project" ? "Proyecto activo" : "Workspace",
        icon: item.icon,
        run: () => onNavigate(item.view),
      })),
    ...projects.map((project) => ({
      id: `project-${project.id}`,
      label: project.name,
      detail: "Abrir proyecto",
      icon: "ti-folder",
      run: () => onSelectProject(project.id),
    })),
    {
      id: "theme",
      label: "Cambiar tema",
      detail: "Apariencia",
      icon: "ti-sun-moon",
      run: onToggleTheme,
    },
  ].filter((command) =>
    normalize(`${command.label} ${command.detail}`).includes(normalize(query.trim())),
  );
  const selected = Math.min(active, Math.max(0, commands.length - 1));

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);

  function execute(index: number) {
    const command = commands[index];
    if (!command) return;
    onClose();
    command.run();
  }

  return (
    <Modal title="Comandos y proyectos" onClose={onClose} className="command-palette">
      <input
        className="input"
        autoFocus
        role="combobox"
        aria-label="Buscar comandos y proyectos"
        aria-expanded="true"
        aria-controls="command-results"
        aria-autocomplete="list"
        aria-activedescendant={commands[selected] ? `command-${commands[selected].id}` : undefined}
        placeholder="Buscar una vista, un proyecto o una accion..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (commands.length)
              setActive(
                (selected + (event.key === "ArrowDown" ? 1 : -1) + commands.length) %
                  commands.length,
              );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            execute(selected);
          }
        }}
      />
      <div
        className="command-results"
        id="command-results"
        role="listbox"
        aria-label="Resultados"
        ref={list}
      >
        {commands.map((command, index) => (
          <div
            key={command.id}
            id={`command-${command.id}`}
            role="option"
            aria-selected={selected === index}
            className="command-option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => execute(index)}
          >
            <i className={`ti ${command.icon}`} aria-hidden="true" />
            <span>
              {command.label}
              <small>{command.detail}</small>
            </span>
            {selected === index && <i className="ti ti-corner-down-left" aria-hidden="true" />}
          </div>
        ))}
      </div>
      {commands.length === 0 && (
        <p className="empty" role="status">
          Sin resultados. Prueba con otro nombre.
        </p>
      )}
      <div className="command-help">
        <span>Flechas para navegar</span>
        <span>Enter para abrir</span>
        <span>Esc para cerrar</span>
      </div>
    </Modal>
  );
}
