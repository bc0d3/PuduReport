---
title: 'Web cache deception en {{target}}'
severity: medium
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-524']
status: open
affected: []
---

## Descripcion

{{target}} tiene una pagina privada (por ejemplo un perfil con datos
personales) cuya respuesta puede quedar guardada en cache si se le agrega
una extension de archivo estatica a la URL (por ejemplo `/perfil/x.css`),
porque la cache decide que guardar basandose solo en la extension aparente
de la URL, mientras que la aplicacion sigue devolviendo el contenido privado
normal ignorando esa extension.

## Impacto

Un atacante puede hacer que la victima visite una URL asi (con su sesion
activa), quedando la respuesta privada de la victima guardada en la cache
compartida. Luego, el atacante visita la misma URL y recibe desde la cache
el contenido privado que en realidad pertenecia a la victima.

## Prueba de concepto

1. Identificar una pagina privada en {{target}} que devuelva datos propios
   del usuario autenticado (por ejemplo `/perfil`).
2. Acceder a esa misma pagina agregando una extension de archivo estatica al
   final de la ruta:

```
https://victima.example/perfil/noexiste.css
```

3. Confirmar si la aplicacion sigue devolviendo el contenido privado del
   perfil (en vez de un error 404), y si la respuesta queda marcada como
   cacheable.
4. Repetir la peticion sin la sesion de la victima (por ejemplo desde otra
   sesión o de forma anonima) y verificar si se recibe la respuesta guardada
   en cache con los datos de la victima.

## Remediacion

Configurar la cache para decidir que guardar en base al tipo de contenido
real de la respuesta (`Content-Type`), no solo en base a la extension de la
URL, y asegurarse de que las rutas que no correspondan a un recurso real
devuelvan un error 404 antes de llegar a cualquier logica de cache.
