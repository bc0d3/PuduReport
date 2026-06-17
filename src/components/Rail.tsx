export type View =
  | "inicio"
  | "proyectos"
  | "editor"
  | "reporte"
  | "plantillas"
  | "portada"
  | "preview"
  | "ajustes";

interface RailItem {
  view: View;
  icon: string;
  title: string;
}

const TOP: RailItem[] = [
  { view: "inicio", icon: "ti-home", title: "Inicio" },
  { view: "proyectos", icon: "ti-folder", title: "Proyectos" },
  { view: "editor", icon: "ti-bug", title: "Hallazgos" },
  { view: "reporte", icon: "ti-file-text", title: "Reporte" },
  { view: "plantillas", icon: "ti-template", title: "Plantillas" },
  { view: "portada", icon: "ti-layout-cards", title: "Portada" },
  { view: "preview", icon: "ti-eye", title: "Vista previa PDF" },
];

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

/** Barra de navegacion lateral de iconos (Tabler). */
export function Rail({ view, onNavigate, dark, onToggleTheme }: Props) {
  return (
    <nav className="rail">
      {TOP.map((item) => (
        <button
          key={item.view}
          className={`rail-btn ${view === item.view ? "active" : ""}`}
          title={item.title}
          onClick={() => onNavigate(item.view)}
        >
          <i className={`ti ${item.icon}`} />
        </button>
      ))}
      <span className="rail-spacer" />
      <button
        className="rail-btn"
        title={dark ? "Modo claro" : "Modo oscuro"}
        onClick={onToggleTheme}
      >
        <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} />
      </button>
      <button
        className={`rail-btn ${view === "ajustes" ? "active" : ""}`}
        title="Ajustes"
        onClick={() => onNavigate("ajustes")}
      >
        <i className="ti ti-settings" />
      </button>
    </nav>
  );
}
