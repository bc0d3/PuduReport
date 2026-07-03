---
title: 'Cross-site request forgery (CSRF) en {{target}}'
severity: medium
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-352']
status: open
affected: []
---

## Descripcion

La accion en {{target}} (por ejemplo cambiar un dato de la cuenta o realizar
una operacion) se ejecuta usando solo la sesion del navegador, sin verificar
que la peticion haya sido realmente iniciada por el usuario desde la propia
aplicacion. Un sitio externo puede armar una pagina que, al ser visitada por
la victima con su sesion activa, dispare esa misma peticion sin que se de
cuenta.

## Impacto

Un atacante puede hacer que la victima ejecute, sin saberlo, una accion en su
nombre mientras tiene una sesion activa: cambiar un correo o contraseña,
transferir datos, o cualquier operacion que la aplicacion permita hacer con
una peticion simple. El impacto depende de que tan sensible sea la accion
afectada.

## Prueba de concepto

1. Identificar una peticion en {{target}} que realice un cambio de estado
   (no una simple lectura) y confirmar que se ejecuta solo con la cookie de
   sesion, sin un token anti-CSRF valido u otra proteccion equivalente.
2. Armar una pagina HTML externa que dispare automaticamente esa peticion:

```html
<form action="https://victima.example/cambiar-email" method="POST">
  <input type="hidden" name="email" value="atacante@example.com" />
</form>
<script>document.forms[0].submit()</script>
```

3. Con una sesion activa en la aplicacion, abrir esa pagina externa y
   confirmar que la accion se ejecuto sin interaccion adicional del usuario.

## Remediacion

Exigir un token anti-CSRF unico por sesion (o por peticion) en toda accion
que cambie estado, y validarlo en el servidor. Complementar con la cookie de
sesion configurada como `SameSite=Lax` o `Strict`, y verificar el origen de
la peticion (`Origin`/`Referer`) en operaciones sensibles.
