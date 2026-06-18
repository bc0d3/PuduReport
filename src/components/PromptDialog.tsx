import { useState } from "react";
import { Modal } from "./Modal";

interface Props {
  title: string;
  /** Etiqueta sobre el campo. */
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

/**
 * Dialogo de entrada de texto del propio diseno. Reemplaza window.prompt, que
 * en el webview de Tauri puede no mostrarse o devolver null.
 */
export function PromptDialog({
  title,
  label,
  placeholder,
  initialValue = "",
  confirmLabel = "Aceptar",
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
    onClose();
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {label && <label className="field-label-top">{label}</label>}
      <input
        className="input"
        style={{ width: "100%" }}
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
    </Modal>
  );
}
