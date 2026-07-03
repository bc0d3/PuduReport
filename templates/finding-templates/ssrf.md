---
title: 'Server-Side Request Forgery (SSRF) en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-918']
status: open
affected: []
---

## Descripcion

{{target}} recibe una URL (o un dato que se usa para construir una) y hace
una peticion HTTP hacia ella desde el propio servidor, sin validar que el
destino sea uno de los esperados. Un atacante puede indicar una URL que
apunte a servicios internos que normalmente no serian accesibles desde
afuera.

## Impacto

Un atacante puede usar al servidor como intermediario para alcanzar recursos
internos: paneles de administracion sin exposicion publica, servicios en la
red interna, o el endpoint de metadata de la nube (que en muchos proveedores
expone credenciales temporales). Segun que se alcance, el impacto puede
llegar a comprometer toda la infraestructura.

## Prueba de concepto

1. Identificar en {{target}} un parametro que reciba una URL o un host (por
   ejemplo para generar una miniatura, validar un webhook, o importar un
   recurso).
2. Reemplazar el valor por una direccion interna o el endpoint de metadata
   de la nube, segun el entorno:

```
http://169.254.169.254/latest/meta-data/
```

3. Confirmar si la respuesta de {{target}} refleja el contenido obtenido de
   esa direccion interna (indicando que la peticion se realizo desde el
   servidor).

## Remediacion

Validar el destino contra una lista explicita de hosts permitidos
(allowlist), en vez de tratar de bloquear direcciones especificas
(blocklist), que es facil de evadir. Bloquear el acceso del servidor de
aplicacion al endpoint de metadata de la nube salvo que sea estrictamente
necesario, y aislar la red interna del componente que hace estas peticiones.
