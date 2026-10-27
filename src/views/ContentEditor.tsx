// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useId, useRef, useState } from "react";
import * as api from "../lib/api";
import { scheduleWrite } from "../lib/pendingWrites";
import type { ProjectMeta } from "../lib/types";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useToast } from "../components/Toast";

interface Props {
  projectId: string | null;
  /** Directorio absoluto del proyecto, para pegar/soltar evidencias. */
  assetBase?: string | null;
  onGoToPreview: () => void;
  onPickProject: () => void;
}

/** Clave de la unica seccion que usan los tipos de lienzo markdown libre. */
const CONTENT_KEY = "contenido";

/**
 * Editor de reporte como un unico lienzo markdown. Lo usan los tipos sin
 * hallazgos (documento libre, CTI, respuesta a incidentes): todo el cuerpo es
 * una sola seccion "contenido" que se construye en markdown y se guarda sola.
 */
export function ContentEditor({
  projectId,
  assetBase,
  onGoToPreview,
  onPickProject,
}: Readonly<Props>) {
  const headingId = useId();
  const { guard } = useToast();
  const [content, setContent] = useState<string | null>(null);
  const projectRef = useRef<ProjectMeta | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void guard(api.loadProject(projectId)).then((p) => {
      if (!p || cancelled) return;
      projectRef.current = p;
      const sec = p.sections.find((s) => s.key === CONTENT_KEY);
      setContent(sec?.body ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [guard, projectId]);

  const persist = useCallback(
    (md: string) => {
      if (!projectId || !projectRef.current) return;
      scheduleWrite(
        `project:${projectId}`,
        async () => {
          const base = projectRef.current;
          if (!base) throw new Error("El proyecto ya no esta disponible");
          const has = base.sections.some((s) => s.key === CONTENT_KEY);
          const sections = has
            ? base.sections.map((s) => (s.key === CONTENT_KEY ? { ...s, body: md } : s))
            : [...base.sections, { key: CONTENT_KEY, title: "", body: md, enabled: true }];
          const next: ProjectMeta = { ...base, sections };
          projectRef.current = await api.saveProject(projectId, next);
        },
        600,
        (error) => {
          void guard(Promise.reject(error));
        },
      );
    },
    [guard, projectId],
  );

  function handleChange(md: string) {
    setContent(md);
    persist(md);
  }

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para editar su contenido.
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn primary" onClick={onPickProject}>
              <i className="ti ti-folder" aria-hidden="true" /> <span>Ir a proyectos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="screen-head">
        <div>
          <h1 id={headingId}>Contenido</h1>
          <p className="sub">Construi el reporte en markdown. Se guarda solo.</p>
        </div>
        <button className="btn primary" onClick={onGoToPreview}>
          <i className="ti ti-eye" aria-hidden="true" /> <span>Vista previa</span>
        </button>
      </div>
      <div className="view" style={{ paddingTop: 12 }}>
        {content !== null && (
          <MarkdownEditor
            key={projectId}
            labelledBy={headingId}
            value={content}
            onChange={handleChange}
            placeholder="Escribi el reporte en markdown. Usa encabezados (##) para las secciones."
            assetBase={assetBase}
            projectId={projectId}
          />
        )}
      </div>
    </>
  );
}
