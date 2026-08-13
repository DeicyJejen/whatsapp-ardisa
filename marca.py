#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# IDENTIDAD DE MARCA — fuente única para todos los generadores de documentos.
# Colores extraídos del imagotipo OFICIAL (oficina/IMAGOTIPOS-GRUPOARDISA-01-V1-(3).jpg, 13-ago-2026).
import base64

TURQUESA = "#009e8f"        # la flecha del imagotipo (tono principal)
TURQUESA_CLARO = "#59c5b6"  # la flecha (tono claro)
MARINO = "#1d2951"          # el azul del logotipo "grupoardisa"
AMARILLO = "#f0c000"        # Carpincentro

def logo_datauri():
    """El imagotipo oficial embebido (para portadas de PDF sin depender de rutas)."""
    return "data:image/jpeg;base64," + base64.b64encode(
        open("oficina/IMAGOTIPOS-GRUPOARDISA-01-V1-(3).jpg", "rb").read()).decode()
