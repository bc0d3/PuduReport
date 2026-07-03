---
title: 'Vulnerabilidad en la implementacion de OAuth de {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-287']
status: open
affected: []
---

## Descripcion

El flujo de OAuth de {{target}} tiene una debilidad de implementacion: por
ejemplo, no valida el parametro `state` (dejando el flujo abierto a CSRF de
autenticacion), acepta cualquier `redirect_uri` sin validarla contra una
lista exacta registrada, o no verifica que el `client_id`/`aud` del token
recibido corresponda a la aplicacion actual. Cualquiera de estos puntos
individualmente ya representa un riesgo real.

## Impacto

Segun la debilidad concreta, un atacante puede vincular la cuenta de la
victima a una cuenta bajo su control (tomando la sesion), robar el codigo de
autorizacion o el token redirigiendolo a un dominio propio, o hacerse pasar
por la aplicacion ante el proveedor de identidad. El resultado tipico es
toma de control de cuenta.

## Prueba de concepto

1. Iniciar el flujo de OAuth de {{target}} e interceptar la peticion de
   autorizacion.
2. Probar reemplazar el parametro `redirect_uri` por un dominio propio (o
   una variante del dominio legitimo) y confirmar si el proveedor de
   identidad igual redirige el codigo/token hacia ese destino.
3. Repetir el flujo sin enviar el parametro `state`, o reutilizando uno ya
   usado, y confirmar si la aplicacion lo acepta igual.
4. Documentar cual de las validaciones falta y el impacto concreto (por
   ejemplo, el codigo de autorizacion llegando al dominio del atacante).

## Remediacion

Validar `redirect_uri` contra una lista exacta de URIs registradas (sin
comodines ni coincidencia parcial), generar y validar un `state` unico e
impredecible por cada flujo, y verificar que el `client_id`/audiencia del
token corresponda exactamente a la aplicacion. Seguir las recomendaciones
vigentes de OAuth 2.1 / Best Current Practice para clientes web.
