#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# El Curso "Bot desde Cero" en PDF (pedido Deicy: todo con leer-en-línea Y descarga).
# Fuente única: docs/CURSO-BOT-DESDE-CERO.md. Uso: python3 gen_curso_pdf.py
import subprocess, datetime, sys
sys.path.insert(0, '.')
import marca as _marca
from gen_manual_pdf import md_a_html

hoy = datetime.date.today().strftime("%d/%m/%Y")
contenido = md_a_html(open("docs/CURSO-BOT-DESDE-CERO.md").read())
cuerpo = """
<div class="portada">
  <img src="LOGO_DATAURI" style="width:320px;max-width:75%%;margin-bottom:18px">
  <p class="kicker">GRUPO ARDISA · GUÍA DE APRENDIZAJE</p>
  <h1 class="titulo">Curso: el Bot desde Cero</h1>
  <p class="sub">Las recetas de cada tipo de nodo, los 78 nodos con su configuración,<br>y el ciclo profesional de construcción.</p>
  <p class="autor">Para <b>Deicy Milena Jejen</b> · generado el %s</p>
</div>
%s""" % (hoy, contenido)
css = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.55; }
.portada { text-align: center; padding-top: 150px; page-break-after: always; }
.kicker { color: %s; font-weight: bold; letter-spacing: 3px; font-size: 12px; }
.titulo { font-size: 34px; color: %s; } .sub { color: #666; font-size: 13px; } .autor { margin-top: 50px; color: #666; }
h1 { color: %s; font-size: 21px; border-bottom: 3px solid %s; padding-bottom: 4px; margin-top: 24px; page-break-after: avoid; }
h2 { color: %s; font-size: 16px; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%%; margin: 8px 0; }
th { background: %s; color: white; text-align: left; padding: 6px 8px; font-size: 12.5px; }
td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; font-size: 12.5px; }
code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
pre { background: #f7f7f2; border: 1px solid #e0e0d8; border-radius: 4px; padding: 8px 10px; font-family: monospace; font-size: 11.5px; white-space: pre-wrap; }
.nota { background: #fff8e6; border-left: 4px solid %s; padding: 6px 10px; margin: 8px 0; }
.li { margin: 4px 0 4px 10px; } p { margin: 6px 0; }
""" % (_marca.AMARILLO, _marca.MARINO, _marca.TURQUESA, _marca.AMARILLO, _marca.TURQUESA, _marca.TURQUESA, _marca.AMARILLO)
doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (css, cuerpo)
open("/tmp/curso_pdf.html", "w").write(doc.replace("LOGO_DATAURI", _marca.logo_datauri()))
subprocess.run(["wkhtmltopdf", "-q", "--enable-local-file-access", "/tmp/curso_pdf.html", "docs/Curso-Bot-desde-Cero.pdf"], check=True)
print("OK -> docs/Curso-Bot-desde-Cero.pdf")
