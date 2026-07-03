---
title: 'Vulnerabilidad en WebSockets de {{target}}'
severity: medium
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-346']
status: open
affected: []
---

## Descripcion

El canal WebSocket de {{target}} no valida correctamente el origen (`Origin`)
de la conexion entrante, ni exige un token de autenticacion propio del
protocolo, confiando unicamente en la sesion HTTP existente en el navegador
en el momento del handshake inicial. Esto es equivalente al problema de CSRF
pero aplicado a una conexion persistente en vez de a una peticion HTTP
puntual.

## Impacto

Una pagina externa puede abrir una conexion WebSocket hacia {{target}} desde
el navegador de la victima (usando su sesion activa) y enviar o recibir
mensajes en su nombre, sin que la victima lo note. Segun que funcionalidad
exponga el canal, esto puede filtrar informacion en tiempo real o ejecutar
acciones no autorizadas.

## Prueba de concepto

1. Identificar el endpoint WebSocket de {{target}} y confirmar si el
   handshake valida la cabecera `Origin`.
2. Crear una pagina HTML externa que abra una conexion hacia ese endpoint:

```html
<script>
  const ws = new WebSocket("wss://victima.example/target");
  ws.onmessage = (e) => console.log(e.data);
</script>
```

3. Con la victima autenticada visitando esa pagina externa, confirmar si la
   conexion se establece y si permite leer o enviar mensajes con su sesion.

## Remediacion

Validar la cabecera `Origin` durante el handshake contra una lista de
dominios confiables, y exigir ademas un token de autenticacion propio del
canal (no depender solo de la cookie de sesion del navegador). Aplicar el
mismo criterio de autorizacion por mensaje que se aplicaria a un endpoint
HTTP equivalente.
