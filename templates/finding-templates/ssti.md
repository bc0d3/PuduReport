---
title: 'Server-Side Template Injection (SSTI) en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-1336']
status: open
affected: []
---

## Descripcion

{{target}} incluye un valor enviado por el usuario dentro de una plantilla
que luego se procesa con el motor de renderizado del lado del servidor (por
ejemplo Jinja2, Twig, FreeMarker, entre otros), en vez de tratarlo solo como
texto a mostrar. Si el motor interpreta ese valor como parte de la sintaxis
de la plantilla, puede llegar a ejecutar expresiones o codigo.

## Impacto

Segun el motor de plantillas y su configuracion, el impacto va desde
divulgacion de informacion interna hasta ejecucion remota de codigo en el
servidor, que es el peor escenario posible: control total del servidor con
los permisos del proceso de la aplicacion.

## Prueba de concepto

1. Identificar en {{target}} un valor que se refleje en la respuesta y que
   pueda estar pasando por un motor de plantillas.
2. Enviar una expresion matematica simple propia de la sintaxis de
   plantillas para confirmar si se evalua:

```
{{7*7}}
```

3. Si la respuesta muestra `49` en vez del texto literal `{{7*7}}`, el valor
   se esta interpretando como codigo de plantilla y no como texto plano.
4. Escalar con payloads especificos del motor identificado solo en un
   entorno de prueba controlado, para confirmar el alcance real (lectura de
   archivos, ejecucion de comandos).

## Remediacion

Nunca construir una plantilla concatenando datos del usuario dentro de su
sintaxis; el dato del usuario debe pasarse siempre como variable al motor de
plantillas, nunca como parte de la plantilla en si. Mantener el motor de
plantillas actualizado y, si el caso de uso lo permite, usar un modo de
renderizado "sandboxed" (con capacidades restringidas).
