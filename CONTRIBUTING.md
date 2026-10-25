# Guia de contribucion

Gracias por tu interes en PuduReport. Antes de enviar cambios, lee esta guia.

## Acuerdo de Licencia de Contribuyente (obligatorio)

Toda contribucion requiere aceptar el [CLA](CLA.md) **antes** del primer merge.
Es un tramite unico por persona. Sin CLA firmado, el PR no se mergea. El motivo
esta explicado en el propio CLA: preservar la capacidad del autor de licenciar
el proyecto bajo distintos terminos en el futuro.

## Flujo de trabajo

- `main` es la rama estable y solo recibe pull requests de release desde `dev`.
- `dev` es la rama de integracion. Trabaja en ramas `feature/*`, `fix/*`,
  `docs/*` o `ci/*` y abre el PR contra `dev`.
- Los cambios se integran de a un PR por vez. Si un PR depende de otro, declara
  la dependencia y rebasea la rama cuando el anterior llegue a `dev`.
- Las ramas de trabajo se eliminan solo despues de verificar que sus commits
  quedaron integrados. `main` y `dev` son permanentes.
- CI debe quedar en verde: formato, lint, tests, build y el gate de licencias
  (`deny.toml`). No se mergea con CI roja.
- No agregues dependencias con copyleft fuerte (GPL/AGPL/LGPL/SSPL/EUPL). El CI
  las rechaza para no comprometer el licenciamiento del proyecto. El copyleft
  debil (MPL-2.0) si se permite.

## Estilo

- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`...). Mensajes en
  espanol neutro, concisos.
- Sin emojis en codigo, comentarios, UI, documentacion ni mensajes de commit.
- Rust: `cargo fmt` + `cargo clippy` sin warnings. TypeScript: ESLint +
  Prettier, modo strict, prohibido `any`.
- Cada archivo de codigo lleva la cabecera SPDX de licencia y copyright (ver los
  archivos existentes como referencia).

## Antes de solicitar revision

```bash
npm run lint
node --test scripts/*.test.mjs
npm run build
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Mantiene el PR enfocado y evita mezclar refactors, dependencias y funcionalidad
sin relacion. Usa la plantilla del PR para documentar riesgos, compatibilidad y
evidencia manual.

## Reportar fallos

Abre un issue describiendo el problema, los pasos para reproducirlo y el entorno
(sistema operativo y version de la app).
