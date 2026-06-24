import { useState } from "react";
import * as api from "../lib/api";
import { useToast } from "../components/Toast";
import { LivePreview } from "../components/LivePreview";
import { Modal } from "../components/Modal";

interface Props {
  projectId: string | null;
  onPickProject: () => void;
}

// Columnas del CSV de resumen (en el orden en que salen). El usuario elige
// cuales incluir; "nuevo" sirve sobre todo para retest.
const CSV_COLUMNS: { key: string; label: string }[] = [
  { key: "numero", label: "#" },
  { key: "titulo", label: "Titulo" },
  { key: "severidad", label: "Severidad" },
  { key: "cvss", label: "CVSS" },
  { key: "cwe", label: "CWE" },
  { key: "estado", label: "Estado" },
  { key: "afectados", label: "Afectados" },
  { key: "nuevo", label: "Nuevo (retest)" },
];
const CSV_DEFAULT = ["numero", "titulo", "severidad", "cvss", "estado", "afectados"];

export function PdfPreview({ projectId, onPickProject }: Props) {
  const { guard } = useToast();
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
          <button
            className="btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
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
        <LivePreview
          projectId={projectId}
          refreshKey={refreshKey}
          onLoadingChange={setLoading}
        />
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
            Tabla de hallazgos sin el detalle (cuerpo/PoC). Elegi las columnas. Los
            hallazgos ocultos no se incluyen.
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
    </>
  );
}
