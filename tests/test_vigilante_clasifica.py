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
from vigilante_reglas import clasifica_perdido, etapa_cola, lead_sin_solicitud, sin_solicitud_sev

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
# 2026-08-24 (Stefany Reyna, técnico en SST que mandó su hoja de vida): el recorrido REAL trae las etapas
# mecánicas (saludo con aviso de datos, menú de marca, recordatorio, cierre). Con ellas adentro la prueba
# de "todo el recorrido es atendido-sin-lead" no daba verdadera nunca y salía correo urgente por una
# conversación que el bot resolvió bien.
caso("busca empleo, recorrido completo real", "573125672287",
     "aviso_datos>marca>empleo>recordatorio>cierre_inactividad", 2, "atendió", False)
caso("reclamo con recorrido completo real", "573001114455",
     "aviso_datos>marca>reclamo>recordatorio>cierre_inactividad", 2, "atendió", False)
# GUARDARRAÍL: descontar las mecánicas NO puede volver invisible al que se perdió de verdad. Si lo único
# que hubo fueron etapas mecánicas, no hay ninguna decisión del bot que justifique bajarle la severidad.
caso("solo vio el menú y se fue (sigue urgente)", "573007778899",
     "aviso_datos>marca>recordatorio>cierre_inactividad", 1, None, False)
# Y si preguntó por empleo pero DESPUÉS siguió el formulario comercial, hay que mirarlo: sigue sev1.
caso("preguntó empleo pero avanzó a nombre", "573002223344", "aviso_datos>marca>empleo>nombre", 1, None, False)
# Usuario con "username" de WhatsApp (BSUID): CO = Colombia -> cliente colombiano, NO spam extranjero
caso("BSUID colombiano varado en el flujo", "CO.1352055013679988", "consent>marca>cierre_inactividad", 1, None, False)
caso("BSUID extranjero (India)", "IN.9990001112223334", "", 2, "internacional", True)
# Bordes: nada de esto debe romper ni silenciar de más
caso("recorrido vacío, número colombiano", "573000000000", "", 1, None, False)
caso("recorrido vacío, número extranjero", "919000000000", "", 2, "internacional", True)

# ── lead_sin_solicitud: el cliente pide por la SUPERFICIE, no por el material (24-ago, lead #374) ──
# Marcela escribió "tienen disponible para el piso de una panadería" y la alerta dijo "SIN solicitud":
# el vocabulario del vigilante no tenía "piso", aunque el del bot sí. Dos listas para la misma pregunta.
for _t, _esp in [("Buen día, hágame un favor que tienen disponible para el piso de una panadería?", False),
                 ("necesito enchapar un muro", False),
                 ("para la fachada", False),
                 ("quiero cotizar la escalera", False),
                 ("Buen día", True),
                 ("necesito cotización", True),
                 ("estoy buscando asesoría", True),
                 ("Bucaramanga", True)]:
    _r = lead_sin_solicitud(_t)
    _ok = (_r == _esp)
    print("  %s %-58s -> %s" % ("✅" if _ok else "❌", '"%s"' % _t[:54],
                                "SIN SOLICITUD" if _r else "tiene solicitud"))
    if not _ok:
        fallos += 1

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
# ── 3) lead_sin_solicitud: ¿al asesor le llegó una tarjeta que no puede atender? ──
# Caso Andrea Mendoza (#317): Detalle "Medellín". Antes esto solo se descubría cuando Deicy leía el chat.
# ── 4) sin_solicitud_sev: urgente solo si al asesor NO le llegó nada del cliente ──
print("")
for _det, _sev, _por in [
    ("Medellín",                       1, "una ciudad suelta: el asesor no tiene nada"),
    ("Hola buenos días",               1, "solo saludo"),
    ("Hola! Estoy buscando asesoría",  1, "el texto del botón de la web, sin producto"),
    ("Para la ciudad de ibague",       1, "otra ciudad"),
    ("Buen dia · Manejan yumbolon?",   2, "sí escribió algo suyo: falta vocabulario, no es emergencia"),
    ("tienen disponible",              2, "escribió, pero no se sabe de qué"),
    ("Recebo para base final",         0, "tiene solicitud"),
]:
    _r = sin_solicitud_sev(_det)
    _ok = _r == _sev
    print("  %s %-38s -> sev%d  (%s)" % ("✅" if _ok else "❌", '"%s"' % _det, _r, _por))
    if not _ok:
        fallos += 1

print("")
for _det, _esperado, _por in [
    ("Medellín",                              True,  "la ciudad que escribió la clienta (caso #317)"),
    ("Hola buenos días",                      True,  "solo un saludo"),
    ("Para la ciudad de ibague",               True,  "otra ciudad (caso #247)"),
    ("tienen disponible",                     True,  "pregunta sin producto (caso Nelson #313)"),
    ("",                                      True,  "vacío"),
    ("Recebo para base final",                False, "recebo es producto"),
    ("Tambor de acronal novaflex",            False, "acronal es producto"),
    ("230 unds LAMINA DE TRIPLEX",            False, "trae cantidad"),
    ("📎 Imagen: caneca de reciclaje",         False, "trae adjunto"),
    ("melamina rh blanca",                    False, "producto del catálogo"),
]:
    _r = lead_sin_solicitud(_det)
    _ok = _r == _esperado
    print("  %s %-42s -> %s  (%s)" % ("✅" if _ok else "❌", '"%s"' % (_det or "(vacío)"),
          "SIN SOLICITUD" if _r else "tiene solicitud", _por))
    if not _ok:
        fallos += 1


print("test_vigilante_clasifica: TODAS PASAN")
