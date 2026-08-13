#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Prueba de las reglas puras del vigilante (caso "Laconic ceramic", 13-ago-2026).
# Corre sola:  python3 tests/test_vigilante_clasifica.py   (también la corre tests/correr.sh)
#
# Lo que fija esta prueba: el spam de proveedores extranjeros (+91 India, +86 China...) y la gente que el
# bot YA atendió a propósito sin crear lead (proveedor/info/reclamo/empleo) NO deben salir como correo
# urgente de "cliente perdido" — pero TAMPOCO deben desaparecer (severidad 2 = panel + 🟡 en WhatsApp).
# El cliente colombiano varado a mitad del flujo sigue siendo severidad 1, como siempre.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vigilante_reglas import clasifica_perdido

fallos = 0


def caso(nombre, wa, recorrido, sev_esperada, fragmento=None):
    global fallos
    sev, nota = clasifica_perdido(wa, recorrido)
    ok = sev == sev_esperada and (fragmento is None or fragmento in nota)
    print("  %s %s -> sev%d%s" % ("✅" if ok else "❌", nombre, sev, (" " + nota[:70]) if nota else ""))
    if not ok:
        fallos += 1


# El caso real: fábrica de cerámica de la India, el bot le contestó como proveedor y como info
caso("proveedor de India atendido (Laconic ceramic)", "919104293388", "proveedor>info", 2, "atendió")
# Spam chino que ADEMÁS rozó el muro de consentimiento: el recorrido ya no es puro-atendido,
# pero el número extranjero lo delata (caso Viola +86, 11-ago)
caso("spam chino que tocó el muro", "8613586300781", "info>consent>recordatorio>cierre_inactividad", 2, "internacional")
# Cliente COLOMBIANO varado a mitad del flujo: la alerta URGENTE de siempre no se puede perder
caso("colombiano varado en el flujo", "573223475520", "consent>marca>recordatorio>cierre_inactividad", 1)
caso("colombiano que solo saludó y se fue", "573011755929", "consent>recordatorio>cierre_inactividad", 1)
# Colombiano que preguntó por Servicio al Cliente y el bot lo orientó: atendido a propósito -> panel
caso("colombiano orientado a Servicio al Cliente", "573001112233", "info", 2, "atendió")
# Bordes: nada de esto debe romper ni silenciar de más
caso("recorrido vacío, número colombiano", "573000000000", "", 1)
caso("recorrido vacío, número extranjero", "919000000000", "", 2, "internacional")

if fallos:
    print("test_vigilante_clasifica: HAY PRUEBAS FALLANDO (%d)" % fallos)
    sys.exit(1)
print("test_vigilante_clasifica: TODAS PASAN")
