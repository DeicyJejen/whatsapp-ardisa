#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# REGLAS PURAS DEL VIGILANTE — separadas de vigilante.py para poderlas PROBAR.
# vigilante.py no se puede importar en una prueba (al cargarlo consulta la BD, lee el sqlite de n8n y
# hasta manda correos). Una función "pura" (entra texto, sale decisión, sin tocar nada) sí se puede
# importar y probar mil veces sin miedo. Por eso vive aquí.
#
# Nace del caso "Laconic ceramic" (13-ago-2026): una fábrica de cerámica de la INDIA (+91) mandó su spam
# de ventas ("stock premium a 3,80 $"), el bot la atendió correctamente como proveedor... y el vigilante
# igual gritó "cliente perdido" con correo urgente. En 10 días, 5 de 15 alertas de cliente_perdido eran
# este mismo spam extranjero. Un vigilante que grita por spam enseña a ignorar el correo — y el día que
# haya un cliente perdido DE VERDAD, nadie lo va a mirar.

# Etapas donde el bot YA atendió a la persona y A PROPÓSITO no crea lead:
#   proveedor -> "este canal es la línea comercial de clientes"   info/reclamo -> Servicio al Cliente
#   empleo -> ayuda@ardisa.com   horario -> le respondió el horario   compras -> le preguntó a qué área va
ETAPAS_SIN_LEAD = {"proveedor", "info", "reclamo", "empleo", "horario", "compras"}


def clasifica_perdido(wa_id, recorrido):
    """Decide la severidad de una alerta de 'cliente perdido'. Devuelve (severidad, nota, silencio).

    severidad 1 = correo urgente + 🔴 en WhatsApp (cliente colombiano varado a mitad del flujo);
    severidad 2 = solo panel + 🟡 en WhatsApp (el bot ya lo despachó a propósito).
    silencio True = queda registrada en la tabla `alertas` (auditoría/panel) pero NO se envía al
    WhatsApp de Deicy — pedido del 14-ago: el spam extranjero ya corregido no debe volver a sonar.

    - Si TODO el recorrido son etapas de "atendido sin lead", el bot no lo perdió: lo atendió y decidió
      no crear lead (proveedores, reclamos, empleo...). Eso no es una emergencia.
    - Si el número no es colombiano (57...), es casi siempre proveedor/spam internacional (+91 India,
      +86 China, +63 Filipinas): Ardisa vende en Colombia → se registra en silencio.
    La alerta nunca desaparece del registro (el punto ciego del vigilante ya nos costó un cliente,
    caso 573124639292): siempre queda en la tabla con el texto completo para poderla juzgar.
    """
    etapas = set(e for e in str(recorrido or "").split(">") if e)
    # 14-ago: un usuario con "username" de WhatsApp llega como BSUID ("CO.1352..."): CO = Colombia,
    # es un cliente colombiano con el número oculto, NO un extranjero.
    _wa = str(wa_id or "")
    extranjero = not (_wa.startswith("57") or _wa.startswith("CO."))
    if etapas and etapas <= ETAPAS_SIN_LEAD:
        return 2, (" — OJO: el bot SÍ lo atendió (%s) y a propósito no crea lead; revisar solo si en "
                   "realidad era un cliente" % "/".join(sorted(etapas))), extranjero
    if extranjero:
        return 2, (" — número internacional (+%s...): casi siempre proveedor/spam, no un cliente de "
                   "Colombia" % str(wa_id)[:2]), True
    return 1, "", False


def etapa_cola(horas_espera, horas_para_poda):
    """Decide en qué ETAPA está una cola de adjuntos atascada. Devuelve (etiqueta, severidad).

    Pedido de Deicy (14-ago): una cola que no cambia no se re-avisa cada día. La etiqueta entra en la
    clave de la alerta (UNIQUE en la BD), así que cada cola atascada avisa MÁXIMO 3 veces, y solo
    cuando algo cambia de verdad:
      'nueva'  (sev 2) -> apareció (lleva más de 6 h esperando)
      'grave'  (sev 1) -> cumplió un día entero sin destrabarse
      'final'  (sev 1) -> a la poda de 7 días le queda menos de un día: última llamada antes del descarte
    Si llega OTRO adjunto a la misma cola, el conteo cambia la clave y vuelve a avisar (eso SÍ es nuevo).
    """
    if horas_para_poda <= 24:
        return "final", 1
    if horas_espera >= 24:
        return "grave", 1
    return "nueva", 2


# ── LEAD SIN SOLICITUD (2026-08-19) ───────────────────────────────────────────
# Pedido de Deicy: "estamos corrigiendo todos los días los mismos errores". El error se repetía porque
# solo se descubría cuando ELLA leía un chat. Esta regla lo vuelve automático: cada hora el vigilante
# mira los leads del día y avisa de los que llegaron al asesor SIN decir qué necesita el cliente —el
# caso Andrea Mendoza (#317, "Detalle: Medellín")— para poderlo recuperar el mismo día, no la semana
# siguiente. Es la misma vara que usa el bot al cerrar: ¿hay un producto, una cifra o un adjunto?
_PROD = (r"cemento|arena|gravilla|grava|hierro|varilla|acero|malla|ladrillo|bloque|adoqu|loseta|drywall|"
         r"superboard|eterboard|fibrocemento|teja|tubo|tuber|pvc|ceramic|cerámic|porcelan|enchape|azulejo|"
         r"baldosa|grifer|sanitario|inodoro|lavamanos|ducha|baño|bano|meson|mesón|pintura|esmalte|estuco|"
         r"vinilo|sika|impermeabiliz|tabl|mdf|mdp|melamin|formica|fórmica|triplex|tripl|contrachap|madera|"
         r"perfil|perfiles|policarbonato|domo|"
         r"lamina|lámina|mueble|combo|espejo|electrodom|nevera|refriger|estufa|horno|lavadora|secadora|"
         r"calentador|aluminio|mosaico|lavadero|cielo raso|metaldeck|yeso|resina|novafort|adhesiv|sellador|"
         r"sellante|sellad|silicona|pegante|pegacor|masilla|pañete|panete|mortero|concreto|hormig|aglomerad|"
         r"herraj|canto|tapacanto|bisagra|corredera|riel|laca|roble|teca|cedro|pino|nogal|wengue|cerezo|"
         r"abedul|caoba|maple|closet|clóset|repisa|entrepaño|entrepano|estante|puerta|recebo|geotextil|"
         r"acronal|caneca|toma|tanque|caballete|extractor|campana|cifon|sifon|sifón")


def lead_sin_solicitud(detalle):
    """¿Este lead salió al asesor SIN decir qué necesita el cliente? Devuelve True/False.

    Vale como solicitud: un producto del catálogo, cualquier cifra (cantidad/medida/referencia) o un
    adjunto (la foto va aparte y el asesor la ve). Todo lo demás —un saludo, una ciudad, un "cómo
    está", el nombre— significa que al asesor le llegó una tarjeta que no puede atender.
    """
    import re
    t = str(detalle or "").strip().lower()
    if not t:
        return True
    if "📎" in t or "imagen:" in t:          # trae adjunto: el asesor tiene con qué
        return False
    if re.search(r"\d", t):                   # cantidad, medida o referencia
        return False
    return not re.search(_PROD, t)


# Cortesías y relleno: lo que queda cuando el cliente no dijo nada de su necesidad.
_RELLENO = (r"hola|holis|buen|buenos|buenas|dias|d[ií]as|tarde|tardes|noche|noches|saludos|gracias|"
            r"se[ñn]or|se[ñn]ora|don|do[ñn]a|como|est[aá]s?|est[aá]n|que|qu[eé]|tal|asesor[ií]a|asesoria|"
            r"ayuda|informaci[oó]n|informes?|cotizaci[oó]n|cotizar|precio|precios|urgente|favor|por|"
            r"necesito|quiero|busco|estoy|buscando|para|de|del|la|el|los|las|un|una|mi|me|y|en|es|con|"
            r"ciudad|municipio|soy|vivo|aqui|encuentro|ubicado|ubicada")


def sin_solicitud_sev(detalle):
    """Severidad del aviso 'lead sin solicitud'. 0 = no hay problema, 1 = urgente, 2 = solo panel.

    Distinguir importa para no volver ruido la alerta (pedido de Deicy 15-ago sobre el correo):
      1 → al asesor no le llegó NADA suyo: vacío, un saludo, una ciudad, "estoy buscando asesoría".
      2 → el cliente sí escribió algo suyo ("manejan yumbolon?") y lo que pasa es que el producto no
          está en nuestro vocabulario. Vale mirarlo, pero no es una emergencia.
    """
    import re, unicodedata
    if not lead_sin_solicitud(detalle):
        return 0
    t = unicodedata.normalize("NFD", str(detalle or "").strip().lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")      # sin tildes: "cómo está" = "como esta"
    palabras = [w for w in re.split(r"[^a-zñ]+", t) if w and not re.fullmatch(_RELLENO, w)]
    # Una sola palabra suelta tampoco es una solicitud ("Medellín", "Ibagué", el nombre del cliente).
    return 2 if len(palabras) >= 2 else 1
