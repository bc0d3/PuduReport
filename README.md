<p align="center">
  <img src="branding/logo.png" alt="PuduReport" width="320" />
</p>

# PuduReport

<!--
  Badges estaticos: el repo es privado y shields.io no puede leer repos privados
  (el badge dinamico de version/CI da "repo not found"). Cuando el repo sea
  publico, se pueden volver dinamicos:
    version: https://img.shields.io/github/v/tag/bc0d3/PuduReport?label=version&sort=semver
    CI:      https://github.com/bc0d3/PuduReport/actions/workflows/ci.yml/badge.svg?branch=main
-->
<p align="center">
  <a href="https://github.com/bc0d3/PuduReport/releases"><img src="https://img.shields.io/badge/version-v0.0.6-1f6fb2" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-GPL--3.0-blue" alt="Licencia GPL-3.0" /></a>
  <img src="https://img.shields.io/badge/plataformas-macOS%20%7C%20Windows%20%7C%20Linux-555" alt="Plataformas" />
  <a href="https://ko-fi.com/bc0d3"><img src="https://img.shields.io/badge/Ko--fi-apoyar-FF5E5B?logo=ko-fi&amp;logoColor=white" alt="Apoyar en Ko-fi" /></a>
</p>

<p align="center"><sub>Rama <code>main</code>: version estable (produccion). El desarrollo ocurre en <code>dev</code>.</sub></p>

Aplicacion de escritorio local-first para redactar reportes de vulnerabilidades y generar PDF profesionales. Pensada para pentesters y bug hunters. Funciona offline, sin servidor y sin que los datos salgan de tu equipo.

## Caracteristicas

- Editor de hallazgos tipo formulario: campos estructurados (severidad, CVSS, estado, CWE) y bloques markdown que se llenan pegando contenido.
- Calculadora CVSS 3.1 y 4.0 integrada. La severidad se deriva del vector.
- Libreria de plantillas: hallazgos y snippets reutilizables con variables.
- Generacion de PDF con plantillas personalizables: portada con tu logo y colores, marca de agua, secciones activables.
- Workspaces locales en la carpeta que elijas. Cada workspace es git-friendly (solo texto + assets).
- Multiplataforma: macOS, Windows y Linux.

## Stack

- Tauri v2 (Rust + React/TypeScript)
- Typst como motor de PDF
- SQLite (solo indice de busqueda)

## Desarrollo

Guia completa de arquitectura, setup y contribucion en [README.dev.md](README.dev.md).

Requisitos: Node.js 20+, Rust estable, y las dependencias de Tauri para tu sistema.

PuduReport empaqueta el binario de Typst como sidecar de Tauri. Antes de
`dev` o `build`, coloca el binario en `src-tauri/binaries/` con el sufijo del
target triple de tu plataforma (por ejemplo `typst-aarch64-apple-darwin`).
Para desarrollo basta tener `typst` en el PATH: el backend lo resuelve por
variable de entorno `PUDU_TYPST_BIN`, sidecar junto al ejecutable, o PATH.

```bash
npm install
npm run tauri dev
```

Build de produccion:

```bash
npm run tauri build
```

Tests del backend (CVSS 3.1/4.0, parseo de front-matter, pipeline de PDF):

```bash
cd src-tauri && cargo test
```

El workspace por defecto se ubica donde tu lo elijas (file picker); sugerencia
`~/Documents/PuduReport/`. Cada workspace es una carpeta de texto + assets,
apta para versionar con git.

## Privacidad

Sin telemetria. Sin llamadas de red salvo la verificacion de actualizaciones. Los reportes nunca salen de tu equipo.

## Seguridad

Encontraste una vulnerabilidad en PuduReport? Reportala de forma responsable por el
canal privado de GitHub (pestania **Security** > **Report a vulnerability**), no en un
issue publico. Detalle, alcance y agradecimientos en [SECURITY.md](SECURITY.md).

Reconocemos publicamente a quien reporte (Hall of Fame). Gracias por ayudar.

## Aviso

PuduReport es una herramienta gratuita y de codigo abierto, provista "tal cual" (as is), sin garantia de ningun tipo, segun la licencia GPL-3.0 (ver secciones 15 y 16 de LICENSE).

El usuario es el unico responsable del uso que le da a la herramienta, del contenido que ingresa y de los reportes que genera. PuduReport esta pensada para documentar pruebas de seguridad autorizadas; cualquier uso fuera de ese marco es responsabilidad exclusiva de quien la utiliza. Los autores no se responsabilizan por danos ni uso indebido.

## Apoyar el proyecto

PuduReport es gratuito y de codigo abierto (GPL-3.0), desarrollado en tiempo libre. Si te resulta util y quieres ayudar a sostener el desarrollo, puedes invitarme un cafe. Es totalmente opcional y se agradece mucho.

<div align="center">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R4W421O9QC)

</div>

## Licencia

GPL-3.0. Ver LICENSE.