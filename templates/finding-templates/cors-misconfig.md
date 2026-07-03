---
title: 'Configuracion insegura de CORS en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-942']
status: open
affected: []
---

## Descripcion

{{target}} responde con cabeceras de Cross-Origin Resource Sharing (CORS)
demasiado permisivas: refleja cualquier origen que le envien en
`Access-Control-Allow-Origin` (o usa `*`) junto con
`Access-Control-Allow-Credentials: true`, en vez de aceptar solo una lista
concreta de origenes confiables. Esto le permite a paginas de otros dominios
leer respuestas de la API que deberian ser privadas.

## Impacto

Un sitio malicioso, visitado por la victima mientras tiene una sesion activa,
puede hacer peticiones a {{target}} usando las credenciales de la victima
(cookies) y leer la respuesta desde JavaScript, algo que normalmente el
navegador impide entre dominios distintos. Esto puede exponer datos
personales, tokens u otra informacion sensible de la cuenta.

## Prueba de concepto

1. Enviar una peticion a {{target}} con una cabecera `Origin` de un dominio
   arbitrario y observar la respuesta:

```http
GET /api/perfil HTTP/1.1
Host: victima.example
Origin: https://atacante.example
Cookie: session=<sesion-valida>
```

2. Si la respuesta incluye
   `Access-Control-Allow-Origin: https://atacante.example` junto con
   `Access-Control-Allow-Credentials: true`, un sitio en ese dominio puede
   leer la respuesta con las credenciales de la victima.
3. Confirmar el impacto armando una pagina de prueba que haga un `fetch` con
   `credentials: 'include'` hacia {{target}} desde ese origen.

## Remediacion

Validar el `Origin` contra una lista explicita de dominios confiables (nunca
reflejar cualquier valor recibido) y no combinar un origen comodin o
reflejado con `Access-Control-Allow-Credentials: true`. Si el endpoint no
necesita ser accedido entre dominios, no enviar cabeceras CORS.
