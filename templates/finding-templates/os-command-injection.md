---
title: 'Inyeccion de comandos del sistema operativo en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-78']
status: open
affected: []
---

## Descripcion

{{target}} arma un comando del sistema operativo (por ejemplo para procesar
un archivo, hacer un ping, convertir un formato, etc.) incluyendo directamente
un valor enviado por el usuario, sin separarlo del resto del comando. Esto
permite que un atacante agregue caracteres especiales del shell para
ejecutar comandos adicionales de los que la aplicacion no tenia previstos.

## Impacto

Un atacante puede ejecutar comandos arbitrarios en el servidor con los
permisos del proceso de la aplicacion: leer o modificar archivos, moverse
lateralmente en la red interna, o instalar herramientas para mantener acceso
persistente. Es una de las vulnerabilidades de mayor impacto posible, ya que
suele equivaler a control total del servidor.

## Prueba de concepto

1. Identificar en {{target}} un valor que se use para construir un comando
   del sistema operativo.
2. Enviar un valor que agregue un comando adicional usando un separador del
   shell:

```
valor_normal; id
```

3. Si la respuesta incluye la salida del comando agregado (por ejemplo el
   resultado de `id`), la inyeccion esta confirmada.
4. En un entorno de prueba, documentar con un comando inofensivo (como `id`
   o `whoami`); no ejecutar comandos destructivos.

## Remediacion

Evitar invocar el shell del sistema operativo con datos del usuario. Cuando
sea imprescindible, usar las APIs del lenguaje que ejecutan el binario
directamente con una lista de argumentos (sin pasar por un interprete de
shell), y validar la entrada contra una lista estricta de valores permitidos.
