#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# PDF PROFESIONAL de la documentación de la conexión MCP-SAP (pedido Deicy 13-ago: "por si algún día
# me piden la documentación, enviarla"). Formato de documento controlado: portada con código, versión,
# clasificación y control de cambios. Fuente única: docs/DOC-CONEXION-MCP-SAP.md
# Uso: python3 gen_doc_mcp_pdf.py
import subprocess, datetime, sys
sys.path.insert(0, '.')
from gen_manual_pdf import md_a_html

VERDE = "#1e7a3c"; AMARILLO = "#f5a800"
hoy = datetime.date.today().strftime("%d/%m/%Y")

contenido = md_a_html(open("docs/DOC-CONEXION-MCP-SAP.md").read())

cuerpo = """
<div class="portada">
  <p class="kicker">GRUPO ARDISA · DOCUMENTACIÓN TÉCNICA</p>
  <h1 class="titulo">Conexión del Bot de WhatsApp<br>al MCP de SAP Business One</h1>
  <p class="sub">Integración de cotización en tiempo real — arquitectura, seguridad y verificación</p>
  <table class="ficha">
    <tr><td>Código del documento</td><td>DOC-BOT-MCP-001</td></tr>
    <tr><td>Versión</td><td>1.0</td></tr>
    <tr><td>Fecha</td><td>%s</td></tr>
    <tr><td>Elaborado por</td><td>Deicy Milena Jejen — Líder del proyecto Bot WhatsApp</td></tr>
    <tr><td>Clasificación</td><td>Uso interno — Grupo Ardisa</td></tr>
  </table>
  <table class="ficha cambios">
    <tr><th colspan="3">Control de cambios</th></tr>
    <tr><th>Versión</th><th>Fecha</th><th>Descripción</th></tr>
    <tr><td>1.0</td><td>%s</td><td>Versión inicial: conexión OAuth/M365, arquitectura "token en casa", lista blanca, activación de precios, verificación E2E</td></tr>
  </table>
</div>
%s
<div class="cierrefinal">
  <p><b>Fin del documento.</b> Este documento se genera desde el repositorio del proyecto
  (<code>docs/DOC-CONEXION-MCP-SAP.md</code> + <code>gen_doc_mcp_pdf.py</code>): toda actualización queda
  versionada en git y el PDF se regenera para mantener una única fuente de verdad.</p>
</div>
""" % (hoy, hoy, contenido)

css = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #333; font-size: 13.5px; line-height: 1.55; }
.portada { text-align: center; padding-top: 110px; page-break-after: always; }
.kicker { color: %s; font-weight: bold; letter-spacing: 3px; font-size: 12px; }
.titulo { font-size: 30px; color: %s; line-height: 1.2; margin: 14px 0 8px; }
.sub { color: #666; font-size: 14px; margin-bottom: 40px; }
table.ficha { border-collapse: collapse; margin: 0 auto 24px; width: 84%%; font-size: 12.5px; text-align: left; }
table.ficha td, table.ficha th { border: 1px solid #ccc; padding: 6px 10px; }
table.ficha td:first-child { background: #f0f6f1; font-weight: bold; width: 38%%; }
table.cambios th { background: %s; color: white; }
table.cambios td:first-child { background: white; font-weight: normal; width: auto; }
h1 { color: %s; font-size: 20px; border-bottom: 3px solid %s; padding-bottom: 4px; margin-top: 24px; page-break-after: avoid; }
h2 { color: %s; font-size: 16px; margin-top: 18px; page-break-after: avoid; }
table { border-collapse: collapse; width: 100%%; margin: 8px 0; }
th { background: %s; color: white; text-align: left; padding: 6px 8px; font-size: 12.5px; }
td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; font-size: 12.5px; }
code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
pre { background: #f7f7f2; border: 1px solid #e0e0d8; border-radius: 4px; padding: 8px 10px;
      font-family: 'DejaVu Sans Mono', monospace; font-size: 11.5px; white-space: pre-wrap; }
.nota { background: #fff8e6; border-left: 4px solid %s; padding: 6px 10px; margin: 8px 0; }
.li { margin: 4px 0 4px 10px; }
.cierrefinal { margin-top: 30px; border-top: 2px solid #ddd; padding-top: 10px; color: #666; font-size: 12px; }
p { margin: 6px 0; }
""" % (AMARILLO, VERDE, VERDE, VERDE, AMARILLO, VERDE, VERDE, AMARILLO)

doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><style>%s</style></head><body>%s</body></html>" % (css, cuerpo)
open("/tmp/doc_mcp_pdf.html", "w").write(doc)
subprocess.run(["wkhtmltopdf", "-q", "--enable-local-file-access",
                "/tmp/doc_mcp_pdf.html", "docs/Doc-Conexion-MCP-SAP.pdf"], check=True)
print("OK -> docs/Doc-Conexion-MCP-SAP.pdf")
