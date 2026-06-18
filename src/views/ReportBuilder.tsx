import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { Finding, ProjectMeta, Severity, WorkspaceMeta } from "../lib/types";
import { SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_COLOR } from "../lib/severity";
import { typeInfo } from "../lib/projectTypes";
import { MarkdownEditor } from "../components/MarkdownEditor";
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

interface Props {
  workspace: WorkspaceMeta;
  projectId: string | null;
  assetBase?: string | null;
  onWorkspaceSaved: (meta: WorkspaceMeta) => void;
  onGoToPreview: () => void;
  onPickProject: () => void;
}

type Selection = { kind: "data" } | { kind: "section"; index: number };

export function ReportBuilder({ projectId, assetBase, onGoToPreview, onPickProject }: Props) {
  const { guard } = useToast();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "data" });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [scopeInput, setScopeInput] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    guard(api.loadProject(projectId)).then((p) => p && setProject(p));
    guard(api.listFindings(projectId)).then((f) => f && setFindings(f));
  }, [guard, projectId]);

  const persist = useCallback(
    (meta: ProjectMeta) => {
      if (!projectId) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => guard(api.saveProject(projectId, meta)), 500);
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

  async function handleExport() {
    if (!projectId) return;
    const paths = await guard(api.generatePdf(projectId), "PDF generado");
    if (paths) onGoToPreview();
  }

  function reorderSections(from: number, to: number) {
    patch((p) => {
      const sections = [...p.sections];
      const [moved] = sections.splice(from, 1);
      sections.splice(to, 0, moved);
      return { ...p, sections };
    });
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
        <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0,1fr)", gap: 18 }}>
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
            <div className="row on">
              <i className="ti ti-photo" style={{ color: "var(--text-muted)" }} />
              Portada
              <span className="faint" style={{ marginLeft: "auto", fontSize: 11 }}>
                fija
              </span>
            </div>
            {project.sections.map((s, i) => (
              <div
                key={s.key}
                className={`row ${selection.kind === "section" && selection.index === i ? "on" : ""} ${
                  dragIdx === i ? "dragging" : ""
                }`}
                style={{ cursor: "pointer", opacity: s.enabled ? 1 : 0.5 }}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== i) reorderSections(dragIdx, i);
                  setDragIdx(null);
                }}
                onClick={() => setSelection({ kind: "section", index: i })}
              >
                <i className="ti ti-grip-vertical grip" />
                {s.title}
                <button
                  className={`toggle ${s.enabled ? "" : "off"}`}
                  title={s.enabled ? "Visible en el PDF" : "Oculta"}
                  onClick={(e) => {
                    e.stopPropagation();
                    patch((p) => ({
                      ...p,
                      sections: p.sections.map((x, idx) =>
                        idx === i ? { ...x, enabled: !x.enabled } : x,
                      ),
                    }));
                  }}
                >
                  <i className={`ti ${s.enabled ? "ti-eye" : "ti-eye-off"}`} />
                </button>
              </div>
            ))}
            <div className="row">
              <i className="ti ti-bug" style={{ color: "var(--text-muted)" }} />
              Hallazgos
              <span className="faint" style={{ marginLeft: "auto" }}>
                {findings.length}
              </span>
            </div>
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
            ) : (
              <SectionEditor
                key={project.sections[selection.index]?.key ?? selection.index}
                title={project.sections[selection.index]?.title ?? ""}
                sectionKey={project.sections[selection.index]?.key ?? ""}
                body={project.sections[selection.index]?.body ?? ""}
                counts={counts}
                assetBase={assetBase}
                projectId={projectId}
                onChange={(md) =>
                  patch((p) => ({
                    ...p,
                    sections: p.sections.map((x, idx) =>
                      idx === selection.index ? { ...x, body: md } : x,
                    ),
                  }))
                }
              />
            )}
          </div>
        </div>
      </div>
    </>
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
