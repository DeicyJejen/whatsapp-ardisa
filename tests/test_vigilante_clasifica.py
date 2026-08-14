#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Prueba de las reglas puras del vigilante (caso "Laconic ceramic" 13-ago + pedido Deicy 14-ago).
# Corre sola:  python3 tests/test_vigilante_clasifica.py   (también la corre tests/correr.sh)
#
# Lo que fija esta prueba:
# 1) clasifica_perdido: el spam de proveedores extranjeros (+91, +86...) queda REGISTRADO pero en
#    SILENCIO (no suena en el WhatsApp de Deicy); lo atendido-a-propósito colombiano baja a sev2 pero
#    SÍ suena (podría ser un cliente mal clasificado); el colombiano varado sigue siendo sev1 urgente.
# 2) etapa_cola: una cola de adjuntos atascada avisa máximo 3 veces (nueva>6h, grave≥24h, final en la
#    víspera de la poda) — nunca "cada día por calendario".
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vigilante_reglas import clasifica_perdido, etapa_cola

fallos = 0


def caso(nombre, wa, recorrido, sev_esperada, fragmento=None, silencio_esperado=None):
    global fallos
    sev, nota, sil = clasifica_perdido(wa, recorrido)
    ok = sev == sev_esperada and (fragmento is None or fragmento in nota) \
        and (silencio_esperado is None or sil == silencio_esperado)
    print("  %s %s -> sev%d%s%s" % ("✅" if ok else "❌", nombre, sev,
          " 🔇" if sil else "", (" " + nota[:60]) if nota else ""))
    if not ok:
        fallos += 1


def caso_cola(nombre, horas, horas_poda, etq_esperada, sev_esperada):
    global fallos
    etq, sev = etapa_cola(horas, horas_poda)
    ok = etq == etq_esperada and sev == sev_esperada
    print("  %s %s -> %s sev%d" % ("✅" if ok else "❌", nombre, etq, sev))
    if not ok:
        fallos += 1


# ── clasifica_perdido ───────────────────────────────────────────────────────
# El caso real: fábrica de cerámica de la India, el bot le contestó como proveedor y como info
caso("proveedor de India atendido (Laconic ceramic)", "919104293388", "proveedor>info", 2, "atendió", True)
# Proveedora china de melamina (caso Rosalie Yang 14-ago): registrada pero SIN sonar en WhatsApp
caso("proveedora china de melamina (Rosalie)", "8613958544542", "proveedor", 2, "atendió", True)
# Spam chino que ADEMÁS rozó el muro de consentimiento: el número extranjero lo delata (Viola +86)
caso("spam chino que tocó el muro", "8613586300781", "info>consent>recordatorio>cierre_inactividad", 2, "internacional", True)
# Cliente COLOMBIANO varado a mitad del flujo: la alerta URGENTE de siempre no se puede perder
caso("colombiano varado en el flujo", "573223475520", "consent>marca>recordatorio>cierre_inactividad", 1, None, False)
caso("colombiano que solo saludó y se fue", "573011755929", "consent>recordatorio>cierre_inactividad", 1, None, False)
# Colombiano atendido a propósito: baja a sev2 pero SÍ suena (podría ser un cliente mal clasificado,
# caso del comprador B2B echado como proveedor en la auditoría del 05-ago)
caso("colombiano orientado a Servicio al Cliente", "573001112233", "info", 2, "atendió", False)
caso("colombiano clasificado proveedor (¿B2B?)", "573124027713", "proveedor", 2, "atendió", False)
# Bordes: nada de esto debe romper ni silenciar de más
caso("recorrido vacío, número colombiano", "573000000000", "", 1, None, False)
caso("recorrido vacío, número extranjero", "919000000000", "", 2, "internacional", True)

# ── etapa_cola ──────────────────────────────────────────────────────────────
print()
caso_cola("cola recién atascada (8h, poda lejos)", 8, 160, "nueva", 2)
caso_cola("misma cola al otro día (30h)", 30, 138, "grave", 1)
caso_cola("caso Karime hoy (62h esperando)", 62, 106, "grave", 1)
caso_cola("víspera del descarte (20h para la poda)", 148, 20, "final", 1)
caso_cola("justo en el borde de las 24h", 24, 144, "grave", 1)
caso_cola("borde: quedan exactamente 24h de poda", 100, 24, "final", 1)

if fallos:
    print("test_vigilante_clasifica: HAY PRUEBAS FALLANDO (%d)" % fallos)
    sys.exit(1)
print("test_vigilante_clasifica: TODAS PASAN")
