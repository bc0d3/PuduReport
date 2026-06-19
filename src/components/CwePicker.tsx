import { useMemo, useState } from "react";
import { COMMON_CWES } from "../lib/cwe";

interface Props {
  /** CWE ya seleccionados, para resaltarlos. */
  selected: string[];
  /** Agrega o quita un CWE de la seleccion. */
  onToggle: (cweId: string) => void;
  onClose: () => void;
}

/**
 * Selector de los CWE mas usados. Filtra por numero o por nombre para no tener
 * que buscar el CWE a mano. Permite elegir varios (no se cierra al tocar uno);
 * el editor igual acepta escribir un CWE libre.
 */
export function CwePicker({ selected, onToggle, onClose }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMON_CWES;
    // Permite buscar "89", "cwe-89", "sql" o una sigla ("xss", "idor").
    const num = q.replace(/^cwe-?/, "");
    return COMMON_CWES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.aliases?.some((a) => a.toLowerCase().includes(q)) ||
        c.id.toLowerCase().replace("cwe-", "").includes(num),
    );
  }, [query]);

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="popover cwe-popover" onClick={(e) => e.stopPropagation()}>
        <h3>Seleccionar CWE</h3>
        <input
          className="input"
          style={{ width: "100%", marginBottom: 12 }}
          autoFocus
          placeholder="Buscar por numero o nombre (ej. 89, sql, xss)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cwe-list">
          {results.map((c) => {
            const active = selected.includes(c.id);
            return (
              <button
                key={c.id}
                className={`cwe-item${active ? " active" : ""}`}
                onClick={() => onToggle(c.id)}
              >
                <i className={`ti ${active ? "ti-check" : "ti-plus"} cwe-mark`} />
                <span className="cwe-id">{c.id}</span>
                <span className="cwe-name">{c.name}</span>
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="sub" style={{ padding: "8px 2px" }}>
              Sin coincidencias. Se puede escribir el CWE a mano en el campo.
            </p>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
