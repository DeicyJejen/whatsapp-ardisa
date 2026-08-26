#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Prueba de la alerta `ia_sin_saldo` (incidente 2026-08-26: la alerta se detectaba A SÍ MISMA).
# Corre sola:  python3 tests/test_vigilante_saldo.py   (también la corre tests/correr.sh)
#
# Lo que fija esta prueba:
#   1) Un rechazo REAL de la API de Anthropic SÍ se detecta (si no, volvemos a enterarnos probando).
#   2) El TEXTO de la propia alerta NO se detecta — ese fue el bucle: el mensaje viaja por n8n al
#      entregarse por WhatsApp, y a la hora siguiente el vigilante lo encontraba y alertaba otra vez.
#   3) El texto de la alerta que vigilante.py manda hoy NO contiene la aguja (cierre independiente:
#      aunque alguien cambie la aguja, el eco no puede volver).
import sys, os, io, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vigilante_reglas import es_rechazo_de_saldo, AGUJA_SIN_SALDO

fallos = 0


def caso(nombre, blob, esperado):
    global fallos
    r = es_rechazo_de_saldo(blob)
    ok = (r == esperado)
    print("  %s %-52s -> %s" % ("✅" if ok else "❌", nombre,
                                "RECHAZO REAL" if r else "no es rechazo"))
    if not ok:
        fallos += 1


# ── 1) Lo REAL: tal cual salió de la ejecución 137223 (25-ago 15:49, primera falla) ──────────
caso("error real de la API (exec 137223)",
     '"Bad request - please check your parameters","NodeApiError","Your credit balance is too low '
     'to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",{}',
     True)

# ── 2) El ECO: tal cual salió de la ejecución 137660 (la alerta entregándose por WhatsApp) ────
caso("el texto VIEJO de la alerta viajando por n8n (exec 137660)",
     '"1|La cuenta de Anthropic se quedó SIN SALDO: 1 conversaciones en los últimos 90 min '
     "recibieron 'credit balance is too low'. El bot NO puede clasificar la línea\",{\"messaging_product\"",
     False)

caso("una conversación normal, sin nada que ver", '{"json":{"texto":"venden cemento gris?"}}', False)
caso("volcado vacío", "", False)
caso("volcado nulo", None, False)

# ── 3) El texto que vigilante.py manda HOY no puede contener la aguja ────────────────────────
_src = io.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "vigilante.py"), encoding="utf-8").read()
# Solo el bloque del anota("ia_sin_saldo", ...) — el comentario de arriba SÍ cita la frase (y no pasa
# nada: los comentarios no viajan por n8n, solo el texto que se le manda a Deicy).
_i = _src.find('anota("ia_sin_saldo"')
_bloque = _src[_i:_src.find("except Exception", _i)]
_ok = AGUJA_SIN_SALDO not in _bloque
print("  %s %-52s -> %s" % ("✅" if _ok else "❌", "el mensaje de la alerta no cita la aguja",
                            "limpio" if _ok else "¡VUELVE EL BUCLE!"))
if not _ok:
    fallos += 1

if fallos:
    print("test_vigilante_saldo: %d FALLAS" % fallos)
    sys.exit(1)
print("test_vigilante_saldo: TODAS PASAN")
