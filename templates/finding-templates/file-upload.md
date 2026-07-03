---
title: 'Subida de archivos insegura en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-434']
status: open
affected: []
---

## Descripcion

{{target}} permite subir archivos validando de forma insuficiente su tipo
real (por ejemplo confiando solo en la extension o en un encabezado
`Content-Type` que el propio usuario controla), y el archivo subido queda
almacenado en una ubicacion desde la que el servidor puede llegar a
ejecutarlo o interpretarlo.

## Impacto

Un atacante puede subir un archivo con codigo ejecutable (por ejemplo un
script del lenguaje del backend) disfrazado de un tipo permitido, y luego
acceder a el para que el servidor lo ejecute. El resultado tipico es
ejecucion remota de codigo, es decir, control del servidor.

## Prueba de concepto

1. Intentar subir en {{target}} un archivo con extension del lenguaje del
   backend (por ejemplo `.php`, `.jsp` o `.aspx` segun corresponda) y
   observar si es aceptado.
2. Si se bloquea por extension, probar variantes: doble extension
   (`archivo.php.jpg`), cambiar mayusculas/minusculas, o modificar solo la
   cabecera `Content-Type` de la peticion sin cambiar el contenido real del
   archivo.
3. Si el archivo se acepta, intentar acceder a el directamente por su URL y
   confirmar si el servidor lo ejecuta en vez de devolverlo como archivo
   estatico (usando contenido inofensivo para la prueba, por ejemplo que
   solo imprima un texto identificable).

## Remediacion

Validar el tipo real del archivo por su contenido (no por extension ni por
`Content-Type` declarado por el cliente), generar un nombre nuevo aleatorio
al guardarlo, y almacenar los archivos subidos fuera del directorio desde el
que el servidor ejecuta codigo, sirviendolos siempre como contenido estatico
sin permisos de ejecucion.
