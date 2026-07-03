---
title: 'HTTP request smuggling en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-444']
status: open
affected: []
---

## Descripcion

Delante de {{target}} hay mas de un servidor procesando la misma peticion
(por ejemplo un proxy o balanceador y luego el servidor de aplicacion), y
ambos interpretan de forma distinta donde termina una peticion HTTP y
empieza la siguiente (por una diferencia en como leen las cabeceras
`Content-Length` y `Transfer-Encoding`). Esa discrepancia permite "esconder"
una segunda peticion dentro de la primera.

## Impacto

Segun la variante, un atacante puede hacer que su peticion escondida se
procese como si fuera la siguiente peticion de otro usuario: esto permite
robar datos de otras sesiones, envenenar la cache compartida por todos los
usuarios, o saltarse controles de seguridad que solo aplica el proxy
delantero. Es un impacto alto porque afecta a otros usuarios, no solo al
atacante.

## Prueba de concepto

1. Enviar una peticion que declare ambas cabeceras de longitud de forma
   ambigua, para ver si el proxy y el servidor de aplicacion las interpretan
   distinto:

```http
POST /target HTTP/1.1
Host: victima.example
Content-Length: 13
Transfer-Encoding: chunked

0

SMUGGLED
```

2. Usar la tecnica de retraso (enviar una peticion smuggled que deje al
   servidor esperando datos) y medir si la siguiente respuesta se retrasa de
   forma anormal: es la senal mas confiable de que el ataque funciona.
3. Confirmar el impacto real (por ejemplo, interceptar la respuesta
   destinada a otro usuario) solo en un entorno de prueba controlado.

## Remediacion

Unificar el manejo de `Content-Length` y `Transfer-Encoding` entre todos los
componentes de la cadena (proxy, balanceador, servidor de aplicacion),
idealmente forzando HTTP/2 de extremo a extremo o rechazando peticiones
ambiguas en el primer punto de entrada. Mantener actualizado el software de
proxy/balanceador, ya que estas discrepancias suelen corregirse con parches.
