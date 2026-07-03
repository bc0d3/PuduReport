---
title: 'Divulgacion de informacion en {{target}}'
severity: medium
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-200']
status: open
affected: []
---

## Descripcion

{{target}} expone informacion que no deberia ser publica ni accesible para
el usuario actual: puede ser un mensaje de error con detalle tecnico interno
(rutas del servidor, version de software, traza de la aplicacion), un
archivo de configuracion accesible directamente, o un campo de respuesta que
incluye mas datos de los que la funcionalidad requiere mostrar.

## Impacto

La informacion expuesta por si sola puede no ser critica, pero suele
facilitar otros ataques: conocer la version exacta del software permite
buscar vulnerabilidades conocidas para esa version, y los detalles internos
de un error ayudan a entender como esta armada la aplicacion por dentro.
Segun el dato expuesto, el impacto directo puede ir de bajo a alto (por
ejemplo si se filtran credenciales o tokens).

## Prueba de concepto

1. Provocar un error en {{target}} con una entrada invalida o inesperada y
   revisar si la respuesta incluye una traza tecnica detallada en vez de un
   mensaje generico.
2. Revisar respuestas de la API en busca de campos adicionales no usados por
   la interfaz (por ejemplo datos internos o de otros usuarios incluidos
   "de mas" en el JSON).
3. Documentar el dato concreto expuesto y por que via se obtuvo (mensaje de
   error, endpoint, archivo accesible directamente).

## Remediacion

Configurar el entorno de produccion para mostrar mensajes de error genericos
al usuario, registrando el detalle tecnico solo en logs internos. Revisar
que cada respuesta de la API incluya unicamente los campos que la
funcionalidad realmente necesita, aplicando ese filtro del lado del
servidor.
