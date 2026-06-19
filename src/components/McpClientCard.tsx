import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { McpClient, McpStatus } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";

interface Props {
  client: McpClient;
  /** Titulo de la tarjeta, ej "Conectar a Claude Desktop". */
  title: string;
  /** Texto del boton de instalar, ej "Instalar en Claude Desktop". */
  installLabel: string;
  /** Nota especifica del cliente (reiniciar, CLI, etc.). */
  note: string;
  /** Cambia para refrescar el estado al cambiar de workspace. */
  workspacePath: string | null;
}

const CONSENT =
  "Al conectar, el TEXTO de los hallazgos de este workspace queda accesible para tu cliente de " +
  "IA. Si el cliente usa un modelo en la nube, ese texto SALE del equipo. Para trabajo bajo NDA, " +
  "usa un modelo local (ej. Ollama). Las evidencias (imagenes y archivos) nunca se exponen. " +
  "Aceptas el riesgo y continuas?";

/** Tarjeta de integracion con un cliente MCP (Claude Desktop o Claude Code). */
export function McpClientCard({ client, title, installLabel, note, workspacePath }: Props) {
  const { guard } = useToast();
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const reload = useCallback(async () => {
    const status = await guard(api.mcpStatus(client));
    if (status !== undefined) setMcp(status);
  }, [guard, client]);

  useEffect(() => {
    void reload();
  }, [reload, workspacePath]);

  async function doInstall() {
    const done = await guard(api.mcpConnect(client), "Instalado en el cliente MCP");
    if (done !== undefined) reload();
  }
  async function doDisconnect() {
    const done = await guard(api.mcpDisconnect(client), "Desconectado del cliente MCP");
    if (done !== undefined) reload();
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <i className="ti ti-robot" style={{ color: "var(--accent)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{title}</strong>
          <p className="faint" style={{ fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}>
            Permite que tu cliente de IA lea y mejore el texto de los hallazgos de este workspace.
            No expone evidencias (imagenes ni archivos), solo texto. PuduReport no manda nada a
            ningun lado: el cliente lanza el servidor local por stdio.
          </p>
          <p className="faint" style={{ fontSize: 12, margin: "6px 0 0", lineHeight: 1.5 }}>
            {note}
          </p>

          {mcp?.config_path && (
            <div className="mono faint" style={{ fontSize: 11, marginTop: 8 }}>
              {mcp.config_path}
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {mcp && !mcp.binary_found && (
              <span className="faint" style={{ fontSize: 12 }}>
                Binario pudureport-mcp no encontrado junto a la app.
              </span>
            )}
            {mcp && mcp.binary_found && !mcp.cli_available && (
              <span className="faint" style={{ fontSize: 12 }}>
                No se encontro el CLI de Claude Code (claude).
              </span>
            )}
            {mcp && mcp.binary_found && mcp.cli_available && (
              <>
                {mcp.installed && mcp.points_to_current && (
                  <>
                    <span style={{ fontSize: 12, color: "var(--accent)" }}>
                      <i className="ti ti-circle-check" /> Instalado para este workspace
                    </span>
                    <button className="btn small" onClick={doDisconnect}>
                      Desconectar
                    </button>
                  </>
                )}
                {mcp.installed && !mcp.points_to_current && (
                  <>
                    <span className="faint" style={{ fontSize: 12 }}>
                      Instalado, pero apunta a otro workspace.
                    </span>
                    <button className="btn small primary" onClick={() => setConsentOpen(true)}>
                      Apuntar a este
                    </button>
                    <button className="btn small" onClick={doDisconnect}>
                      Desconectar
                    </button>
                  </>
                )}
                {!mcp.installed && (
                  <button className="btn small primary" onClick={() => setConsentOpen(true)}>
                    {installLabel}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {consentOpen && (
        <ConfirmDialog
          title="Conectar al cliente de IA"
          message={CONSENT}
          confirmLabel="Acepto el riesgo y conectar"
          danger={false}
          onConfirm={doInstall}
          onClose={() => setConsentOpen(false)}
        />
      )}
    </div>
  );
}
