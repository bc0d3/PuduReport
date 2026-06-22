import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type {
  BlockKind,
  Finding,
  ProjectMeta,
  ReportBlock,
  Severity,
  WorkspaceMeta,
} from "../lib/types";
import { SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_COLOR } from "../lib/severity";
import { typeInfo, usesBlockRenderer, usesCustomTemplate } from "../lib/projectTypes";
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
    desc: "Detalle de cada hallazgo. Se edita en la pantalla Hallazgos.",
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
  onGoToPreview: () => void;
  onPickProject: () => void;
}

type Selection = { kind: "data" } | { kind: "block"; index: number };

export function ReportBuilder({ projectId, assetBase, onPickProject }: Props) {
  const { guard } = useToast();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "data" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [scopeInput, setScopeInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const saveTimer = useRef<number | undefined>(undefined);

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
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        await guard(api.saveProject(projectId, meta));
        setRefreshKey((k) => k + 1);
      }, 500);
    },
    [guard, projectId],
  );

  function patch(updater: (p: ProjectMeta) => ProjectMeta) {
    setProject((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      persist(next);
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
  }

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
      layout: p.layout.map((b, i) => (i === index ? { ...b, config: { ...b.config, ...next } } : b)),
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

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Reporte</h1>
          <p className="sub">
            {project.name} · {project.client}
          </p>
        </div>
        <button className="btn primary" onClick={handleExport}>
          <i className="ti ti-download" />
          Exportar PDF
        </button>
      </div>

      <div className="view" style={{ paddingTop: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: blockMode
              ? "260px minmax(0,1fr) minmax(360px,0.9fr)"
              : "240px minmax(0,1fr)",
            gap: 18,
          }}
        >
          {/* Estructura del reporte */}
          <div className="section-list">
            <span className="field-label-top">estructura del PDF</span>
            <div
              className={`row ${selection.kind === "data" ? "on" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setSelection({ kind: "data" })}
            >
              <i className="ti ti-info-circle" style={{ color: "var(--accent)" }} />
              Datos del proyecto
            </div>

            {blockMode && usesCustomTemplate(project) && (
              <p
                className="faint"
                style={{ fontSize: 11, marginBottom: 8, color: "var(--warning, #b4690e)" }}
              >
                Estas usando una plantilla personalizada. Si la duplicaste antes de esta version,
                el PDF puede no reflejar el orden de los bloques: usa una plantilla incluida (desde
                Plantillas) o actualiza tu copia.
              </p>
            )}
            {blockMode ? (
              <>
                {project.layout.map((b, i) => (
                  <BlockRow
                    key={`${b.kind}-${b.kind === "section" ? cfgStr(b, "key") : i}`}
                    block={b}
                    section={b.kind === "section" ? sectionByKey(cfgStr(b, "key")) : undefined}
                    findingsCount={findings.length}
                    selected={selection.kind === "block" && selection.index === i}
                    dragging={dragIdx === i}
                    onDragStart={() => setDragIdx(i)}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== i) reorderBlocks(dragIdx, i);
                      setDragIdx(null);
                    }}
                    onSelect={() => setSelection({ kind: "block", index: i })}
                    onToggle={() => toggleBlock(i)}
                  />
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
            {selection.kind === "data" ? (
              <ProjectDataForm
                project={project}
                patch={patch}
                scopeInput={scopeInput}
                setScopeInput={setScopeInput}
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
            <div className="report-preview">
              <LivePreview projectId={projectId} refreshKey={refreshKey} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function BlockRow({
  block,
  section,
  findingsCount,
  selected,
  dragging,
  onDragStart,
  onDrop,
  onSelect,
  onToggle,
}: {
  block: ReportBlock;
  section: { title: string; enabled: boolean } | undefined;
  findingsCount: number;
  selected: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
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
      className={`row ${selected ? "on" : ""} ${dragging ? "dragging" : ""}`}
      style={{ cursor: "pointer", opacity: enabled ? 1 : 0.5 }}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
    >
      <i className="ti ti-grip-vertical grip" />
      <i className={`ti ${meta.icon}`} style={{ color: "var(--text-muted)" }} />
      {label}
      {block.kind === "findings" && (
        <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
          {findingsCount}
        </span>
      )}
      <button
        className={`toggle ${enabled ? "" : "off"}`}
        title={enabled ? "Visible en el PDF" : "Oculto"}
        style={{ marginLeft: "auto" }}
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
          sourceFirst
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
        Este bloque es automatico: no se edita aca. Podes reordenarlo u ocultarlo desde la lista
        de la izquierda.
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
            placeholder="https://app.acme.com"
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
        sourceFirst
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
