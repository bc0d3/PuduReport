// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import * as api from "../lib/api";
import { scheduleWrite } from "../lib/pendingWrites";
import { createEditorRows } from "../lib/editorRows";
import { selectionAfterMove } from "../lib/reportLayout";
import type {
  AccionRemediacion,
  Ambiente,
  BlockKind,
  CausaRaiz,
  Exposicion,
  Finding,
  PrioridadRemediacion,
  ProjectMeta,
  ReportBlock,
  Severity,
} from "../lib/types";
import {
  PRIORIDAD_OPTIONS,
  TEXTO_CORTO_MAX,
  TEXTO_LARGO_MAX,
  findingNumbers,
  newRemediationAction,
  newRootCause,
  singleParagraph,
  toggleFindingId,
} from "../lib/executive";
import { SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_COLOR } from "../lib/severity";
import {
  PROJECT_TYPES,
  typeInfo,
  usesBlockRenderer,
  usesCustomTemplate,
} from "../lib/projectTypes";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { LivePreview } from "../components/LivePreview";
import { useToast } from "../components/Toast";

// Boilerplate generico por seccion (espeja el backend) para reinsertar.
const BOILERPLATE: Record<string, string> = {
  resumen:
    "Durante el periodo evaluado se realizo una prueba de penetracion sobre los activos definidos en el alcance. Se identificaron varios hallazgos de distinta severidad; los de mayor criticidad deben atenderse de forma prioritaria.",
  alcance:
    "La evaluacion se limito a los activos listados en la portada. Cualquier sistema no incluido quedo fuera de alcance. No se realizaron ataques de denegacion de servicio ni acciones destructivas.",
  metodologia:
    "La evaluacion siguio un enfoque de caja gris alineado con OWASP WSTG y PTES: reconocimiento, enumeracion, identificacion de vulnerabilidades, explotacion controlada y reporte. Cada hallazgo se clasifico con CVSS.",
  conclusiones:
    "El nivel de seguridad general se considera mejorable. Se recomienda priorizar la remediacion de los hallazgos criticos y altos y reverificar tras aplicar las correcciones.",
};

// Opciones de clasificacion del proyecto (metadata para integraciones). El valor
// guardado es el slug; el backend descarta cualquier otro.
const AMBIENTE_OPTIONS: { value: Ambiente; label: string }[] = [
  { value: "", label: "Sin especificar" },
  { value: "qa", label: "QA" },
  { value: "produccion", label: "Produccion" },
];
const EXPOSICION_OPTIONS: { value: Exposicion; label: string }[] = [
  { value: "", label: "Sin especificar" },
  { value: "internet", label: "Internet" },
  { value: "interno", label: "Red interna" },
];

// Etiqueta, icono y descripcion (para los bloques automaticos) por kind.
const BLOCK_META: Record<BlockKind, { label: string; icon: string; desc: string }> = {
  cover: {
    label: "Portada",
    icon: "ti-photo",
    desc: "Portada del reporte. Se edita en la pantalla Portada y marca.",
  },
  toc: {
    label: "Indice de contenidos",
    icon: "ti-list",
    desc: "Indice con numeros de pagina. Se genera automaticamente.",
  },
  info: {
    label: "Informacion del proyecto",
    icon: "ti-info-circle",
    desc: "Cliente, periodo, equipo y alcance. Se arma desde Datos del proyecto.",
  },
  severity: {
    label: "Resumen de severidades",
    icon: "ti-chart-bar",
    desc: "Tabla de conteos por severidad. Se calcula desde los hallazgos.",
  },
  findings_index: {
    label: "Indice de hallazgos",
    icon: "ti-list-numbers",
    desc: "Tabla resumen de los hallazgos. Se genera automaticamente.",
  },
  findings: {
    label: "Hallazgos",
    icon: "ti-bug",
    desc: "Detalle de cada hallazgo. Se edita en la pantalla Hallazgos.",
  },
  section: { label: "Seccion", icon: "ti-file-text", desc: "" },
  text: { label: "Texto libre", icon: "ti-text-caption", desc: "" },
  pagebreak: {
    label: "Salto de pagina",
    icon: "ti-page-break",
    desc: "Fuerza el inicio de una pagina nueva en el PDF.",
  },
  root_causes: {
    label: "Causas raiz",
    icon: "ti-hierarchy",
    desc: "Causas raiz con su descripcion y los hallazgos que explican. Se definen en Datos del proyecto y se asignan en cada hallazgo. Sin causas raiz no aparece.",
  },
  business_risks: {
    label: "Riesgos para el negocio",
    icon: "ti-alert-triangle",
    desc: "Hallazgos agrupados por categoria de riesgo, con su impacto al negocio. Se arma desde los campos de cada hallazgo. Sin categorias no aparece.",
  },
  findings_impact: {
    label: "Hallazgos e impacto",
    icon: "ti-table",
    desc: "Tabla con numero, hallazgo, modulo, severidad e impacto para el negocio. Aparece si algun hallazgo tiene modulo o impacto al negocio.",
  },
  remediation_plan: {
    label: "Plan de remediacion",
    icon: "ti-checklist",
    desc: "Acciones ordenadas por prioridad, con los hallazgos que cierran y su responsable. Se edita en Datos del proyecto. Sin acciones no aparece.",
  },
};

const cfgStr = (block: ReportBlock, key: string): string => {
  const v = block.config?.[key];
  return typeof v === "string" ? v : "";
};

interface Props {
  projectId: string | null;
  assetBase?: string | null;
  onProjectMetaChange?: (meta: ProjectMeta) => void;
  onPickProject: () => void;
}

type Selection = { kind: "data" } | { kind: "block"; index: number };
type ProjectPatch = (updater: (project: ProjectMeta) => ProjectMeta) => void;

export function ReportBuilder({
  projectId,
  assetBase,
  onProjectMetaChange,
  onPickProject,
}: Readonly<Props>) {
  const { guard } = useToast();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const projectRef = useRef<ProjectMeta | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "data" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [scopeInput, setScopeInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [blockRows] = useState(createEditorRows<ReportBlock>);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void guard(api.loadProject(projectId)).then((p) => {
      if (!cancelled && p) {
        projectRef.current = p;
        setProject(p);
      }
    });
    void guard(api.listFindings(projectId)).then((f) => {
      if (!cancelled && f) setFindings(f);
    });
    return () => {
      cancelled = true;
    };
  }, [guard, projectId]);

  // Guardar (debounced) y, al completar, refrescar el preview: previewPdf lee
  // del disco, asi que el refresco va DESPUES de persistir.
  const persist = useCallback(
    (meta: ProjectMeta) => {
      if (!projectId) return;
      scheduleWrite(
        `project:${projectId}`,
        async () => {
          const saved = await api.saveProject(projectId, {
            ...meta,
            revision: projectRef.current?.revision,
          });
          if (projectRef.current) {
            const latest = { ...projectRef.current, revision: saved.revision };
            projectRef.current = latest;
            setProject(latest);
            onProjectMetaChange?.(latest);
          }
          setRefreshKey((k) => k + 1);
        },
        500,
        (error) => {
          void guard(Promise.reject(error));
        },
      );
    },
    [guard, projectId, onProjectMetaChange],
  );

  function patch(updater: (p: ProjectMeta) => ProjectMeta) {
    const previous = projectRef.current;
    if (!previous) return;
    const next = updater(previous);
    projectRef.current = next;
    setProject(next);
    persist(next);
    onProjectMetaChange?.(next);
  }

  function reorderBlocks(from: number, to: number) {
    patch((p) => {
      const layout = [...p.layout];
      const [moved] = layout.splice(from, 1);
      layout.splice(to, 0, moved);
      return { ...p, layout };
    });
    setSelection((current) => {
      if (current.kind !== "block") return current;
      return {
        kind: "block",
        index: selectionAfterMove(current.index, from, to),
      };
    });
  }

  // Arrastre por eventos de mouse en vez de drag-and-drop nativo HTML5: en el
  // WKWebView de macOS (Tauri) el DnD nativo no dispara de forma confiable (el
  // mismo motivo por el que el tablero Kanban usa este enfoque).
  const dragFromRef = useRef<number | null>(null);
  const overIdxRef = useRef<number | null>(null);
  const candidateRef = useRef<{ idx: number; x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  function startBlockDrag(idx: number, e: ReactMouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    draggedRef.current = false;
    candidateRef.current = { idx, x: e.clientX, y: e.clientY };
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragFromRef.current === null && candidateRef.current) {
        const c = candidateRef.current;
        if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > 4) {
          draggedRef.current = true;
          dragFromRef.current = c.idx;
          window.getSelection()?.removeAllRanges();
          setDragIdx(c.idx);
        }
      }
      if (dragFromRef.current !== null) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const rowEl = el?.closest<HTMLElement>("[data-block-row]") ?? null;
        const idx = rowEl ? Number(rowEl.dataset.blockRow) : null;
        overIdxRef.current = idx;
        setOverIdx(idx);
      }
    }
    function onUp() {
      candidateRef.current = null;
      const from = dragFromRef.current;
      const to = overIdxRef.current;
      dragFromRef.current = null;
      overIdxRef.current = null;
      setDragIdx(null);
      setOverIdx(null);
      if (from !== null && to !== null && from !== to) reorderBlocks(from, to);
      // El click que sigue al mouseup no debe cambiar la seleccion reordenada.
      // Liberar la marca al terminar ese evento permite el siguiente click normal.
      setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle de visibilidad: para una seccion escribe section.enabled (un solo
  // toggle por seccion); para el resto de los bloques, block.enabled.
  function toggleBlock(index: number) {
    patch((p) => {
      const b = p.layout[index];
      const key = b.kind === "section" ? cfgStr(b, "key") : "";
      if (b.kind === "section" && key) {
        return {
          ...p,
          sections: p.sections.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)),
        };
      }
      return {
        ...p,
        layout: p.layout.map((x, i) =>
          i === index ? blockRows.replace(x, { ...x, enabled: !x.enabled }) : x,
        ),
      };
    });
  }

  function addBlock(kind: "text" | "pagebreak") {
    patch((p) => {
      const block: ReportBlock =
        kind === "text"
          ? { kind: "text", enabled: true, config: { title: "Nuevo bloque", body: "" } }
          : { kind: "pagebreak", enabled: true, config: {} };
      const at = p.layout.findIndex((b) => b.kind === "findings");
      const layout = [...p.layout];
      const pos = at >= 0 ? at : layout.length;
      layout.splice(pos, 0, block);
      return { ...p, layout };
    });
    setSelection({ kind: "data" });
  }

  function deleteBlock(index: number) {
    patch((p) => ({ ...p, layout: p.layout.filter((_, i) => i !== index) }));
    setSelection({ kind: "data" });
  }

  function updateBlockConfig(index: number, next: Record<string, unknown>) {
    patch((p) => ({
      ...p,
      layout: p.layout.map((b, i) =>
        i === index ? blockRows.replace(b, { ...b, config: { ...b.config, ...next } }) : b,
      ),
    }));
  }

  const counts = countSeverities(findings);

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para armar su reporte.
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn primary" onClick={onPickProject}>
              <i className="ti ti-folder" aria-hidden="true" /> <span>Ir a proyectos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="view">
        <output>Cargando proyecto...</output>
      </div>
    );
  }

  const blockMode = usesBlockRenderer(project);

  async function handleExport() {
    if (!projectId) return;
    await guard(api.generatePdf(projectId), "PDF generado");
    setRefreshKey((k) => k + 1);
  }

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Reporte</h1>
          <p className="sub">
            {project.name} · {project.client}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {blockMode && (
            <button
              className="btn"
              aria-expanded={previewOpen}
              aria-controls="report-inspector"
              onClick={() => setPreviewOpen((open) => !open)}
            >
              <i className="ti ti-layout-sidebar-right" aria-hidden="true" />{" "}
              <span>Vista previa</span>
            </button>
          )}
          <button className="btn primary" onClick={handleExport}>
            <i className="ti ti-download" aria-hidden="true" /> <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        <div className={`report-layout ${blockMode && previewOpen ? "with-preview" : ""}`}>
          {/* Estructura del reporte */}
          <ReportStructure
            project={project}
            selection={selection}
            onSelect={(next) => {
              if (draggedRef.current) {
                draggedRef.current = false;
                return;
              }
              setSelection(next);
            }}
            findingsCount={findings.length}
            blockRows={blockRows}
            dragIdx={dragIdx}
            overIdx={overIdx}
            onDrag={startBlockDrag}
            onToggle={toggleBlock}
            onAdd={addBlock}
            patch={patch}
          />

          {/* Panel de la seleccion */}
          <ReportSelection
            project={project}
            projectId={projectId}
            findings={findings}
            selection={selection}
            counts={counts}
            assetBase={assetBase}
            scopeInput={scopeInput}
            setScopeInput={setScopeInput}
            patch={patch}
            blockRows={blockRows}
            onReorder={reorderBlocks}
            onConfig={updateBlockConfig}
            onDelete={deleteBlock}
          />

          {/* Vista previa en vivo (render real de Typst) */}
          {blockMode && (
            <aside
              className="report-preview"
              hidden={!previewOpen}
              id="report-inspector"
              aria-label="Vista previa del reporte"
            >
              <LivePreview projectId={projectId} refreshKey={refreshKey} />
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

function ReportStructure({
  project,
  selection,
  onSelect,
  findingsCount,
  blockRows,
  dragIdx,
  overIdx,
  onDrag,
  onToggle,
  onAdd,
  patch,
}: Readonly<{
  project: ProjectMeta;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  findingsCount: number;
  blockRows: ReturnType<typeof createEditorRows<ReportBlock>>;
  dragIdx: number | null;
  overIdx: number | null;
  onDrag: (index: number, event: ReactMouseEvent) => void;
  onToggle: (index: number) => void;
  onAdd: (kind: "text" | "pagebreak") => void;
  patch: ProjectPatch;
}>) {
  const blockMode = usesBlockRenderer(project);
  return (
    <div className="section-list report-structure">
      <span className="field-label-top">Configuracion</span>
      <button
        type="button"
        className={`row report-data-button ${selection.kind === "data" ? "on" : ""}`}
        aria-pressed={selection.kind === "data"}
        onClick={() => onSelect({ kind: "data" })}
      >
        <i className="ti ti-info-circle" style={{ color: "var(--accent)" }} aria-hidden="true" />{" "}
        <span>Datos del proyecto</span>
      </button>
      <div className="report-structure-heading">
        <span className="field-label-top">Orden del documento</span>
        <p className="faint">
          Selecciona un bloque para revisarlo. El ojo indica si aparece en el PDF.
        </p>
      </div>
      {blockMode && usesCustomTemplate(project) && (
        <p
          className="faint"
          style={{ fontSize: 11, marginBottom: 8, color: "var(--warning, #b4690e)" }}
        >
          Estas usando una plantilla personalizada. Si la duplicaste antes de esta version, el PDF
          puede no reflejar el orden de los bloques: usa una plantilla incluida (desde Plantillas) o
          actualiza tu copia.
        </p>
      )}
      {blockMode ? (
        <>
          {project.layout.map((block, index) => (
            <BlockRow
              key={blockRows.key(block)}
              index={index}
              block={block}
              section={project.sections.find((section) => section.key === cfgStr(block, "key"))}
              findingsCount={findingsCount}
              selected={selection.kind === "block" && selection.index === index}
              dragging={dragIdx === index}
              dropTarget={dragIdx !== null && overIdx === index && dragIdx !== index}
              onDragHandleDown={(event) => onDrag(index, event)}
              onSelect={() => onSelect({ kind: "block", index })}
              onToggle={() => onToggle(index)}
            />
          ))}
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button className="btn small" onClick={() => onAdd("text")}>
              <i className="ti ti-text-plus" aria-hidden="true" /> <span>Texto</span>
            </button>
            <button className="btn small" onClick={() => onAdd("pagebreak")}>
              <i className="ti ti-page-break" aria-hidden="true" /> <span>Salto</span>
            </button>
          </div>
        </>
      ) : (
        <>
          {project.sections.map((section, index) => (
            <SectionRow
              key={section.key}
              section={section}
              selected={selection.kind === "block" && selection.index === index}
              onSelect={() => onSelect({ kind: "block", index })}
              onToggle={() =>
                patch((p) => ({
                  ...p,
                  sections: p.sections.map((s) =>
                    s.key === section.key ? { ...s, enabled: !s.enabled } : s,
                  ),
                }))
              }
            />
          ))}
          <p className="faint" style={{ fontSize: 11, marginTop: 10 }}>
            Este tipo de reporte usa una estructura fija; solo se reordenan las secciones de prosa.
          </p>
        </>
      )}
    </div>
  );
}

function SectionRow({
  section,
  selected,
  onSelect,
  onToggle,
}: Readonly<{
  section: { title: string; enabled: boolean };
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}>) {
  return (
    <div className={`row ${selected ? "on" : ""}`} style={{ opacity: section.enabled ? 1 : 0.5 }}>
      <button
        type="button"
        className="report-block-select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <i className="ti ti-file-text" aria-hidden="true" /> <span>{section.title}</span>
      </button>
      <button
        className={`toggle ${section.enabled ? "" : "off"}`}
        title={section.enabled ? "Visible en el PDF" : "Oculta"}
        aria-label={`Mostrar ${section.title} en el PDF`}
        aria-pressed={section.enabled}
        onClick={onToggle}
      >
        <i className={`ti ${section.enabled ? "ti-eye" : "ti-eye-off"}`} aria-hidden="true" />
      </button>
    </div>
  );
}

function ReportSelection({
  project,
  projectId,
  findings,
  selection,
  counts,
  assetBase,
  scopeInput,
  setScopeInput,
  patch,
  blockRows,
  onReorder,
  onConfig,
  onDelete,
}: Readonly<{
  project: ProjectMeta;
  projectId: string;
  findings: Finding[];
  selection: Selection;
  counts: Record<Severity, number>;
  assetBase?: string | null;
  scopeInput: string;
  setScopeInput: (value: string) => void;
  patch: ProjectPatch;
  blockRows: ReturnType<typeof createEditorRows<ReportBlock>>;
  onReorder: (from: number, to: number) => void;
  onConfig: (index: number, next: Record<string, unknown>) => void;
  onDelete: (index: number) => void;
}>) {
  if (selection.kind === "data") {
    return (
      <ProjectDataForm
        project={project}
        findings={findings}
        patch={patch}
        scopeInput={scopeInput}
        setScopeInput={setScopeInput}
      />
    );
  }
  const index = selection.index;
  const onSectionBody = (key: string, body: string) =>
    patch((p) => ({
      ...p,
      sections: p.sections.map((section) => (section.key === key ? { ...section, body } : section)),
    }));
  if (!usesBlockRenderer(project)) {
    const section = project.sections[index];
    if (!section) return <div className="card">Seleccion no disponible.</div>;
    return (
      <SectionEditor
        key={section.key}
        title={section.title}
        sectionKey={section.key}
        body={section.body}
        counts={counts}
        assetBase={assetBase}
        projectId={projectId}
        onChange={(body) => onSectionBody(section.key, body)}
      />
    );
  }
  const block = project.layout[index];
  if (!block) return <div className="card">Seleccion no disponible.</div>;
  return (
    <div>
      <div className="report-block-controls">
        <span className="faint">
          Bloque {index + 1} de {project.layout.length}
        </span>
        <div className="row">
          <button
            className="btn small"
            disabled={index === 0}
            onClick={() => onReorder(index, index - 1)}
          >
            <i className="ti ti-arrow-up" aria-hidden="true" /> <span>Subir</span>
          </button>
          <button
            className="btn small"
            disabled={index === project.layout.length - 1}
            onClick={() => onReorder(index, index + 1)}
          >
            <i className="ti ti-arrow-down" aria-hidden="true" /> <span>Bajar</span>
          </button>
        </div>
      </div>
      <BlockEditor
        key={blockRows.key(block)}
        block={block}
        section={project.sections.find((section) => section.key === cfgStr(block, "key"))}
        counts={counts}
        assetBase={assetBase}
        projectId={projectId}
        onSectionBody={onSectionBody}
        onConfig={(next) => onConfig(index, next)}
        onDelete={() => onDelete(index)}
      />
    </div>
  );
}

function blockStatus(kind: BlockKind, enabled: boolean): string {
  if (!enabled) return "Oculto en el PDF";
  if (kind === "section" || kind === "text") return "Contenido editable";
  if (kind === "pagebreak") return "Separador";
  return "Contenido automatico";
}

function BlockRow({
  index,
  block,
  section,
  findingsCount,
  selected,
  dragging,
  dropTarget,
  onDragHandleDown,
  onSelect,
  onToggle,
}: Readonly<{
  index: number;
  block: ReportBlock;
  section: { title: string; enabled: boolean } | undefined;
  findingsCount: number;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragHandleDown: (e: ReactMouseEvent) => void;
  onSelect: () => void;
  onToggle: () => void;
}>) {
  // Un section-block colgante no deberia llegar (el backend lo reconcilia).
  if (block.kind === "section" && !section) return null;
  const meta = BLOCK_META[block.kind];
  let label: string;
  let enabled: boolean;
  if (block.kind === "section") {
    label = section?.title ?? meta.label;
    enabled = section?.enabled ?? true;
  } else if (block.kind === "text") {
    label = cfgStr(block, "title") || meta.label;
    enabled = block.enabled;
  } else {
    label = meta.label;
    enabled = block.enabled;
  }

  return (
    <div
      data-block-row={index}
      className={`row ${selected ? "on" : ""} ${dragging ? "dragging" : ""} ${
        dropTarget ? "drop-target" : ""
      }`}
      style={{
        cursor: dragging ? "grabbing" : "grab",
        opacity: dragging ? 0.4 : undefined,
      }}
    >
      <button
        type="button"
        onMouseDown={onDragHandleDown}
        onClick={onSelect}
        aria-label={`Reordenar ${label}: seleccionar y usar Subir o Bajar`}
        title="Arrastrar para reordenar o seleccionar y usar Subir/Bajar"
        className="report-block-grip"
      >
        <i className="ti ti-grip-vertical grip" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="report-block-select"
        aria-pressed={selected}
        style={{ opacity: enabled ? 1 : 0.5 }}
        onClick={onSelect}
      >
        <span className="report-block-number">{String(index + 1).padStart(2, "0")}</span>
        <i className={`ti ${meta.icon}`} aria-hidden="true" />
        <span className="report-block-label">
          {label}
          <small>{blockStatus(block.kind, enabled)}</small>
        </span>
      </button>
      {block.kind === "findings" && (
        <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
          {findingsCount}
        </span>
      )}
      <button
        className={`toggle ${enabled ? "" : "off"}`}
        title={enabled ? "Visible en el PDF" : "Oculto"}
        aria-label={`Mostrar ${label} en el PDF`}
        aria-pressed={enabled}
        style={{ marginLeft: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <i className={`ti ${enabled ? "ti-eye" : "ti-eye-off"}`} aria-hidden="true" />
      </button>
    </div>
  );
}

function BlockEditor({
  block,
  section,
  counts,
  assetBase,
  projectId,
  onSectionBody,
  onConfig,
  onDelete,
}: Readonly<{
  block: ReportBlock;
  section: { key: string; title: string; body: string } | undefined;
  counts: Record<Severity, number>;
  assetBase?: string | null;
  projectId: string | null;
  onSectionBody: (key: string, md: string) => void;
  onConfig: (next: Record<string, unknown>) => void;
  onDelete: () => void;
}>) {
  const fieldId = useId();
  if (block.kind === "section") {
    if (!section) return <div className="card">Seleccion no disponible.</div>;
    return (
      <SectionEditor
        key={section.key}
        title={section.title}
        sectionKey={section.key}
        body={section.body}
        counts={counts}
        assetBase={assetBase}
        projectId={projectId}
        onChange={(md) => onSectionBody(section.key, md)}
      />
    );
  }

  if (block.kind === "text") {
    return (
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <strong id={`${fieldId}-body`} style={{ fontSize: 15 }}>
            Bloque de texto
          </strong>
          <button className="btn" onClick={onDelete}>
            <i className="ti ti-trash" aria-hidden="true" /> <span>Quitar bloque</span>
          </button>
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor={`${fieldId}-title`}>Titulo (opcional)</label>
          <input
            id={`${fieldId}-title`}
            className="input"
            value={cfgStr(block, "title")}
            onChange={(e) => onConfig({ title: e.target.value })}
          />
        </div>
        <MarkdownEditor
          labelledBy={`${fieldId}-body`}
          value={cfgStr(block, "body")}
          onChange={(md) => onConfig({ body: md })}
          placeholder="Contenido del bloque..."
          assetBase={assetBase}
          projectId={projectId}
        />
      </div>
    );
  }

  if (block.kind === "pagebreak") {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Salto de pagina</h3>
          <button className="btn" onClick={onDelete}>
            <i className="ti ti-trash" aria-hidden="true" /> <span>Quitar</span>
          </button>
        </div>
        <p className="faint" style={{ fontSize: 13 }}>
          Fuerza el inicio de una pagina nueva en el PDF. No tiene contenido editable.
        </p>
      </div>
    );
  }

  // Bloques automaticos (cover, toc, info, severity, findings_index, findings).
  const meta = BLOCK_META[block.kind];
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{meta.label}</h3>
      <p className="faint" style={{ fontSize: 13 }}>
        {meta.desc}
      </p>
      <p className="faint" style={{ fontSize: 12 }}>
        Este bloque es automatico: no se edita aca. Podes reordenarlo u ocultarlo desde la lista de
        la izquierda.
      </p>
    </div>
  );
}

function ProjectDataForm({
  project,
  findings,
  patch,
  scopeInput,
  setScopeInput,
}: Readonly<{
  project: ProjectMeta;
  findings: Finding[];
  patch: ProjectPatch;
  scopeInput: string;
  setScopeInput: (v: string) => void;
}>) {
  const fieldId = useId();
  function addScope() {
    const v = scopeInput.trim();
    if (!v) return;
    patch((p) => ({ ...p, scope: [...p.scope, v] }));
    setScopeInput("");
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Datos del proyecto</h3>
      <div className="editor-grid">
        <div className="field">
          <label htmlFor={`${fieldId}-type`}>Tipo de reporte</label>
          <select
            id={`${fieldId}-type`}
            className="input"
            value={project.project_type}
            onChange={(e) => patch((p) => ({ ...p, project_type: e.target.value }))}
            title="Cambia el flujo del reporte (formulario, plantilla por defecto y orden). No borra el contenido."
          >
            {PROJECT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-name`}>Nombre</label>
          <input
            id={`${fieldId}-name`}
            className="input"
            value={project.name}
            onChange={(e) => patch((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-client`}>Cliente</label>
          <input
            id={`${fieldId}-client`}
            className="input"
            value={project.client}
            onChange={(e) => patch((p) => ({ ...p, client: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="project-external-reference">Referencia compartida (opcional)</label>
          <input
            id="project-external-reference"
            className="input"
            value={project.external_reference ?? ""}
            aria-describedby="project-reference-help"
            aria-invalid={[...(project.external_reference ?? "").trim()].length > 128}
            onChange={(event) =>
              patch((p) => ({ ...p, external_reference: event.target.value || undefined }))
            }
          />
          <p id="project-reference-help" className="sub">
            Hasta 128 caracteres. Ayuda a vincular documentos de un mismo trabajo; no fusiona
            hallazgos ni concede acceso. Se exporta solo al seleccionarla en v2.
          </p>
          {[...(project.external_reference ?? "").trim()].length > 128 && (
            <p role="alert">La referencia supera 128 caracteres. Acortala para guardar.</p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-gerencia`}>Gerencia</label>
          <input
            id={`${fieldId}-gerencia`}
            className="input"
            placeholder="Opcional"
            value={project.gerencia}
            onChange={(e) => patch((p) => ({ ...p, gerencia: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-area`}>Area</label>
          <input
            id={`${fieldId}-area`}
            className="input"
            placeholder="Opcional"
            value={project.area}
            onChange={(e) => patch((p) => ({ ...p, area: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-start`}>Fecha de inicio</label>
          <input
            id={`${fieldId}-start`}
            className="input"
            type="date"
            value={project.start_date}
            onChange={(e) => patch((p) => ({ ...p, start_date: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-end`}>Fecha de fin</label>
          <input
            id={`${fieldId}-end`}
            className="input"
            type="date"
            value={project.end_date}
            onChange={(e) => patch((p) => ({ ...p, end_date: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-environment`}>Ambiente evaluado</label>
          <select
            id={`${fieldId}-environment`}
            className="input"
            value={project.ambiente}
            onChange={(e) => patch((p) => ({ ...p, ambiente: e.target.value as Ambiente }))}
          >
            {AMBIENTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-exposure`}>Exposicion del activo</label>
          <select
            id={`${fieldId}-exposure`}
            className="input"
            value={project.exposicion}
            onChange={(e) => patch((p) => ({ ...p, exposicion: e.target.value as Exposicion }))}
          >
            {EXPOSICION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {typeInfo(project.project_type).exam && (
          <div className="field">
            <label htmlFor={`${fieldId}-osid`}>OSID</label>
            <input
              id={`${fieldId}-osid`}
              className="input"
              placeholder="XXXXX"
              value={project.osid}
              onChange={(e) => patch((p) => ({ ...p, osid: e.target.value }))}
            />
          </div>
        )}
      </div>
      <p className="faint" style={{ fontSize: 11, margin: "4px 0 12px" }}>
        Ambiente y exposicion son opcionales y no salen en el PDF: son metadata para integraciones
        (ej. un SLA segun la exposicion del activo). Solo se envian a los destinos de API que los
        activen.
      </p>
      <div className="field full">
        <label htmlFor={`${fieldId}-scope`}>Alcance</label>
        <div className="tag-list" style={{ marginBottom: 6 }}>
          {project.scope.map((s, i) => (
            <span className="tag" key={`${s}-${i}`}>
              {s}
              <button
                aria-label={`Quitar ${s} del alcance`}
                onClick={() =>
                  patch((p) => ({ ...p, scope: p.scope.filter((_, idx) => idx !== i) }))
                }
              >
                <i className="ti ti-x" />
              </button>
            </span>
          ))}
        </div>
        <div className="inline-form">
          <input
            id={`${fieldId}-scope`}
            className="input"
            placeholder="https://app.acme.com — admite **negrita**, *cursiva*, [links](url)"
            value={scopeInput}
            onChange={(e) => setScopeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addScope()}
            style={{ flex: 1 }}
          />
          <button className="btn small" onClick={addScope}>
            Agregar
          </button>
        </div>
      </div>
      <RootCausesEditor project={project} patch={patch} />
      <RemediationPlanEditor project={project} findings={findings} patch={patch} />
    </div>
  );
}

// --- Parte ejecutiva: causas raiz y plan de remediacion ---
// Texto plano (no markdown): el PDF los muestra tal cual en tablas y listas.

function RootCausesEditor({
  project,
  patch,
}: Readonly<{
  project: ProjectMeta;
  patch: ProjectPatch;
}>) {
  const causas = project.causas_raiz ?? [];

  function update(index: number, next: Partial<CausaRaiz>) {
    patch((p) => ({
      ...p,
      causas_raiz: (p.causas_raiz ?? []).map((c, i) => (i === index ? { ...c, ...next } : c)),
    }));
  }

  return (
    <div className="field full" style={{ marginTop: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h4 className="field-label">Causas raiz</h4>
        <button
          className="btn small"
          onClick={() =>
            patch((p) => ({
              ...p,
              causas_raiz: [...(p.causas_raiz ?? []), newRootCause(p.causas_raiz ?? [])],
            }))
          }
        >
          <i className="ti ti-plus" aria-hidden="true" /> <span>Agregar causa raiz</span>
        </button>
      </div>
      <p className="faint" style={{ fontSize: 11, margin: "2px 0 6px" }}>
        Debilidades de fondo que explican varios hallazgos. Cada hallazgo elige la suya en el editor
        de hallazgos; el PDF las lista con los hallazgos que explican.
      </p>
      {causas.length === 0 && (
        <p className="faint" style={{ fontSize: 12 }}>
          Sin causas raiz. El bloque no aparece en el PDF.
        </p>
      )}
      {causas.map((c, i) => (
        <div className="card" key={c.clave} style={{ padding: 12, marginBottom: 8 }}>
          <div className="inline-form" style={{ marginBottom: 6 }}>
            <input
              className="input"
              aria-label={`Titulo de la causa raiz ${i + 1}`}
              placeholder="Ej. Validacion de entradas solo en el cliente"
              maxLength={TEXTO_CORTO_MAX}
              value={c.titulo}
              onChange={(e) =>
                update(i, { titulo: singleParagraph(e.target.value, TEXTO_CORTO_MAX) })
              }
              style={{ flex: 1 }}
            />
            <button
              className="btn small"
              title="Quitar causa raiz. Los hallazgos que la usaban quedan sin causa raiz."
              aria-label={`Quitar causa raiz ${i + 1}`}
              onClick={() =>
                patch((p) => ({
                  ...p,
                  causas_raiz: (p.causas_raiz ?? []).filter((_, idx) => idx !== i),
                }))
              }
            >
              <i className="ti ti-trash" />
            </button>
          </div>
          <textarea
            className="textarea"
            aria-label={`Descripcion de la causa raiz ${i + 1}`}
            placeholder="Por que ocurre y que la origina (opcional)"
            rows={2}
            maxLength={TEXTO_LARGO_MAX}
            value={c.descripcion}
            onChange={(e) => update(i, { descripcion: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

function RemediationPlanEditor({
  project,
  findings,
  patch,
}: Readonly<{
  project: ProjectMeta;
  findings: Finding[];
  patch: ProjectPatch;
}>) {
  const [rows] = useState(createEditorRows<AccionRemediacion>);
  const fieldId = useId();
  const plan = project.plan_remediacion ?? [];
  const numbers = findingNumbers(findings);
  const order = findings.map((f) => f.id);
  // Solo hallazgos con numero en el reporte (los ocultos no salen en el PDF).
  const selectable = findings.filter((f) => numbers.has(f.id));

  function update(index: number, next: Partial<AccionRemediacion>) {
    patch((p) => ({
      ...p,
      plan_remediacion: (p.plan_remediacion ?? []).map((a, i) =>
        i === index ? rows.replace(a, { ...a, ...next }) : a,
      ),
    }));
  }

  return (
    <div className="field full" style={{ marginTop: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h4 className="field-label">Plan de remediacion</h4>
        <button
          className="btn small"
          onClick={() =>
            patch((p) => ({
              ...p,
              plan_remediacion: [...(p.plan_remediacion ?? []), newRemediationAction()],
            }))
          }
        >
          <i className="ti ti-plus" aria-hidden="true" /> <span>Agregar accion</span>
        </button>
      </div>
      <p className="faint" style={{ fontSize: 11, margin: "2px 0 6px" }}>
        El PDF ordena las acciones por prioridad y muestra el numero de cada hallazgo que cierran.
      </p>
      {plan.length === 0 && (
        <p className="faint" style={{ fontSize: 12 }}>
          Sin acciones. El bloque no aparece en el PDF.
        </p>
      )}
      {plan.map((a, i) => (
        <div className="card" key={rows.key(a)} style={{ padding: 12, marginBottom: 8 }}>
          <div className="editor-grid">
            <div className="field">
              <label htmlFor={`${fieldId}-${rows.key(a)}-prioridad`}>Prioridad</label>
              <select
                id={`${fieldId}-${rows.key(a)}-prioridad`}
                className="input"
                value={a.prioridad}
                onChange={(e) => update(i, { prioridad: e.target.value as PrioridadRemediacion })}
              >
                {PRIORIDAD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${fieldId}-${rows.key(a)}-responsable`}>Responsable</label>
              <input
                id={`${fieldId}-${rows.key(a)}-responsable`}
                className="input"
                placeholder="Opcional"
                maxLength={TEXTO_CORTO_MAX}
                value={a.responsable}
                onChange={(e) =>
                  update(i, { responsable: singleParagraph(e.target.value, TEXTO_CORTO_MAX) })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor={`${fieldId}-${rows.key(a)}-accion`}>Accion</label>
              <textarea
                id={`${fieldId}-${rows.key(a)}-accion`}
                className="textarea"
                placeholder="Que hay que hacer, en imperativo"
                rows={2}
                maxLength={TEXTO_LARGO_MAX}
                value={a.accion}
                onChange={(e) => update(i, { accion: e.target.value })}
              />
            </div>
            <fieldset className="field field-group full">
              <legend>Hallazgos que cierra</legend>
              {selectable.length === 0 ? (
                <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                  El proyecto no tiene hallazgos visibles.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    maxHeight: 150,
                    overflowY: "auto",
                  }}
                >
                  {selectable.map((f) => (
                    <label
                      key={f.id}
                      className="row"
                      style={{ gap: 8, cursor: "pointer", fontSize: 12 }}
                    >
                      <input
                        type="checkbox"
                        checked={a.hallazgos.includes(f.id)}
                        onChange={() =>
                          update(i, { hallazgos: toggleFindingId(a.hallazgos, f.id, order) })
                        }
                      />
                      <span>
                        {numbers.get(f.id)}. {f.meta.title || f.id}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
            <button
              className="btn small"
              aria-label={`Quitar accion ${i + 1}`}
              onClick={() =>
                patch((p) => ({
                  ...p,
                  plan_remediacion: (p.plan_remediacion ?? []).filter((_, idx) => idx !== i),
                }))
              }
            >
              <i className="ti ti-trash" aria-hidden="true" /> <span>Quitar accion</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionEditor({
  title,
  sectionKey,
  body,
  counts,
  assetBase,
  projectId,
  onChange,
}: Readonly<{
  title: string;
  sectionKey: string;
  body: string;
  counts: Record<Severity, number>;
  assetBase?: string | null;
  projectId: string | null;
  onChange: (md: string) => void;
}>) {
  const headingId = useId();
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <strong id={headingId} style={{ fontSize: 15 }}>
          {title}
        </strong>
        {BOILERPLATE[sectionKey] && (
          <button
            className="btn"
            onClick={() => onChange(body.trim() ? body : BOILERPLATE[sectionKey])}
          >
            <i className="ti ti-clipboard-text" aria-hidden="true" />{" "}
            <span>Insertar boilerplate</span>
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {SEVERITY_ORDER.map((sev) => (
          <div
            key={sev}
            className="card"
            style={{ textAlign: "center", padding: "8px 14px", minWidth: 70 }}
          >
            <div style={{ fontSize: 20, fontWeight: 600, color: SEVERITY_COLOR[sev] }}>
              {counts[sev]}
            </div>
            <div className="faint" style={{ fontSize: 11 }}>
              {SEVERITY_LABEL[sev]}
            </div>
          </div>
        ))}
      </div>

      <MarkdownEditor
        labelledBy={headingId}
        value={body}
        onChange={onChange}
        placeholder={`${title}...`}
        assetBase={assetBase}
        projectId={projectId}
      />
    </div>
  );
}

function countSeverities(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) counts[f.meta.severity]++;
  return counts;
}
