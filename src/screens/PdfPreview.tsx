import { useState } from "react";
import * as api from "../lib/api";
import { useToast } from "../components/Toast";
import { LivePreview } from "../components/LivePreview";

interface Props {
  projectId: string | null;
  onPickProject: () => void;
}

export function PdfPreview({ projectId, onPickProject }: Props) {
  const { guard } = useToast();
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [execPath, setExecPath] = useState<string | null>(null);
  const [alsoExec, setAlsoExec] = useState(false);

  async function handleExport() {
    if (!projectId) return;
    const paths = await guard(api.generatePdf(projectId, alsoExec), "PDF exportado");
    if (paths) {
      setPdfPath(paths[0] ?? null);
      setExecPath(paths[1] ?? null);
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
    </>
  );
}
