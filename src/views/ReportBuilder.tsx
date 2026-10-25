// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import {
  Fragment,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as api from "../lib/api";
import { scheduleWrite } from "../lib/pendingWrites";
import type {
  BlockKind,
  Finding,
  ProjectMeta,
  ReportBlock,
  Severity,
  WorkspaceMeta,
} from "../lib/types";
import { SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_COLOR } from "../lib/severity";
import {
  PROJECT_TYPES,
  typeInfo,
  usesBlockRenderer,
  usesCustomTemplate,
} from "../lib/projectTypes";
import { FINDING_SECTIONS } from "../lib/sections";
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
    desc: "Detalle de cada hallazgo. Desplegalo en el arbol para ordenar sus campos (titulo, CVSS, secciones...) y agregar saltos de pagina; el contenido de cada hallazgo se edita en la pantalla Hallazgos.",
  },
  section: { label: "Seccion", icon: "ti-file-text", desc: "" },
  text: { label: "Texto libre", icon: "ti-text-caption", desc: "" },
  pagebreak: {
    label: "Salto de pagina",
    icon: "ti-page-break",
    desc: "Fuerza el inicio de una pagina nueva en el PDF.",
  },
};

const cfgStr = (block: ReportBlock, key: string): string => {
  const v = block.config?.[key];
  return typeof v === "string" ? v : "";
};

interface Props {
  workspace: WorkspaceMeta;
  projectId: string | null;
  assetBase?: string | null;
  onWorkspaceSaved: (meta: WorkspaceMeta) => void;
  onProjectMetaChange?: (meta: ProjectMeta) => void;
  onGoToPreview: () => void;
  onPickProject: () => void;
}

type Selection =
  | { kind: "data" }
  | { kind: "block"; index: number }
  /** Campo del bloque "Hallazgos" (indice en su lista de campos). */
  | { kind: "field"; idx: number };

export function ReportBuilder({ projectId, assetBase, onProjectMetaChange, onPickProject }: Props) {
  const { guard, notify } = useToast();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "data" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [scopeInput, setScopeInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(true);
  // Arbol: los campos de cada hallazgo cuelgan del bloque "Hallazgos".
  const [findingsOpen, setFindingsOpen] = useState(true);
  const [fieldDragIdx, setFieldDragIdx] = useState<number | null>(null);
  const [fieldOverIdx, setFieldOverIdx] = useState<number | null>(null);
  // Si la plantilla efectiva dibuja los hallazgos con el orden de campos. Las
  // copias hechas antes de esta funcion lo ignoran (ver upgradeTemplate).
  const [fieldsSupport, setFieldsSupport] = useState<"yes" | "no" | "unknown">("yes");

  useEffect(() => {
    if (!projectId) return;
    guard(api.loadProject(projectId)).then((p) => p && setProject(p));
    guard(api.listFindings(projectId)).then((f) => f && setFindings(f));
  }, [guard, projectId]);

  // Guardar (debounced) y, al completar, refrescar el preview: previewPdf lee
  // del disco, asi que el refresco va DESPUES de persistir.
  const persist = useCallback(
    (meta: ProjectMeta) => {
      if (!projectId) return;
      scheduleWrite(
        `project:${projectId}`,
        async () => {
          await api.saveProject(projectId, meta);
          setRefreshKey((k) => k + 1);
        },
        500,
        (error) => {
          void guard(Promise.reject(error));
        },
      );
    },
    [guard, projectId],
  );

  function patch(updater: (p: ProjectMeta) => ProjectMeta) {
    setProject((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      persist(next);
      // Mantiene en sincronia el proyecto activo del App (otras vistas leen el
      // tipo de ahi, p.ej. el orden de retest en el editor de hallazgos).
      onProjectMetaChange?.(next);
      return next;
    });
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
      const index = current.index;
      return {
        kind: "block",
        index:
          index === from
            ? to
            : from < index && index <= to
              ? index - 1
              : to <= index && index < from
                ? index + 1
                : index,
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
        layout: p.layout.map((x, i) => (i === index ? { ...x, enabled: !x.enabled } : x)),
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
        i === index ? { ...b, config: { ...b.config, ...next } } : b,
      ),
    }));
  }

  // --- Campos del bloque "Hallazgos" (orden de las piezas de cada hallazgo) ---
  // Se escriben en config.fields del bloque dentro del patch() del proyecto,
  // calculando sobre el estado mas reciente (sin closures viejos).
  function patchFindingFields(mutate: (items: FieldItem[]) => FieldItem[]) {
    patch((p) => {
      const at = p.layout.findIndex((b) => b.kind === "findings");
      if (at < 0) return p;
      const items = mutate(findingFields(p.layout[at], isRetest(p)));
      return {
        ...p,
        layout: p.layout.map((b, i) =>
          i === at ? { ...b, config: { ...b.config, fields: serializeFields(items) } } : b,
        ),
      };
    });
  }

  function moveField(from: number, to: number) {
    if (from === to) return;
    patchFindingFields((items) => {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSelection((cur) => {
      if (cur.kind !== "field") return cur;
      const i = cur.idx;
      return {
        kind: "field",
        idx: i === from ? to : from < i && i <= to ? i - 1 : to <= i && i < from ? i + 1 : i,
      };
    });
  }

  function toggleField(idx: number) {
    patchFindingFields((items) =>
      items.map((it, i) => (i === idx ? { ...it, enabled: !it.enabled } : it)),
    );
  }

  function removeField(idx: number) {
    patchFindingFields((items) =>
      items.filter((it, i) => !(i === idx && SEPARATOR_FIELDS.has(it.key))),
    );
    setSelection({ kind: "data" });
  }

  // Inserta un separador despues del campo seleccionado (o al final).
  function addSeparator(kind: "pagebreak") {
    const after = selection.kind === "field" ? selection.idx + 1 : null;
    patchFindingFields((items) => {
      const next = [...items];
      const item: FieldItem = { key: kind, enabled: true, id: `${kind}-${Date.now()}` };
      next.splice(after ?? next.length, 0, item);
      return next;
    });
    if (after !== null) setSelection({ kind: "field", idx: after });
  }

  function resetFields() {
    patch((p) => ({
      ...p,
      layout: p.layout.map((b) =>
        b.kind === "findings" ? { ...b, config: { ...b.config, fields: [] } } : b,
      ),
    }));
    setSelection({ kind: "data" });
  }

  // Arrastre de campos dentro del arbol (mismo enfoque por eventos de mouse
  // que los bloques, por el DnD nativo poco confiable del WKWebView).
  const fieldDragFromRef = useRef<number | null>(null);
  const fieldOverRef = useRef<number | null>(null);
  const fieldCandidateRef = useRef<{ idx: number; x: number; y: number } | null>(null);
  const moveFieldRef = useRef(moveField);
  moveFieldRef.current = moveField;

  function startFieldDrag(idx: number, e: ReactMouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    fieldCandidateRef.current = { idx, x: e.clientX, y: e.clientY };
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const c = fieldCandidateRef.current;
      if (fieldDragFromRef.current === null && c) {
        if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > 4) {
          fieldDragFromRef.current = c.idx;
          window.getSelection()?.removeAllRanges();
          setFieldDragIdx(c.idx);
        }
      }
      if (fieldDragFromRef.current !== null) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const rowEl = el?.closest<HTMLElement>("[data-field-row]") ?? null;
        const idx = rowEl ? Number(rowEl.dataset.fieldRow) : null;
        fieldOverRef.current = idx;
        setFieldOverIdx(idx);
      }
    }
    function onUp() {
      fieldCandidateRef.current = null;
      const from = fieldDragFromRef.current;
      const to = fieldOverRef.current;
      fieldDragFromRef.current = null;
      fieldOverRef.current = null;
      setFieldDragIdx(null);
      setFieldOverIdx(null);
      if (from !== null && to !== null && from !== to) moveFieldRef.current(from, to);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Copia de la libreria del usuario activa en el proyecto (vacio = incluida).
  const customTemplate = project && usesCustomTemplate(project) ? project.template_override : "";
  useEffect(() => {
    if (!customTemplate) {
      setFieldsSupport("yes");
      return;
    }
    let alive = true;
    api
      .readTemplateSource(customTemplate)
      .then((src) => {
        if (alive) setFieldsSupport(src.includes("render-finding(") ? "yes" : "no");
      })
      .catch(() => {
        if (alive) setFieldsSupport("unknown");
      });
    return () => {
      alive = false;
    };
  }, [customTemplate]);

  async function upgradeTemplate() {
    if (!customTemplate) return;
    const result = await guard(api.upgradeTemplateFindingFields(customTemplate));
    if (result === "upgraded" || result === "already_supported") {
      setFieldsSupport("yes");
      setRefreshKey((k) => k + 1);
      notify(
        result === "upgraded"
          ? `Plantilla "${customTemplate}" actualizada. El original quedo en ${customTemplate}.typ.bak`
          : "La plantilla ya soportaba el orden de campos.",
        "ok",
      );
    } else if (result === "unsupported") {
      notify(
        `No se reconoce como se dibujan los hallazgos en "${customTemplate}". Usa la plantilla incluida o editala desde Plantillas.`,
        "error",
      );
    }
  }

  function switchToBuiltinTemplate() {
    patch((p) => ({ ...p, template_override: "" }));
  }

  const templateWarning =
    fieldsSupport === "no" && customTemplate
      ? { name: customTemplate, onUpgrade: upgradeTemplate, onUseBuiltin: switchToBuiltinTemplate }
      : undefined;

  const counts = countSeverities(findings);

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para armar su reporte.
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn primary" onClick={onPickProject}>
              <i className="ti ti-folder" />
              Ir a proyectos
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="view">Cargando proyecto...</div>;
  }

  const blockMode = usesBlockRenderer(project);
  const sectionByKey = (key: string) => project.sections.find((s) => s.key === key);

  async function handleExport() {
    if (!projectId) return;
    await guard(api.generatePdf(projectId), "PDF generado");
    setRefreshKey((k) => k + 1);
  }

  const selectedBlock =
    selection.kind === "block" ? (project.layout[selection.index] ?? null) : null;
  const findingsBlock = project.layout.find((b) => b.kind === "findings") ?? null;
  const fields = findingsBlock ? findingFields(findingsBlock, isRetest(project)) : [];

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
              <i className="ti ti-layout-sidebar-right" aria-hidden="true" />
              Vista previa
            </button>
          )}
          <button className="btn primary" onClick={handleExport}>
            <i className="ti ti-download" />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        <div className={`report-layout ${blockMode && previewOpen ? "with-preview" : ""}`}>
          {/* Estructura del reporte */}
          <div className="section-list report-structure">
            <span className="field-label-top">Configuracion</span>
            <button
              type="button"
              className={`row report-data-button ${selection.kind === "data" ? "on" : ""}`}
              aria-pressed={selection.kind === "data"}
              onClick={() => setSelection({ kind: "data" })}
            >
              <i className="ti ti-info-circle" style={{ color: "var(--accent)" }} />
              Datos del proyecto
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
                Estas usando una plantilla personalizada. Si la duplicaste antes de esta version, el
                PDF puede no reflejar el orden de los bloques: usa una plantilla incluida (desde
                Plantillas) o actualiza tu copia.
              </p>
            )}
            {blockMode ? (
              <>
                {project.layout.map((b, i) => (
                  <Fragment key={`${b.kind}-${b.kind === "section" ? cfgStr(b, "key") : i}`}>
                    <BlockRow
                      index={i}
                      block={b}
                      section={b.kind === "section" ? sectionByKey(cfgStr(b, "key")) : undefined}
                      findingsCount={findings.length}
                      expanded={b.kind === "findings" ? findingsOpen : undefined}
                      onToggleExpand={
                        b.kind === "findings" ? () => setFindingsOpen((o) => !o) : undefined
                      }
                      selected={selection.kind === "block" && selection.index === i}
                      dragging={dragIdx === i}
                      dropTarget={dragIdx !== null && overIdx === i && dragIdx !== i}
                      onDragHandleDown={(e) => startBlockDrag(i, e)}
                      onSelect={() => {
                        setSelection({ kind: "block", index: i });
                      }}
                      onToggle={() => toggleBlock(i)}
                    />
                    {b.kind === "findings" && findingsOpen && (
                      <FindingFieldTree
                        prefix={String(i + 1).padStart(2, "0")}
                        items={fields}
                        parentHidden={!b.enabled}
                        selectedIdx={selection.kind === "field" ? selection.idx : null}
                        dragIdx={fieldDragIdx}
                        overIdx={fieldOverIdx}
                        onDragHandleDown={startFieldDrag}
                        onSelect={(idx) => setSelection({ kind: "field", idx })}
                        onToggle={toggleField}
                        warning={Boolean(templateWarning)}
                        onWarningClick={() => setSelection({ kind: "block", index: i })}
                      />
                    )}
                  </Fragment>
                ))}
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button className="btn small" onClick={() => addBlock("text")}>
                    <i className="ti ti-text-plus" />
                    Texto
                  </button>
                  <button className="btn small" onClick={() => addBlock("pagebreak")}>
                    <i className="ti ti-page-break" />
                    Salto
                  </button>
                </div>
              </>
            ) : (
              <>
                {project.sections.map((s, i) => (
                  <div
                    key={s.key}
                    className={`row ${
                      selection.kind === "block" && selection.index === i ? "on" : ""
                    }`}
                    style={{ cursor: "pointer", opacity: s.enabled ? 1 : 0.5 }}
                    onClick={() => setSelection({ kind: "block", index: i })}
                  >
                    <i className="ti ti-file-text" style={{ color: "var(--text-muted)" }} />
                    {s.title}
                    <button
                      className={`toggle ${s.enabled ? "" : "off"}`}
                      title={s.enabled ? "Visible en el PDF" : "Oculta"}
                      onClick={(e) => {
                        e.stopPropagation();
                        patch((p) => ({
                          ...p,
                          sections: p.sections.map((x) =>
                            x.key === s.key ? { ...x, enabled: !x.enabled } : x,
                          ),
                        }));
                      }}
                    >
                      <i className={`ti ${s.enabled ? "ti-eye" : "ti-eye-off"}`} />
                    </button>
                  </div>
                ))}
                <p className="faint" style={{ fontSize: 11, marginTop: 10 }}>
                  Este tipo de reporte usa una estructura fija; solo se reordenan las secciones de
                  prosa.
                </p>
              </>
            )}
          </div>

          {/* Panel de la seleccion */}
          <div>
            {blockMode && selection.kind === "block" && selectedBlock && (
              <div className="report-block-controls">
                <span className="faint">
                  Bloque {selection.index + 1} de {project.layout.length}
                </span>
                <div className="row">
                  <button
                    className="btn small"
                    disabled={selection.index === 0}
                    onClick={() => reorderBlocks(selection.index, selection.index - 1)}
                  >
                    <i className="ti ti-arrow-up" aria-hidden="true" /> Subir
                  </button>
                  <button
                    className="btn small"
                    disabled={selection.index === project.layout.length - 1}
                    onClick={() => reorderBlocks(selection.index, selection.index + 1)}
                  >
                    <i className="ti ti-arrow-down" aria-hidden="true" /> Bajar
                  </button>
                </div>
              </div>
            )}
            {selection.kind === "field" ? (
              fields[selection.idx] ? (
                <>
                  <div className="report-block-controls">
                    <span className="faint">
                      Campo {selection.idx + 1} de {fields.length} del hallazgo
                    </span>
                    <div className="row">
                      <button
                        className="btn small"
                        disabled={selection.idx === 0}
                        onClick={() => moveField(selection.idx, selection.idx - 1)}
                      >
                        <i className="ti ti-arrow-up" aria-hidden="true" /> Subir
                      </button>
                      <button
                        className="btn small"
                        disabled={selection.idx === fields.length - 1}
                        onClick={() => moveField(selection.idx, selection.idx + 1)}
                      >
                        <i className="ti ti-arrow-down" aria-hidden="true" /> Bajar
                      </button>
                    </div>
                  </div>
                  <FindingFieldsCard
                    templateWarning={templateWarning}
                    field={fields[selection.idx]}
                    onToggle={() => toggleField(selection.idx)}
                    onRemove={() => removeField(selection.idx)}
                    onAddSeparator={addSeparator}
                    onReset={resetFields}
                  />
                </>
              ) : (
                <div className="card">Seleccion no disponible.</div>
              )
            ) : selection.kind === "data" ? (
              <ProjectDataForm
                project={project}
                patch={patch}
                scopeInput={scopeInput}
                setScopeInput={setScopeInput}
              />
            ) : blockMode && selectedBlock?.kind === "findings" ? (
              <FindingFieldsCard
                templateWarning={templateWarning}
                onAddSeparator={addSeparator}
                onReset={resetFields}
              />
            ) : blockMode && selectedBlock ? (
              <BlockEditor
                block={selectedBlock}
                index={selection.index}
                section={
                  selectedBlock.kind === "section"
                    ? sectionByKey(cfgStr(selectedBlock, "key"))
                    : undefined
                }
                counts={counts}
                assetBase={assetBase}
                projectId={projectId}
                onSectionBody={(key, md) =>
                  patch((p) => ({
                    ...p,
                    sections: p.sections.map((x) => (x.key === key ? { ...x, body: md } : x)),
                  }))
                }
                onConfig={(next) => updateBlockConfig(selection.index, next)}
                onDelete={() => deleteBlock(selection.index)}
              />
            ) : !blockMode ? (
              (() => {
                const sec = project.sections[selection.index];
                if (!sec) return <div className="card">Seleccion no disponible.</div>;
                const key = sec.key;
                return (
                  <SectionEditor
                    key={key}
                    title={sec.title}
                    sectionKey={key}
                    body={sec.body}
                    counts={counts}
                    assetBase={assetBase}
                    projectId={projectId}
                    onChange={(md) =>
                      patch((p) => ({
                        ...p,
                        sections: p.sections.map((x) => (x.key === key ? { ...x, body: md } : x)),
                      }))
                    }
                  />
                );
              })()
            ) : (
              <div className="card">Seleccion no disponible.</div>
            )}
          </div>

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

function BlockRow({
  index,
  block,
  section,
  findingsCount,
  expanded,
  onToggleExpand,
  selected,
  dragging,
  dropTarget,
  onDragHandleDown,
  onSelect,
  onToggle,
}: {
  index: number;
  block: ReportBlock;
  section: { title: string; enabled: boolean } | undefined;
  findingsCount: number;
  /** Solo el bloque "Hallazgos": si su rama de campos esta desplegada. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragHandleDown: (e: ReactMouseEvent) => void;
  onSelect: () => void;
  onToggle: () => void;
}) {
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
        opacity: dragging ? 0.4 : enabled ? 1 : 0.5,
      }}
    >
      <span
        onMouseDown={onDragHandleDown}
        title="Arrastrar para reordenar"
        className="report-block-grip"
      >
        <i className="ti ti-grip-vertical grip" />
      </span>
      {onToggleExpand && (
        <button
          type="button"
          className="report-tree-caret"
          aria-expanded={expanded}
          title={expanded ? "Plegar campos del hallazgo" : "Desplegar campos del hallazgo"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          <i className={`ti ${expanded ? "ti-chevron-down" : "ti-chevron-right"}`} />
        </button>
      )}
      <button
        type="button"
        className="report-block-select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="report-block-number">{String(index + 1).padStart(2, "0")}</span>
        <i className={`ti ${meta.icon}`} aria-hidden="true" />
        <span className="report-block-label">
          {label}
          <small>
            {!enabled
              ? "Oculto en el PDF"
              : block.kind === "section" || block.kind === "text"
                ? "Contenido editable"
                : block.kind === "pagebreak"
                  ? "Separador"
                  : "Contenido automatico"}
          </small>
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
        style={{ marginLeft: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <i className={`ti ${enabled ? "ti-eye" : "ti-eye-off"}`} />
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
}: {
  block: ReportBlock;
  index: number;
  section: { key: string; title: string; body: string } | undefined;
  counts: Record<Severity, number>;
  assetBase?: string | null;
  projectId: string | null;
  onSectionBody: (key: string, md: string) => void;
  onConfig: (next: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
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
          <strong style={{ fontSize: 15 }}>Bloque de texto</strong>
          <button className="btn" onClick={onDelete}>
            <i className="ti ti-trash" />
            Quitar bloque
          </button>
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Titulo (opcional)</label>
          <input
            className="input"
            value={cfgStr(block, "title")}
            onChange={(e) => onConfig({ title: e.target.value })}
          />
        </div>
        <MarkdownEditor
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
            <i className="ti ti-trash" />
            Quitar
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
  patch,
  scopeInput,
  setScopeInput,
}: {
  project: ProjectMeta;
  patch: (u: (p: ProjectMeta) => ProjectMeta) => void;
  scopeInput: string;
  setScopeInput: (v: string) => void;
}) {
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
          <label>Tipo de reporte</label>
          <select
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
          <label>Nombre</label>
          <input
            className="input"
            value={project.name}
            onChange={(e) => patch((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Cliente</label>
          <input
            className="input"
            value={project.client}
            onChange={(e) => patch((p) => ({ ...p, client: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Gerencia</label>
          <input
            className="input"
            placeholder="Opcional"
            value={project.gerencia}
            onChange={(e) => patch((p) => ({ ...p, gerencia: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Area</label>
          <input
            className="input"
            placeholder="Opcional"
            value={project.area}
            onChange={(e) => patch((p) => ({ ...p, area: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Fecha de inicio</label>
          <input
            className="input"
            type="date"
            value={project.start_date}
            onChange={(e) => patch((p) => ({ ...p, start_date: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Fecha de fin</label>
          <input
            className="input"
            type="date"
            value={project.end_date}
            onChange={(e) => patch((p) => ({ ...p, end_date: e.target.value }))}
          />
        </div>
        {typeInfo(project.project_type).exam && (
          <div className="field">
            <label>OSID</label>
            <input
              className="input"
              placeholder="XXXXX"
              value={project.osid}
              onChange={(e) => patch((p) => ({ ...p, osid: e.target.value }))}
            />
          </div>
        )}
      </div>
      <div className="field full">
        <label>Alcance</label>
        <div className="tag-list" style={{ marginBottom: 6 }}>
          {project.scope.map((s, i) => (
            <span className="tag" key={`${s}-${i}`}>
              {s}
              <button
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
}: {
  title: string;
  sectionKey: string;
  body: string;
  counts: Record<Severity, number>;
  assetBase?: string | null;
  projectId: string | null;
  onChange: (md: string) => void;
}) {
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        {BOILERPLATE[sectionKey] && (
          <button
            className="btn"
            onClick={() => onChange(body.trim() ? body : BOILERPLATE[sectionKey])}
          >
            <i className="ti ti-clipboard-text" />
            Insertar boilerplate
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

// ---------------------------------------------------------------------------
// Campos del bloque "Hallazgos": orden y visibilidad de las piezas de cada
// hallazgo en el PDF. Espeja finding-fields/render-finding de theme.typ.
// ---------------------------------------------------------------------------

/** Pieza del hallazgo (o separador) en config.fields del bloque. */
interface FieldItem {
  key: string;
  enabled: boolean;
  /** Solo separadores (se pueden repetir): identidad estable para la UI. */
  id?: string;
}

const SEPARATOR_FIELDS = new Set(["pagebreak"]);
/** Se dibujan como chips en linea; si siguen al titulo van en su franja. */
const INLINE_FIELDS = new Set(["severity", "cvss", "cwe", "status"]);

const SECTION_TITLE = Object.fromEntries(FINDING_SECTIONS.map((s) => [s.key, s.title]));

const FIELD_META: Record<string, { label: string; icon: string; hint: string }> = {
  title: {
    label: "Titulo",
    icon: "ti-heading",
    hint: "Numero y titulo del hallazgo, con la franja de color. Los chips que lo siguen van dentro de la franja.",
  },
  severity: { label: "Severidad", icon: "ti-alert-triangle", hint: "Etiqueta de severidad." },
  cvss: { label: "Puntaje CVSS", icon: "ti-gauge", hint: "Chip con la version y el puntaje CVSS." },
  cwe: { label: "CWE", icon: "ti-tag", hint: "Identificadores CWE del hallazgo." },
  status: { label: "Estado", icon: "ti-circle-check", hint: "Estado de remediacion." },
  vector: { label: "Vector CVSS", icon: "ti-code", hint: "Vector CVSS completo en tipografia mono." },
  affected: { label: "Activos afectados", icon: "ti-server", hint: "Lista de activos afectados." },
  descripcion: { label: SECTION_TITLE.descripcion, icon: "ti-file-text", hint: "Seccion del cuerpo." },
  impacto: { label: SECTION_TITLE.impacto, icon: "ti-file-text", hint: "Seccion del cuerpo." },
  poc: { label: SECTION_TITLE.poc, icon: "ti-file-text", hint: "Seccion del cuerpo." },
  remediacion: { label: SECTION_TITLE.remediacion, icon: "ti-file-text", hint: "Seccion del cuerpo." },
  pagebreak: {
    label: "Salto de pagina",
    icon: "ti-page-break",
    hint: "Lo que sigue arranca en una pagina nueva.",
  },
};

/** Retest usa su propia plantilla: estado antes que severidad, sin CVSS/CWE/vector. */
function isRetest(project: { project_type: string }): boolean {
  return project.project_type === "retest";
}

function defaultFindingFields(retest: boolean): string[] {
  const body = FINDING_SECTIONS.map((s) => s.key);
  return retest
    ? ["title", "status", "severity", "affected", ...body]
    : ["title", "severity", "cvss", "cwe", "status", "vector", "affected", ...body];
}

/** Normaliza config.fields: descarta claves desconocidas o duplicadas y anexa
 * al final (visibles) las piezas que falten, igual que la plantilla. */
function findingFields(block: ReportBlock, retest: boolean): FieldItem[] {
  const defaults = defaultFindingFields(retest);
  const allowed = new Set([...defaults, ...SEPARATOR_FIELDS]);
  const raw = block.config?.fields;
  const items: FieldItem[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const { key, enabled, id } = entry as { key?: unknown; enabled?: unknown; id?: unknown };
      if (typeof key !== "string" || !allowed.has(key)) continue;
      const separator = SEPARATOR_FIELDS.has(key);
      if (!separator && items.some((it) => it.key === key)) continue;
      items.push({
        key,
        enabled: enabled !== false,
        ...(separator ? { id: typeof id === "string" ? id : `${key}-${items.length}` } : {}),
      });
    }
  }
  for (const key of defaults) {
    if (!items.some((it) => it.key === key)) items.push({ key, enabled: true });
  }
  return items;
}

function serializeFields(items: FieldItem[]): Record<string, unknown>[] {
  return items.map(({ key, enabled, id }) => (id ? { key, enabled, id } : { key, enabled }));
}

/** Rama del arbol con los campos de cada hallazgo, en el orden del PDF. */
function FindingFieldTree({
  prefix,
  items,
  parentHidden,
  selectedIdx,
  dragIdx,
  overIdx,
  onDragHandleDown,
  onSelect,
  onToggle,
  warning,
  onWarningClick,
}: {
  prefix: string;
  items: FieldItem[];
  /** El bloque "Hallazgos" entero esta oculto: la rama se ve atenuada. */
  parentHidden: boolean;
  selectedIdx: number | null;
  dragIdx: number | null;
  overIdx: number | null;
  onDragHandleDown: (idx: number, e: ReactMouseEvent) => void;
  onSelect: (idx: number) => void;
  onToggle: (idx: number) => void;
  /** La plantilla del proyecto no aplica este orden (copia antigua). */
  warning: boolean;
  onWarningClick: () => void;
}) {
  return (
    <div className="report-tree-children" style={{ opacity: parentHidden ? 0.5 : 1 }}>
      {warning && (
        <button type="button" className="report-tree-warning" onClick={onWarningClick}>
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          Tu plantilla no aplica este orden. Ver como arreglarlo
        </button>
      )}
      {items.map((it, i) => {
        const meta = FIELD_META[it.key];
        const separator = SEPARATOR_FIELDS.has(it.key);
        const dragging = dragIdx === i;
        return (
          <div
            key={it.id ?? it.key}
            data-field-row={i}
            className={`row ${selectedIdx === i ? "on" : ""} ${dragging ? "dragging" : ""} ${
              dragIdx !== null && overIdx === i && dragIdx !== i ? "drop-target" : ""
            } ${separator ? "report-tree-separator" : ""}`}
            style={{
              cursor: dragging ? "grabbing" : "grab",
              opacity: dragging ? 0.4 : it.enabled ? 1 : 0.5,
            }}
          >
            <span
              onMouseDown={(e) => onDragHandleDown(i, e)}
              title="Arrastrar para reordenar"
              className="report-block-grip"
            >
              <i className="ti ti-grip-vertical grip" />
            </span>
            <button
              type="button"
              className="report-block-select"
              aria-pressed={selectedIdx === i}
              onClick={() => onSelect(i)}
            >
              <span className="report-block-number">
                {prefix}.{i + 1}
              </span>
              <i className={`ti ${meta.icon}`} aria-hidden="true" />
              <span className="report-block-label">
                {meta.label}
                {!it.enabled && <small>Oculto en el PDF</small>}
              </span>
            </button>
            {!separator && (
              <button
                className={`toggle ${it.enabled ? "" : "off"}`}
                title={it.enabled ? "Visible en el PDF" : "Oculto"}
                style={{ marginLeft: "auto" }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(i);
                }}
              >
                <i className={`ti ${it.enabled ? "ti-eye" : "ti-eye-off"}`} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Panel del bloque "Hallazgos" o de uno de sus campos: separadores y reset. */
function FindingFieldsCard({
  templateWarning,
  field,
  onToggle,
  onRemove,
  onAddSeparator,
  onReset,
}: {
  templateWarning?: { name: string; onUpgrade: () => void; onUseBuiltin: () => void };
  field?: FieldItem;
  onToggle?: () => void;
  onRemove?: () => void;
  onAddSeparator: (kind: "pagebreak") => void;
  onReset: () => void;
}) {
  const meta = field ? FIELD_META[field.key] : null;
  const separator = field ? SEPARATOR_FIELDS.has(field.key) : false;
  return (
    <div className="card">
      {templateWarning && (
        <div className="report-template-warning" role="alert">
          <strong>
            <i className="ti ti-alert-triangle" aria-hidden="true" /> La plantilla &quot;
            {templateWarning.name}&quot; no aplica este orden
          </strong>
          <p>
            Es una copia hecha antes de esta funcion: dibuja los hallazgos con un formato fijo, asi
            que el orden, lo oculto y los saltos de pagina se guardan pero no aparecen en el PDF.
          </p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="btn small primary" onClick={templateWarning.onUpgrade}>
              <i className="ti ti-wand" />
              Actualizar mi plantilla
            </button>
            <button className="btn small" onClick={templateWarning.onUseBuiltin}>
              <i className="ti ti-template" />
              Usar la plantilla incluida
            </button>
          </div>
          <p className="faint" style={{ fontSize: 11, marginBottom: 0 }}>
            Actualizar reemplaza solo la parte que dibuja los hallazgos y conserva el resto de tu
            copia. El original queda en {templateWarning.name}.typ.bak.
          </p>
        </div>
      )}
      {field && meta ? (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>
              <i className={`ti ${meta.icon}`} aria-hidden="true" /> {meta.label}
            </h3>
            {separator ? (
              <button className="btn" onClick={onRemove}>
                <i className="ti ti-trash" />
                Quitar
              </button>
            ) : (
              <button className="btn" onClick={onToggle}>
                <i className={`ti ${field.enabled ? "ti-eye-off" : "ti-eye"}`} />
                {field.enabled ? "Ocultar en el PDF" : "Mostrar en el PDF"}
              </button>
            )}
          </div>
          <p className="faint" style={{ fontSize: 13 }}>
            {meta.hint}
            {INLINE_FIELDS.has(field.key) &&
              " Se dibuja en linea junto a los otros chips que tenga al lado."}
          </p>
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>Hallazgos</h3>
          <p className="faint" style={{ fontSize: 13 }}>
            Define como se arma cada hallazgo en el PDF. Desplega el bloque en el arbol y arrastra
            sus campos para ordenarlos; el ojo los oculta. Aplica a todos los hallazgos del
            reporte: el contenido de cada uno se edita en la pantalla Hallazgos.
          </p>
        </>
      )}
      <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn small" onClick={() => onAddSeparator("pagebreak")}>
          <i className="ti ti-page-break" />
          Salto de pagina
        </button>
        <button className="btn small" style={{ marginLeft: "auto" }} onClick={onReset}>
          <i className="ti ti-restore" />
          Restablecer orden
        </button>
      </div>
      <p className="faint" style={{ fontSize: 11, marginTop: 8 }}>
        {field
          ? "El salto de pagina se inserta debajo del campo seleccionado: lo que sigue arranca en una hoja nueva."
          : "El salto de pagina se agrega al final; despues arrastralo a su lugar."}
      </p>
    </div>
  );
}
