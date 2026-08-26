# Reglas del proyecto — Bot WhatsApp Ardisa

## 🎓 REGLA DE ORO: cada cambio es una CLASE COMPLETA

Quien opera este proyecto es **Deicy** (estudia ingeniería de software; la meta declarada es
pasar entrevistas técnicas y ser experta). Entregar solo el resultado la deja igual de expuesta.
Por eso **ningún cambio se entrega como reporte: se entrega como clase**, en 6 bloques:

1. **Qué pasaba** — el síntoma real, con el caso de un cliente de verdad.
2. **Cómo lo averigüé** — los comandos EXACTOS y copiables, con lo que mostró cada uno.
3. **Dónde vive** — archivo y línea (`build_f1.py:3979`) y en qué nodo de n8n cae.
4. **El código ANTES → DESPUÉS**, explicado COMPLETO (ver abajo qué significa "completo").
5. **El concepto de ingeniería** — su nombre "de libro" + una frase corta para entrevista.
6. **Tu turno** — una tarea pequeña que ella teclee, o una pregunta de predicción.

### Qué significa "explicar el código COMPLETO" (regla añadida 2026-08-24)

Explicar por encima no sirve: si no entiende cada línea, no puede defenderla en una entrevista
ni mantenerla cuando yo no esté. Entonces, en el bloque 4:

- **Se muestra el bloque entero**, no solo las líneas del diff. Si la función cambió en dos
  renglones pero tiene quince, se explican los quince: el diff sin contexto no enseña nada.
- **Se explica línea por línea**, en orden, diciendo qué hace y **por qué está ahí**.
- **Cada símbolo se nombra y se traduce**, sin asumir que es obvio: `||` `&&` `?.` `!!` `=>`
  `...` `?:` `.map()` `.filter()` `.some()` `try/catch`, cada trozo de una expresión regular,
  cada operador de SQL. Si en una línea hay tres símbolos, se explican los tres.
- **Se dice qué pasaría si se quita** esa línea (o qué rompía antes de existir). Ese "¿y si no
  estuviera?" es lo que convierte código leído en código entendido.
- **Se explica por qué así y no de otra forma**: la alternativa que se descartó y su motivo.
- **Los nombres de variables se traducen** (`_tok`, `_muerto`, `_plazaDe`), incluidas las
  convenciones de la casa (por qué el guion bajo, por qué en español).
- Lo mismo aplica a **comandos de terminal y consultas SQL**: cada bandera (`-n`, `-B`, `-e`,
  `--single-transaction`) y cada cláusula se explican, no solo lo que devuelve el comando.

**No aplica solo a los cambios de código.** Un diagnóstico, una consulta a la base, una prueba o
un script temporal se explican igual de completo.

## Reglas de operación (no negociables)

- **Build limpio antes de desplegar.** `python3 build_f1.py` valida la sintaxis de cada nodo y
  aborta si algo falla. Una llave de más tumbó el bot en vivo el 15-jul.
- **Suite en verde:** `bash tests/correr.sh` antes de cualquier despliegue.
- **Desplegar solo en ventana sin tráfico** (antes de las 8 am o después de las 5 pm): desplegar
  descarta la memoria de los últimos minutos (candados, sesiones, rotación de asesores).
- **Nunca copiar la base de n8n** (3.1 GB): se consulta en el sitio, en modo solo lectura.
- **Arreglos generales, no por caso:** el caso reportado es la punta. Se corrige el mecanismo, se
  audita a quién más le pasó y se deja una prueba que lo fije.
- **Los mensajes al cliente nunca exponen el problema interno**, hablan en plural y no prometen
  tiempos que no controlamos.

El resto del contexto del proyecto (arquitectura, incidentes, decisiones históricas) vive en la
memoria del proyecto, no aquí.
