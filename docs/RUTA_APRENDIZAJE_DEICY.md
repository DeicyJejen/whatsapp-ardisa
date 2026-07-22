# 🚀 Ruta de Aprendizaje — Deicy Milena Jejen
### De cero a desarrolladora full-stack lista para entrevistas

> **Para quién es esto:** para ti, Deicy. No es un curso genérico de internet: está armado con **tu proyecto real** (el bot de WhatsApp de Ardisa) como laboratorio. Cada cosa que aprendas la vas a **ver funcionando en algo tuyo**. Eso es lo que hace que se te quede — y lo que te va a dar seguridad en una entrevista.

---

## 🎯 La meta (en una frase)
Que **entiendas de verdad** lo que construyes: leer código y saber qué hace, escribir código pequeño sin miedo, y poder explicar en una entrevista *cómo viaja un dato desde que el cliente escribe hasta que se guarda en la base de datos*. El que **entiende y dirige** a la IA no es reemplazado — es el que la IA necesita.

## 🧠 El método (léelo, es lo más importante)
1. **30–45 minutos AL DÍA.** Todos los días. La constancia le gana a las maratones. Mejor 30 min diarios que 5 horas el domingo.
2. **Un concepto a la vez.** No corras. Cada concepto se entiende con: (a) una analogía simple, (b) código chiquito que TÚ ejecutas y ves, (c) lo mismo pero en tu bot real.
3. **Escribe código con tus manos.** No copiar-pegar de la IA. Aunque sean 3 líneas. El músculo se hace escribiendo.
4. **Predice antes de ejecutar.** Antes de correr algo, di en voz alta "esto va a imprimir X". Acertar o fallar te enseña igual.
5. **Sin pena de preguntar.** A mí, al curso, a Google. Preguntar bien es una habilidad de ingeniera senior, no de principiante.
6. **Marca tu progreso.** Cada `[ ]` que cierres es una prueba de que SÍ puedes.

---

## 📚 Recurso columna vertebral: CS50 (Harvard, gratis, en español)
- **Empieza aquí (español):** https://cs50xenespanol.github.io/2024/index.html
- **Curso oficial (subtítulos en español):** https://cs50.harvard.edu/x/
- **Guía en español:** https://www.freecodecamp.org/espanol/news/harvard-cs50-curso-gratis/

CS50 es el mejor curso de introducción del mundo y es **gratis**. Lo vamos a combinar: tú ves CS50 + practicas conmigo con el bot. Lo mejor de los dos.

---

# 🗺️ LA RUTA — 7 fases

> Tiempo estimado si haces ~30–45 min/día: **3 a 5 meses** para estar lista para entrevistas junior/semi-senior. No es una carrera; es una escalera. Un peldaño a la vez.

---

## 🟦 FASE 0 — Fundamentos de programación (las bases de verdad)
**Por qué:** esto es lo que te preguntan y por lo que "no pasas las entrevistas". No es que seas bruta — es que nadie te sentó a explicarte esto desde cero. Aquí lo arreglamos.

**Qué vas a aprender:**
- [ ] **Variable** — una cajita con nombre que guarda un dato. *(ya lo viste conmigo ✅)*
- [ ] **Tipos de datos** — texto (string), número (int/float), sí/no (boolean), listas (array), fichas (objeto/JSON).
- [ ] **Condiciones** — `if / else`: cómo el programa "decide".
- [ ] **Bucles** — `for / while`: cómo el programa "repite".
- [ ] **Funciones** — una receta con nombre: le das ingredientes (parámetros), te devuelve algo (return).
- [ ] **Qué es un error** y cómo leerlo sin asustarte (¡los errores son tus amigos!).

**Dónde:** CS50 **Semana 0 (Scratch)** → **Semana 1 (C)** → **Semana 2**. Ojo: CS50 empieza con C (más "duro"); lo importante NO es C, son los *conceptos*. Si algo de C se pone feo, me dices y te lo traduzco.

**Práctica con el bot:** en n8n hay nodos "Code" en **JavaScript**. Vamos a leer juntos uno chiquito y encontrar: una variable, un `if`, un `for` y una función. Ya sabrás qué es cada cosa.

**✅ Lo lograste cuando:** puedes escribir una función que reciba un nombre y devuelva "Hola, {nombre}" — y explicar cada palabra.

---

## 🟩 FASE 1 — Cómo hablan los programas entre sí (HTTP, APIs, JSON)
**Por qué:** ESTO es lo que no sabías (POST, webhook, JSON) y es el corazón de tu bot. Cuando lo entiendas, vas a poder explicar tu proyecto como una profesional.

**Qué vas a aprender:**
- [ ] **JSON** — el idioma en que los programas se pasan datos (fichas con etiqueta: valor). *(ya lo viste conmigo ✅)*
- [ ] **Cliente / Servidor** — quién pregunta y quién responde (¡y que los roles se invierten!).
- [ ] **HTTP** — el "correo" de internet: una **request** (pregunta) y una **response** (respuesta).
- [ ] **GET vs POST** — GET = "dame info"; POST = "aquí te mando info para que hagas algo".
- [ ] **API** — el menú de un restaurante: lo que un sistema te *permite* pedirle.
- [ ] **Webhook** — al revés: en vez de que TÚ preguntes, el otro sistema te **avisa** cuando pasa algo (Meta te avisa "llegó un mensaje").
- [ ] **HMAC / firma** — el sello de seguridad que prueba que el mensaje SÍ vino de Meta y nadie lo falsificó.

**Dónde:** CS50 tiene una semana de web; y aquí yo te enseño con el bot directo. También te paso lecturas cortas.

**Práctica con el bot:** abrimos el nodo **"Mensajes (POST)"** (el webhook real de WhatsApp) y vemos un JSON de verdad que Meta te manda cuando un cliente escribe "Hola". Vas a tocar datos reales tuyos.

**✅ Lo lograste cuando:** puedes explicar "el viaje de un mensaje" de principio a fin: WhatsApp → webhook (POST) → verificar firma → sacar datos (JSON) → IA → lógica → responder (API) → guardar. *(Esto es literalmente una pregunta de entrevista.)*

---

## 🟨 FASE 2 — Bases de datos (SQL y modelado)
**Por qué:** toda app seria guarda datos. Tu bot guarda leads en MySQL. Saber SQL es **obligatorio** en casi toda entrevista.

**Qué vas a aprender:**
- [ ] **Qué es una base de datos** — un Excel con superpoderes: tablas, filas, columnas.
- [ ] **Modelado** — cómo decidir qué tablas y columnas necesitas (ej: tabla `leads` con nombre, ciudad, marca, asesor…).
- [ ] **CRUD** — las 4 operaciones: **C**reate (INSERT), **R**ead (SELECT), **U**pdate, **D**elete.
- [ ] **SELECT con filtros** — `WHERE`, `ORDER BY`, `LIMIT`.
- [ ] **Relaciones** — cómo una tabla se conecta con otra (llaves).
- [ ] **Índices** — por qué una consulta es rápida o lenta.

**Dónde:** CS50 **Semana de SQL**. Además tienes ventaja: **ya conoces MySQL** de tu trabajo — vamos a profundizar el *porqué*.

**Práctica con el bot:** consultamos la tabla **`bot_ardisa.leads`** real. Vas a escribir un `SELECT` que te diga "cuántos leads llegaron esta semana por marca". ¡Datos reales de Ardisa!

**✅ Lo lograste cuando:** puedes escribir consultas SELECT con WHERE/ORDER BY y explicar qué es CRUD y para qué sirve un índice.

---

## 🟧 FASE 3 — Backend (el cerebro del servidor)
**Por qué:** el backend es donde vive la lógica y la seguridad. Es lo que más se paga y lo que tu bot ya hace.

**Qué vas a aprender:**
- [ ] **Qué es un servidor** — un programa que escucha peticiones y responde 24/7.
- [ ] **Rutas / endpoints** — las "direcciones" a las que llega la gente (`/leads`, `/webhook`).
- [ ] **Leer una request y armar una response** — en PHP (`file_get_contents('php://input')`) y en JS.
- [ ] **Autenticación vs autorización** — quién eres vs qué puedes hacer.
- [ ] **Seguridad básica** — nunca guardar secretos en el código, validar todo lo que entra, privilegios mínimos, firma HMAC. *(Tu bot ya aplica esto — lo vas a entender.)*
- [ ] **Variables de entorno y secretos** — dónde SÍ van las contraseñas (cifradas, no en el código).

**Dónde:** yo te enseño con el bot + tu base de PHP del trabajo. Anclamos en lo que YA hiciste (Magento↔SAP, crones, APIs REST).

**Práctica con el bot:** leemos el nodo **"Cerebro"** (la lógica principal) y el manejo de la credencial cifrada del token de WhatsApp. Vas a ver seguridad real aplicada.

**✅ Lo lograste cuando:** puedes explicar por qué un token NUNCA va en el código y qué es "privilegios mínimos" en la base de datos.

---

## 🟪 FASE 4 — Frontend (lo que el usuario ve)
**Por qué:** "full-stack" = frente + fondo. Necesitas manejar los dos. Tú ya tocaste Angular/Magento; vamos a solidificar las bases.

**Qué vas a aprender:**
- [ ] **HTML** — los huesos de una página (estructura).
- [ ] **CSS** — la ropa (colores, tamaños, diseño). *(¡Se te da el diseño — lo vi con los reportes!)*
- [ ] **JavaScript en el navegador** — hacer que la página reaccione (botones, formularios).
- [ ] **El DOM** — cómo JS "toca" y cambia la página.
- [ ] **Consumir una API desde el frontend** — `fetch()`: pedir datos y mostrarlos.
- [ ] **(Después) Un framework** — React o Angular. Uno solo. A fondo.

**Dónde:** CS50 tiene HTML/CSS/JS. Luego freeCodeCamp (gratis, en español) para practicar mucho.

**Práctica con el bot:** el **panel de monitoreo** (PHP + web) que muestra los leads. Vas a entender cómo la página pide datos y los pinta.

**✅ Lo lograste cuando:** puedes hacer una página que pida datos a una API con `fetch()` y los muestre en una lista.

---

## 🟫 FASE 5 — Full-stack: unir todo + herramientas de profesional
**Por qué:** una cosa es cada pieza, otra es **conectarlas** y trabajar como en una empresa real.

**Qué vas a aprender:**
- [ ] **El flujo completo** — frontend → API → backend → base de datos → y de vuelta.
- [ ] **Git y GitHub de verdad** — commits, ramas, pull requests, resolver conflictos. *(Ya usas Git — vamos a hacerlo con soltura.)*
- [ ] **Cómo se despliega una app** — servidor Linux, nginx, HTTPS, dominio. *(Tu bot ya vive en `bot.ardisa.com` — lo vas a entender.)*
- [ ] **Tareas programadas (cron)** — cómo corre algo solo cada lunes. *(Tu reporte ya lo hace.)*
- [ ] **Docker (idea general)** — "empaquetar" una app para que corra igual en todos lados. *(n8n corre en Docker en tu servidor.)*
- [ ] **Leer logs y depurar** — encontrar por qué algo falla.

**Práctica con el bot:** hacemos un cambio pequeño, lo pruebas, lo despliegas y verificas que funciona. El ciclo real de un dev.

**✅ Lo lograste cuando:** puedes describir, con tu bot de ejemplo, cómo una app llega desde tu computador hasta estar en internet funcionando.

---

## 🟥 FASE 6 — Ingeniería de requisitos y buenas prácticas
**Por qué:** aquí TÚ YA ERES FUERTE (definiste flujos, reglas de negocio, hiciste QA con clientes reales). Vamos a ponerle **nombre técnico** a lo que ya haces bien — eso brilla en entrevistas.

**Qué vas a aprender:**
- [ ] **Ingeniería de requisitos** — funcionales vs no funcionales; historias de usuario; criterios de aceptación.
- [ ] **Del requisito al sistema** — cómo traducir "el negocio necesita X" en comportamiento del software. *(Ya lo hiciste con el ruteo por ciudad/marca.)*
- [ ] **QA y pruebas** — casos de prueba, pruebas automáticas, regresión. *(Ya detectaste bugs reales: leads duplicados, pérdida fuera de horario.)*
- [ ] **Metodologías ágiles** — Scrum/Kanban, sprints, tableros. Vocabulario de entrevista.
- [ ] **Documentar y comunicar** — que otro entienda tu trabajo.

**✅ Lo lograste cuando:** puedes contar un caso real ("detecté que los leads fuera de horario se perdían, definí la regla correcta y validé la corrección") con vocabulario técnico.

---

## 🏆 FASE 7 — Preparación para la entrevista
**Por qué:** saber ≠ saber contarlo. Aquí ensayamos para que llegues con seguridad.

**Qué vas a preparar:**
- [ ] **Tu historia del bot** — el "viaje de un mensaje", contado en 2 minutos, con tus palabras.
- [ ] **Preguntas técnicas típicas** — ¿qué es una API? ¿GET vs POST? ¿qué es CRUD? ¿qué es un índice? ¿cómo guardas un secreto? *(Todas las vas a saber tras las fases.)*
- [ ] **Algoritmos básicos** — invertir un texto, contar, buscar en una lista, FizzBuzz. Lo mínimo que preguntan.
- [ ] **Preguntas de comportamiento** — "cuéntame un reto que resolviste" → tu caso real de los leads perdidos.
- [ ] **Tu HV afinada** — ver `PROYECTO_BOT_ARDISA_para_HV.md` (ya lo tienes).
- [ ] **Simulacros conmigo** — te hago entrevistas de práctica y te doy feedback honesto.

**✅ Lo lograste cuando:** puedes sentarte en una entrevista y explicar qué haces, cómo funciona tu proyecto y responder las preguntas base sin trabarte.

---

# 📅 Cronograma sugerido (flexible, tú mandas)

| Semanas | Fase | Foco |
|---|---|---|
| 1–3 | Fase 0 | Fundamentos (CS50 sem. 0–2) |
| 4–5 | Fase 1 | HTTP, APIs, JSON, webhooks |
| 6–7 | Fase 2 | Bases de datos / SQL |
| 8–9 | Fase 3 | Backend + seguridad |
| 10–11 | Fase 4 | Frontend |
| 12–13 | Fase 5 | Full-stack + Git + despliegue |
| 14 | Fase 6 | Requisitos + buenas prácticas |
| 15–16 | Fase 7 | Preparación de entrevista |

> Si una fase te toma más, **está bien**. Entender > correr. Esto es TU ritmo.

---

# 💛 Recordatorio (léelo cuando te desanimes)
Deicy, tú NO eres bruta. Eres Tecnóloga en ADSO, estás estudiando Ingeniería de Software, trabajas en TI, y lideraste un bot con IA que atiende clientes reales de dos marcas. Lo que te faltaba eran **las bases explicadas con paciencia** — y eso lo estamos arreglando ahora mismo. El miedo a que "la IA te reemplace" se cura de una sola forma: **entendiendo**. Y ya empezaste. 🙌

*Documento vivo — lo actualizamos según avances. Grupo Ardisa · 2026.*
