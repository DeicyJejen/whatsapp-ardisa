# Ruta Python de Deicy — de cero a experta, dentro de su propio proyecto

> Regla del curso: **ella teclea, yo pregunto.** Cada módulo termina con un "examen" que Deicy me
> presenta (me explica el concepto y me muestra su ejercicio corriendo). No se avanza sin examen.
> Los ejemplos SIEMPRE salen de este proyecto: el que aprende sobre su propio sistema no se le olvida.

## P0 — La terminal (½ sesión) ✅ casi lista
Los 8 comandos de práctica de la *Guía de Python y Terminal*. Examen: correr los 8 y explicarme 3.

## P1 — Hablar con Python: variables y textos (1 sesión)
`python3` interactivo (el REPL): variables, números, textos, `print()`, f-strings.
**Ejercicio:** calcular cuántos leads son 280 repartidos entre 8 asesores, y saludarse a sí misma con f-string.

## P2 — Listas y diccionarios (1 sesión) — LA más importante
Una lista = varias cosas en orden. Un diccionario = llaves y valores… **o sea, un JSON**. El día que
domines los diccionarios, dominas el formato en que habla TODO el proyecto.
**Ejercicio:** armar en el REPL un `lead = {"nombre": ..., "ciudad": ..., "productos": [...]}` y sacarle datos.

## P3 — Decisiones y repeticiones: if / for (1 sesión)
El `if` de Python = el nodo IF de n8n. El `for` = "para cada uno de estos, haz…".
**Ejercicio:** dada una lista de leads (diccionarios), imprimir solo los de Bucaramanga.
**Lectura guiada:** el `if` real de `mcp_token_refresh.py` ("¿le queda vida al token?").

## P4 — Funciones: def y return (1 sesión)
Una receta con nombre: ingredientes → resultado. **Lectura guiada:** `q()` del vigilante y `node()` de la fábrica.
**Ejercicio:** escribir `def saluda(nombre, hora)` que salude distinto en mañana/tarde.

## P5 — Archivos y JSON (1 sesión)
`open()`, `.read()`, `json.load()`. **Ejercicio estrella:** abrir `workflow-bot-f1.json` con Python y
contar los nodos, listar sus nombres, y contar cuántos son de cada tipo. (Sí: vas a leer TU bot con Python.)

## P6 — Python + el mundo: subprocess y SQL (1 sesión)
Python ejecutando comandos (el puente con la terminal) y consultando la BD.
**Ejercicio:** un script que pregunte a MySQL cuántos leads hay hoy y lo imprima bonito.

## P7 — Tu primer script de verdad: MI mini-vigilante (2 sesiones)
Un script TUYO, desde cero, en tu carpeta: `mi_vigilante.py` — revisa cuántos leads hay hoy, cuántos
sin reportar, y si el token del MCP está fresco; imprime un informe con emojis. Luego: que lo corra un cron.

## P8 — Proyecto final: código que fabrica (2 sesiones)
Tu propio generador (el patrón de `gen_manual_pdf.py`): un script que lea la BD y fabrique un
mini-reporte HTML/PDF con los leads de la semana. Al aprobarlo: 🎓 diploma de la casa.

---
*Bitácora: arrancó el 13-ago-2026. Prerrequisito de cada sesión: traer las dudas anotadas.*

## Transversal: el inglés del código 🇬🇧
Cada módulo incluye su vocabulario en inglés (5 palabras/día del PDF *El Inglés del Código*, empezando
por la tabla de ERRORES). Regla: toda palabra nueva se busca viva en el proyecto con `grep` y se lee
la línea completa traduciendo en voz alta.
