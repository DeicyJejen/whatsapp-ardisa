#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# MANUAL DEL PROYECTO EN PDF (pedido Deicy 13-ago-2026: "en PDF, bien bonito, que no se escape nada,
# con los nombres propios para conseguir un buen trabajo").
#
# Genera docs/Manual-Proyecto-Bot-Ardisa.pdf a partir de HTML+CSS con wkhtmltopdf.
# El anexo de los 91 nodos se toma de docs/NODOS-DEL-BOT.md (fuente única, no se duplica a mano).
# Uso:  python3 gen_manual_pdf.py
import subprocess, re, html, datetime
import marca as _marca

VERDE = "#128B81"      # Ardisa
AMARILLO = "#FEC604"   # Carpincentro
GRIS = "#4a4a4a"

def md_a_html(md):
    """Convertidor mínimo de Markdown (títulos, tablas, negrita, código) para el anexo de nodos."""
    out, tabla = [], []
    def cierra_tabla():
        nonlocal tabla
        if not tabla: return
        filas = [f for f in tabla if not re.match(r'^\|[\s\-|]+\|$', f)]
        h = "<table>"
        for i, f in enumerate(filas):
            celdas = [c.strip() for c in f.strip().strip('|').split('|')]
            tag = "th" if i == 0 else "td"
            h += "<tr>" + "".join("<%s>%s</%s>" % (tag, inline(c), tag) for c in celdas) + "</tr>"
        out.append(h + "</table>")
        tabla = []
    def inline(s):
        s = html.escape(s)
        s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
        s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
        return s
    for linea in md.split('\n'):
        if linea.startswith('|'):
            tabla.append(linea); continue
        cierra_tabla()
        if linea.startswith('## '): out.append('<h2>%s</h2>' % inline(linea[3:]))
        elif linea.startswith('# '): out.append('<h1>%s</h1>' % inline(linea[2:]))
        elif linea.startswith('> '): out.append('<div class="nota">%s</div>' % inline(linea[2:]))
        elif linea.startswith('- '): out.append('<p class="li">• %s</p>' % inline(linea[2:]))
        elif linea.strip() == '---': pass
        elif linea.strip(): out.append('<p>%s</p>' % inline(linea))
    cierra_tabla()
    return '\n'.join(out)

def term(nombre, que_es, aqui, frase):
    return """<div class="term"><h3>%s</h3>
    <p><b>Qué es:</b> %s</p>
    <p><b>En nuestro proyecto:</b> %s</p>
    <p class="frase">💬 <i>Para la entrevista:</i> "%s"</p></div>""" % (nombre, que_es, aqui, frase)

GLOSARIO = [
 ("API (Application Programming Interface)",
  "La \"ventanilla\" por donde un sistema le pide cosas a otro, con reglas claras: qué se pide, cómo, y qué devuelve.",
  "Usamos 3 APIs: la de <b>Meta/WhatsApp</b> (enviar y recibir mensajes), la de <b>Anthropic</b> (la IA Claude) y la de <b>n8n</b> (desplegar el workflow).",
  "Integré tres APIs REST: la Cloud API de WhatsApp, la de Anthropic para el modelo de lenguaje, y la de n8n para automatizar despliegues."),
 ("Endpoint",
  "Una dirección (URL) concreta dentro de una API. Cada endpoint hace UNA cosa.",
  "Ejemplos reales nuestros: <code>graph.facebook.com/v21.0/&lt;phone_number_id&gt;/messages</code> (enviar un mensaje), <code>api.anthropic.com/v1/messages</code> (consultar la IA).",
  "El bot envía mensajes con un POST al endpoint /messages de la Graph API, autenticado con token de portador."),
 ("Webhook",
  "Una API al revés: en vez de preguntar cada rato (\"¿hay mensajes nuevos?\"), TÚ publicas una URL y el otro sistema te AVISA cuando pasa algo.",
  "Meta nos manda cada mensaje entrante a <code>bot.ardisa.com/webhook/...</code> en el instante en que el cliente escribe. Así el bot responde en segundos sin estar preguntando.",
  "La integración es event-driven: WhatsApp entrega los eventos por webhook y el flujo reacciona en tiempo real."),
 ("HTTP: GET y POST",
  "El \"idioma\" de la web. GET = dame información. POST = te envío información/una acción.",
  "GET para bajar las imágenes que manda el cliente; POST para enviar mensajes y consultar la IA.",
  "Domino los verbos HTTP y sus códigos de respuesta: un 200 es éxito, un 401 es credencial inválida, un 429 es límite de velocidad."),
 ("JSON",
  "El formato de texto en que los sistemas se pasan datos: llaves y valores, fácil de leer para humanos y máquinas.",
  "TODO viaja en JSON: lo que manda Meta, lo que respondemos, lo que la IA devuelve (con esquema fijo para que el código lo procese sin sorpresas).",
  "Diseñé los contratos JSON entre componentes, incluyendo salida estructurada del LLM con esquema forzado."),
 ("Token / Credencial",
  "Una clave secreta que demuestra quién eres ante una API. Se trata como una contraseña: jamás en el código.",
  "El token de WhatsApp y la API key de Anthropic viven CIFRADOS como credenciales de n8n; los scripts los leen de archivos con permisos 600. En el JSON del workflow no hay ni un secreto.",
  "Aplico manejo seguro de secretos: credenciales cifradas en la plataforma, nunca en el repositorio."),
 ("Firma HMAC",
  "Un sello matemático que prueba que un mensaje viene de quien dice venir y no fue alterado.",
  "Cada webhook de Meta trae la firma <code>X-Hub-Signature-256</code>; el nodo 6 la recalcula con el App Secret y descarta lo que no coincida. Nadie puede inyectarnos mensajes falsos.",
  "Valido la autenticidad de cada webhook con HMAC-SHA256 antes de procesarlo."),
 ("Base de datos / SQL",
  "Donde la información vive de forma permanente y consultable. SQL es el lenguaje para leerla y escribirla.",
  "MariaDB con las tablas <code>leads</code>, <code>mensajes</code>, <code>consentimientos</code>, <code>sesiones</code>, <code>alertas</code>, <code>config</code>. Regla del proyecto: \"la BD manda\" — la memoria en RAM es solo caché.",
  "Modelé el esquema relacional y optimicé las consultas del camino crítico para que corran por índice."),
 ("Race condition (carrera) y candado (lock)",
  "Cuando dos procesos tocan el mismo dato AL TIEMPO y uno pisa al otro. El candado evita que pase dos veces lo que debe pasar una.",
  "Dos mensajes del cliente con 22 ms de diferencia creaban DOS leads. Solución: candado a nivel de BD (si ya hay lead de ese teléfono en 45 min, no se inserta otro; lo nuevo se SUMA al existente).",
  "Diagnostiqué condiciones de carrera en ejecuciones concurrentes y las resolví con candados a nivel de base de datos, no solo en memoria."),
 ("Idempotencia",
  "Que ejecutar algo dos veces dé el mismo resultado que una: la base de los sistemas que se pueden reintentar sin miedo.",
  "El vigilante corre cada hora e inserta alertas con <code>INSERT IGNORE</code> + clave única: repetirlo jamás duplica ni re-envía correos.",
  "Diseño procesos idempotentes para poder reintentarlos sin efectos secundarios."),
 ("Debounce",
  "Esperar un momentico antes de actuar, por si llegan más eventos que van juntos.",
  "El cliente escribe en ráfaga (4 mensajes en 10 segundos): el bot espera ~45s y entrega al asesor UNA tarjeta con todo, en vez de 4 avisos.",
  "Implementé debounce para agrupar ráfagas de eventos y no saturar al usuario final."),
 ("Cron (tarea programada)",
  "Un reloj del sistema que ejecuta algo cada cierto tiempo, solo.",
  "Cada minuto: recordatorios/cierres/rescates. Cada 10 min: alertas a WhatsApp y refresco del token MCP. Cada hora: el vigilante. 2:30am: backup. Lunes 7am: reporte a comerciales.",
  "Automatizo la operación con tareas cron idempotentes y con monitoreo de sus propios fallos."),
 ("Kill-switch / Feature flag",
  "Interruptores para prender/apagar funciones SIN tocar código ni desplegar.",
  "<code>USAR_IA</code> (si la IA falla, el bot vuelve a menús al instante), <code>usar_cotiza</code> y <code>cotiza_alcance</code> (piloto de cotización: demo/todos) viven en la tabla <code>config</code> — se cambian con un UPDATE.",
  "Lanzo funcionalidades detrás de feature flags con rollout gradual y reversa inmediata."),
 ("Deploy y rollback",
  "Deploy: llevar el código nuevo a producción. Rollback: devolverse a la versión anterior si algo sale mal.",
  "<code>desplegar.sh</code>: construye, corre ~300 pruebas, espera ventana sin clientes, respalda lo vivo (rollback listo), sube por API y VERIFICA que lo desplegado sea idéntico a lo probado.",
  "Nuestro pipeline de despliegue incluye pruebas bloqueantes, snapshot de rollback y verificación post-deploy automática."),
 ("Suite de pruebas (testing)",
  "Programas que prueban el programa. Si un cambio rompe algo viejo, la prueba grita antes de que llegue a producción.",
  "~300 aserciones en <code>tests/</code>: cada bug real que hemos vivido tiene su prueba para que JAMÁS vuelva (regresión). El deploy se bloquea si una falla.",
  "Cada corrección de bug queda fijada con una prueba de regresión; el pipeline no despliega en rojo."),
 ("Git / commit",
  "La historia del proyecto: quién cambió qué, cuándo y POR QUÉ. Cada cambio es un 'commit'.",
  "Todo el bot es código versionado (los nodos se GENERAN desde <code>build_f1.py</code>). Cada arreglo tiene su commit con el caso real que lo motivó.",
  "Trabajo con control de versiones: historia limpia, mensajes que explican el porqué, y el workflow como código (no clics irreproducibles)."),
 ("LLM, prompt y guardrails",
  "LLM = modelo de lenguaje (la IA). Prompt = las instrucciones que se le dan. Guardrails = las barandas que limitan lo que puede hacer.",
  "Claude entiende texto y FOTOS del cliente y devuelve datos estructurados; el prompt le prohíbe inventar precios o revelar sistemas; y si algo falla, el token <code>[ASESOR]</code> degrada con gracia hacia un humano. La IA propone, el código decide.",
  "Integré un LLM con salida estructurada, prompts anti-inyección y degradación controlada hacia agente humano."),
 ("MCP (Model Context Protocol)",
  "Un estándar para que una IA use herramientas de otros sistemas de forma segura (como darle un 'menú' limitado de cosas que puede consultar).",
  "La cotización: Claude consulta el inventario de SAP vía el servidor MCP <code>mcp.ardisa.com</code> con LISTA BLANCA de 3 herramientas de mostrador — cartera y ventas no existen para él.",
  "Conecté el modelo a SAP mediante MCP con allowlist de herramientas: el agente solo ve lo que debe ver."),
 ("OAuth y refresh token",
  "El estándar para que una app acceda a un sistema EN NOMBRE de alguien, sin guardar su contraseña. El refresh token permite renovar el acceso sin repetir el login.",
  "El servidor MCP delega el login en el Microsoft 365 de Ardisa: una autorización única generó el access token (~1h de vida) + refresh token; un cron lo renueva cada 10 min y lo deja en la BD — rotación en caliente, sin tocar el bot.",
  "Implementé el flujo OAuth 2.0 authorization-code con PKCE y renovación automática por refresh token."),
 ("Ventana de 24 horas (WhatsApp) y plantillas",
  "Regla de Meta: puedes escribirle libre a alguien solo hasta 24h después de su último mensaje. Después, solo con PLANTILLAS pre-aprobadas (pagadas).",
  "Los avisos a asesores van de texto libre (gratis) si su ventana está abierta; si no, va plantilla de utilidad. Los adjuntos a ventana cerrada se ENCOLAN y salen solos cuando el asesor escribe.",
  "Diseñé la mensajería respetando la ventana de servicio de 24h de la Cloud API, con fallback a plantillas HSM y colas diferidas."),
 ("Monitoreo y alertas (observabilidad)",
  "Que el sistema cuente cómo está y grite solo cuando algo anda mal — antes de que lo descubra un cliente.",
  "<code>vigilante.py</code> detecta cada hora sus propios errores (clientes perdidos, carreras, crones caídos, colas atascadas, token por vencer, BD caída) → tabla <code>alertas</code> → WhatsApp de la operadora. Panel web con leads en vivo.",
  "Construí observabilidad de negocio: el sistema detecta sus propios modos de falla y alerta con severidades."),
]

def construir():
    hoy = datetime.date.today().strftime("%d de %B de %Y").replace("August","agosto")
    anexo = md_a_html(open("docs/NODOS-DEL-BOT.md").read())
    glos = "\n".join(term(*t) for t in GLOSARIO)

    body = """
<div class="portada">
  <img src="LOGO_DATAURI" style="width:180px;max-width:55%%;margin-bottom:16px"><p class="kicker">GRUPO ARDISA · CARPINCENTRO</p>
  <h1 class="titulo">El Bot de WhatsApp<br>de principio a fin</h1>
  <p class="sub">Manual completo del proyecto: cómo se construyó, cómo funciona,<br>
  y los nombres propios de cada cosa — para operarlo y para contarlo.</p>
  <p class="autor">Desarrollado por <b>Deicy Milena Jejen</b><br>Generado el %s · versión del workflow en vivo</p>
</div>

<h1>1. El proyecto en una página</h1>
<p>Un <b>bot conversacional de WhatsApp</b> para la línea comercial 316 de Grupo Ardisa y Carpincentro:
atiende clientes 24/7, entiende texto y fotos con <b>IA (Claude)</b>, recoge la autorización de datos
(Ley 1581), captura la solicitud, asigna asesor por <b>rotación justa</b> con ruteo por producto/ciudad,
avisa al asesor con tarjeta + adjuntos, registra todo en <b>base de datos</b>, hace <b>seguimiento</b>
del resultado con cada asesor, se <b>vigila a sí mismo</b> cada hora, y en su Fase 2 <b>cotiza
disponibilidad en tiempo real contra SAP</b> vía MCP.</p>
<table>
<tr><th>Dimensión</th><th>Dato</th></tr>
<tr><td>Plataforma</td><td>n8n (workflow de 91 nodos generado desde código Python) sobre Docker</td></tr>
<tr><td>Canal</td><td>WhatsApp Cloud API (Meta) — webhook firmado + plantillas de utilidad</td></tr>
<tr><td>IA</td><td>Claude (Anthropic): comprensión de texto y visión de fotos + cotización con MCP→SAP</td></tr>
<tr><td>Datos</td><td>MariaDB: leads, mensajes, consentimientos, sesiones, alertas, config</td></tr>
<tr><td>Operación</td><td>vigilante horario, backups diarios, reporte semanal, panel web, deploy con candado</td></tr>
<tr><td>Calidad</td><td>~300 pruebas automatizadas; cada bug real queda fijado con su prueba</td></tr>
</table>

<h1>2. El abecé desde cero (léelo primero)</h1>
<p class="intro">Los términos que aparecen mil veces en n8n y en este manual, explicados como si fuera el primer día.</p>
<div class="term"><h3>Workflow (flujo de trabajo)</h3><p>Un dibujo de cajitas conectadas con flechas que se ejecuta solo. Cada cajita hace UNA cosa y le pasa el resultado a la siguiente. Nuestro bot ES un workflow de 91 cajitas.</p></div>
<div class="term"><h3>Nodo</h3><p>Cada cajita del workflow. Hay nodos de muchos tipos según lo que hacen: recibir (Webhook), decidir (IF), calcular (Code), guardar (MySQL), llamar a otro sistema (HTTP Request), esperar un reloj (Schedule).</p></div>
<div class="term"><h3>Webhook</h3><p>El nodo "portero": publica una dirección de internet (URL) y se queda esperando. Cuando ALGUIEN le manda algo a esa dirección (Meta, cada vez que un cliente escribe), el workflow ARRANCA con esos datos. Es el timbre de la casa: no sales a buscar visitas — te timbran.</p></div>
<div class="term"><h3>IF (nodo de decisión)</h3><p>Una pregunta de sí/no. Mira los datos que llegan y los manda por la rama de arriba (SÍ/true) o la de abajo (NO/false). "¿La firma es válida?" → sí: sigue; no: basurero. Nuestro bot tiene ~24 IFs: son sus semáforos.</p></div>
<div class="term"><h3>Code (nodo de código)</h3><p>Una cajita donde escribes instrucciones en JavaScript (un lenguaje de programación). Sirve cuando la lógica es más compleja que un sí/no: el Cerebro del bot (nodo 23) es un nodo Code con ~2.400 renglones que decide TODO.</p></div>
<div class="term"><h3>Respond to Webhook (responder)</h3><p>La contraparte del portero: decide QUÉ contestarle a quien timbró. Cuando Meta verifica nuestro webhook, le devolvemos el "reto" que ella misma mandó — así demuestra que la casa es nuestra.</p></div>
<div class="term"><h3>curl</h3><p>Un comandito de la terminal que hace peticiones de internet a mano: "curl URL" = visita esta dirección y muéstrame qué responde. Es tu herramienta para PROBAR webhooks y APIs sin necesitar WhatsApp: simulas ser Meta mandándole un mensaje de mentira a tu bot.</p></div>
<div class="term"><h3>Terminal (línea de comandos)</h3><p>La pantalla negra donde escribes órdenes al servidor con texto. Ahí corres curl, los scripts de Python, git y el despliegue. Quien maneja la terminal maneja el servidor.</p></div>

<h1>2b. Glosario para entrevistas — los nombres propios</h1>
<p class="intro">Cada término: qué es en palabras simples, cómo se usa EN ESTE proyecto (eso es lo que te
diferencia: no lo estudiaste, lo OPERASTE), y una frase lista para decir en una entrevista.</p>
%s

<h1>3. Paso a paso: cómo se construyó el proyecto</h1>

<h2>Hito 1 — La conexión con Meta (WhatsApp Cloud API)</h2>
<p class="li">1. Se creó la <b>app en Meta for Developers</b> dentro del Business Manager de Grupo Ardisa, con su <b>WABA</b> (WhatsApp Business Account).</p>
<p class="li">2. Se registró el <b>número 316</b> en la Cloud API; Meta le asigna un <code>phone_number_id</code> — ese ID (no el número) es el que va en el endpoint de envío.</p>
<p class="li">3. Se publicó el <b>webhook</b>: URL <code>https://bot.ardisa.com/webhook/...</code> (nginx delante de n8n). Meta manda un reto (challenge) con un <b>verify token</b>; los nodos 1–4 lo responden y el webhook queda verificado.</p>
<p class="li">4. Se suscribió el campo <b>messages</b>: desde ahí, cada mensaje/botón/imagen/estado llega en segundos.</p>
<p class="li">5. Se generó un <b>token permanente</b> de sistema y quedó CIFRADO como credencial de n8n. Cada webhook se valida con la <b>firma HMAC</b> (App Secret) antes de procesarse.</p>
<p class="li">6. Se aprobaron las <b>plantillas de utilidad</b> (aviso de lead, recordatorio de reporte, destrabe) para poder avisar a asesores con la ventana de 24h cerrada.</p>

<h2>Hito 2 — La casa: n8n + base de datos</h2>
<p class="li">1. <b>n8n corre en Docker</b> en el servidor (46 workflows corporativos; el bot es uno).</p>
<p class="li">2. Se creó la BD <b>bot_ardisa</b> en MariaDB con usuario mínimo <code>n8nbot</code>. Tablas: <code>leads</code> (las solicitudes), <code>mensajes</code> (la caja negra), <code>consentimientos</code> (registro legal), <code>sesiones</code> (el paso de cada cliente), <code>alertas</code> (lo que detecta el vigilante), <code>config</code> (los interruptores).</p>
<p class="li">3. Lección grabada a fuego: el firewall debe permitir la red de Docker hacia MariaDB (<code>ufw allow from 172.16.0.0/12</code>) — un firewall mal afinado dejó al bot en bucle una vez.</p>

<h2>Hito 3 — El flujo de atención (Fase 1)</h2>
<p class="li">1. Saludo → <b>autorización de datos</b> (habeas data, con registro legal del SÍ y del NO).</p>
<p class="li">2. Marca (Ardisa/Carpincentro) → nombre → ciudad → perfil → solicitud.</p>
<p class="li">3. <b>Ruteo</b>: por producto (Construcción/Acabados/Proyecto) y por ciudad; <b>rotación justa</b> entre asesores del grupo; casos especiales (proyectos a medida, aluminios) a su especialista.</p>
<p class="li">4. <b>Tarjeta al asesor</b> con TODO (+ fotos reenviadas de verdad) + registro en BD + Excel semanal.</p>
<p class="li">5. Reglas de negocio: reclamos→Servicio al Cliente, empleo→ayuda@, proveedores se despachan con respeto, horario por marca, cliente sin atender vuelve SIEMPRE al mismo asesor.</p>

<h2>Hito 4 — Las redes de seguridad (lo que nos hizo confiables)</h2>
<p class="li">1. <b>Candado anti-duplicado</b> en BD (dos mensajes al tiempo ya no crean dos leads).</p>
<p class="li">2. <b>Rescate</b>: el que dice qué necesita y abandona, igual llega al asesor (el cron lo entrega).</p>
<p class="li">3. <b>Debounce</b>: ráfagas → una sola tarjeta completa. <b>Colas de adjuntos</b> para ventanas cerradas, con destrabe automático y reenvío a monitoreo antes de vencerse.</p>
<p class="li">4. <b>Sesiones en BD</b>: la memoria compartida de n8n se pisa entre ejecuciones simultáneas; la BD manda.</p>

<h2>Hito 5 — La IA (el bot que entiende)</h2>
<p class="li">1. <b>Claude</b> lee el texto libre (y los typos: "quiro cotizart") y devuelve datos estructurados: marca, productos, ciudad, si es reclamo, si es proveedor...</p>
<p class="li">2. <b>Visión</b>: si mandan foto, la IA la VE y la clasifica igual que un texto.</p>
<p class="li">3. Con filtro de costo (no se gasta IA en un "hola"), kill-switch, y regla de oro: la IA manda sobre las palabras clave, pero el CÓDIGO decide asesor y cierre.</p>

<h2>Hito 6 — Operación que se cuida sola</h2>
<p class="li">1. <b>vigilante.py</b> (cada hora): clientes perdidos, carreras, crones caídos, colas atascadas, token por vencer, BD caída, bot mudo → tabla <code>alertas</code> → WhatsApp de Deicy.</p>
<p class="li">2. <b>Seguimiento por asesor</b> con botones (Estado/Valor/Obs) → alimenta el informe. Recordatorios agrupados por día hábil.</p>
<p class="li">3. <b>Backups</b> diarios 2:30am, <b>reporte semanal</b> automático a comerciales, <b>panel web</b> con leads en vivo.</p>
<p class="li">4. <b>Deploy con candado</b>: pruebas bloqueantes + ventana tranquila + snapshot + verificación.</p>

<h2>Hito 7 — Fase 2: cotización contra SAP (agosto 2026)</h2>
<p class="li">1. El equipo SAP publicó el servidor <b>MCP</b> (<code>mcp.ardisa.com</code>, 19 herramientas de solo lectura sobre HANA).</p>
<p class="li">2. Acceso por <b>OAuth</b> delegado en Microsoft 365: registro dinámico del cliente + autorización única de Deicy + <b>refresh token</b> renovado por cron — el token vive en la BD y rota en caliente.</p>
<p class="li">3. <b>Arquitectura "token en casa"</b> (requisito de auditoría): la IA NO recibe credenciales — solo declara qué herramienta necesita y n8n la ejecuta contra el MCP dentro de nuestra infraestructura (hasta 3 vueltas: búsqueda → disponibilidad+precio en paralelo → redacción). Fijado con prueba automática que bloquea despliegues violatorios.</p>
<p class="li">4. El bot cotiza <b>disponibilidad real por ciudad, marcas, unidades de venta y PRECIO con IVA</b> (tool `precio_articulo`: cascada precio especial → lista del cliente → lista general; todo precio sale como "precio de referencia — tu asesor te lo confirma"). Documento formal: <code>DOC-BOT-MCP-001</code>.</p>
<p class="li">5. Piloto con <b>feature flags</b>: <code>usar_cotiza</code> (maestro) y <code>cotiza_alcance</code> (demo → todos). Probado end-to-end contra SAP real antes de la primera demo.</p>

<h2>Hito 8 — Clientes con número oculto y cotización de listas (14 de agosto 2026)</h2>
<p class="li">1. <b>WhatsApp usernames (BSUID)</b>: Meta 2026 permite ocultar el número — el mensaje llega SIN teléfono, con un código por-empresa (<code>CO.1352...</code>). El bot los ignoraba EN SILENCIO (9 personas en 4 días, detectadas en auditoría el mismo día; 4 rescatadas dentro de su ventana de 24h). Ahora: el extractor acepta el código como identidad, la respuesta viaja por el campo <code>recipient</code>, y el asesor recibe el enlace <code>wa.me/@usuario</code> o el número de contacto que el bot le pregunta al cliente antes de cerrar.</p>
<p class="li">2. <b>Cotización de LISTAS por foto</b>: la visión lee la imagen (una lista de obra con 12 ítems) y el circuito hace TODAS las búsquedas en SAP <b>en paralelo</b> en un turno — respuesta en lista, un renglón por producto con marca, unidad y precio de referencia.</p>
<p class="li">3. <b>Guard de expresiones n8n</b> en el build: n8n corta cada expresión <code>{{ }}</code> en el primer <code>}}</code> — un objeto anidado moría EN VIVO con "invalid syntax" (así cayó la primera demo del día). El build ahora lo detecta y ABORTA antes de desplegar: esa clase de bug ya no puede llegar a producción.</p>
<p class="li">4. <b>Vigilante sin repetidos</b>: las alertas ahora se deduplican por el ESTADO de la situación (no por el día del calendario) — solo re-suenan cuando algo cambia de verdad; el spam de proveedores extranjeros queda registrado pero ya no interrumpe.</p>
<p class="li">5. Si la cotización no puede resolver un producto, el cliente ya no recibe un mensaje genérico: <i>"Tu solicitud quedó registrada ✅ y será atendida por [nombre de la asesora]"</i>.</p>

<h1>4. Anexo — Los 91 nodos, uno a uno</h1>
%s

<h1>5. Cómo contar este proyecto en una entrevista</h1>
<p><b>El pitch (30 segundos):</b> "Lideré la automatización comercial de WhatsApp de un grupo ferretero:
un bot con IA que atiende 24/7, entiende texto y fotos, asigna asesores con rotación y ruteo por
producto, registra todo con validez legal, se monitorea a sí mismo, y cotiza inventario en tiempo real
contra SAP. Corre sobre n8n con el workflow como código, ~300 pruebas automatizadas y despliegues con
verificación. Pasamos de perder clientes por chats sin responder a un embudo medible con seguimiento
por asesor."</p>
<p><b>Tres historias con método STAR (Situación→Tarea→Acción→Resultado):</b></p>
<p class="li"><b>La carrera del consentimiento:</b> clientes autorizaban y el bot volvía a pedir permiso (21 casos). Causa: dos ejecuciones simultáneas pisándose la memoria compartida. Solución: la base de datos como fuente de verdad + freno temporal. Resultado: cero reincidencias, y el patrón quedó fijado con pruebas.</p>
<p class="li"><b>El candado anti-duplicado:</b> mensajes con milisegundos de diferencia creaban leads dobles y avisos dobles. Solución en capas: dedup en memoria, candado en BD, y suma del contenido nuevo al lead existente. Resultado: cada cliente = un lead, sin perder ni una palabra.</p>
<p class="li"><b>La integración SAP con MCP:</b> conectar la IA al inventario sin exponer datos sensibles. Lista blanca de herramientas, OAuth con refresh automático, guardrails de "no inventar", y prueba end-to-end contra el API real — que cazó un bug de formato que habría matado la función en silencio. Resultado: cotización de disponibilidad en producción piloto.</p>
<p class="nota">Complementos en el repositorio: <code>docs/CURSO-BOT-DESDE-CERO.md</code> (las recetas para construir cada nodo a mano) y <code>docs/entrevista/</code> (hoja de vida y preparación).</p>
""" % (hoy, glos, anexo)

    css = """
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: 'DejaVu Sans', 'Segoe UI', Arial, sans-serif; color: %s; font-size: 15px; line-height: 1.6; }
    .portada { text-align: center; padding-top: 220px; page-break-after: always; }
    .kicker { color: %s; font-weight: bold; letter-spacing: 3px; font-size: 12px; }
    .titulo { font-size: 40px; color: %s; margin: 12px 0; line-height: 1.15; }
    .sub { font-size: 13px; color: #666; }
    .autor { margin-top: 80px; font-size: 12px; color: #666; }
    h1 { color: %s; font-size: 24px; border-bottom: 3px solid %s; padding-bottom: 4px; margin-top: 26px; page-break-after: avoid; }
    h2 { color: %s; font-size: 17px; margin-top: 18px; page-break-after: avoid; }
    h3 { font-size: 14.5px; margin: 0 0 4px 0; color: %s; }
    table { border-collapse: collapse; width: 100%%; margin: 8px 0; page-break-inside: avoid; }
    th { background: %s; color: white; text-align: left; padding: 6px 8px; font-size: 12px; }
    td { border: 1px solid #ddd; padding: 4px 7px; vertical-align: top; }
    code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-family: 'DejaVu Sans Mono', monospace; font-size: 13px; }
    .term { border-left: 4px solid %s; background: #fafaf7; padding: 7px 10px; margin: 8px 0; page-break-inside: avoid; }
    .term p { margin: 3px 0; }
    .frase { color: #7a5c00; }
    .nota { background: #fff8e6; border-left: 4px solid %s; padding: 6px 10px; margin: 8px 0; }
    .li { margin: 3px 0 3px 10px; }
    .intro { color: #666; font-style: italic; }
    p { margin: 5px 0; }
    """ % (GRIS, AMARILLO, VERDE, VERDE, AMARILLO, VERDE, VERDE, VERDE, VERDE, AMARILLO)

    css = css + _marca.CSS_APA   # formato formal APA (pedido Deicy 14-ago)
    html_doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (css, body)
    open("/tmp/manual_bot.html", "w").write(html_doc.replace("LOGO_DATAURI", _marca.logo_datauri()))
    subprocess.run(["wkhtmltopdf", "-q", "--enable-local-file-access",
                    "--footer-center", "Manual del Bot WhatsApp Ardisa — pág. [page] de [topage]",
                    "--footer-font-size", "7", "--footer-spacing", "4",
                    "/tmp/manual_bot.html", "docs/Manual-Proyecto-Bot-Ardisa.pdf"], check=True)
    print("OK -> docs/Manual-Proyecto-Bot-Ardisa.pdf")

if __name__ == "__main__":
    construir()
