import type { Severity } from "../lib/types";
import { SEVERITY_COLOR, SEVERITY_LABEL } from "../lib/severity";

export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      className="sev-dot"
      style={{ background: SEVERITY_COLOR[severity] }}
      title={SEVERITY_LABEL[severity]}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="sev-badge" style={{ background: SEVERITY_COLOR[severity] }}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
