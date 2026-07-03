---
title: 'Autenticacion rota en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-287']
status: open
affected: []
---

## Descripcion

El mecanismo de autenticacion de {{target}} tiene una debilidad que permite
sortearlo o abusarlo: por ejemplo, no limita los intentos de inicio de
sesion (permitiendo probar contraseñas por fuerza bruta), acepta contraseñas
debiles sin ninguna politica minima, o expone informacion que permite
enumerar que cuentas existen (mensajes de error distintos para "usuario no
existe" vs "contraseña incorrecta").

## Impacto

Un atacante puede comprometer cuentas de usuarios legitimos probando
contraseñas de forma automatizada, o usar la enumeracion de cuentas como
paso previo a un ataque dirigido (por ejemplo credential stuffing con
contraseñas filtradas de otros sitios). El impacto final es tipicamente toma
de control de cuenta.

## Prueba de concepto

1. Enviar varios intentos de inicio de sesion consecutivos con credenciales
   incorrectas contra {{target}} y observar si la aplicacion bloquea,
   demora o limita los intentos despues de cierto umbral.
2. Comparar la respuesta al intentar con un usuario que existe y una
   contraseña incorrecta, contra un usuario que no existe, para ver si el
   mensaje de error (o el tiempo de respuesta) permite distinguir ambos
   casos.
3. Documentar cuantos intentos fueron posibles sin bloqueo y, si corresponde,
   la diferencia observada entre los mensajes de error.

## Remediacion

Implementar limite de intentos (rate limiting) y bloqueo temporal progresivo
tras varios intentos fallidos, ademas de una politica de contraseñas
minimas razonable. Unificar el mensaje de error para "usuario o contraseña
incorrectos" sin distinguir cual de los dos fallo, e igualar los tiempos de
respuesta entre ambos casos.
