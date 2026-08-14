#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# IDENTIDAD DE MARCA — fuente única para todos los generadores de documentos.
# Paleta OFICIAL del Manual de Identidad Visual 2025 (docs: "paleta de color ardisa.pdf", entregada por Deicy 13-ago).
import base64

TURQUESA = "#128B81"        # Verde Menta 2 (primario oscuro del manual)
TURQUESA_CLARO = "#55B3A4"  # Verde Menta 1 (primario claro del manual)
MARINO = "#1E2B4F"          # Azul Oscuro (primario del manual)
AMARILLO = "#FEC604"        # Amarillo Mostaza (acento principal del manual)

def logo_datauri():
    """El imagotipo oficial embebido (para portadas de PDF sin depender de rutas)."""
    return "data:image/jpeg;base64," + base64.b64encode(
        open("oficina/IMAGOTIPOS-GRUPOARDISA-01-V1-(3).jpg", "rb").read()).decode()

# ── Formato formal tipo NORMAS APA para los PDFs (pedido Deicy 14-ago) ──────────────────────────
# Se AÑADE al final del CSS de cada generador (el CSS que llega después gana): tipografía serif
# 12pt, interlineado 1.5, márgenes de 1 pulgada, jerarquía de títulos APA (niv.1 centrado negrita,
# niv.2 izquierda negrita, niv.3 negrita cursiva) y portada académica centrada. El código y las
# tablas conservan su mono/compacto para no volverse ilegibles.
CSS_APA = """
@page { size: A4; margin: 25.4mm; }
body { font-family: 'Liberation Serif','Times New Roman','DejaVu Serif',serif; font-size: 12pt;
       line-height: 1.5; color: #111; }
p, .li { text-align: justify; }
h1 { font-family: inherit; font-size: 14pt; text-align: center; color: #1E2B4F;
     border-bottom: none; margin: 26px 0 10px; page-break-after: avoid; }
h1::after { content: ""; display: block; width: 90px; height: 3px; margin: 8px auto 0;
     background: linear-gradient(90deg,#FEC604,#55B3A4); border-radius: 2px; }
h2 { font-family: inherit; font-size: 12.5pt; text-align: left; color: #128B81;
     background: none; padding: 0; margin: 18px 0 6px; border-radius: 0; page-break-after: avoid; }
h3 { font-family: inherit; font-size: 12pt; font-style: italic; color: #1E2B4F; }
pre, code { font-family: 'DejaVu Sans Mono', monospace; }
pre { font-size: 9.5pt; line-height: 1.4; }
table { font-size: 10.5pt; line-height: 1.35; }
th { background: #1E2B4F; }
.portada { text-align: center; padding-top: 120px; page-break-after: always; }
.portada .titulo, .portada h1 { font-size: 20pt; font-weight: bold; color: #1E2B4F; line-height: 1.3; }
.portada .titulo::after, .portada h1::after { content: none; }
.portada .kicker { letter-spacing: 4px; font-size: 10pt; color: #128B81; font-weight: bold; }
.portada .sub, .portada .autor { font-size: 12pt; color: #333; font-style: normal; }
"""
