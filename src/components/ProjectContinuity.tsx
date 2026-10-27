// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 bc0d3

import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import { errorMessage } from "../lib/exportFlow";
import { flushWrites } from "../lib/pendingWrites";
import type { IdentityStatus, ProjectCopyMode } from "../lib/types";
import { Modal } from "./Modal";

interface Props {
  projectId: string;
  onClose: () => void;
  onPrepared: () => Promise<void>;
  onCopied: (id: string) => Promise<void>;
}

type Inventory =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; status: IdentityStatus };

export function ProjectContinuity({ projectId, onClose, onPrepared, onCopied }: Readonly<Props>) {
  const [inventory, setInventory] = useState<Inventory>({ kind: "loading" });
  const [mode, setMode] = useState<ProjectCopyMode>("continue");
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setInventory({ kind: "loading" });
    void flushWrites()
      .then(() => api.inspectProjectIdentity(projectId))
      .then(
        (status) => {
          if (active) setInventory({ kind: "ready", status });
        },
        (error_: unknown) => {
          if (active) setInventory({ kind: "error", message: errorMessage(error_) });
        },
      );
    return () => {
      active = false;
    };
  }, [projectId, reload]);

  async function prepare() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      await flushWrites();
      const status = await api.prepareProjectIdentity(projectId);
      setInventory({ kind: "ready", status });
      await onPrepared();
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  async function copy() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError("");
    let copied: string | undefined;
    try {
      await flushWrites();
      copied = await api.copyProject(projectId, name.trim(), mode, reference.trim() || undefined);
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      busy.current = false;
      setWorking(false);
    }
    if (copied) {
      onClose();
      await onCopied(copied);
    }
  }

  const status = inventory.kind === "ready" ? inventory.status : null;
  const validReference = [...reference.trim()].length <= 128;

  return (
    <Modal
      title="Continuidad del proyecto"
      onClose={() => {
        if (!busy.current) onClose();
      }}
      footer={
        <>
          <button className="btn" disabled={working} onClick={onClose}>
            Cerrar
          </button>
          <button
            className="btn primary"
            onClick={() => {
              void copy().catch((error_: unknown) => setError(errorMessage(error_)));
            }}
            disabled={
              working ||
              !name.trim() ||
              !validReference ||
              !status ||
              status.conflicts.length > 0 ||
              (mode === "continue" && status.missing > 0)
            }
          >
            {working ? "Procesando..." : "Crear copia"}
          </button>
        </>
      }
    >
      {inventory.kind === "loading" && (
        <p>
          <output>Revisando identidades guardadas...</output>
        </p>
      )}
      {inventory.kind === "error" && (
        <div role="alert">
          <p>{inventory.message}</p>
          <button className="btn" onClick={() => setReload((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {status && (
        <>
          <p className="sub">
            Documento: <code>{status.project_uid ?? "Sin UUID"}</code>
          </p>
          <p>
            <output>
              {status.findings} hallazgos ·{" "}
              {status.missing === 0
                ? "Identidades completas"
                : `${status.missing} identidades pendientes`}
            </output>
          </p>
          {status.conflicts.length > 0 && (
            <ul role="alert">
              {status.conflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
          )}
          {status.missing > 0 && status.conflicts.length === 0 && (
            <>
              <p className="sub">
                Preparar agrega UUID a este documento y sus hallazgos. Conserva los existentes y
                permite reanudar si ocurre un error.
              </p>
              <button
                className="btn"
                disabled={working}
                onClick={() => {
                  void prepare();
                }}
              >
                Preparar identidades
              </button>
            </>
          )}
        </>
      )}
      <fieldset disabled={working} style={{ marginBlock: "var(--space-4)" }}>
        <legend>Uso de la copia</legend>
        <label className="row">
          <input
            type="radio"
            name="copy-mode"
            checked={mode === "continue"}
            onChange={() => setMode("continue")}
          />{" "}
          Continuar este trabajo
        </label>
        <p className="sub">Conserva los UUID para continuar el mismo documento con otra persona.</p>
        <label className="row">
          <input
            type="radio"
            name="copy-mode"
            checked={mode === "independent"}
            onChange={() => setMode("independent")}
          />{" "}
          Crear un trabajo independiente
        </label>
        <p className="sub">
          Crea UUID nuevos para la copia y sus hallazgos. El origen permanece disponible.
        </p>
      </fieldset>
      <div className="field">
        <label htmlFor="copy-project-name">Nombre de la copia</label>
        <input
          id="copy-project-name"
          className="input"
          value={name}
          disabled={working}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="copy-reference">Referencia compartida de la copia (opcional)</label>
        <input
          id="copy-reference"
          className="input"
          value={reference}
          disabled={working}
          aria-invalid={!validReference}
          aria-describedby="copy-reference-help"
          onChange={(event) => setReference(event.target.value)}
        />
        <p id="copy-reference-help" className="sub">
          Confirma por separado la referencia del trabajo, hasta 128 caracteres. Vacio significa sin
          referencia; no se hereda automaticamente.
        </p>
        {!validReference && <p role="alert">La referencia supera 128 caracteres.</p>}
      </div>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
