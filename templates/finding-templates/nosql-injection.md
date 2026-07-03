---
title: 'Inyeccion NoSQL en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-943']
status: open
affected: []
---

## Descripcion

{{target}} construye una consulta a una base de datos NoSQL (por ejemplo
MongoDB) incluyendo directamente una estructura enviada por el usuario, en
vez de tratarla como un valor simple. Cuando la aplicacion acepta que el
parametro sea un objeto (por ejemplo `{"$ne": null}` en vez de un texto
plano), ese objeto puede alterar la logica de la consulta igual que una
inyeccion SQL altera una consulta relacional.

## Impacto

Un atacante puede saltear una validacion (por ejemplo un inicio de sesion) o
extraer datos que no deberia ver, aprovechando operadores propios de la base
NoSQL que la aplicacion no esperaba recibir desde el cliente. El impacto es
comparable al de una inyeccion SQL: exposicion o alteracion de datos.

## Prueba de concepto

1. Identificar en {{target}} un parametro que se use en una consulta a la
   base NoSQL (por ejemplo el campo de contraseña en un login).
2. Si la peticion se envia como JSON, reemplazar el valor de texto plano por
   un operador de la base de datos:

```json
{"usuario": "admin", "password": {"$ne": null}}
```

3. Si la aplicacion acepta el inicio de sesion sin conocer la contraseña
   real, la inyeccion esta confirmada.

## Remediacion

Validar que los parametros recibidos tengan el tipo de dato esperado (por
ejemplo, rechazar un objeto donde se espera un texto plano) antes de usarlos
en la consulta, y usar los metodos de la libreria de base de datos que
escapan o tipan los valores en vez de construir la consulta con datos crudos
del usuario.
