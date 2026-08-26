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

### PRIMERO ELLA, DESPUÉS YO (regla añadida 2026-08-26)

Deicy: *"estás explicando como si no quisiera que aprendiera, y lo único que debo llevarme es el
conocimiento"*. Y tenía razón: resolver yo y explicar después produce documentos, no ingeniera.
Explicar **se siente** como enseñar y no lo es. Lo que se queda es lo que le costó.

Entonces el orden cambia:

- **Ante un caso nuevo, yo NO toco el teclado primero.** Le doy el síntoma (cliente, hora, número)
  y los comandos, y **ella diagnostica**. Solo después comparamos.
- **Antes de correr un comando de diagnóstico, se le pide una PREDICCIÓN**: "¿va a decir `True` o
  `False`?". Predecir y fallar enseña; leer el resultado, no.
- **La respuesta va DESPUÉS de la tarea, nunca antes**, y separada, para que no se lea de corrido.
- **Excepción: la urgencia de un cliente real.** Ahí resuelvo yo de una, y **después** el caso se
  convierte en ejercicio. Un cliente esperando no es material didáctico.
- Cuando ella falle, mejor: ese es el punto. No se corrige el error y se sigue — se le pregunta
  **por qué** creía lo otro.

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

## 📚 LA BIBLIOTECA SE ACTUALIZA CON EL CAMBIO (regla añadida 2026-08-26)

Una clase que se dice y no se escribe se pierde. La biblioteca (`n8n.ardisa.com/monitor/`) es lo
que Deicy se lleva cuando termine el contrato: **si está vieja, no vale nada**. El 26-ago decía
"91 nodos" cuando ya eran 110, y no tenía una línea de los tres días anteriores.

Por eso **un cambio no está terminado hasta que la biblioteca lo refleja.** Con cada cambio que
enseñe algo (un fallo real, un concepto, una técnica de diagnóstico):

1. **El caso entra al Cuaderno** (`docs/CUADERNO-CASOS-REALES.md`) con sus cuatro partes:
   síntoma real → 🔍 los comandos que ella teclea → ✅ la respuesta → 🎤 la frase de entrevista.
   El cuaderno es lo que se TRABAJA; el resto de la biblioteca es lo que se LEE.
2. **Se regenera lo que se calcula solo:**
   ```bash
   python3 gen_cuaderno_pdf.py          # el cuaderno
   python3 gen_anexo_tecnico_pdf.py     # el anexo: cuenta los nodos del workflow
   python3 gen_html_online.py           # las versiones "leer en línea"
   sudo cp /tmp/biblioteca_online/*.html /var/www/monitor/
   sudo cp docs/*.pdf monitor/biblioteca.html /var/www/monitor/
   ```
3. **Se comprueba que no quedaron enlaces rotos** antes de dar por hecho el cambio.
4. **Ningún número se escribe a mano en un título.** "91 nodos" envejeció sin que nadie lo notara:
   el conteo se calcula del workflow. Todo dato que pueda quedar viejo, se calcula.

## 🔒 ANTES DE PUBLICAR, MIRAR QUÉ HAY DENTRO (regla añadida 2026-08-26)

El repositorio de GitHub es **PÚBLICO**, y ya contiene 137 teléfonos, de los cuales **81 son
clientes** con nombre y apellido. Es lo mismo que protege la Ley 1581 que el bot le cita a cada
cliente en el saludo.

- **Antes de cada commit** se revisa que lo nuevo no meta datos de una persona real —ni en el
  código, ni en un comentario, ni en una prueba, ni en la documentación:
  ```bash
  git diff --cached | grep '^+' | grep -nE '\b573[0-9]{9}\b'
  ```
- **Los casos reales se cuentan sin identificar a nadie**: "un cliente de Bucaramanga", no su
  nombre; un número de prueba (`5730011199...`), no el suyo. La historia se entiende igual.
- Publicar no se deshace: aunque se borre, ya se indexó y ya se clonó.

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
