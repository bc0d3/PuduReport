---
title: 'Path traversal en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-22']
status: open
affected: []
---

## Descripcion

{{target}} recibe un nombre de archivo o una ruta como parametro (por
ejemplo para descargar o mostrar un archivo) y lo usa para acceder al sistema
de archivos sin validar que se mantenga dentro del directorio esperado. Un
atacante puede incluir secuencias como `../` para salir de ese directorio y
acceder a otros archivos del servidor.

## Impacto

Un atacante puede leer (y en algunos casos escribir) archivos fuera del
directorio previsto: archivos de configuracion, codigo fuente, credenciales,
o cualquier archivo al que tenga acceso el proceso de la aplicacion. Segun
que se logre leer o modificar, el impacto puede ser muy alto.

## Prueba de concepto

1. Identificar en {{target}} un parametro que reciba un nombre de archivo o
   una ruta.
2. Reemplazar el valor por una secuencia de salida de directorio apuntando a
   un archivo conocido del sistema:

```
../../../../etc/passwd
```

3. Si la respuesta incluye el contenido de ese archivo (en vez de un error o
   el archivo esperado), la vulnerabilidad esta confirmada.
4. Probar variantes (codificacion URL, doble codificacion, rutas absolutas)
   si la primera es bloqueada por un filtro parcial.

## Remediacion

Resolver la ruta final del archivo y validar que quede dentro del directorio
permitido antes de usarla (comparar rutas ya normalizadas, no el string
crudo). Cuando sea posible, evitar que el usuario indique un nombre de
archivo directamente: usar un identificador interno que se mapee a la ruta
real del lado del servidor.
