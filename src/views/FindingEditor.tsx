import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type {
  CvssResult,
  CvssVersion,
  Finding,
  FindingMeta,
  FindingStatus,
  Severity,
} from "../lib/types";
import { FINDING_SECTIONS, joinSections, parseSections } from "../lib/sections";
import { SEVERITY_COLOR, SEVERITY_LABEL } from "../lib/severity";
import { Sidebar } from "../components/Sidebar";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { CvssCalculator } from "../components/CvssCalculator";
import { useToast } from "../components/Toast";

const STATUS_OPTIONS: { value: FindingStatus; label: string }[] = [
  { value: "open", label: "Abierto" },
  { value: "fixed", label: "Corregido" },
  { value: "accepted", label: "Aceptado" },
  { value: "wontfix", label: "No se corregira" },
];

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "critical", label: "Critica" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
  { value: "info", label: "Informativa" },
];

interface Props {
  projectId: string | null;
  /** Directorio absoluto del proyecto, para adjuntar evidencias. */
  assetBase?: string | null;
  /** Perfil de certificacion del workspace ("oscp" activa el modo examen). */
  examProfile?: string;
  onGoToPreview: () => void;
  onPickProject: () => void;
}

export function FindingEditor({
  projectId,
  assetBase,
  examProfile,
  onGoToPreview,
  onPickProject,
}: Props) {
  // En modo examen (OSCP) no se usa CVSS: la severidad es cualitativa y manual,
  // y se ocultan los campos CVSS/CWE.
  const examMode = examProfile === "oscp";
  const { guard, notify } = useToast();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Finding | null>(null);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [calcOpen, setCalcOpen] = useState(false);
  const [affectedInput, setAffectedInput] = useState("");

  const saveTimer = useRef<number | undefined>(undefined);
  const metaRef = useRef<FindingMeta | null>(null);
  const sectionsRef = useRef<Record<string, string>>({});

  const loadFindings = useCallback(async () => {
    if (!projectId) return;
    const list = await guard(api.listFindings(projectId));
    if (list) {
      setFindings(list);
      setActiveId((prev) => prev ?? (list.length > 0 ? list[0].id : null));
    }
  }, [guard, projectId]);

  useEffect(() => {
    setActiveId(null);
    setCurrent(null);
    loadFindings();
  }, [loadFindings]);

  useEffect(() => {
    const found = findings.find((f) => f.id === activeId) ?? null;
    setCurrent(found);
    if (found) {
      metaRef.current = found.meta;
      const parsed = parseSections(found.body);
      sectionsRef.current = parsed;
      setSections(parsed);
    }
  }, [activeId, findings]);

  const scheduleSave = useCallback(
    (id: string) => {
      if (!projectId) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const meta = metaRef.current;
        if (!meta) return;
        const finding: Finding = { id, meta, body: joinSections(sectionsRef.current) };
        const saved = await guard(api.saveFinding(projectId, finding));
        if (saved) setFindings((list) => list.map((f) => (f.id === saved.id ? saved : f)));
      }, 600);
    },
    [guard, projectId],
  );

  function patchMeta(updater: (m: FindingMeta) => FindingMeta) {
    setCurrent((prev) => {
      if (!prev) return prev;
      const meta = updater(prev.meta);
      metaRef.current = meta;
      scheduleSave(prev.id);
      return { ...prev, meta };
    });
  }

  function setSection(key: string, value: string) {
    if (!current) return;
    const next = { ...sectionsRef.current, [key]: value };
    sectionsRef.current = next;
    setSections(next);
    scheduleSave(current.id);
  }

  async function handleCreate(title: string) {
    if (!projectId) return;
    const created = await guard(api.createFinding(projectId, title));
    if (created) {
      setFindings((list) => [...list, created]);
      setActiveId(created.id);
    }
  }

  async function handleDelete() {
    if (!current || !projectId) return;
    if (!window.confirm(`Eliminar el hallazgo "${current.meta.title}"?`)) return;
    const done = await guard(api.deleteFinding(projectId, current.id), "Hallazgo eliminado");
    if (done !== undefined) {
      setActiveId(null);
      await loadFindings();
    }
  }

  async function handleReorder(orderedIds: string[]) {
    if (!projectId) return;
    const reordered = orderedIds
      .map((id) => findings.find((f) => f.id === id))
      .filter((f): f is Finding => Boolean(f));
    setFindings(reordered);
    await guard(api.reorderFindings(projectId, orderedIds));
  }

  async function handleExport() {
    if (!projectId) return;
    const path = await guard(api.generatePdf(projectId), "PDF generado");
    if (path) onGoToPreview();
  }

  function applyCvss(result: CvssResult) {
    const version: CvssVersion = result.vector.startsWith("CVSS:4.0") ? "4.0" : "3.1";
    patchMeta((m) => ({
      ...m,
      cvss: result.score.toFixed(1),
      cvss_vector: result.vector,
      cvss_version: version,
      severity: result.severity,
    }));
    setCalcOpen(false);
    notify(`CVSS ${result.score.toFixed(1)} (${result.severity})`, "ok");
  }

  function addAffected() {
    const value = affectedInput.trim();
    if (!value) return;
    patchMeta((m) => ({ ...m, affected: [...m.affected, value] }));
    setAffectedInput("");
  }

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para editar sus hallazgos.
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

  return (
    <div className="main">
      <Sidebar
        findings={findings}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onReorder={handleReorder}
      />
      {current ? (
        <div className="editor">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 14, alignItems: "flex-start" }}
          >
            <input
              className="title-input"
              value={current.meta.title}
              placeholder="Titulo del hallazgo"
              onChange={(e) => patchMeta((m) => ({ ...m, title: e.target.value }))}
            />
            <button className="btn primary" onClick={handleExport}>
              <i className="ti ti-download" />
              Exportar PDF
            </button>
          </div>

          <div className="fieldrow">
            <div>
              <label className="field-label-top">severidad</label>
              {examMode ? (
                <select
                  className="select"
                  style={{ width: "100%" }}
                  value={current.meta.severity}
                  onChange={(e) =>
                    patchMeta((m) => ({ ...m, severity: e.target.value as Severity }))
                  }
                >
                  {SEVERITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  className="sev-field"
                  style={{ background: SEVERITY_COLOR[current.meta.severity] }}
                >
                  {SEVERITY_LABEL[current.meta.severity]}
                  <i className="ti ti-lock" style={{ fontSize: 13 }} />
                </div>
              )}
            </div>
            {!examMode && (
              <div>
                <label className="field-label-top">CVSS {current.meta.cvss_version}</label>
                <div className="field cvss-field" onClick={() => setCalcOpen(true)}>
                  {current.meta.cvss || "—"}
                  <i className="ti ti-calculator" style={{ color: "var(--accent)" }} />
                </div>
              </div>
            )}
            <div>
              <label className="field-label-top">estado</label>
              <select
                className="select"
                style={{ width: "100%" }}
                value={current.meta.status}
                onChange={(e) =>
                  patchMeta((m) => ({ ...m, status: e.target.value as FindingStatus }))
                }
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {!examMode && (
              <div>
                <label className="field-label-top">CWE</label>
                <input
                  className="input"
                  style={{ width: "100%" }}
                  placeholder="CWE-89"
                  value={current.meta.cwe}
                  onChange={(e) => patchMeta((m) => ({ ...m, cwe: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>Activos afectados</label>
            <div className="tag-list" style={{ marginBottom: 6 }}>
              {current.meta.affected.map((a, i) => (
                <span className="tag" key={`${a}-${i}`}>
                  {a}
                  <button
                    onClick={() =>
                      patchMeta((m) => ({
                        ...m,
                        affected: m.affected.filter((_, idx) => idx !== i),
                      }))
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
                placeholder="https://app.acme.com/login"
                value={affectedInput}
                onChange={(e) => setAffectedInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAffected()}
                style={{ flex: 1 }}
              />
              <button className="btn small" onClick={addAffected}>
                Agregar
              </button>
            </div>
          </div>

          <div className="section-grid">
            {FINDING_SECTIONS.map((s) => (
              <div className={`field ${s.full ? "full" : ""}`} key={s.key}>
                <label>{s.title}</label>
                <MarkdownEditor
                  key={`${current.id}-${s.key}`}
                  value={sections[s.key] ?? ""}
                  onChange={(md) => setSection(s.key, md)}
                  placeholder={
                    s.key === "poc"
                      ? "Paso a paso con evidencia. Pega o arrastra capturas aqui."
                      : `${s.title}...`
                  }
                  assetBase={assetBase}
                  projectId={projectId}
                />
              </div>
            ))}
          </div>

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn danger" onClick={handleDelete}>
              <i className="ti ti-trash" />
              Eliminar hallazgo
            </button>
          </div>
        </div>
      ) : (
        <div className="editor">
          <div className="empty">Selecciona o crea un hallazgo para empezar.</div>
        </div>
      )}

      {calcOpen && current && (
        <CvssCalculator
          version={current.meta.cvss_version}
          initialVector={current.meta.cvss_vector}
          onApply={applyCvss}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </div>
  );
}
