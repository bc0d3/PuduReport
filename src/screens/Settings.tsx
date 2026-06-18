import { useRef, useState } from "react";
import * as api from "../lib/api";
import type { WorkspaceMeta } from "../lib/types";
import { PromptDialog } from "../components/PromptDialog";
import { useToast } from "../components/Toast";

interface Props {
  workspace: WorkspaceMeta;
  workspacePath: string | null;
  dark: boolean;
  onSetDark: (dark: boolean) => void;
  onWorkspaceSaved: (meta: WorkspaceMeta) => void;
}

export function Settings({ workspace, workspacePath, dark, onSetDark, onWorkspaceSaved }: Props) {
  const { guard } = useToast();
  const saveTimer = useRef<number | undefined>(undefined);
  const [commitOpen, setCommitOpen] = useState(false);

  function saveWorkspace(next: WorkspaceMeta) {
    onWorkspaceSaved(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => guard(api.saveWorkspaceMeta(next)), 400);
  }

  async function gitInit() {
    await guard(api.gitInit(), "Repositorio git inicializado");
  }
  async function doGitCommit(msg: string) {
    await guard(api.gitCommit(msg), "Commit creado");
  }

  return (
    <>
      <div className="screen-head">
        <div>
          <h1>Ajustes</h1>
          <p className="sub">Configuracion local. Nada se sincroniza.</p>
        </div>
      </div>

      <div className="view" style={{ paddingTop: 16, maxWidth: 620 }}>
        <div className="card">
          <span className="field-label-top">ubicacion del workspace</span>
          <div className="mono faint" style={{ fontSize: 12 }}>
            {workspacePath ?? "—"}
          </div>
        </div>

        <div className="card">
          <div className="row">
            <i className="ti ti-git-branch" style={{ color: "var(--accent)" }} />
            <div>
              <strong>Control de versiones (git)</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                Versiona tus reportes localmente. No hace push a ningun lado.
              </div>
            </div>
            <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
              <button className="btn small" onClick={gitInit}>
                Inicializar
              </button>
              <button className="btn small" onClick={() => setCommitOpen(true)}>
                Commit
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="row">
            <i className={`ti ${dark ? "ti-moon" : "ti-sun"}`} style={{ color: "var(--accent)" }} />
            <strong>Tema</strong>
            <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
              <button
                className={`btn small ${!dark ? "primary" : ""}`}
                onClick={() => onSetDark(false)}
              >
                Claro
              </button>
              <button
                className={`btn small ${dark ? "primary" : ""}`}
                onClick={() => onSetDark(true)}
              >
                Oscuro
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <span className="field-label-top">marca de agua por defecto</span>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={`toggle ${workspace.watermark.enabled ? "" : "off"}`}
              onClick={() =>
                saveWorkspace({
                  ...workspace,
                  watermark: { ...workspace.watermark, enabled: !workspace.watermark.enabled },
                })
              }
            >
              <i className={`ti ${workspace.watermark.enabled ? "ti-eye" : "ti-eye-off"}`} />
            </button>
            <input
              className="input mono"
              style={{ flex: 1 }}
              value={workspace.watermark.text}
              disabled={!workspace.watermark.enabled}
              onChange={(e) =>
                saveWorkspace({
                  ...workspace,
                  watermark: { ...workspace.watermark, text: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <i className="ti ti-info-circle" style={{ color: "var(--accent)" }} />
            <div>
              <strong>Acerca de PuduReport</strong>
              <p className="faint" style={{ fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}>
                Herramienta gratuita y de codigo abierto bajo licencia GPL-3.0, provista "tal cual"
                y sin garantia de ningun tipo. El usuario es el unico responsable del uso que le da
                a la herramienta, del contenido que ingresa y de los reportes que genera. Pensada
                para documentar pruebas de seguridad autorizadas; los autores no se responsabilizan
                por danos ni uso indebido.
              </p>
            </div>
          </div>
        </div>
      </div>

      {commitOpen && (
        <PromptDialog
          title="Commit"
          label="Mensaje del commit"
          placeholder="Actualiza reportes"
          initialValue="Actualiza reportes"
          confirmLabel="Crear commit"
          onConfirm={doGitCommit}
          onClose={() => setCommitOpen(false)}
        />
      )}
    </>
  );
}
