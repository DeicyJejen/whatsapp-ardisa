#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# EL INGLÉS DEL CÓDIGO (pedido Deicy 13-ago: "en inglés aplicado a todo lo programado, porque yo creo
# que por eso no entiendo"). Las ~100 palabras que son el 90% de todo el código, con pronunciación
# figurada y ejemplo REAL del proyecto. Uso: python3 gen_ingles_codigo_pdf.py
import html, subprocess, datetime
import marca as _marca

VERDE = "#128B81"; AMARILLO = "#FEC604"

def tabla(filas, cab=("Palabra", "Se pronuncia", "Significa", "En tu proyecto")):
    h = "<table><tr>" + "".join("<th>%s</th>" % c for c in cab) + "</tr>"
    for f in filas:
        h += "<tr>" + "".join("<td>%s</td>" % c for c in f) + "</tr>"
    return h + "</table>"

K = lambda s: "<code>%s</code>" % html.escape(s)

PYTHON_JS = [
 (K("if / else"), "if / els", "si / si no", "Los semáforos: <code>if not FORZAR...</code> (refrescador del token)"),
 (K("for"), "for", "para cada uno", "<code>for wa, nom... in q(...)</code> — el vigilante recorriendo clientes"),
 (K("while"), "uáil", "mientras", "repetir mientras algo sea cierto"),
 (K("def"), "def", "definir (una función)", "<code>def q(sql):</code> — la receta que consulta la BD"),
 (K("return"), "ritérn", "devolver (el resultado)", "<code>return out;</code> — el Cerebro entregando su decisión"),
 (K("function"), "fónk-shon", "función (en JavaScript)", "<code>function cerrarLead(st, opts)</code>"),
 (K("import"), "im-port", "traer (una herramienta)", "<code>import json, subprocess</code> — abrir la caja de herramientas"),
 (K("print"), "print", "imprimir/mostrar", "<code>print(nombre)</code> — tu primera línea de P1"),
 (K("true / false"), "trú / fols", "verdadero / falso", "<code>hay_cot: true</code> — 'sí hay cotización'"),
 (K("null / None"), "nol / nóun", "nada / vacío", "<code>wpp_body: null</code> — 'no hay mensaje que enviar'"),
 (K("try / catch (except)"), "trái / cach", "intenta / si falla atrapa", "<code>try{...}catch(e){...}</code> — que un tropiezo no tumbe el bot"),
 (K("let / const / var"), "let / conts", "variable / constante", "<code>const NOW = Date.now()</code> — 'la hora de ahora, que no cambie'"),
 (K("length (len)"), "lenz", "longitud/cuántos hay", "<code>_q.length > 30</code> — '¿la cola pasó de 30?'"),
 (K("push / pop"), "push / pop", "meter / sacar (de una lista)", "<code>out.push({...})</code> — agregar un mensaje a la salida"),
 (K("split / join"), "es-plít / yóin", "partir / unir (textos)", "<code>recorrido.split('>')</code> — partir 'consent>marca' en pedazos"),
 (K("replace"), "ri-pléis", "reemplazar", "<code>.replace('?', '$1')</code>"),
 (K("slice"), "es-láis", "rebanar (cortar un pedazo)", "<code>.slice(0,400)</code> — 'máximo 400 letras'"),
 (K("delete"), "di-lít", "borrar", "<code>delete store.muro[wa]</code> — soltar el freno"),
 (K("store"), "es-tór", "almacén/guardar", "<code>store.mediaPend</code> — la cola de adjuntos guardada"),
 (K("get / set"), "guet / set", "obtener / poner", "el par universal: leer un valor / escribirlo"),
]

WEB_API = [
 (K("request / response"), "ri-cuést / ris-póns", "petición / respuesta", "cada mensaje a Meta es un request; lo que Meta contesta, el response"),
 (K("send / receive"), "send / ri-cív", "enviar / recibir", "'Enviar al cliente (Meta)' = send"),
 (K("endpoint"), "énd-point", "punto de llegada (URL concreta)", "<code>/v1/messages</code> — donde se envían los mensajes"),
 (K("webhook"), "uéb-juk", "gancho web (te avisan)", "el timbre por donde Meta te entrega cada mensaje"),
 (K("token / key"), "tóu-ken / kí", "ficha secreta / llave", "el token de WhatsApp, la API key de Anthropic"),
 (K("header / body"), "jéder / bódi", "encabezado / cuerpo", "el header lleva el token; el body lleva el mensaje JSON"),
 (K("host / path"), "jóust / paz", "servidor / ruta", "<code>graph.facebook.com</code> es el host; <code>/messages</code> el path"),
 (K("timeout"), "táim-aut", "tiempo agotado", "'esperé 45s y no respondió' — el nodo de cotización lo tiene"),
 (K("retry"), "ri-trái", "reintentar", "'Retry on Fail' — si Meta parpadea, se intenta de nuevo"),
 (K("query"), "cuí-ri", "consulta", "un SELECT a la BD, o los parámetros ?esc=normal de una URL"),
 (K("deploy / rollback"), "di-plói / ról-bak", "desplegar / reversar", "desplegar.sh hace deploy; el snapshot permite rollback"),
 (K("log"), "log", "bitácora/diario", "<code>cron_mcp_token.log</code> — el diario del refrescador"),
 (K("flag / switch"), "flag / suích", "bandera / interruptor", "<code>usar_cotiza</code> — el interruptor del piloto"),
 (K("queue"), "kiú", "cola/fila", "<code>mediaPend</code> — la fila de adjuntos esperando"),
 (K("lock"), "lok", "candado", "el candado anti-duplicado de la BD"),
 (K("build"), "bild", "construir", "<code>build_f1.py</code> — LA fábrica"),
 (K("test"), "test", "prueba", "<code>tests/correr.sh</code> — las ~300 pruebas"),
 (K("commit"), "co-mít", "confirmar/guardar en la historia", "cada cambio con su porqué en git"),
]

SQL_BD = [
 (K("SELECT ... FROM"), "se-léct from", "elige ... de (leer)", "<code>SELECT COUNT(*) FROM leads</code> — 'cuenta los leads'"),
 (K("INSERT INTO"), "in-sért íntu", "insertar en (crear fila)", "así nace cada lead en la BD"),
 (K("UPDATE ... SET"), "op-déit set", "actualizar ... poniendo", "<code>UPDATE config SET valor='si'</code> — prender el piloto"),
 (K("WHERE"), "juér", "donde (el filtro)", "<code>WHERE telefono='57...'</code> — 'solo los de este cliente'"),
 (K("COUNT / SUM / MAX"), "cáunt / som / max", "contar / sumar / el mayor", "<code>COUNT(*)</code> = cuántas filas"),
 (K("ORDER BY ... LIMIT"), "órder bai / lí-mit", "ordenar por ... máximo N", "<code>ORDER BY id DESC LIMIT 5</code> = 'los 5 últimos'"),
 (K("JOIN"), "yóin", "cruzar tablas", "unir leads con mensajes por teléfono"),
 (K("table / row / column"), "téibol / róu / có-lumn", "tabla / fila / columna", "la tabla leads, una fila por cliente, la columna estado"),
]

ERRORES = [
 (K("error / warning"), "é-rror / uór-ning", "error / advertencia", "rojo = se rompió; amarillo = ojo"),
 (K("not found (404)"), "not fáund", "no encontrado", "la URL o el archivo no existe (¡tu PDF antes de copiarlo al web root!)"),
 (K("denied / forbidden (403)"), "di-náid / for-bíd-en", "negado / prohibido", "sin permiso — como el 403 del verify token inválido"),
 (K("unauthorized (401)"), "on-ózo-ráisd", "no autorizado", "token vencido o malo — lo que daba el MCP sin token"),
 (K("invalid"), "in-vá-lid", "inválido", "'Input should be an object' — ¡el bug que cazamos hoy!"),
 (K("missing"), "mí-sing", "falta algo", "'missing required parameter' = olvidaste un dato obligatorio"),
 (K("expected ... got ..."), "ex-péc-ted / got", "esperaba ... llegó ...", "la pista de oro: te dice QUÉ quería y QUÉ le diste"),
 (K("failed / success"), "féild / suc-cés", "falló / éxito", "el resumen de toda operación"),
 (K("connection refused"), "co-néc-shon ri-fiúsd", "conexión rechazada", "el servicio no está escuchando (¿se cayó n8n?)"),
 (K("permission denied"), "per-mí-shon di-náid", "permiso negado", "te faltó sudo o el archivo es 600 de otro dueño"),
]

hoy = datetime.date.today().strftime("%d/%m/%Y")
cuerpo = """
<div class="portada">
  <img src="LOGO_DATAURI" style="width:320px;max-width:75%%;margin-bottom:18px"><p class="kicker">GRUPO ARDISA · GUÍA DE APRENDIZAJE</p>
  <h1 class="titulo">El Inglés del Código</h1>
  <p class="sub">Las ~100 palabras que son el 90%% de todo lo programado —<br>
  con pronunciación figurada y su ejemplo real en TU proyecto.</p>
  <p class="autor">Para <b>Deicy Milena Jejen</b> · generado el %s</p>
</div>

<h1>La buena noticia (léela dos veces)</h1>
<p>El código NO está en "inglés completo": está en un <b>mini-idioma de ~100 palabras</b> que se repiten
en TODOS los lenguajes, todas las APIs y todos los errores. No necesitas hablar inglés para leer código —
necesitas ESTAS palabras. Y como cada una la vas a ver mil veces en tu propio proyecto, se te van a
pegar solas. El método: <b>5 palabras por día</b>, buscándolas de una vez en tu código real
(<code>grep -n "palabra" build_f1.py</code>) para verlas trabajando.</p>

<h1>1. Las palabras de los lenguajes (Python y JavaScript)</h1>
%s

<h1>2. Las palabras de la web y las APIs</h1>
%s

<h1>3. Las palabras de la base de datos (SQL)</h1>
%s

<h1>4. El inglés de los ERRORES (el más valioso)</h1>
<p>Aquí es donde el inglés más te bloqueaba: un error en la pantalla es Python o la API <b>diciéndote
exactamente qué pasó</b> — pero en inglés. Con esta tabla, los errores dejan de ser sustos y se vuelven pistas:</p>
%s

<h1>5. Tu práctica de esta semana</h1>
<p class="li">1. <b>5 palabras al día</b> de las tablas 1 y 4 (empieza por los errores — es lo que más vas a ver).</p>
<p class="li">2. Por cada palabra, búscala viva: <code>grep -n "return" vigilante.py | head -3</code> y lee la línea completa en voz alta, traduciendo.</p>
<p class="li">3. Traduce estas 5 líneas REALES de tu proyecto (están en el Anexo Técnico) y me las presentas:</p>
<pre>if(!store.mediaPend) store.mediaPend = {};
return false;
for(const _dst in store.mediaPend){ ... }
const _winAbierta = (MODO_PRUEBA || _esDemo || ventanaAbierta(destino));
print("%%s | token vigente (quedan %%dmin) — sin cambios")</pre>
<p class="li">4. Regla de oro: cuando un error te salga en pantalla, ANTES de asustarte, tradúcelo palabra
por palabra con la tabla 4. El 90%% de las veces el error te está diciendo la solución.</p>
""" % (hoy, tabla(PYTHON_JS), tabla(WEB_API), tabla(SQL_BD), tabla(ERRORES))

css = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #333; font-size: 15px; line-height: 1.6; }
.portada { text-align: center; padding-top: 220px; page-break-after: always; }
.kicker { color: %s; font-weight: bold; letter-spacing: 3px; font-size: 12px; }
.titulo { font-size: 40px; color: %s; }
.sub { color: #666; font-size: 13px; } .autor { margin-top: 60px; color: #666; font-size: 12px; }
h1 { color: %s; font-size: 21px; border-bottom: 3px solid %s; padding-bottom: 4px; margin-top: 24px; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%%; margin: 8px 0; }
th { background: %s; color: white; text-align: left; padding: 6px 8px; font-size: 12px; }
td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; font-size: 13.5px; }
td:nth-child(2) { color: #a05a00; font-style: italic; white-space: nowrap; }
code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
pre { background: #f7f7f2; border: 1px solid #e0e0d8; border-radius: 4px; padding: 8px 10px;
      font-family: 'DejaVu Sans Mono', monospace; font-size: 10.5px; white-space: pre-wrap; }
.li { margin: 5px 0 5px 10px; }
p { margin: 6px 0; }
""" % (AMARILLO, VERDE, VERDE, AMARILLO, VERDE)

css = css + _marca.CSS_APA   # formato formal APA (pedido Deicy 14-ago)
doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (css, cuerpo)
open("/tmp/ingles_codigo.html", "w").write(doc.replace("LOGO_DATAURI", _marca.logo_datauri()))
subprocess.run(["wkhtmltopdf", "-q", "--enable-local-file-access",
                "/tmp/ingles_codigo.html", "docs/Ingles-del-Codigo.pdf"], check=True)
print("OK -> docs/Ingles-del-Codigo.pdf")
