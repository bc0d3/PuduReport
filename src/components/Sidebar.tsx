import { useState } from "react";
import type { Finding, FindingStatus } from "../lib/types";
import { SEVERITY_ORDER } from "../lib/severity";
import { SeverityDot } from "./Severity";

// Orden de estados para retest: el riesgo vivo primero (abierto, luego lo que no
// se corregira), despues lo aceptado y al final lo corregido. Espeja el resumen
// por estado de retest.typ.
const RETEST_STATUS_ORDER: FindingStatus[] = ["open", "wontfix", "accepted", "fixed"];

interface Props {
  findings: Finding[];
  activeId: string | null;
  /** Familia de render efectiva (deriva de la plantilla); gatea el orden de retest. */
  family?: "findings" | "retest" | "narrative";
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  onReorder: (orderedIds: string[]) => void;
  /** Alterna si un hallazgo se oculta del PDF. */
  onToggleHidden: (id: string) => void;
  /** Duplica un hallazgo (lo clona en el proyecto). */
  onDuplicate: (id: string) => void;
  /** Elimina un hallazgo (la confirmacion la maneja el padre). */
  onDelete: (id: string) => void;
}

/** Lista lateral de hallazgos con punto de severidad y reordenamiento drag & drop. */
export function Sidebar({
  findings,
  activeId,
  family,
  onSelect,
  onCreate,
  onReorder,
  onToggleHidden,
  onDuplicate,
  onDelete,
}: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  function submitNew() {
    const title = newTitle.trim();
    if (title) {
      onCreate(title);
      setNewTitle("");
    }
  }

  // Ordena los hallazgos por severidad (criticos primero) reescribiendo el orden;
  // independiente de la plantilla. El orden manual (drag) sigue disponible.
  function sortBySeverity() {
    const rank = (f: Finding) => SEVERITY_ORDER.indexOf(f.meta.severity);
    const ids = [...findings].sort((a, b) => rank(a) - rank(b)).map((f) => f.id);
    onReorder(ids);
  }

  // Orden para retest: primero por estado (abierto -> no se corregira -> aceptado
  // -> corregido) y dentro de cada estado por severidad (criticos primero).
  // Reescribe finding_order igual que el orden por severidad.
  function sortForRetest() {
    const statusRank = (f: Finding) => {
      const i = RETEST_STATUS_ORDER.indexOf(f.meta.status);
      return i < 0 ? RETEST_STATUS_ORDER.length : i;
    };
    const sevRank = (f: Finding) => SEVERITY_ORDER.indexOf(f.meta.severity);
    const ids = [...findings]
      .sort((a, b) => statusRank(a) - statusRank(b) || sevRank(a) - sevRank(b))
      .map((f) => f.id);
    onReorder(ids);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = findings.map((f) => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    onReorder(ids);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="inline-form">
          <input
            className="input"
            placeholder="Nuevo hallazgo..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            style={{ flex: 1 }}
          />
          <button
            className="btn primary small"
            onClick={submitNew}
            disabled={!newTitle.trim()}
            title="Agregar hallazgo"
          >
            <i className="ti ti-plus" />
          </button>
        </div>
        {family === "retest" ? (
          <button
            className="btn small"
            style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
            onClick={sortForRetest}
            disabled={findings.length < 2}
            title="Ordena por estado (abierto primero) y luego por severidad. Despues podes ajustar a mano."
          >
            <i className="ti ti-arrows-sort" />
            Ordenar para retest
          </button>
        ) : (
          <button
            className="btn small"
            style={{ marginTop: 8, width: "100%", justifyContent: "center" }}
            onClick={sortBySeverity}
            disabled={findings.length < 2}
            title="Ordena los hallazgos por severidad (criticos primero). Despues podes ajustar a mano."
          >
            <i className="ti ti-arrows-sort" />
            Ordenar por severidad
          </button>
        )}
      </div>
      <div className="finding-list">
        {findings.length === 0 && <div className="empty">Sin hallazgos todavia.</div>}
        {findings.map((f) => (
          <div
            key={f.id}
            className={`finding-item ${f.id === activeId ? "active" : ""} ${
              f.id === dragId ? "dragging" : ""
            }`}
            style={f.meta.hidden ? { opacity: 0.45 } : undefined}
            onClick={() => onSelect(f.id)}
            draggable
            onDragStart={() => setDragId(f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(f.id)}
          >
            <i className="ti ti-grip-vertical grip" />
            <SeverityDot severity={f.meta.severity} />
            <span className="title">{f.meta.title || "(sin titulo)"}</span>
            {family === "retest" && f.meta.new_in_retest && (
              <span className="cvss-chip" title="Nuevo detectado en el retest">
                nuevo
              </span>
            )}
            {f.meta.hidden && (
              <i
                className="ti ti-eye-off"
                title="Oculto del PDF"
                style={{ color: "var(--text-muted)", fontSize: 14 }}
              />
            )}
            {f.meta.cvss && <span className="cvss-chip">{f.meta.cvss}</span>}
            <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <button
                className="icon-btn"
                title="Mas opciones"
                aria-label="Mas opciones"
                onClick={() => setMenuId(menuId === f.id ? null : f.id)}
              >
                <i className="ti ti-dots-vertical" />
              </button>
              {menuId === f.id && (
                <>
                  <div className="finding-menu-backdrop" onClick={() => setMenuId(null)} />
                  <div className="finding-menu">
                    <button
                      onClick={() => {
                        onToggleHidden(f.id);
                        setMenuId(null);
                      }}
                    >
                      <i className={`ti ti-eye${f.meta.hidden ? "" : "-off"}`} />
                      {f.meta.hidden ? "Mostrar en el PDF" : "Ocultar del PDF"}
                    </button>
                    <button
                      onClick={() => {
                        onDuplicate(f.id);
                        setMenuId(null);
                      }}
                    >
                      <i className="ti ti-copy" />
                      Copiar
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        onDelete(f.id);
                        setMenuId(null);
                      }}
                    >
                      <i className="ti ti-trash" />
                      Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
