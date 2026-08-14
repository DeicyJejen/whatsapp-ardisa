#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# VERSIONES "LEER EN LÍNEA" de la biblioteca (pedido Deicy 13-ago: "leerlo ahí mismo, letra grande").
# Toma el MISMO HTML que cada generador dejó en /tmp (fuente única: el PDF y la web salen de lo mismo),
# le pone título de pestaña, letra 18px y ancho de lectura, y lo deja listo para copiar al web root.
# Uso: correr DESPUÉS de los gen_*_pdf.py →  python3 gen_html_online.py  → luego:
#      sudo cp /tmp/biblioteca_online/*.html /var/www/monitor/
import os, re

DOCS = [
    ("/tmp/manual_bot.html",     "manual.html",              "📘 Manual del Proyecto"),
    ("/tmp/anexo_tecnico.html",  "anexo-78-nodos.html",      "📗 Anexo: los 91 Nodos"),
    ("/tmp/doc_mcp_pdf.html",    "doc-conexion-mcp.html",    "🔌 Conexión MCP-SAP"),
    ("/tmp/curso_pdf.html",      "curso-bot-desde-cero.html","🎓 Curso: el Bot desde Cero"),
    ("/tmp/guia_python.html",    "python-terminal.html",     "🐍 Guía Python y Terminal"),
    ("/tmp/ingles_codigo.html",  "ingles.html",              "🇬🇧 Inglés del Código"),
]

EXTRA_CSS = """
<style>
/* versión de lectura en línea: letra grande y ancho cómodo (los PDF conservan su propio CSS) */
body { font-size: 18px !important; max-width: 980px; margin: 0 auto; padding: 52px 18px 12px; }
pre { font-size: 14px !important; }
.portada { padding-top: 40px !important; page-break-after: avoid; }
/* botón fijo de regreso a la biblioteca (pedido Deicy 14-ago) */
.volver-bib { position: fixed; top: 10px; left: 12px; z-index: 999; background: #128B81; color: #fff !important;
  text-decoration: none; font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 15px; font-weight: bold;
  padding: 8px 14px; border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.volver-bib:hover { background: #0d6b63; }
</style>
"""

BOTON_VOLVER = '<a class="volver-bib" href="biblioteca.html">← Volver a la biblioteca</a>'

out_dir = "/tmp/biblioteca_online"
os.makedirs(out_dir, exist_ok=True)
hechos = 0
for src, dst, titulo in DOCS:
    if not os.path.exists(src):
        print("(salta %s: no existe %s — corre antes su gen_*_pdf.py)" % (dst, src))
        continue
    h = open(src).read()
    h = re.sub(r"<head>", "<head><title>%s</title><meta name='viewport' content='width=device-width, initial-scale=1'>" % titulo, h, count=1)
    h = h.replace("</head>", EXTRA_CSS + "</head>", 1)
    h = re.sub(r"<body>", "<body>" + BOTON_VOLVER, h, count=1)
    open(os.path.join(out_dir, dst), "w").write(h)
    hechos += 1
    print("OK ->", os.path.join(out_dir, dst))
print("%d versión(es) en línea listas. Copia: sudo cp %s/*.html /var/www/monitor/" % (hechos, out_dir))
