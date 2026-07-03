---
title: 'Vulnerabilidad en el manejo de JWT de {{target}}'
severity: high
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-347']
status: open
affected: []
---

## Descripcion

{{target}} usa JSON Web Tokens (JWT) para autenticacion o autorizacion, pero
su validacion tiene una debilidad: por ejemplo, acepta el algoritmo `none`
(sin firma), permite cambiar el algoritmo de RS256 a HS256 y usar la clave
publica como secreto, usa una clave de firma debil o predecible, o no valida
la expiracion (`exp`) del token.

## Impacto

Un atacante que logre falsificar o modificar un JWT valido puede
autenticarse como otro usuario (incluyendo un administrador), o mantener
acceso con un token que ya deberia haber expirado. El impacto tipico es toma
de control de cuenta o escalamiento de privilegios.

## Prueba de concepto

1. Decodificar el JWT emitido por {{target}} (la cabecera y el payload estan
   en Base64, no cifrados) y revisar el algoritmo declarado en la cabecera.
2. Probar modificar la cabecera para usar el algoritmo `none` y quitar la
   firma, enviando el token resultante:

```json
{"alg":"none","typ":"JWT"}
```

3. Si el servidor acepta el token sin firma (o firmado con una clave
   debil/adivinada), la vulnerabilidad esta confirmada. Documentar con un
   cambio inofensivo en el payload (por ejemplo el nombre de usuario), nunca
   escalando a una cuenta real ajena sin autorizacion.

## Remediacion

Fijar explicitamente el algoritmo esperado del lado del servidor al validar
el token (nunca aceptar el algoritmo que venga declarado en el propio JWT),
rechazar `none`, usar una clave de firma fuerte y aleatoria, y validar
siempre la expiracion y el emisor del token.
