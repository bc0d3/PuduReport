# Politica de seguridad

PuduReport es una herramienta local-first para redactar reportes de seguridad. Tomamos en serio la seguridad del propio proyecto y agradecemos los reportes responsables.

## Versiones soportadas

| Version | Soportada |
| ------- | --------- |
| 0.0.x (beta) | Si |

Al estar en beta, los arreglos de seguridad se publican sobre la ultima version.

## Como reportar una vulnerabilidad

**No abras un issue publico para temas de seguridad.** Usa el canal privado de GitHub:

1. Entra al repositorio en GitHub.
2. Pestania **Security** > **Report a vulnerability** (Private Vulnerability Reporting).
3. Completa el formulario con el detalle.

> Nota para el mantenedor: hay que habilitar "Private vulnerability reporting" en Settings > Code security and analysis.

### Que incluir

- Descripcion clara del problema y su **impacto**.
- **Pasos para reproducir** y una prueba de concepto (PoC), idealmente paso a paso con evidencia.
- **Version** de PuduReport y **sistema operativo**.
- Severidad estimada (CVSS 3.1/4.0 opcional, pero bienvenido).

Cuanto mas reproducible sea el reporte, mas rapido lo podemos validar y corregir.

## Divulgacion coordinada

- Acusamos recibo lo antes posible (objetivo: 72 horas).
- Trabajamos un arreglo y coordinamos la fecha de divulgacion con quien reporta.
- Objetivo de correccion: hasta 90 dias, antes si la severidad lo amerita.
- Pedimos no divulgar publicamente hasta que haya un arreglo disponible.

## Alcance

**Dentro de alcance** (el codigo del proyecto):

- La aplicacion (backend Rust, frontend, comandos IPC).
- El pipeline de generacion de PDF y el manejo de assets.
- Cualquier via que permita escribir o leer fuera del workspace, ejecutar codigo, o filtrar datos del equipo.

Para el modelo de seguridad del servidor MCP (`pudureport-mcp`) y su
autoevaluacion ASVS + checklist OWASP LLM Top 10, ver
[docs/mcp-security-assessment.md](docs/mcp-security-assessment.md).

**Fuera de alcance** (comportamiento conocido / por diseno):

- El contenido que el propio usuario escribe en sus reportes.
- **Plantillas `.typ` de terceros**: ejecutan en el sandbox de Typst (sin red, sin escritura, lectura limitada al workspace). Tratalas como codigo no confiable; importar una plantilla ajena es bajo tu responsabilidad.
- **Instaladores sin firmar**: las advertencias de Gatekeeper/SmartScreen son esperadas (ver README). No es una vulnerabilidad.
- Vulnerabilidades en dependencias de terceros sin un vector explotable en PuduReport (igual, avisanos).

## Reconocimiento

PuduReport es open source (GPL-3.0) y **no tiene recompensa monetaria**, pero reconocemos publicamente a quien reporte de forma responsable. Si tu reporte es valido y aceptas, te sumamos al **Hall of Fame** de abajo (con el nombre/alias que prefieras).

Gracias por ayudar a que la herramienta sea mas segura.

## Hall of Fame

Todavia no hay reportes. Si encontras algo, se el primero en aparecer aca.

<!--
- Nombre / alias — breve descripcion (RUSTSEC/CVE si aplica) — fecha
-->
