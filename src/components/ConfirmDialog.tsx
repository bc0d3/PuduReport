import { Modal } from "./Modal";

interface Props {
  title: string;
  message: string;
  /** Texto del boton de accion (por defecto "Eliminar"). */
  confirmLabel?: string;
  /** Si la accion es destructiva, el boton va en rojo. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Dialogo de confirmacion del propio diseno (reemplaza window.confirm). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Eliminar",
  danger = true,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {message}
      </p>
    </Modal>
  );
}
