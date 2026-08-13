#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ANEXO TÉCNICO EN PDF: la configuración COMPLETA de los 78 nodos, incluido todo el código JavaScript
# (pedido Deicy 13-ago: "no veo qué configuración tiene cada nodo, algunos veo código — quiero aprender").
# Los comentarios del código son la mitad de la enseñanza: cada uno cuenta el caso real que lo motivó.
# Uso:  python3 gen_anexo_tecnico_pdf.py   ->  docs/Anexo-Tecnico-78-Nodos.pdf
import json, html, subprocess, datetime

VERDE = "#1e7a3c"; AMARILLO = "#f5a800"
REDACTAR = ["ardisa2026"]   # el verify token no viaja en un PDF (aunque el PDF sea interno)

w = json.load(open("workflow-bot-f1.json"))
nodes, conns = w["nodes"], w["connections"]

def destinos(nombre):
    out = []
    for i, rama in enumerate(conns.get(nombre, {}).get("main", [])):
        tgts = [x["node"] for x in (rama or [])]
        if tgts: out.append(("SÍ → " if i == 0 else "NO → ") + ", ".join(tgts))
    return out

def limpia(s):
    for r in REDACTAR: s = s.replace(r, "•••••")
    return s

def param_html(p):
    """Parámetros del nodo: el código JS va aparte en <pre>; el resto como JSON legible."""
    partes = []
    resto = {}
    for k, v in p.items():
        if k == "jsCode":
            partes.append("<p class='sec'>Código JavaScript (completo, con sus comentarios):</p><pre>%s</pre>"
                          % html.escape(limpia(v)))
        else:
            resto[k] = v
    if resto:
        partes.insert(0, "<p class='sec'>Parámetros:</p><pre class='cfg'>%s</pre>"
                      % html.escape(limpia(json.dumps(resto, indent=2, ensure_ascii=False))))
    return "\n".join(partes) or "<p class='sec'>Sin parámetros (nodo simple).</p>"

secciones = []
indice = []
for i, n in enumerate(nodes, 1):
    t = n["type"].replace("n8n-nodes-base.", "")
    extras = []
    if n.get("credentials"):
        extras.append("Credencial: " + ", ".join(v.get("name", "") for v in n["credentials"].values()))
    if n.get("onError") == "continueRegularOutput": extras.append("Si falla: continúa (no tumba el flujo)")
    if n.get("retryOnFail"): extras.append("Reintentos: %s (espera %sms)" % (n.get("maxTries", 2), n.get("waitBetweenTries", "")))
    d = destinos(n["name"])
    indice.append("<tr><td>%d</td><td>%s</td><td>%s</td></tr>" % (i, html.escape(n["name"]), t))
    secciones.append("""
<div class="nodo">
<h2>Nodo %d — %s</h2>
<p class="meta"><b>Tipo:</b> %s (v%s)%s%s</p>
%s
</div>""" % (i, html.escape(n["name"]), t, n.get("typeVersion", "1"),
             (" · <b>%s</b>" % " · ".join(extras)) if extras else "",
             (" · <b>Conecta:</b> %s" % " | ".join(d)) if d else "",
             param_html(n.get("parameters", {}))))

hoy = datetime.date.today().strftime("%d/%m/%Y")
cuerpo = """
<div class="portada">
  <p class="kicker">GRUPO ARDISA · ANEXO TÉCNICO</p>
  <h1 class="titulo">Los 78 nodos<br>con su configuración completa</h1>
  <p class="sub">Todo el código, todos los parámetros, todas las conexiones — extraído del workflow en vivo.<br>
  Compañero del <i>Manual del Proyecto</i> y del curso <code>docs/CURSO-BOT-DESDE-CERO.md</code>.</p>
  <p class="autor">Para <b>Deicy Milena Jejen</b> · generado el %s</p>
  <p class="sub">💡 Cómo estudiarlo: los comentarios dentro del código (las líneas con //) cuentan el caso real
  que motivó cada decisión — son la mitad de la enseñanza. Empieza por los nodos Code cortos
  (6, 13, 74, 76) y deja el Cerebro (23) para sesiones guiadas.</p>
</div>
<h1>Índice</h1>
<table class="idx"><tr><th>#</th><th>Nodo</th><th>Tipo</th></tr>%s</table>
%s
""" % (hoy, "\n".join(indice), "\n".join(secciones))

css = """
@page { size: A4; margin: 14mm 12mm; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #333; font-size: 14.5px; line-height: 1.55; }
.portada { text-align: center; padding-top: 200px; page-break-after: always; }
.kicker { color: %s; font-weight: bold; letter-spacing: 3px; font-size: 12px; }
.titulo { font-size: 34px; color: %s; line-height: 1.15; }
.sub { color: #666; font-size: 12px; } .autor { margin-top: 50px; color: #666; font-size: 12px; }
h1 { color: %s; font-size: 18px; border-bottom: 3px solid %s; padding-bottom: 4px; }
h2 { color: white; background: %s; font-size: 14.5px; padding: 5px 8px; border-radius: 4px; margin: 14px 0 4px 0; page-break-after: avoid; }
.meta { margin: 2px 0 6px 0; }
.sec { font-weight: bold; color: %s; margin: 6px 0 2px 0; }
pre { background: #f7f7f2; border: 1px solid #e0e0d8; border-radius: 4px; padding: 6px 8px;
      font-family: 'DejaVu Sans Mono', monospace; font-size: 11.5px; line-height: 1.45;
      white-space: pre-wrap; word-wrap: break-word; }
pre.cfg { background: #f0f6f1; }
table.idx { border-collapse: collapse; width: 100%%; font-size: 9px; }
table.idx th { background: %s; color: white; text-align: left; padding: 3px 6px; }
table.idx td { border: 1px solid #ddd; padding: 2px 6px; }
code { background: #f0f0f0; padding: 1px 3px; border-radius: 3px; }
.nodo { page-break-inside: auto; }
""" % (AMARILLO, VERDE, VERDE, AMARILLO, VERDE, VERDE, VERDE)

doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (css, cuerpo)
open("/tmp/anexo_tecnico.html", "w").write(doc)
subprocess.run(["wkhtmltopdf", "-q", "--enable-local-file-access",
                "/tmp/anexo_tecnico.html", "docs/Anexo-Tecnico-78-Nodos.pdf"], check=True)
print("OK -> docs/Anexo-Tecnico-78-Nodos.pdf")
