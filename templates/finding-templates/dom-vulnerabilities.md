---
title: 'Vulnerabilidad DOM-based en {{target}}'
severity: medium
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-79']
status: open
affected: []
---

## Descripcion

El codigo JavaScript que corre en el navegador toma un dato controlable por
el usuario (por ejemplo, un fragmento de la URL como `location.hash` o
`location.search`) y lo usa directamente para modificar la pagina (por
ejemplo con `innerHTML` o similar), sin pasar por el servidor y sin
neutralizarlo. A diferencia de un XSS reflejado clasico, el problema ocurre
enteramente del lado del cliente.

## Impacto

Un atacante puede ejecutar codigo en el navegador de la victima con solo
lograr que abra un enlace especialmente armado a {{target}}, sin necesidad de
que el servidor participe en el envio del payload. El impacto es el mismo
que un XSS: robo de sesion, manipulacion de la pagina o acciones no
autorizadas en nombre de la victima.

## Prueba de concepto

1. Revisar el codigo JavaScript de {{target}} (o su comportamiento) e
   identificar donde se lee un dato de la URL o de otra fuente del cliente y
   se inserta en el DOM.
2. Construir una URL de prueba que incluya un payload en esa parte:

```
https://victima.example/target#<img src=x onerror=alert(document.domain)>
```

3. Abrir la URL y confirmar si el payload se ejecuta al cargar la pagina.

## Remediacion

Evitar insertar datos no confiables en el DOM con metodos que interpreten
HTML (`innerHTML`, `document.write`, etc.); usar en su lugar propiedades que
tratan el valor como texto plano (`textContent`) o una libreria que sanitice
el HTML antes de insertarlo. Aplicar Content Security Policy como defensa
adicional.
