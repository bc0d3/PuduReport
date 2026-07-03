---
title: 'Control de acceso roto en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-284']
status: open
affected: []
---

## Descripcion

{{target}} no valida correctamente que el usuario autenticado tenga permiso
para acceder al recurso o accion solicitada. Esto incluye, por ejemplo, que
alcance con conocer o adivinar el identificador de un recurso ajeno (IDOR)
para acceder a el, o que un usuario sin privilegios pueda ejecutar una
funcion pensada solo para administradores.

## Impacto

Un usuario autenticado (o incluso sin autenticar, segun el caso) puede
acceder a datos o funciones de otros usuarios o de niveles superiores de
privilegio, sin haber sido autorizado para ello. El impacto depende de la
sensibilidad del dato o la accion expuesta, y puede llegar hasta tomar
control de cuentas ajenas.

## Prueba de concepto

1. Autenticarse con una cuenta de prueba propia y ubicar en {{target}} una
   peticion que incluya un identificador de recurso (por ejemplo
   `/api/pedidos/1234`).
2. Reemplazar el identificador por uno que pertenezca a otro usuario o
   registro (`/api/pedidos/1235`), sin cambiar nada mas de la peticion.
3. Confirmar si la respuesta devuelve datos del otro registro en vez de un
   error de autorizacion (403) o de no encontrado (404).
4. Repetir la prueba, si aplica, con una cuenta de menor privilegio contra
   una funcion pensada para administradores.

## Remediacion

Validar la autorizacion en el servidor para cada peticion, verificando que
el usuario autenticado sea efectivamente dueño del recurso o tenga el rol
necesario para la accion, y no confiar en que el identificador sea dificil
de adivinar. Aplicar esta verificacion de forma centralizada, no repetida y
ad hoc en cada endpoint.
