---
title: 'Web cache poisoning en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-444']
status: open
affected: []
---

## Descripcion

La cache que sirve {{target}} (una CDN, un proxy inverso, o la cache de la
propia aplicacion) usa una clave de cache que no incluye alguna cabecera o
parametro que si afecta el contenido de la respuesta (por ejemplo
`X-Forwarded-Host` o un parametro que la aplicacion procesa pero la cache
ignora). Un atacante puede enviar una peticion con ese valor manipulado y
lograr que la respuesta "envenenada" quede guardada en cache para el resto de
los usuarios.

## Impacto

Todos los usuarios que reciban la respuesta cacheada quedan afectados por el
contenido que el atacante logro inyectar, sin haber interactuado
directamente con el: esto puede propagar un XSS almacenado, redirigir a
todos a un sitio malicioso, o servir contenido incorrecto a gran escala desde
un unico ataque inicial.

## Prueba de concepto

1. Identificar una cabecera o parametro que la aplicacion use para construir
   la respuesta (por ejemplo un enlace absoluto armado con
   `X-Forwarded-Host`) pero que la cache no incluya en su clave.
2. Enviar una peticion con ese valor manipulado hacia una URL cacheable:

```http
GET /target HTTP/1.1
Host: victima.example
X-Forwarded-Host: atacante.example
```

3. Repetir la peticion normal (sin la cabecera manipulada) y confirmar si la
   respuesta cacheada sigue reflejando el valor del atacante para otros
   usuarios.

## Remediacion

Incluir en la clave de cache toda cabecera o parametro que influya en el
contenido de la respuesta, o normalizar/ignorar esos valores antes de
procesarlos si no son necesarios. Revisar la configuracion de la CDN o proxy
para que no reenvie cabeceras no confiables como si fueran de confianza.
