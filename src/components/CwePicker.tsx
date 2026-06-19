import { useMemo, useState } from "react";
import { COMMON_CWES } from "../lib/cwe";

interface Props {
  /** Valor actual del CWE, para resaltar el seleccionado. */
  current?: string;
  onPick: (cweId: string) => void;
  onClose: () => void;
}

/**
 * Selector de los CWE mas usados. Filtra por numero o por nombre para no tener
 * que buscar el CWE a mano. El editor igual permite escribir un CWE libre.
 */
export function CwePicker({ current, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMON_CWES;
    // Permite buscar "89", "cwe-89" o "sql".
    const num = q.replace(/^cwe-?/, "");
    return COMMON_CWES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().replace("cwe-", "").includes(num),
    );
  }, [query]);

  function pick(id: string) {
    onPick(id);
    onClose();
  }

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
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) pick(results[0].id);
          }}
        />
        <div className="cwe-list">
          {results.map((c) => (
            <button
              key={c.id}
              className={`cwe-item${c.id === current ? " active" : ""}`}
              onClick={() => pick(c.id)}
            >
              <span className="cwe-id">{c.id}</span>
              <span className="cwe-name">{c.name}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="sub" style={{ padding: "8px 2px" }}>
              Sin coincidencias. Se puede escribir el CWE a mano en el campo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
