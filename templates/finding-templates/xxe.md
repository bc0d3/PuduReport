---
title: 'XML External Entity (XXE) en {{target}}'
severity: critical
cvss_version: '3.1'
cvss: ''
cvss_vector: ''
cwe: ['CWE-611']
status: open
affected: []
---

## Descripcion

{{target}} procesa un documento XML enviado por el usuario (directamente, o
dentro de un formato que internamente es XML, como DOCX o SVG) usando un
parser que tiene habilitada la resolucion de entidades externas. Esto
permite definir una entidad que apunte a un archivo local o a una direccion
de red, y que el parser la resuelva al procesar el documento.

## Impacto

Un atacante puede leer archivos del servidor (por ejemplo archivos de
configuracion con credenciales), y en algunos casos usar el parser como
punto de partida para peticiones SSRF hacia servicios internos, o provocar
denegacion de servicio. Es una vulnerabilidad de alto impacto porque suele
dar acceso directo a informacion sensible del servidor.

## Prueba de concepto

1. Identificar en {{target}} un punto donde se suba o envie un documento XML
   (o un formato basado en XML).
2. Enviar un documento que declare una entidad externa apuntando a un
   archivo local:

```xml
<?xml version="1.0"?>
<!DOCTYPE data [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<data>&xxe;</data>
```

3. Si el contenido del archivo aparece reflejado en la respuesta (o se puede
   inferir por canal fuera de banda), la vulnerabilidad esta confirmada.

## Remediacion

Deshabilitar la resolucion de entidades externas (DTD externo) en la
configuracion del parser XML utilizado; la mayoria de las librerias lo
permiten desactivar de forma explicita. Si el formato lo permite, preferir
un formato de datos mas simple (por ejemplo JSON) que no tenga este riesgo.
