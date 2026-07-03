---
title: 'Cross-site scripting (XSS) en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-79']
status: open
affected: []
---

## Descripcion

La aplicacion incluye en la pagina un dato ingresado por el usuario (o por
otro usuario, si el dato es compartido) sin neutralizarlo correctamente antes
de mostrarlo. Como el navegador no distingue entre "contenido" y "codigo", si
ese dato contiene una etiqueta o un script, el navegador de la victima lo
ejecuta como si fuera parte legitima de la pagina.

## Impacto

Un atacante puede ejecutar codigo en el navegador de otro usuario cuando este
visita la pagina afectada. Con eso puede robar su sesion (y suplantarlo),
modificar lo que ve en pantalla, capturar lo que escribe, o hacer que realice
acciones sin darse cuenta. El impacto real depende de que tan privilegiada
sea la cuenta de la victima (un administrador es el peor caso).

## Prueba de concepto

1. Identificar un campo o parametro en {{target}} cuyo valor se refleje o se
   guarde y luego se muestre en la pagina.
2. Enviar un valor de prueba simple que confirme si se ejecuta como codigo:

```html
<script>alert(document.domain)</script>
```

3. Si aparece el mensaje emergente al cargar la pagina, el valor no se esta
   neutralizando y la vulnerabilidad esta confirmada.
4. Ajustar el payload segun el contexto (atributo HTML, JavaScript, URL) si
   el primero no funciona, y documentar el que si funciono.

## Remediacion

Codificar (escapar) toda salida segun el contexto donde se inserta (HTML,
atributo, JavaScript, URL) usando las funciones que el propio framework ya
provee para esto. Aplicar una Content Security Policy (CSP) como capa
adicional de defensa, y validar la entrada del lado del servidor.
