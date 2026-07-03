---
title: 'Prototype pollution en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-1321']
status: open
affected: []
---

## Descripcion

{{target}} combina o asigna objetos JavaScript (por ejemplo con una fusion
recursiva de dos objetos) usando datos que vienen del usuario, sin bloquear
las claves especiales `__proto__`, `constructor` o `prototype`. Esto permite
que un atacante modifique el prototipo base compartido por todos los
objetos del mismo tipo en la aplicacion, en vez de una propiedad puntual.

## Impacto

Segun donde se use el objeto contaminado, el impacto va desde denegacion de
servicio (si se rompe una propiedad que el codigo espera con otro valor)
hasta cross-site scripting o ejecucion remota de codigo, si el valor
contaminado termina llegando a una funcion sensible (por ejemplo una que
genera HTML o ejecuta codigo dinamicamente).

## Prueba de concepto

1. Identificar en {{target}} un punto donde el usuario controla un objeto
   JSON que luego se fusiona con otro (por ejemplo una configuracion o
   parametros de busqueda convertidos a objeto).
2. Enviar un payload que intente contaminar el prototipo global:

```json
{"__proto__": {"esAdmin": true}}
```

3. Verificar si, luego de esa peticion, un objeto nuevo sin relacion directa
   ya tiene la propiedad `esAdmin` heredada (por ejemplo observando un
   cambio de comportamiento en otra parte de la aplicacion que dependa de
   esa propiedad).

## Remediacion

Usar `Object.create(null)` o un `Map` en vez de objetos literales para
estructuras que reciben datos externos, congelar `Object.prototype`
(`Object.freeze`) al iniciar la aplicacion, y usar versiones actualizadas de
las librerias de fusion de objetos, que ya bloquean estas claves especiales.
