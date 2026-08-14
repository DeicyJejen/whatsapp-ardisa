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
/* ── LECTURA EN LÍNEA PREMIUM (pedido Deicy 14-ago: "que se vea más lindo, más premium") ──
   Los PDF conservan su propio CSS; esto solo re-viste la versión web. */
html { background: linear-gradient(180deg,#eef4f3 0%,#f6f8f7 30%) fixed; }
body { font-family: 'Segoe UI','Helvetica Neue',Arial,sans-serif !important; font-size: 18px !important;
  line-height: 1.72 !important; color: #25333a !important; max-width: 940px; margin: 0 auto;
  padding: 68px 34px 60px; background: #ffffff !important;
  box-shadow: 0 0 0 1px rgba(20,48,78,.05), 0 18px 60px rgba(20,48,78,.10); border-radius: 0 0 18px 18px; }
h1 { color: #1E2B4F !important; font-size: 28px !important; letter-spacing: .2px;
  border-bottom: none !important; padding: 10px 0 12px !important; margin-top: 40px !important; position: relative; }
h1::after { content:""; display:block; width:76px; height:4px; border-radius:2px; margin-top:10px;
  background: linear-gradient(90deg,#FEC604,#55B3A4); }
h2 { color: #128B81 !important; font-size: 21px !important; margin-top: 30px !important;
  background: none !important; padding: 0 !important; border-left: 4px solid #55B3A4; padding-left: 12px !important;
  border-radius: 0 !important; }
h3 { color: #1E2B4F !important; }
pre { border-radius: 12px !important; border: 1px solid #e3e8e6 !important; box-shadow: inset 0 1px 4px rgba(0,0,0,.04);
  font-size: 14px !important; padding: 14px 16px !important; }
table { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 6px rgba(20,48,78,.08); }
table tr:nth-child(even) td { background: #f7faf9; }
td, th { padding: 8px 10px !important; }
code { background: #eef6f4 !important; color: #0d6b63; border-radius: 5px; padding: 2px 6px !important; }
.nota { border-radius: 10px; box-shadow: 0 1px 5px rgba(254,198,4,.18); }
.portada { padding: 46px 10px 26px !important; page-break-after: avoid;
  background: linear-gradient(135deg,#f2f8f7, #fdf9ec); border-radius: 16px; margin-bottom: 26px; }
.portada img { border-radius: 12px; }
/* barra fija de regreso a la biblioteca */
.volver-bib { position: fixed; top: 12px; left: 14px; z-index: 999;
  background: linear-gradient(135deg,#128B81,#0d6b63); color: #fff !important; text-decoration: none;
  font-family: 'Segoe UI',Arial,sans-serif; font-size: 14.5px; font-weight: 700; letter-spacing: .2px;
  padding: 9px 16px; border-radius: 999px; box-shadow: 0 5px 16px rgba(13,107,99,.35);
  transition: transform .15s ease, filter .15s ease; }
.volver-bib:hover { filter: brightness(1.08); transform: translateY(-1px); }
@media (max-width: 700px) { body { padding: 64px 16px 40px; } }
</style>
"""

BOTON_VOLVER = '<a class="volver-bib" href="biblioteca.html">← Biblioteca</a>'

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
