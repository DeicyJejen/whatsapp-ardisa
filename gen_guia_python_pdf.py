#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# GUÍA DE PYTHON Y TERMINAL DEL PROYECTO (pedido Deicy 13-ago: "enséñame lo de Python, cómo genera
# los scripts, y los comandos utilizados"). Los fragmentos de código se EXTRAEN de los scripts reales
# al generar, para que la guía nunca mienta. Uso: python3 gen_guia_python_pdf.py
import re, html, subprocess, datetime
import marca as _marca

VERDE = "#009e8f"; AMARILLO = "#f0c000"

def snippet(archivo, desde, hasta_lineas):
    """Extrae un fragmento REAL de un script del proyecto (desde la línea que contiene `desde`)."""
    lineas = open(archivo).read().split("\n")
    for i, l in enumerate(lineas):
        if desde in l:
            return "\n".join(lineas[i:i+hasta_lineas])
    return "(fragmento no encontrado)"

def pre(codigo, titulo=""):
    t = "<p class='sec'>%s</p>" % titulo if titulo else ""
    return t + "<pre>%s</pre>" % html.escape(codigo)

def cmd(comando, que_hace, ejemplo_real):
    return """<div class="term"><h3><code>%s</code></h3>
    <p><b>Qué hace:</b> %s</p>
    <p><b>Ejemplo real del proyecto:</b></p><pre class="sh">%s</pre></div>""" % (
        html.escape(comando), que_hace, html.escape(ejemplo_real))

snip_node = snippet("build_f1.py", "def node(", 8)
snip_append = snippet("build_f1.py", 'nodes.append(node("Cada 10 min (alertas)"', 2)
snip_q = snippet("vigilante.py", "def q(sql):", 5)
snip_refresh = snippet("mcp_token_refresh.py", "if not FORZAR and restante > umbral:", 9)

COMANDOS = [
 ("ls  /  cd  /  pwd", "Moverte por las carpetas: listar (ls), entrar (cd), ¿dónde estoy? (pwd).",
  "cd /home/ubuntu/whatsapp-ardisa\nls docs/          # ver los manuales\nls backups/auto/  # ver los respaldos diarios"),
 ("cat  /  tail  /  grep", "Leer archivos: completo (cat), las últimas líneas (tail — ideal para logs), o BUSCAR texto adentro (grep).",
  "tail -5 reportes/cron_mcp_token.log      # ¿el token se está renovando?\ngrep -n 'CLIENTES_PRUEBA' build_f1.py    # ¿dónde está la lista de números demo?"),
 ("python3", "Ejecutar un script de Python.",
  "python3 vigilante.py --seco      # el vigilante en modo 'solo mirar' (no guarda ni envía)\npython3 monitor.py               # salud del bot y leads de hoy\npython3 gen_manual_pdf.py        # regenerar tu manual en PDF"),
 ("bash", "Ejecutar un script de terminal (.sh) — una receta de varios comandos.",
  "bash tests/correr.sh    # correr TODA la suite de pruebas (~300)\nbash desplegar.sh       # el despliegue con candado completo"),
 ("git status / log / diff / add / commit", "El control de versiones: qué cambió (status/diff), la historia (log), y guardar un cambio con su porqué (add + commit).",
  "git status                  # ¿qué archivos toqué?\ngit log --oneline -10       # los últimos 10 cambios del proyecto\ngit diff build_f1.py        # ¿qué cambié exactamente?\ngit add build_f1.py && git commit -m 'por qué del cambio'"),
 ("mysql", "Hablar con la base de datos en SQL.",
  "sudo mysql bot_ardisa -e \"SELECT COUNT(*) FROM leads WHERE creado_en >= CURDATE();\"   # ¿cuántos leads hoy?\nsudo mysql bot_ardisa -e \"SELECT clave, valor FROM config;\"                          # los interruptores"),
 ("curl", "Hacer peticiones de internet a mano: tu herramienta para probar APIs y webhooks sin WhatsApp.",
  "curl -X POST http://localhost:5678/webhook/mi-bot \\\n  -H \"Content-Type: application/json\" -d '{\"texto\":\"hola\"}'   # 'timbrarle' a tu mini-bot"),
 ("crontab -l", "Ver los relojes del sistema: qué tareas corren solas y cuándo.",
  "crontab -l    # verás el vigilante (cada hora), el refrescador del token (cada 10 min),\n              # el backup (2:30am) y el reporte semanal (lunes 7am)"),
 ("sudo  /  chmod", "sudo = hacer algo con permisos de administrador. chmod = cambiar permisos de un archivo (600 = solo el dueño lo lee: OBLIGATORIO para secretos).",
  "chmod 600 ~/.config/ardisa/smtp_pass     # la clave del correo: solo la ve el dueño\nsudo cp docs/Manual-*.pdf /var/www/monitor/   # publicar en el panel (web root)"),
 ("docker", "Manejar contenedores (cajas aisladas donde corren programas). n8n vive en uno.",
  "docker ps                 # ¿qué contenedores corren?\ndocker logs n8n --tail 20 # las últimas líneas del diario de n8n"),
]

practica = """
<h2>Tu práctica de hoy: 8 comandos sin riesgo (todos son de SOLO LECTURA)</h2>
<pre class="sh">cd /home/ubuntu/whatsapp-ardisa
git log --oneline -10                 # 1. la historia reciente del proyecto
python3 monitor.py                    # 2. la salud del bot ahora mismo
python3 vigilante.py --seco           # 3. qué alertaría el vigilante (sin guardar)
sudo mysql bot_ardisa -e "SELECT COUNT(*) FROM leads WHERE creado_en >= CURDATE();"   # 4. leads de hoy
tail -5 reportes/cron_mcp_token.log   # 5. ¿el token del MCP se renueva solo?
crontab -l                            # 6. los relojes del sistema
grep -c "def " build_f1.py            # 7. ¿cuántas funciones tiene la fábrica del bot?
ls -la backups/auto/ | tail -3        # 8. los últimos respaldos diarios</pre>
<p>Corre cada uno, LEE lo que sale, y anota lo que no entiendas — eso es la agenda de la próxima clase.</p>
"""

hoy = datetime.date.today().strftime("%d/%m/%Y")
cuerpo = """
<div class="portada">
  <img src="LOGO_DATAURI" style="width:320px;max-width:75%%;margin-bottom:18px"><p class="kicker">GRUPO ARDISA · GUÍA DE APRENDIZAJE</p>
  <h1 class="titulo">Python y la Terminal<br>del proyecto</h1>
  <p class="sub">Cómo un script FABRICA los 78 nodos y los PDFs, la anatomía de un script real,<br>
  y todos los comandos que usamos — con ejemplos del proyecto, no de libro.</p>
  <p class="autor">Para <b>Deicy Milena Jejen</b> · generado el %s</p>
</div>

<h1>1. ¿Qué es Python y qué papel juega aquí?</h1>
<p><b>Python</b> es un lenguaje de programación famoso por leerse casi como inglés. En este proyecto
NO corre dentro del bot (el bot es JavaScript dentro de n8n) — Python es el <b>equipo de apoyo</b> que
trabaja alrededor del bot:</p>
<table>
<tr><th>Script</th><th>Qué hace</th><th>Cuándo corre</th></tr>
<tr><td><code>build_f1.py</code></td><td><b>LA FÁBRICA</b>: genera el workflow completo (los 78 nodos) y valida la sintaxis de cada uno</td><td>En cada build/deploy</td></tr>
<tr><td><code>vigilante.py</code></td><td>Detecta solo los errores del bot → tabla alertas → tu WhatsApp</td><td>Cron: cada hora</td></tr>
<tr><td><code>mcp_token_refresh.py</code></td><td>Renueva el token OAuth del MCP antes de que venza</td><td>Cron: cada 10 min</td></tr>
<tr><td><code>mcp_token_login.py</code></td><td>El login inicial del MCP (autorización única M365)</td><td>Una vez (o si el refresh muere)</td></tr>
<tr><td><code>monitor.py</code></td><td>Salud y leads en vivo en la terminal</td><td>Cuando quieras</td></tr>
<tr><td><code>check_duplicados.py</code></td><td>Caza leads duplicados (noches/domingos incluidos)</td><td>Cron</td></tr>
<tr><td><code>reporte_semanal.py</code></td><td>El Excel/correo a los comerciales</td><td>Cron: lunes 7am</td></tr>
<tr><td><code>build_panel.py</code></td><td>Genera el panel web de monitoreo</td><td>Al cambiar el panel</td></tr>
<tr><td><code>gen_manual_pdf.py</code> y hermanos</td><td>Fabrican tus manuales en PDF desde el workflow vivo</td><td>Cuando el proyecto cambia</td></tr>
<tr><td><code>backup_diario.sh</code> / <code>desplegar.sh</code> / <code>tests/correr.sh</code></td><td>(bash, no Python) respaldo, deploy con candado, suite de pruebas</td><td>Cron 2:30am / deploys / antes de cada deploy</td></tr>
</table>

<h1>2. La idea estrella: código que fabrica código</h1>
<p>El concepto con nombre propio: <b>generación de código</b> (o "workflow como código"). En vez de
crear 78 nodos a clics (lento, sin historia, fácil de dañar), escribimos UNA fábrica en Python que los
imprime siempre iguales. Mira la pieza central de <code>build_f1.py</code> — extraída del archivo real:</p>
%s
<p>Esa funcioncita <code>node(...)</code> es un <b>molde</b>: le das nombre, tipo, configuración y posición,
y te devuelve la "cajita" en el formato JSON que n8n entiende. Y luego la fábrica la usa 78 veces:</p>
%s
<p>Al final, <code>json.dump(...)</code> escribe <code>workflow-bot-f1.json</code> y — la parte que nos salvó
el pellejo — <b>valida cada nodo de código con <code>node --check</code></b>: si hay UNA llave mal, el build
ABORTA y el error jamás llega al bot en vivo (el 15-jul una llave de más lo tumbó; nunca más).</p>
<p>Tus PDFs nacen igual: <code>gen_manual_pdf.py</code> arma una página HTML con estilos (colores, tablas)
y se la pasa a <code>wkhtmltopdf</code>, que la "imprime" a PDF. Mismo patrón: <b>datos + molde = producto</b>.</p>

<h1>3. Anatomía de un script real (desmenuzado)</h1>
<p>Este fragmento es del <code>vigilante.py</code> — la función con la que consulta la base de datos:</p>
%s
<p class="li"><b>def q(sql):</b> — "def" DEFINE una función: una receta con nombre que recibe ingredientes (aquí, una consulta SQL) y devuelve un resultado.</p>
<p class="li"><b>subprocess.check_output([...])</b> — Python ejecutando un COMANDO de terminal desde adentro (aquí llama a <code>mysql</code>). Puentea los dos mundos que estás aprendiendo.</p>
<p class="li"><b>return [...]</b> — lo que la función le entrega a quien la llamó: aquí, las filas de la BD convertidas en listas.</p>
<p>Y este es del <code>mcp_token_refresh.py</code> — mira cómo se lee un "if" en voz alta:</p>
%s
<p class="li"><b>if not FORZAR and restante &gt; umbral:</b> — "SI no me obligaron Y al token le queda vida de sobra…" — un IF de n8n y un if de Python son la MISMA idea: preguntas de sí/no.</p>
<p class="li"><b>raise SystemExit(0)</b> — "termina el programa, todo bien (código 0)". Los códigos de salida son el idioma de los crones: 0 = éxito, otro = error.</p>

<h1>4. Los comandos de la terminal — tu caja de herramientas</h1>
%s
%s
""" % (hoy, pre(snip_node, "build_f1.py — el molde de nodos (real):"),
       pre(snip_append, "build_f1.py — usando el molde (real):"),
       pre(snip_q, "vigilante.py — la función q() (real):"),
       pre(snip_refresh, "mcp_token_refresh.py — el 'if' del refresco (real):"),
       "\n".join(cmd(*c) for c in COMANDOS), practica)

css = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #333; font-size: 15px; line-height: 1.6; }
.portada { text-align: center; padding-top: 210px; page-break-after: always; }
.kicker { color: %s; font-weight: bold; letter-spacing: 3px; font-size: 12px; }
.titulo { font-size: 36px; color: %s; line-height: 1.15; }
.sub { color: #666; font-size: 13px; } .autor { margin-top: 60px; color: #666; font-size: 12px; }
h1 { color: %s; font-size: 22px; border-bottom: 3px solid %s; padding-bottom: 4px; margin-top: 24px; page-break-after: avoid; }
h2 { color: %s; font-size: 16px; page-break-after: avoid; }
h3 { margin: 0 0 4px 0; font-size: 14px; }
table { border-collapse: collapse; width: 100%%; margin: 8px 0; }
th { background: %s; color: white; text-align: left; padding: 6px 8px; font-size: 12px; }
td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; font-size: 13.5px; }
pre { background: #f7f7f2; border: 1px solid #e0e0d8; border-radius: 4px; padding: 8px 10px;
      font-family: 'DejaVu Sans Mono', monospace; font-size: 12.5px; line-height: 1.5;
      white-space: pre-wrap; word-wrap: break-word; page-break-inside: avoid; }
pre.sh { background: #1e2a1e; color: #d8f0d8; border: none; }
.sec { font-weight: bold; color: %s; margin: 8px 0 2px 0; }
.term { border-left: 4px solid %s; background: #fafaf7; padding: 7px 10px; margin: 10px 0; page-break-inside: avoid; }
.term p { margin: 3px 0; }
.li { margin: 4px 0 4px 10px; }
code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 11.5px; }
p { margin: 6px 0; }
""" % (AMARILLO, VERDE, VERDE, AMARILLO, VERDE, VERDE, VERDE, VERDE)

doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (css, cuerpo)
open("/tmp/guia_python.html", "w").write(doc.replace("LOGO_DATAURI", _marca.logo_datauri()))
subprocess.run(["wkhtmltopdf", "-q", "--enable-local-file-access",
                "/tmp/guia_python.html", "docs/Guia-Python-y-Terminal.pdf"], check=True)
print("OK -> docs/Guia-Python-y-Terminal.pdf")
