---
title: 'Ataque de HTTP Host header en {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-290']
status: open
affected: []
---

## Descripcion

{{target}} confia en el valor de la cabecera `Host` (o `X-Forwarded-Host`)
enviada por el cliente para construir enlaces, definir el dominio de un
correo de recuperacion de contraseña, o tomar decisiones internas, en vez de
usar un valor fijo configurado del lado del servidor. Esa cabecera la
controla completamente quien envia la peticion.

## Impacto

Un atacante puede manipular la cabecera `Host` para que enlaces generados
por la aplicacion (por ejemplo el de un correo de recuperacion de
contraseña) apunten a un dominio propio en vez del legitimo. Si la victima
hace clic en ese enlace, el token de recuperacion queda expuesto al
atacante, lo que puede derivar en toma de control de la cuenta.

## Prueba de concepto

1. Iniciar el flujo de recuperacion de contraseña (u otro flujo que genere
   un enlace) en {{target}}, enviando una cabecera `Host` distinta a la real:

```http
POST /recuperar-password HTTP/1.1
Host: atacante.example
```

2. Revisar el correo o la respuesta generada y confirmar si el enlace
   incluido usa el dominio manipulado en vez del dominio real de la
   aplicacion.
3. Si el enlace apunta al dominio del atacante, cualquier click de la
   victima enviaria el token de recuperacion a un servidor bajo control del
   atacante.

## Remediacion

Usar un valor de dominio configurado explicitamente del lado del servidor
para generar enlaces y tomar decisiones internas, sin depender de la
cabecera `Host` enviada por el cliente. Si se usa un proxy delante, validar
que solo acepte el/los dominios esperados y rechace el resto.
