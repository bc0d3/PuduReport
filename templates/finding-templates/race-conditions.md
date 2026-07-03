---
title: 'Condicion de carrera (race condition) en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-362']
status: open
affected: []
---

## Descripcion

{{target}} procesa una operacion sensible (por ejemplo canjear un cupon,
descontar saldo, o validar un codigo de un solo uso) leyendo y actualizando
un estado compartido sin un mecanismo que impida que dos peticiones
concurrentes pasen la misma validacion al mismo tiempo. Si se envian varias
peticiones en paralelo, es posible que todas pasen la verificacion antes de
que el estado se actualice.

## Impacto

Un atacante puede repetir una operacion que deberia ejecutarse una sola vez
(canjear un cupon multiples veces, descontar saldo de una cuenta hasta
dejarla en negativo sin que se detecte, o validar un mismo codigo de un solo
uso mas de una vez), obteniendo un beneficio indebido en cada repeticion.

## Prueba de concepto

1. Identificar en {{target}} una operacion que deberia poder ejecutarse una
   sola vez por usuario (canje, descuento de saldo, validacion de un
   codigo).
2. Enviar varias copias identicas de esa peticion de forma simultanea (por
   ejemplo usando el envio en paralelo de una herramienta como Burp
   Repeater, o el envio en un unico paquete cuando el servidor use HTTP/2),
   en vez de una peticion por vez.
3. Revisar si mas de una de esas peticiones concurrentes se proceso como
   exitosa, cuando solo una deberia haberlo sido.

## Remediacion

Usar bloqueos o transacciones atomicas en la base de datos para las
operaciones sensibles (por ejemplo `SELECT ... FOR UPDATE` o una
restriccion a nivel de base de datos), de forma que dos peticiones
concurrentes no puedan pasar la misma validacion al mismo tiempo. Aplicar
ademas idempotencia en operaciones que no deberian repetirse.
