---
title: 'Vulnerabilidad de logica de negocio en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-840']
status: open
affected: []
---

## Descripcion

El flujo de {{target}} asume que el usuario va a seguir los pasos previstos
en el orden esperado, y no valida en el servidor una regla de negocio que
deberia cumplirse siempre (por ejemplo, que un descuento no puede aplicarse
dos veces, que una cantidad no puede ser negativa, o que un paso no puede
saltearse). Al no tratarse de un error tecnico convencional, este tipo de
problema no suele detectarse con herramientas automatizadas.

## Impacto

Un atacante puede abusar del flujo para obtener un beneficio no previsto
(descuentos duplicados, montos alterados, acceso a un paso posterior sin
completar uno anterior obligatorio), afectando directamente la operacion o
las finanzas del negocio. El impacto es especifico de cada caso y suele ser
alto porque afecta la logica central de la aplicacion.

## Prueba de concepto

1. Mapear el flujo completo de {{target}} y las reglas de negocio que
   deberian cumplirse en cada paso (limites, orden, cantidades validas).
2. Repetir un paso del flujo, saltear uno, o enviar un valor fuera del rango
   esperado (por ejemplo una cantidad negativa o cero) directamente a la
   peticion, sin pasar por la interfaz.
3. Confirmar si el servidor acepta la operacion igual, documentando el
   beneficio obtenido (por ejemplo el descuento aplicado dos veces o el
   monto final incorrecto).

## Remediacion

Validar en el servidor cada regla de negocio critica de forma independiente
del orden en que llegan las peticiones, sin asumir que el cliente respeto el
flujo previsto. Aplicar controles como idempotencia en operaciones que no
deben repetirse, y validacion de rangos en toda entrada numerica.
