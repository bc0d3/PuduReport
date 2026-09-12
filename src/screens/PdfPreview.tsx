// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { ExportTarget } from "../lib/types";
import { useToast } from "../components/Toast";
import { LivePreview } from "../components/LivePreview";
import { Modal } from "../components/Modal";

interface Props {
  projectId: string | null;
  onPickProject: () => void;
}

// Columnas del CSV de resumen (en el orden en que salen). El usuario elige
// cuales incluir; "nuevo" sirve sobre todo para retest. El mismo vocabulario de
// campos se reutiliza para la exportacion a API (esquema estable).
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
];
const CSV_DEFAULT = ["numero", "titulo", "severidad", "cvss", "estado", "afectados"];
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

/** Destino nuevo vacio, listo para editar. */
function emptyTarget(): ExportTarget {
  return { name: "", url: "https://", fields: [...API_DEFAULT_FIELDS], include_summary: true };
}

export function PdfPreview({ projectId, onPickProject }: Props) {
  const { guard, notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [execPath, setExecPath] = useState<string | null>(null);
  const [alsoExec, setAlsoExec] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [cols, setCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CSV_COLUMNS.map((c) => [c.key, CSV_DEFAULT.includes(c.key)])),
  );
  const [csvPath, setCsvPath] = useState<string | null>(null);

  // Exportacion a API externa (opt-in).
  const [targets, setTargets] = useState<ExportTarget[]>([]);
  const [apiOpen, setApiOpen] = useState(false);
  const [selName, setSelName] = useState<string | null>(null);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [selHasToken, setSelHasToken] = useState(false);
  const [sending, setSending] = useState(false);
  // Modal de configuracion (crear/editar). `editing` es la copia de trabajo;
  // `isNew` distingue crear de editar (el nombre es la clave, no se renombra).
  const [editing, setEditing] = useState<ExportTarget | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [editHasToken, setEditHasToken] = useState(false);

  const loadTargets = useCallback(async () => {
    const list = await guard(api.listExportTargets());
    if (list) setTargets(list);
  }, [guard]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  const selTarget = targets.find((t) => t.name === selName) ?? null;

  // Al abrir el modal o cambiar de destino, cargar la vista previa exacta del
  // JSON y si el destino tiene token. Asi el usuario ve QUE sale antes de enviar.
  useEffect(() => {
    if (!apiOpen || !projectId || !selName) {
      setPreviewJson(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [payload, hasTok] = await Promise.all([
        api.previewExportPayload(projectId, selName).catch(() => null),
        api.hasExportToken(selName).catch(() => false),
      ]);
      if (cancelled) return;
      setPreviewJson(payload ? JSON.stringify(payload, null, 2) : null);
      setSelHasToken(hasTok);
    })();
    return () => {
      cancelled = true;
    };
  }, [apiOpen, projectId, selName]);

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
    setEditing({ ...t, fields: [...t.fields] });
    setIsNew(target === null);
    setEditToken("");
    setEditHasToken(false);
    if (target) {
      api
        .hasExportToken(target.name)
        .then(setEditHasToken)
        .catch(() => setEditHasToken(false));
    }
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
    if (!projectId || !selTarget) return;
    setSending(true);
    const res = await guard(api.sendExportToApi(projectId, selTarget.name));
    setSending(false);
    if (!res) return;
    if (res.ok) {
      notify(`Enviado. La API respondio ${res.status}.`);
      setApiOpen(false);
    } else {
      notify(`La API respondio ${res.status}. ${res.body.slice(0, 200)}`);
    }
  }

  if (!projectId) {
    return (
      <div className="center-screen">
        <div className="empty">
          Selecciona un proyecto para previsualizar su PDF.
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
    <>
      <div className="screen-head">
        <div>
          <h1>Vista previa PDF</h1>
          <p className="sub">Se regenera con el contenido actual del proyecto.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <label className="row" style={{ gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={alsoExec}
              onChange={(e) => setAlsoExec(e.target.checked)}
            />
            Tambien informe ejecutivo
          </label>
          <button className="btn" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            <i className={`ti ${loading ? "ti-loader-2" : "ti-refresh"}`} />
            {loading ? "Generando..." : "Actualizar"}
          </button>
          <button className="btn primary" onClick={handleExport}>
            <i className="ti ti-download" />
            Exportar PDF
          </button>
          <button className="btn" onClick={() => setCsvOpen(true)}>
            <i className="ti ti-table-export" />
            Exportar CSV
          </button>
          <button className="btn" onClick={openApi}>
            <i className="ti ti-cloud-upload" />
            Enviar a API
          </button>
          {csvPath && (
            <button className="btn" onClick={() => guard(api.openPath(csvPath))}>
              <i className="ti ti-file-spreadsheet" />
              Abrir CSV
            </button>
          )}
          {pdfPath && (
            <>
              <button className="btn" onClick={() => guard(api.openPath(pdfPath))}>
                <i className="ti ti-file-type-pdf" />
                Abrir PDF
              </button>
              <button className="btn" onClick={() => guard(api.revealPath(pdfPath))}>
                <i className="ti ti-folder-open" />
                Abrir carpeta
              </button>
            </>
          )}
          {execPath && (
            <button className="btn" onClick={() => guard(api.openPath(execPath))}>
              <i className="ti ti-presentation" />
              Abrir ejecutivo
            </button>
          )}
        </div>
      </div>

      <div className="view" style={{ paddingTop: 12 }}>
        <LivePreview projectId={projectId} refreshKey={refreshKey} onLoadingChange={setLoading} />
      </div>

      {csvOpen && (
        <Modal
          title="Exportar CSV de resumen"
          onClose={() => setCsvOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCsvOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn primary"
                onClick={handleExportCsv}
                disabled={selectedCols.length === 0}
              >
                Exportar
              </button>
            </>
          }
        >
          <p className="faint" style={{ fontSize: 12, marginTop: 0 }}>
            Tabla de hallazgos sin el detalle (cuerpo/PoC). Elegi las columnas. Los hallazgos
            ocultos no se incluyen.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CSV_COLUMNS.map((c) => (
              <label key={c.key} className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={cols[c.key]}
                  onChange={(e) => setCols((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {apiOpen && (
        <Modal
          title="Enviar a API"
          onClose={() => setApiOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setApiOpen(false)}>
                Cancelar
              </button>
              <button className="btn" onClick={() => openConfig(null)}>
                <i className="ti ti-plus" />
                Nuevo destino
              </button>
              {selTarget && (
                <button className="btn" onClick={() => openConfig(selTarget)}>
                  <i className="ti ti-pencil" />
                  Editar
                </button>
              )}
              <button
                className="btn primary"
                onClick={handleSend}
                disabled={!selTarget || !selHasToken || sending}
              >
                <i className={`ti ${sending ? "ti-loader-2" : "ti-cloud-upload"}`} />
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </>
          }
        >
          {targets.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>
              No hay destinos configurados.
              <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
                <button className="btn primary" onClick={() => openConfig(null)}>
                  <i className="ti ti-plus" />
                  Configurar destino
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label>Destino</label>
                <select
                  className="select"
                  value={selName ?? ""}
                  onChange={(e) => setSelName(e.target.value)}
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
                  Estos datos <strong>salen del equipo</strong> hacia {selTarget?.url}. Revisa abajo
                  exactamente que se envia antes de confirmar. El cuerpo y la PoC de los hallazgos
                  nunca se incluyen por este canal.
                </span>
              </div>

              {!selHasToken && (
                <p className="faint" style={{ fontSize: 12, margin: 0, color: "var(--sev-high)" }}>
                  Falta el token de este destino. Usa "Editar" para agregarlo.
                </p>
              )}

              <div className="field">
                <label>Vista previa del JSON</label>
                <pre
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
                  {previewJson ?? "Cargando..."}
                </pre>
              </div>
            </div>
          )}
        </Modal>
      )}

      {editing && (
        <Modal
          title={isNew ? "Nuevo destino de exportacion" : "Editar destino"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              {!isNew && (
                <button className="btn danger" onClick={handleDeleteTarget}>
                  <i className="ti ti-trash" />
                  Eliminar
                </button>
              )}
              <button className="btn primary" onClick={handleSaveTarget}>
                Guardar
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label>Nombre</label>
              <input
                className="input"
                value={editing.name}
                disabled={!isNew}
                placeholder="ej. bughunter"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>URL (https)</label>
              <input
                className="input"
                value={editing.url}
                placeholder="https://api-gateway.bughunter.cl/api/import/data/pudureport/"
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
              />
            </div>
            <div className="field">
              <label>
                Token {editHasToken && !editToken ? "(guardado; dejar vacio para conservar)" : ""}
              </label>
              <input
                className="input"
                type="password"
                value={editToken}
                placeholder={editHasToken ? "********" : "pegar token"}
                onChange={(e) => setEditToken(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Campos a enviar (esquema estable)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {CSV_COLUMNS.map((c) => (
                  <label key={c.key} className="row" style={{ gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editing.fields.includes(c.key)}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                fields: e.target.checked
                                  ? [...prev.fields, c.key]
                                  : prev.fields.filter((f) => f !== c.key),
                              }
                            : prev,
                        )
                      }
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editing.include_summary}
                onChange={(e) => setEditing({ ...editing, include_summary: e.target.checked })}
              />
              <span>Incluir conteos por severidad (summary)</span>
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
