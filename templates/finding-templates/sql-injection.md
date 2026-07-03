---
title: 'Inyeccion SQL en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-89']
status: open
affected: []
---

## Descripcion

La aplicacion arma una consulta a la base de datos incluyendo directamente
informacion enviada por el usuario (un campo de un formulario, un parametro
de la URL, una cabecera, etc.) sin tratarla como un dato separado del codigo
SQL. Esto permite que quien envia la peticion modifique la logica de la
consulta original y le indique a la base de datos que haga algo distinto de
lo que la aplicacion pretendia.

## Impacto

Segun los permisos de la base de datos afectada, un atacante puede leer
informacion que no deberia (por ejemplo datos de otros usuarios o clientes),
modificarla, eliminarla, o en algunos casos llegar a ejecutar comandos en el
servidor de base de datos. Es una de las vulnerabilidades de mayor impacto:
suele exponer toda la informacion almacenada por la aplicacion, no solo la de
un usuario puntual.

## Prueba de concepto

1. Identificar un parametro en {{target}} que se use para construir una
   consulta a la base de datos.
2. Enviar un valor que altere la sintaxis de la consulta, por ejemplo una
   comilla simple, para confirmar que el dato no se trata por separado del
   codigo SQL:

```sql
' OR '1'='1
```

3. Si el servidor responde con un error de base de datos o con un
   comportamiento distinto al esperado (por ejemplo, devuelve todos los
   registros en vez de uno solo), queda confirmada la inyeccion.
4. Documentar la peticion enviada y la respuesta obtenida como evidencia.

## Remediacion

Usar siempre consultas parametrizadas o sentencias preparadas (prepared
statements): el valor del usuario nunca debe concatenarse dentro del texto de
la consulta. Complementar con validacion de la entrada y con el principio de
menor privilegio en el usuario de base de datos que usa la aplicacion.
