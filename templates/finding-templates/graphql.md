---
title: 'Vulnerabilidad en la API GraphQL de {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-285']
status: open
affected: []
---

## Descripcion

La API GraphQL de {{target}} tiene una debilidad propia de este tipo de
API: por ejemplo, deja habilitada la introspeccion en produccion (exponiendo
todo el esquema, incluyendo campos y mutaciones no documentadas), no aplica
el mismo control de autorizacion a nivel de campo/mutacion que aplicaria un
endpoint REST equivalente, o no limita la complejidad/profundidad de las
consultas permitidas.

## Impacto

Un atacante puede usar la introspeccion para descubrir funcionalidad no
documentada (incluyendo mutaciones administrativas), acceder a datos de
otros usuarios a traves de un campo o resolver sin la autorizacion adecuada,
o degradar el servicio con una consulta anidada de alto costo (equivalente a
una denegacion de servicio).

## Prueba de concepto

1. Consultar el endpoint GraphQL de {{target}} con una query de
   introspeccion estandar para obtener el esquema completo:

```graphql
{ __schema { types { name fields { name } } } }
```

2. Revisar el esquema obtenido en busca de mutaciones o campos sensibles no
   usados por la interfaz publica.
3. Probar acceder a un campo que devuelva datos de otro usuario (por
   ejemplo variando un ID en los argumentos de la query) y confirmar si el
   servidor aplica el control de autorizacion esperado.

## Remediacion

Deshabilitar la introspeccion en el entorno de produccion, aplicar
autorizacion a nivel de resolver (no solo a nivel de endpoint general), y
limitar la profundidad y el costo de las queries permitidas para evitar
abuso de recursos.
