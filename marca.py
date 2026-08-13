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
