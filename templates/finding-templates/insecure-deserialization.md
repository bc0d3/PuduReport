---
title: 'Deserializacion insegura en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-502']
status: open
affected: []
---

## Descripcion

{{target}} recibe datos serializados (por ejemplo un objeto Java, un pickle
de Python, o un formato similar propio del lenguaje) provenientes del
usuario, y los deserializa reconstruyendo objetos sin validar su origen ni
su contenido. Muchos lenguajes permiten que, durante ese proceso de
reconstruccion, se ejecute codigo arbitrario si el objeto esta armado con esa
intencion.

## Impacto

Un atacante que logre inyectar un objeto serializado malicioso puede llegar
a ejecutar codigo en el servidor con los permisos del proceso de la
aplicacion: es, en la practica, equivalente a una ejecucion remota de
codigo. Es una de las vulnerabilidades de mayor impacto posible.

## Prueba de concepto

1. Identificar en {{target}} un punto donde se reciba un dato serializado
   del lenguaje usado por el backend (una cookie, un parametro, un archivo
   subido) y luego se deserialice.
2. Confirmar el formato exacto (por ejemplo, un objeto Java serializado
   suele empezar con los bytes `AC ED 00 05`, o un pickle de Python con la
   marca de protocolo correspondiente).
3. Usando una herramienta de generacion de gadgets apropiada para ese
   lenguaje y framework, construir un objeto que, al deserializarse, ejecute
   un comando inofensivo (por ejemplo `id` o `whoami`) y confirmar la
   ejecucion, solo en un entorno de prueba controlado.

## Remediacion

Evitar deserializar datos que provengan del usuario sin validar; cuando sea
imprescindible, usar formatos de datos que no ejecuten codigo al
deserializarse (como JSON con un esquema estricto) en vez de formatos de
serializacion nativos del lenguaje. Si no hay alternativa, mantener
actualizadas las librerias usadas y aplicar listas de clases permitidas para
la deserializacion.
