// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { ExportTarget } from "../lib/types";
import { useToast } from "../components/Toast";
import { LivePreview } from "../components/LivePreview";
import { Modal } from "../components/Modal";
import { ProjectContinuity } from "../components/ProjectContinuity";
import { createExportFlow, errorMessage, type ExportState } from "../lib/exportFlow";
import { flushWrites } from "../lib/pendingWrites";

interface Props {
  projectId: string | null;
  workspacePath: string | null;
  onIdentityPrepared: () => Promise<void>;
  onCopyCreated: (id: string) => Promise<void>;
  onPickProject: () => void;
}

type TokenStatus = { kind: "loading" | "present" | "absent" } | { kind: "error"; message: string };

// Columnas del CSV de resumen (en el orden en que salen). El usuario elige
// cuales incluir; "nuevo" sirve sobre todo para retest. El mismo vocabulario de
// campos se reutiliza para la exportacion a API (esquema estable). Los campos
// de negocio (modulo en adelante) son opcionales: no estan en los defaults, asi
// los destinos existentes reciben el mismo payload.
const CSV_COLUMNS: { key: string; label: string }[] = [
  { key: "numero", label: "#" },
  { key: "titulo", label: "Titulo" },
  { key: "severidad", label: "Severidad" },
  { key: "cvss", label: "CVSS" },
  { key: "cvss_vector", label: "Vector CVSS" },
  { key: "cvss_version", label: "Version CVSS" },
  { key: "cwe", label: "CWE" },
  { key: "estado", label: "Estado" },
  { key: "afectados", label: "Afectados" },
  { key: "nuevo", label: "Nuevo (retest)" },
  { key: "modulo", label: "Modulo" },
  { key: "impacto_negocio", label: "Impacto al negocio" },
  { key: "categoria_riesgo", label: "Categoria de riesgo" },
  { key: "causa_raiz", label: "Causa raiz" },
];
const CSV_DEFAULT = new Set(["numero", "titulo", "severidad", "cvss", "estado", "afectados"]);
// Campos por default de un destino de API nuevo (metadata util para KPIs).
const API_DEFAULT_FIELDS = [
  "titulo",
  "severidad",
  "cvss",
  "cvss_vector",
  "cwe",
  "estado",
  "afectados",
];

// Datos opcionales del proyecto que un destino puede activar (bloque
// `project`). Apagados por default: un receptor podria rechazar claves nuevas.
const API_PROJECT_FIELDS: { key: string; label: string }[] = [
  { key: "environment", label: "Ambiente (environment)" },
  { key: "exposure", label: "Exposicion (exposure)" },
  { key: "external_reference", label: "Referencia compartida (solo perfil v2)" },
];

/** Destino nuevo vacio, listo para editar. */
function emptyTarget(): ExportTarget {
  return {
    profile: "legacy",
    name: "",
    url: "https://",
    fields: [...API_DEFAULT_FIELDS],
    include_summary: true,
    project_fields: [],
  };
}

export function PdfPreview({
  projectId,
  workspacePath,
  onIdentityPrepared,
  onCopyCreated,
  onPickProject,
}: Readonly<Props>) {
  const { guard, notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [execPath, setExecPath] = useState<string | null>(null);
  const [alsoExec, setAlsoExec] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [cols, setCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CSV_COLUMNS.map((c) => [c.key, CSV_DEFAULT.has(c.key)])),
  );
  const [csvPath, setCsvPath] = useState<string | null>(null);

  // Exportacion a API externa (opt-in).
  const [targets, setTargets] = useState<ExportTarget[]>([]);
  const [apiOpen, setApiOpen] = useState(false);
  const [selName, setSelName] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const [reviewTick, setReviewTick] = useState(0);
  const [continuityOpen, setContinuityOpen] = useState(false);
  const flow = useMemo(
    () =>
      createExportFlow(
        {
          flush: flushWrites,
          prepare: api.previewExportPayload,
          hasToken: api.hasExportToken,
          send: api.sendExportToApi,
        },
        setExportState,
      ),
    [],
  );
  // Modal de configuracion (crear/editar). `editing` es la copia de trabajo;
  // `isNew` distingue crear de editar (el nombre es la clave, no se renombra).
  const [editing, setEditing] = useState<ExportTarget | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [editTokenStatus, setEditTokenStatus] = useState<TokenStatus>({ kind: "absent" });
  const tokenTarget = !isNew ? editing?.name : undefined;

  useEffect(() => {
    let active = true;
    if (tokenTarget === undefined) {
      setEditTokenStatus({ kind: "absent" });
    } else {
      setEditTokenStatus({ kind: "loading" });
      void api.hasExportToken(tokenTarget).then(
        (present) => {
          if (active) setEditTokenStatus({ kind: present ? "present" : "absent" });
        },
        (error_: unknown) => {
          if (active) setEditTokenStatus({ kind: "error", message: errorMessage(error_) });
        },
      );
    }
    return () => {
      active = false;
    };
  }, [tokenTarget]);

  const loadTargets = useCallback(async () => {
    const list = await guard(api.listExportTargets());
    if (list) setTargets(list);
  }, [guard]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const selTarget = targets.find((t) => t.name === selName) ?? null;
  const contextKey = JSON.stringify([workspacePath, projectId, selTarget]);
  const currentExport =
    exportState.kind !== "idle" && exportState.context.key === contextKey ? exportState : null;

  // Al abrir el modal o cambiar de destino, cargar la vista previa exacta del
  // JSON y si el destino tiene token. Asi el usuario ve QUE sale antes de enviar.
  // Depende de `targets` para refrescarla tras editar el destino seleccionado.
  useEffect(() => {
    flow.invalidate();
    if (apiOpen && projectId && selName && !editing) {
      void flow.prepare({ key: contextKey, projectId, targetName: selName });
    }
    return () => flow.invalidate();
  }, [flow, apiOpen, projectId, selName, contextKey, editing, reviewTick]);

  async function handleExport() {
    if (!projectId) return;
    const paths = await guard(api.generatePdf(projectId, alsoExec), "PDF exportado");
    if (paths) {
      setPdfPath(paths[0] ?? null);
      setExecPath(paths[1] ?? null);
    }
  }

  const selectedCols = CSV_COLUMNS.filter((c) => cols[c.key]).map((c) => c.key);

  async function handleExportCsv() {
    if (!projectId || selectedCols.length === 0) return;
    const path = await guard(api.exportCsv(projectId, selectedCols), "CSV exportado");
    if (path) {
      setCsvPath(path);
      setCsvOpen(false);
    }
  }

  function openApi() {
    setSelName((prev) => prev ?? targets[0]?.name ?? null);
    setApiOpen(true);
  }

  function openConfig(target: ExportTarget | null) {
    const t = target ?? emptyTarget();
    setEditing({ ...t, fields: [...t.fields], project_fields: [...t.project_fields] });
    setIsNew(target === null);
    setEditToken("");
  }

  async function handleSaveTarget() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      notify("El destino necesita un nombre.", "error");
      return;
    }
    if (!editing.url.trim().toLowerCase().startsWith("https://")) {
      notify("El destino debe usar https://", "error");
      return;
    }
    // Control de flujo propio: guard() no distingue exito de error en promesas
    // void (ambos resuelven a undefined), y no queremos cerrar el modal si falla.
    try {
      await api.saveExportTarget({ ...editing, name });
      if (editToken.trim()) {
        await api.setExportToken(name, editToken.trim());
      }
      notify("Destino guardado", "ok");
      await loadTargets();
      setSelName(name);
      setEditing(null);
    } catch (e) {
      notify(String(e), "error");
    }
  }

  async function handleDeleteTarget() {
    if (!editing || isNew) return;
    try {
      await api.deleteExportTarget(editing.name);
      notify("Destino eliminado", "ok");
      await loadTargets();
      setSelName(null);
      setEditing(null);
    } catch (e) {
      notify(String(e), "error");
    }
  }

  async function handleSend() {
    const res = await flow.send(contextKey);
    if (!res) return;
    if (res.ok) {
      notify(`Enviado. La API respondio ${res.status}.`);
      setApiOpen(false);
    }
  }

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para previsualizar su PDF.
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
          <h1>Vista previa PDF</h1>
          <p className="sub">Se regenera con el contenido actual del proyecto.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setContinuityOpen(true)}>
            Continuidad y copias
          </button>
          <label className="row" style={{ gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={alsoExec}
              onChange={(e) => setAlsoExec(e.target.checked)}
            />
            <span>Tambien informe ejecutivo</span>
          </label>
          <button className="btn" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            <i className={`ti ${loading ? "ti-loader-2" : "ti-refresh"}`} aria-hidden="true" />{" "}
            <span>{loading ? "Generando..." : "Actualizar"}</span>
          </button>
          <button className="btn primary" onClick={handleExport}>
            <i className="ti ti-download" aria-hidden="true" /> <span>Exportar PDF</span>
          </button>
          <button className="btn" onClick={() => setCsvOpen(true)}>
            <i className="ti ti-table-export" aria-hidden="true" /> <span>Exportar CSV</span>
          </button>
          <button className="btn" onClick={openApi}>
            <i className="ti ti-cloud-upload" aria-hidden="true" /> <span>Enviar a API</span>
          </button>
          {csvPath && (
            <button className="btn" onClick={() => guard(api.openPath(csvPath))}>
              <i className="ti ti-file-spreadsheet" aria-hidden="true" /> <span>Abrir CSV</span>
            </button>
          )}
          {pdfPath && (
            <>
              <button className="btn" onClick={() => guard(api.openPath(pdfPath))}>
                <i className="ti ti-file-type-pdf" aria-hidden="true" /> <span>Abrir PDF</span>
              </button>
              <button className="btn" onClick={() => guard(api.revealPath(pdfPath))}>
                <i className="ti ti-folder-open" aria-hidden="true" /> <span>Abrir carpeta</span>
              </button>
            </>
          )}
          {execPath && (
            <button className="btn" onClick={() => guard(api.openPath(execPath))}>
              <i className="ti ti-presentation" aria-hidden="true" /> <span>Abrir ejecutivo</span>
            </button>
          )}
        </div>
      </div>

      <div className="view" style={{ paddingTop: 12 }}>
        <LivePreview projectId={projectId} refreshKey={refreshKey} onLoadingChange={setLoading} />
      </div>

      {csvOpen && (
        <CsvDialog
          cols={cols}
          onChange={(key, checked) => setCols((prev) => ({ ...prev, [key]: checked }))}
          onClose={() => setCsvOpen(false)}
          onExport={handleExportCsv}
          canExport={selectedCols.length > 0}
        />
      )}
      {apiOpen && (
        <ApiExportDialog
          targets={targets}
          selName={selName}
          selTarget={selTarget}
          currentExport={currentExport}
          editing={editing !== null}
          onClose={() => setApiOpen(false)}
          onConfig={openConfig}
          onSelect={setSelName}
          onSend={handleSend}
          onReview={() => setReviewTick((value) => value + 1)}
        />
      )}
      {editing && (
        <ExportTargetDialog
          editing={editing}
          isNew={isNew}
          onChange={setEditing}
          editToken={editToken}
          onTokenChange={setEditToken}
          editTokenStatus={editTokenStatus}
          onClose={() => setEditing(null)}
          onDelete={handleDeleteTarget}
          onSave={handleSaveTarget}
        />
      )}
      {continuityOpen && (
        <ProjectContinuity
          projectId={projectId}
          onClose={() => setContinuityOpen(false)}
          onPrepared={async () => {
            await onIdentityPrepared();
            setReviewTick((value) => value + 1);
          }}
          onCopied={onCopyCreated}
        />
      )}
    </>
  );
}

function CsvDialog({
  cols,
  onChange,
  onClose,
  onExport,
  canExport,
}: Readonly<{
  cols: Record<string, boolean>;
  onChange: (key: string, checked: boolean) => void;
  onClose: () => void;
  onExport: () => Promise<void>;
  canExport: boolean;
}>) {
  return (
    <Modal
      title="Exportar CSV de resumen"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={onExport} disabled={!canExport}>
            Exportar
          </button>
        </>
      }
    >
      <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>
        Tabla de hallazgos sin el detalle (cuerpo/PoC). Elegi las columnas. Los hallazgos ocultos no
        se incluyen.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {CSV_COLUMNS.map((c) => (
          <label key={c.key} className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={cols[c.key]}
              onChange={(e) => onChange(c.key, e.target.checked)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function ApiExportDialog({
  targets,
  selName,
  selTarget,
  currentExport,
  editing,
  onClose,
  onConfig,
  onSelect,
  onSend,
  onReview,
}: Readonly<{
  targets: ExportTarget[];
  selName: string | null;
  selTarget: ExportTarget | null;
  currentExport: ExportState | null;
  editing: boolean;
  onClose: () => void;
  onConfig: (target: ExportTarget | null) => void;
  onSelect: (name: string) => void;
  onSend: () => Promise<void>;
  onReview: () => void;
}>) {
  const sending = currentExport?.kind === "sending";
  const ready = currentExport?.kind === "ready" ? currentExport : null;
  const reviewed =
    currentExport?.kind === "ready" || currentExport?.kind === "sending"
      ? currentExport.prepared
      : null;
  return (
    <Modal
      title="Enviar a API"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" onClick={() => onConfig(null)}>
            <i className="ti ti-plus" aria-hidden="true" /> <span>Nuevo destino</span>
          </button>
          {selTarget && (
            <button className="btn" onClick={() => onConfig(selTarget)}>
              <i className="ti ti-pencil" aria-hidden="true" /> <span>Editar</span>
            </button>
          )}
          <button
            className="btn primary"
            onClick={onSend}
            disabled={!ready?.hasToken || sending || editing}
          >
            <i className={`ti ${sending ? "ti-loader-2" : "ti-cloud-upload"}`} aria-hidden="true" />{" "}
            <span>{sending ? "Enviando..." : "Enviar"}</span>
          </button>
        </>
      }
    >
      {targets.length === 0 ? (
        <div className="empty" style={{ padding: 16 }}>
          No hay destinos configurados.
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn primary" onClick={() => onConfig(null)}>
              <i className="ti ti-plus" aria-hidden="true" /> <span>Configurar destino</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label htmlFor="export-target">Destino</label>
            <select
              id="export-target"
              className="select"
              disabled={sending}
              value={selName ?? ""}
              onChange={(e) => onSelect(e.target.value)}
            >
              {targets.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.url})
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              background: "var(--accent-bg)",
              border: "0.5px solid var(--border)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              gap: 8,
            }}
          >
            <i className="ti ti-alert-triangle" style={{ color: "var(--sev-medium)" }} />
            <span>
              Estos datos <strong>salen del equipo</strong> hacia{" "}
              {reviewed?.destination_url ?? selTarget?.url}. Revisa abajo exactamente que se envia
              antes de confirmar. El cuerpo y la PoC de los hallazgos nunca se incluyen por este
              canal.
            </span>
          </div>

          <p className="sub">
            Perfil:{" "}
            {(reviewed?.profile ?? selTarget?.profile) === "identified_v2"
              ? "Integración con trazabilidad (v2)"
              : "Legacy"}
          </p>
          {ready && !ready.hasToken && (
            <p className="faint" style={{ fontSize: 12, margin: 0, color: "var(--sev-high)" }}>
              Falta el token de este destino. Usa "Editar" para agregarlo.
            </p>
          )}

          {currentExport?.kind === "error" && (
            <div role="alert">
              <p>{currentExport.message}</p>
              <button className="btn" onClick={onReview}>
                Revisar nueva vista previa
              </button>
            </div>
          )}

          <div className="field">
            <h3 className="field-label" id="export-json-heading">
              Vista previa del JSON
            </h3>
            <pre
              aria-labelledby="export-json-heading"
              style={{
                margin: 0,
                maxHeight: 260,
                overflow: "auto",
                background: "var(--bg-elevated)",
                border: "0.5px solid var(--border)",
                borderRadius: 6,
                padding: 10,
                fontSize: 11.5,
                fontFamily: "var(--mono)",
                color: "var(--text-primary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {reviewed?.payload ??
                (currentExport?.kind === "error"
                  ? "No hay un envio preparado."
                  : "Preparando datos guardados...")}
            </pre>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ExportTargetDialog({
  editing,
  isNew,
  onChange,
  editToken,
  onTokenChange,
  editTokenStatus,
  onClose,
  onDelete,
  onSave,
}: Readonly<{
  editing: ExportTarget;
  isNew: boolean;
  onChange: (target: ExportTarget) => void;
  editToken: string;
  onTokenChange: (token: string) => void;
  editTokenStatus: TokenStatus;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onSave: () => Promise<void>;
}>) {
  const editHasToken = editTokenStatus.kind === "present";
  return (
    <Modal
      title={isNew ? "Nuevo destino de exportacion" : "Editar destino"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          {!isNew && (
            <button className="btn danger" onClick={onDelete}>
              <i className="ti ti-trash" aria-hidden="true" /> <span>Eliminar</span>
            </button>
          )}
          <button className="btn primary" onClick={onSave}>
            Guardar
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label htmlFor="export-profile">Perfil del receptor</label>
          <select
            id="export-profile"
            className="select"
            value={editing.profile}
            onChange={(event) => {
              const profile = event.target.value;
              if (profile === "legacy" || profile === "identified_v2")
                onChange({ ...editing, profile });
            }}
          >
            <option value="legacy">Legacy (compatible con destinos anteriores)</option>
            <option value="identified_v2">Integración con trazabilidad (v2)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="export-name">Nombre</label>
          <input
            id="export-name"
            className="input"
            value={editing.name}
            disabled={!isNew}
            placeholder="ej. bughunter"
            onChange={(e) => onChange({ ...editing, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="export-url">URL (https)</label>
          <input
            id="export-url"
            className="input"
            value={editing.url}
            placeholder="https://api-gateway.bughunter.cl/api/import/data/pudureport/"
            onChange={(e) => onChange({ ...editing, url: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="export-token">
            Token {editHasToken && !editToken ? "(guardado; dejar vacio para conservar)" : ""}
          </label>
          <input
            id="export-token"
            className="input"
            type="password"
            value={editToken}
            placeholder={editHasToken ? "********" : "pegar token"}
            onChange={(e) => onTokenChange(e.target.value)}
          />
          {editTokenStatus.kind === "loading" && (
            <p>
              <output>Consultando keychain...</output>
            </p>
          )}
          {editTokenStatus.kind === "error" && (
            <p role="alert">No se pudo consultar el token: {editTokenStatus.message}</p>
          )}
        </div>
        <fieldset className="field field-group">
          <legend>Campos a enviar (esquema estable)</legend>
          <p className="faint" style={{ fontSize: 12, margin: "2px 0 0" }}>
            Modulo, impacto al negocio, categoria de riesgo y causa raiz son opcionales: activalos
            solo si el receptor los soporta.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {CSV_COLUMNS.map((c) => (
              <label key={c.key} className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={editing.fields.includes(c.key)}
                  onChange={(e) =>
                    onChange({
                      ...editing,
                      fields: e.target.checked
                        ? [...editing.fields, c.key]
                        : editing.fields.filter((f) => f !== c.key),
                    })
                  }
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={editing.include_summary}
            onChange={(e) => onChange({ ...editing, include_summary: e.target.checked })}
          />
          <span>Incluir conteos por severidad (summary)</span>
        </label>
        <fieldset className="field field-group">
          <legend>Datos del proyecto (opcionales)</legend>
          <p className="faint" style={{ fontSize: 12, margin: "2px 0 0" }}>
            Activalos solo si el receptor los soporta. Se envian si el proyecto los tiene definidos.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {API_PROJECT_FIELDS.map((c) => (
              <label key={c.key} className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={editing.project_fields.includes(c.key)}
                  onChange={(e) =>
                    onChange({
                      ...editing,
                      project_fields: e.target.checked
                        ? [...editing.project_fields, c.key]
                        : editing.project_fields.filter((f) => f !== c.key),
                    })
                  }
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
