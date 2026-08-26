# Cómo se usa este cuaderno

Los otros documentos de la biblioteca te **cuentan** el proyecto. Este te pone a **trabajarlo**.

Cada caso viene en cuatro partes, y van en este orden a propósito:

1. **El síntoma** — lo que vio un cliente de verdad, con fecha y número.
2. **🔍 Tu turno: averígualo** — los comandos que tienes que teclear TÚ. Aquí no hay respuesta.
   Corre cada uno, mira qué sale y escribe en un papel qué crees que pasó.
3. **✅ Lo que era** — la causa, ya con el dato en la mano. Léela **después**, no antes.
4. **🎤 Para la entrevista** — cómo se llama esto "de libro" y cómo contarlo.

> **La regla del cuaderno:** si lees la parte 3 antes de teclear la parte 2, el caso no cuenta.
> Leer una explicación se siente como aprender y no lo es. Lo que se queda es lo que te costó.

Todos los comandos son reales y se pueden correr hoy en el servidor del bot. Si alguno falla, el
error también enseña: cópialo y búscalo en el documento *El Inglés del Código*.

---

# Caso 1 — "No pudimos confirmarte el precio" (teniendo el precio)

## El síntoma

**25 de agosto, 5:33 p.m.** Una clienta escribe *"Venden cerámica para piso"*. El bot responde con
cuatro cerámicas, cada una con su enlace… y esta frase en medio:

> *"No pudimos confirmarte el precio ni la disponibilidad en este momento, pero un asesor te los
> confirma enseguida."*

**26 de agosto, 8:57 a.m.**, con una foto de un tornillo, todavía peor:

> *"No pudimos validar en este momento el precio exacto **en nuestro sistema**, así que un asesor te
> confirma si el valor de **$3.599** corresponde a ese paquete de 100 unidades."*

Dio el precio y en la misma frase dijo que no lo tenía. Y le contó al cliente que "nuestro sistema"
falló, que es justo lo que las reglas de redacción prohíben.

## 🔍 Tu turno: averígualo

**Paso 1 — ¿la página tiene el precio?** El enlace que el bot mandó termina en
`piso-cer-mica-hara-beige-60x60-cm`. Pregúntaselo a la tienda:

```bash
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
curl -s -A "$UA" 'https://www.ardisa.com/graphql' -H 'Content-Type: application/json' \
  -d '{"query":"{products(filter:{url_key:{eq:\"piso-cer-mica-hara-beige-60x60-cm\"}}){items{sku name price_range{minimum_price{final_price{value}}}}}}"}'
```

*¿Sale un precio o no sale?* Anótalo.

**Paso 2 — ¿qué le llegó al modelo?** Esta es la pregunta que resuelve el caso. Todo lo que pasó por
n8n queda guardado; hay que ir a mirarlo:

```bash
python3 - <<'PY'
import sqlite3, json
con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
s = con.execute("SELECT data FROM execution_data WHERE executionId=137489").fetchone()[0]
print("¿el volcado trae precios?", 'precio_con_iva' in s)
i = s.find('precio_con_iva')
print(s[max(0,i-300):i+200])
PY
```

**Antes de correrlo, predice:** ¿va a decir `True` o `False`? Escríbelo. Después córrelo.

**Paso 3 — ¿la regla estaba puesta?** El prompt le prohíbe esconder el precio desde el 25-ago:

```bash
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
s = con.execute("SELECT data FROM execution_data WHERE executionId=137489").fetchone()[0]
for r in ('LO QUE TIENES, SE DA','PROHIBIDO ESCONDERLO'):
    print(r, '->', r in s)
PY
```

*Si la regla estaba y el dato estaba… ¿de quién es la culpa?*

## ✅ Lo que era

Los tres pasos dan lo mismo: **el precio estaba, la disponibilidad estaba, y la regla estaba.**
El tool le entregó al modelo los diez productos así:

| SKU | precio | se_vende | disponibilidad |
|---|---|---|---|
| 10018475 | 84041.99 | true | con disponibilidad |
| 10023656 | 88426.79 | true | con disponibilidad |
| … | … | … | … |

**El modelo tenía todo y escribió que no tenía nada.**

La lección incómoda: ese prompt tiene ~9.200 tokens y unas 40 reglas. La que prohibía esconder el
precio es la número 25. **Cuanto más lejos está una instrucción del dato, menos se obedece.**

El arreglo no fue escribir la regla más fuerte. Fue dejar de pedirlo:

- `store.cotDatos[wa]` guarda lo que la página devolvió.
- El nodo `Entregar cotización` compara el texto del modelo contra ese dato y **lo repara**.

Y el orden importa, porque casi sale mal: **primero se borra la muletilla falsa, después se reponen
los precios.** ¿Por qué? Porque en el caso del tornillo el modelo metió el precio *dentro* de la
frase a borrar. Al revés, se habría llevado el único precio del mensaje.

```js
if(_nombrados>0 && _todoTraePrecio && _todoTraeDisp){
  t=t.replace(/\s*no\s+pudimos\s+(?:confirmar|confirmarte|validar|validarte)[^.]*?\b(?:precio|disponibilidad)\b[^.]*\.\s*/gi,' ');
}
_dichos.forEach(function(_x){
  const _d=_dat[_x.sku];
  if(t.indexOf(_ent(_d.pre))>=0) return;          // el precio sobrevivió
  t=t.split('🔗 Verlo en línea: '+_d.url)
     .join('💲 $'+_mil(_d.pre)+' (precio de referencia con IVA)\n🔗 Verlo en línea: '+_d.url);
});
```

**Ejercicio.** En `[^.]*?` el `*?` es "perezoso": para en cuanto encuentra lo que sigue. Y `[^.]`
significa "cualquier cosa menos un punto". ¿Qué pasaría si en vez de `[^.]*?` usara `.*?`?
Pista: piensa en un mensaje con dos frases seguidas.

## 🎤 Para la entrevista

**Concepto:** *la salida de un modelo es entrada no confiable.*

> "Un prompt es una petición, no una garantía. Cualquier propiedad que deba cumplirse siempre
> necesita una comprobación determinista fuera del modelo: guardas la fuente de verdad, comparas la
> salida contra ella y la reparas. La regla en el prompt mejora la primera respuesta; el que responde
> por la corrección es el código."

**Te van a repreguntar:** *"¿y por qué no simplemente reintentas con el modelo?"*
Respuesta: cuesta otra llamada y otro par de segundos con el cliente esperando, y **no garantiza
nada** — puede volver a fallar. La reparación determinista siempre acierta y cuesta cero.

---

# Caso 2 — La alerta que se detectaba a sí misma

## El síntoma

**25 de agosto, 5:16 p.m.** Deicy recarga los créditos de Anthropic. A las **6:15** y a las **7:15**
la alerta vuelve a sonar: *"La cuenta de Anthropic se quedó SIN SALDO"*. Con la cuenta llena.

## 🔍 Tu turno: averígualo

**Paso 1 — ¿cuándo fue la última falla de verdad?**

```bash
sudo -n mysql bot_ardisa -e \
  "SELECT id, creado_en, resuelto_en, LEFT(detalle,60) AS d FROM alertas WHERE tipo='ia_sin_saldo' ORDER BY id DESC LIMIT 5;"
```

**Paso 2 — busca la frase en las ejecuciones, como hacía el vigilante:**

```bash
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
for eid in (137223, 137660):
    s = con.execute("SELECT data FROM execution_data WHERE executionId=?", (eid,)).fetchone()[0]
    i = s.find('credit balance is too low')
    print("=== exec", eid, "===")
    print(s[max(0,i-260):i+120])
PY
```

**Compara los dos con calma.** Uno es un error de verdad de la API. El otro NO lo es.
*¿Qué tiene el primero que el segundo no tiene?* Esa diferencia es toda la respuesta.

## ✅ Lo que era

```
exec 137223 (REAL):
  ..."NodeApiError","Your credit balance is too low to access the Anthropic API..."

exec 137660 (ECO):
  ..."La cuenta de Anthropic se quedó SIN SALDO: 1 conversaciones ... recibieron
      'credit balance is too low'. El bot NO puede clasificar..."
```

**El segundo es el texto de la propia alerta.** El vigilante buscaba `credit balance is too low`
dentro de las ejecuciones de n8n… y el mensaje que él mismo escribe **citaba esa frase**. Ese mensaje
viaja por n8n cuando se entrega al WhatsApp. Resultado:

```
vigilante crea alerta → n8n la entrega → esa ejecución CONTIENE la frase
                                       → una hora después el vigilante la encuentra → ⟳
```

De **23 detecciones en 40 horas, solo 8 eran reales.** Las otras 15 eran su propio eco. Las reales
fueron de 15:49 a **17:15** — un minuto antes de la recarga. La recarga sí funcionó.

La diferencia que lo arregla: el error real sigue con **`to access the Anthropic API`**; la cita de
la alerta se corta antes, en el apóstrofo. Dos frenos, independientes:

1. La aguja pasa a ser la frase completa.
2. El mensaje de la alerta ya no cita nada en inglés.

**Ejercicio.** Abre `tests/test_vigilante_saldo.py` y cambia la aguja a la versión corta:
```python
AGUJA_SIN_SALDO = "credit balance is too low"
```
Corre `python3 tests/test_vigilante_saldo.py`. **¿Cuáles aserciones se ponen en ❌?** Devuélvelo
como estaba después.

## 🎤 Para la entrevista

**Concepto:** *bucle de retroalimentación del observador.*

> "Un sistema de monitoreo nunca debe poder observar sus propios efectos. Si el detector escribe en
> el mismo canal que inspecciona, su salida se vuelve su entrada y genera falsos positivos que se
> auto-sostienen. La regla es aislar el canal de observación del de notificación."

**Y el segundo, que vale por sí solo:**

> "Una firma de detección debe ser específica, no solo estar presente. La diferencia entre un
> detector bueno y uno ruidoso casi nunca es el algoritmo: es cuán específica es la firma."

---

# Caso 3 — "¿Tienen envíos a Bogotá?" → Servicio al Cliente

## El síntoma

**26 de agosto, 9:09 a.m.**, un cliente de Bucaramanga:

- 9:09 — *"tiene envios a bogota??"* → el bot le manda el WhatsApp y el correo de **Servicio al Cliente**.
- 9:21 — recordatorio de inactividad.
- 9:24 — *"Estoy interesado en una basurera q ustedes man4jan"* → menú de marcas **a secas**.

## 🔍 Tu turno: averígualo

**Paso 1 — ¿fue una palabra clave o fue la IA?** Mira si "envío" está en el filtro de regex:

```bash
grep -n "KW_INFO *=" build_f1.py | head -1
```

*¿Aparece "envío" ahí? Si no aparece… ¿quién decidió?*

**Paso 2 — esta es la técnica más útil de todo el cuaderno.** n8n **no** guarda un JSON normal:
guarda un **array plano** donde cada texto se escribe una vez y los demás sitios lo apuntan por su
número de posición. Por eso al mirar en crudo sale `{"ciudad":"395"}` — la ciudad no es "395",
**está en la casilla 395**. Hay que resolverla:

```bash
python3 - <<'PY'
import sqlite3, json
con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
s = con.execute("SELECT data FROM execution_data WHERE executionId=139046").fetchone()[0]
arr = json.loads(s)
def R(v):
    try: return arr[int(v)]
    except Exception: return v
for x in arr:
    if isinstance(x, dict) and 'en_alcance' in x:
        print({k: (R(v) if isinstance(v, str) and v.isdigit() else v) for k, v in x.items()})
        break
PY
```

**Antes de correrlo, predice:** ¿el campo `ciudad` va a venir vacío o va a decir algo?

**Paso 3 — el otro mensaje.** Repite el comando cambiando `139046` por `139081` (la basurera) y
mira el campo `acuse`.

## ✅ Lo que era

```python
exec 139046 → {'ciudad': 'Bogotá', 'en_alcance': False, 'es_info': True,
               'resumen': 'Pregunta si hacen envíos a Bogotá, sin especificar producto.'}

exec 139081 → {'productos': ['basurera'], 'en_alcance': True,
               'acuse': 'Entendido, buscas una basurera.'}
```

Léelo dos veces, porque es lo contrario de lo que parecía:

- **La IA sacó la ciudad.** Y el bot, doce minutos después, le preguntó *"¿en qué ciudad te encuentras?"*.
- **La IA escribió el acuse.** Y el código tenía la orden `st.acuse='';` — lo botaba.

O sea: **la IA acertó y el código tiró el resultado.** Los dos defectos viven en el *traspaso* entre
las dos piezas, no dentro de ninguna. Por eso ninguna auditoría anterior los había cogido: cada pieza
pasa su prueba por separado.

El fallo de clasificación tiene su propio nombre: la definición de `es_info` del prompt hablaba de
trámites (facturación, certificados, cartera) y **la logística no estaba en ninguna de las dos listas**.
Cayó en tierra de nadie.

Tres arreglos:
1. Al prompt se le enseñó la categoría que faltaba: envíos, sedes, horarios y formas de pago son
   **preventa**, no trámite.
2. `KW_PREVENTA` como **veto** — no enruta (la IA sigue mandando), solo impide que la rama de "info"
   se trague una consulta comercial. Lleva `&& !KW_INFO.test(low)` para que un trámite real siga
   yendo a PQRS.
3. La ciudad que la IA extrae se guarda, se le acusa recibo y **no se vuelve a preguntar**.

## 🎤 Para la entrevista

**Concepto A — clasificador con categoría faltante:**

> "Cuando un clasificador falla de forma sistemática en un tipo de entrada, lo primero no es afinar
> el umbral: es revisar si la taxonomía tiene un hueco. Un clasificador nunca se abstiene — si falta
> la clase, empuja la entrada a la vecina más cercana con confianza alta."

**Concepto B — pérdida de información en la frontera:**

> "Cuando un sistema de varias etapas se equivoca, el error rara vez está dentro de una etapa: está
> en la frontera, donde una produce y otra consume. Antes de culpar al modelo hay que verificar qué
> extrajo realmente y qué de eso llegó a usarse."

**Para el bot, en una frase:** *todo dato que el modelo extrae y el código no usa es una pregunta que
el cliente va a tener que responder dos veces.*

---

# Caso 4 — Los datos ya no salen de SAP

## Qué cambió, y por qué te importa

El 25 de agosto el bot dejó de preguntarle a SAP y pasó a preguntarle **a la página**. No fue un
capricho: SAP devolvía referencias que existen en el sistema pero **no se venden**, y el bot las
ofrecía. La página publica solo lo que sí se vende.

El interruptor vive en la base de datos, no en el código:

```bash
sudo -n mysql bot_ardisa -e "SELECT clave, valor FROM config ORDER BY clave;"
```

Busca `fuente_datos`. **Volver a SAP es un `UPDATE`, no un despliegue.** Eso tiene nombre:
*feature flag*, y es una respuesta de entrevista por sí sola.

## 🔍 Tu turno

**Paso 1 — el catálogo:**
```bash
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
curl -s -A "$UA" 'https://www.ardisa.com/graphql' -H 'Content-Type: application/json' \
  -d '{"query":"{products(search:\"cemento gris\",pageSize:5){total_count items{sku name price_range{minimum_price{final_price{value}}}}}}"}'
```

**Paso 2 — la existencia real**, que es el endpoint propio de la tienda (el que pinta "Agotado"):
```bash
curl -s -A "$UA" 'https://www.ardisa.com/inventorybycity/product/batchstockinfo?skus=10021733,10014960,10011990'
```

Compara los tres. Uno tiene existencias y dos no. **Ese fue el caso de Deicy "solo tengo Alion".**

**Pregunta para pensar:** el `city_id` que devuelve es 905 (Bucaramanga). Si un cliente de Bogotá
pregunta, y a esa plaza todavía no le han asignado fuentes de inventario en Magento, **todo** le
saldría en `no_source`. ¿Qué debería hacer el bot: decirle que no hay nada, o callarse sobre
existencias? Mira `nota_stock` en `build_f1.py` y contrasta con lo que pensaste.

## 🎤 Para la entrevista

> "Migramos la fuente de datos de un ERP a la API pública de la tienda porque el ERP exponía el
> catálogo interno completo, incluidas referencias descontinuadas. La tienda es el subconjunto
> curado: lo que está publicado es lo que se vende. La migración se hizo detrás de un *feature flag*
> en base de datos, así que el rollback es un UPDATE y no un despliegue."

---

# Caso 5 — Por qué el bot costaba el triple

## El síntoma

25 de agosto: se acaba el saldo de la API a las 15:49 y **nadie se entera** hasta que alguien prueba.
El bot degradaba bien —seguía registrando leads— pero sin clasificar ni cotizar.

## 🔍 Tu turno

Mira una respuesta real de la IA de hoy y busca tres números:

```bash
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
c = con.cursor()
c.execute("""SELECT d.data FROM execution_entity e JOIN execution_data d ON d.executionId=e.id
             WHERE e.workflowId='botArdisaFase1x' ORDER BY e.id DESC LIMIT 40""")
for (s,) in c.fetchall():
    i = s.find('"input_tokens"')
    if i > 0:
        print(s[i-40:i+230]); break
PY
```

Busca `input_tokens`, `cache_creation_input_tokens` y `cache_read_input_tokens`.

**La pregunta:** los tokens de `cache_read` se cobran a **la décima parte**. Si en tu resultado ese
número es grande y `input_tokens` es pequeño, ¿qué está pasando? Y si `cache_read` fuera **0** en
todas las llamadas, ¿qué habría que revisar?

## ✅ Lo que era

Hasta el 25-ago `cache_read_input_tokens` era **0** en todas las llamadas: se re-enviaban ~8.500
tokens de instrucciones en cada mensaje, a precio completo. El arreglo fue mandar el `system` como
**lista de bloques** con `cache_control`:

```js
system:[{type:'text', text:_sys, cache_control:{type:'ephemeral'} }]
```

Medido: agosto 1–25 costó **US$46,10**. Con la caché, el mismo volumen sale en **~US$20**.

Y para que no vuelva a pasar en silencio, el vigilante ahora avisa el mismo día — el mismo vigilante
del Caso 2, que por eso hubo que arreglar dos veces.

**Ojo con la trampa:** la caché es un **prefijo exacto**. Si en las instrucciones metes una fecha con
hora, un identificador aleatorio o un JSON sin ordenar, **el prefijo cambia en cada llamada y la
caché nunca acierta**. Ahí es donde `cache_read = 0` te delata.

## 🎤 Para la entrevista

> "El prompt caching funciona por coincidencia de prefijo: cualquier byte que cambie invalida todo lo
> que va después. Se pone lo estable primero —instrucciones, herramientas— y lo volátil al final. Se
> verifica con `cache_read_input_tokens`: si es cero en llamadas repetidas, hay un invalidador
> silencioso, típicamente un timestamp o un UUID dentro del prompt."

---

# Los cinco conceptos, en una página

Si solo te llevas una hoja de este cuaderno, que sea esta.

| # | Concepto | En una frase | El caso |
|---|---|---|---|
| 1 | La salida de un modelo es entrada no confiable | Un prompt pide; el código garantiza | El precio escondido |
| 2 | Bucle de retroalimentación del observador | Un detector no debe poder verse a sí mismo | La alerta que se auto-alertaba |
| 3 | Clasificador con categoría faltante | Nunca se abstiene: empuja al cajón vecino | Envíos → PQRS |
| 4 | Pérdida en la frontera entre componentes | Cada pieza pasa su prueba; el traspaso no | La ciudad que se botaba |
| 5 | Caché por prefijo | Lo estable primero, lo volátil al final | `cache_read = 0` |

**Y el hilo que los une todos**, que es lo que de verdad aprendimos en estos tres días:

> Los cinco casos son *una decisión importante que dependía de que algo se portara bien* —el modelo,
> el clasificador, la instrucción— **sin una comprobación debajo**. Cuando eso falla, el cliente cae
> al vacío y nadie se entera. Arreglar el caso es parchear. Poner la comprobación es corregir.

---

# Tu examen (sin mirar)

Contesta con tus palabras. Si una no te sale, vuelve a su caso.

1. El bot tiene el precio en los datos y escribe "no pudimos confirmar el precio".
   **¿Por qué no basta con reforzar la regla del prompt?**
2. Una alerta sigue sonando después de arreglar la causa. **Nombra dos hipótesis** antes de mirar
   nada, y di **qué comando** correrías para descartar cada una.
3. Un clasificador manda a "trámites" una pregunta comercial. **¿Qué revisas primero: el umbral, los
   ejemplos, o la lista de categorías?** ¿Por qué?
4. Un compañero dice "la IA está bruta, no entiende nada". **¿Qué le pides antes de aceptarlo?**
5. `cache_read_input_tokens` sale en 0 en todas las llamadas. **Da tres causas posibles.**
6. Vas a borrar 85 archivos de respaldo para liberar disco. **¿Qué haces antes, y por qué?**

> La 4 y la 6 son las que separan a alguien que programa de alguien en quien se confía para operar
> un sistema en producción.
