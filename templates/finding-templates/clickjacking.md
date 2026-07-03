---
title: 'Clickjacking en {{target}}'
severity: medium
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-1021']
status: open
affected: []
---

## Descripcion

La pagina en {{target}} puede cargarse dentro de un `iframe` en un sitio
externo, porque no envia (o no aplica correctamente) las cabeceras que
impiden ese tipo de incrustacion. Un atacante puede superponer esa pagina,
de forma invisible o disfrazada, sobre contenido propio para inducir a la
victima a hacer clic pensando que interactua con otra cosa.

## Impacto

La victima puede terminar ejecutando, sin darse cuenta, una accion en la
aplicacion real (por ejemplo aceptar un permiso, confirmar una operacion o
cambiar una configuracion) mientras cree que esta interactuando con el sitio
del atacante. El impacto depende de que accion quede expuesta al clic
"secuestrado".

## Prueba de concepto

1. Crear una pagina HTML simple que incruste {{target}} en un `iframe`:

```html
<iframe src="https://victima.example/target" width="800" height="600"></iframe>
```

2. Abrir la pagina en un navegador y confirmar que el contenido de
   {{target}} se carga con normalidad dentro del `iframe` (si el navegador lo
   bloquea o lo muestra en blanco, la proteccion ya existe).
3. Si carga sin restriccion, la aplicacion es vulnerable a que se le
   superponga contenido enganoso encima.

## Remediacion

Enviar la cabecera `X-Frame-Options: DENY` (o `SAMEORIGIN` si se necesita
incrustacion propia) y/o la directiva `frame-ancestors` de Content Security
Policy, que es el mecanismo mas moderno y flexible para controlar quien
puede incrustar la pagina en un `iframe`.
