#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# VIGILANTE DEL BOT (2026-08-03, pedido Deicy: "esos errores son los que necesito saber").
#
# POR QUÉ EXISTE: hasta hoy los errores se descubrían leyendo conversaciones a mano, días después.
# Así se perdieron 13 clientes en 5 días y nadie se enteró. Este script busca los MISMOS patrones
# automáticamente cada hora y deja constancia en la tabla `alertas`.
#
# DISEÑO (a propósito):
#   - El trabajo PESADO corre aquí, en un cron, NO en el camino del cliente. La consulta que el bot
#     hace en cada mensaje debe seguir siendo instantánea.
#   - La tabla `alertas` tiene UNIQUE(tipo, clave) y se inserta con INSERT IGNORE: repetir la corrida
#     NO duplica alertas. Eso se llama IDEMPOTENCIA y es lo que permite correr esto cada hora sin miedo.
#   - Solo se avisa por correo lo NUEVO y GRAVE (severidad 1). Un vigilante que grita por todo se ignora.
#
# Uso:  python3 vigilante.py            -> detecta, guarda, CIERRA lo resuelto y avisa lo nuevo grave
#       python3 vigilante.py --seco     -> solo muestra en pantalla, no guarda ni envía
#       python3 vigilante.py --cerrar 7 -> cierra a mano la alerta #7 (las que no se cierran solas)
import subprocess, os, sys, ssl, smtplib, datetime, base64, json
from email.message import EmailMessage
from vigilante_reglas import clasifica_perdido, etapa_cola   # reglas puras (probadas en tests/test_vigilante_clasifica.py)

BASE      = "/home/ubuntu/whatsapp-ardisa"
KEY_N8N   = "/home/ubuntu/.config/ardisa/n8n_api_key"
SMTP_HOST, SMTP_PORT = "smtp.office365.com", 587
SMTP_USER = "noreply@ardisa.com"
SMTP_PASS = open("/home/ubuntu/.config/ardisa/smtp_pass").read().strip()
# 2026-08-11 (pedido de Deicy): las alertas del bot son SOLO para ella. Ernesto sale de la lista.
# Ojo con la confusión histórica: el correo de la CUENTA de la máquina es ernesto.rondano@ardisa.com,
# pero quien opera y recibe las alertas es Deicy — son dos personas distintas, no dos correos de la misma.
DEST      = ["deicy.jejen@ardisa.com"]
SECO      = "--seco" in sys.argv
CERRAR    = [a for a in sys.argv[1:] if a.isdigit()] if "--cerrar" in sys.argv else []
AHORA     = datetime.datetime.now()

def q(sql):
    out = subprocess.check_output(
        ["sudo","-n","mysql","--default-character-set=utf8mb4","bot_ardisa","-N","-B","-e",sql],
        text=True, errors="replace")
    return [l.split("\t") for l in out.splitlines() if l.strip()]

def esc(s):
    return str(s).replace("\\","\\\\").replace("'","''").replace("\n"," ")[:400]

def avisar_correo(asunto, cuerpo):
    """Manda un correo de alerta. NO depende de MySQL (SMTP directo) -> sirve incluso con la BD caída."""
    msg = EmailMessage()
    msg["From"] = "Grupo Ardisa (Vigilante del Bot) <%s>" % SMTP_USER
    msg["To"] = ", ".join(DEST); msg["Subject"] = asunto; msg.set_content(cuerpo)
    s = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=60); s.ehlo()
    s.starttls(context=ssl.create_default_context()); s.ehlo(); s.login(SMTP_USER, SMTP_PASS)
    s.send_message(msg); s.quit()

# ═══ DEAD-MAN: ¿LA BASE DE DATOS RESPONDE? (2026-08-12, auditoría de robustez) ═══
# El modo de falla más grave y más invisible: si MySQL se cae, TODO el bot falla en silencio (leads,
# consentimientos, sesiones) y este mismo vigilante moría en su primer SELECT antes de avisar nada — la
# caída se conocía días después. Ahora es lo PRIMERO que se comprueba: si la BD no responde, se manda el
# correo de una (SMTP no depende de MySQL) y se sale. La caída de la BD pasa de ser la alerta invisible a
# ser la primera alerta.
if not SECO:
    try:
        q("SELECT 1")
    except Exception as e:
        try:
            avisar_correo("🔴 URGENTE — la base de datos del bot NO responde",
                "El vigilante no pudo conectarse a la base de datos del bot (MySQL).\n\n"
                "Mientras esté caída, el bot NO guarda leads, consentimientos ni sesiones, y las alertas del "
                "panel tampoco funcionan. Esto necesita atención de soporte técnico DE INMEDIATO.\n\n"
                "Detalle técnico: %s\n\nHora: %s" % (str(e)[:300], AHORA.strftime("%Y-%m-%d %H:%M")))
            print("%s | BD CAÍDA — correo de emergencia enviado" % AHORA.strftime("%Y-%m-%d %H:%M"))
        except Exception as e2:
            print("BD caída Y correo falló: %s / %s" % (e, e2))
        raise SystemExit(2)

# ═══ LA TABLA `alertas` TIENE QUE PODER CERRAR ═══════════════════════════════
# 2026-08-15 (lo preguntó Deicy: "muchos problemas y viejos, no sé si ya están corregidos").
# `alertas` nació siendo un DIARIO: se escribía y no se cerraba nunca. Pero el panel de WhatsApp muestra
# "ERRORES DETECTADOS (7 días)", así que un problema detectado el lunes y arreglado el lunes por la tarde
# seguía gritando hasta el domingo. El 15-ago Deicy vio 36 "errores" y la mayoría ya estaban resueltos: dos
# de los tres "clientes perdidos" ya eran los leads #294 y #295. Un panel que no distingue lo VIVO de lo
# HISTÓRICO enseña a ignorarlo, y el día que salga el error de verdad nadie lo va a mirar.
# La columna se crea sola (idempotente) para que esto funcione en una instalación limpia sin DDL a mano.
if not SECO:
    _tiene = q("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() "
               "AND TABLE_NAME='alertas' AND COLUMN_NAME='resuelto_en'")
    if _tiene and _tiene[0][0] == "0":
        q("ALTER TABLE alertas ADD COLUMN resuelto_en DATETIME NULL DEFAULT NULL, "
          "ADD KEY idx_abiertas (resuelto_en, creado_en)")
        print("alertas: columna `resuelto_en` creada")

# Cierre a mano, para las alertas que a propósito NO se cierran solas (ver NO_SE_CIERRA_SOLA abajo).
if CERRAR:
    for _cid in CERRAR:
        q("UPDATE alertas SET resuelto_en=NOW() WHERE id=%s AND resuelto_en IS NULL" % int(_cid))
        print("alerta #%s cerrada a mano" % _cid)
    raise SystemExit(0)

hallazgos = []   # (tipo, severidad, clave, detalle, silencio)
def anota(tipo, sev, clave, detalle, silencio=False):
    # silencio=True: queda en la tabla `alertas` (auditoría/panel) pero nace con avisado_wa=1,
    # así el circuito de WhatsApp nunca la envía (pedido Deicy 14-ago: spam corregido no re-suena).
    hallazgos.append((tipo, sev, str(clave)[:120], detalle, silencio))

# ── Excluir a quien NO es cliente: asesores, la línea de monitoreo y los números de prueba ──
# La lista de etapas es intercambiable (@ETAPAS@): el chequeo de CLIENTE PERDIDO necesita VER las filas
# 'proveedor' — si se ocultan, el recorrido sale MENTIROSO: en el caso "Laconic ceramic" (13-ago) Deicy vio
# "recorrido: info" sin poder saber que el bot ya le había contestado 3 veces como proveedor. Los demás
# chequeos las siguen excluyendo como siempre.
# 2026-08-15: los números de PRUEBA tienen que ser UNA sola lista. El bot ya tenía tres en CLIENTES_PRUEBA
# (build_f1.py) pero aquí solo se excluía el de Deicy, así que una demo desde el BSUID de Oscar se contaba
# como degradación real: las "3 consultas de cotización SAP fallaron" del 14-ago eran las pruebas de Deicy
# y de esa demo, ni un solo cliente. Un vigilante que alarma por los ensayos se vuelve ruido.
CLIENTES_PRUEBA = ["573205662947", "573156251656", "CO.1352055013679988"]   # = CLIENTES_PRUEBA de build_f1.py
_SQL_PRUEBA = ",".join("'%s'" % esc(x) for x in CLIENTES_PRUEBA)

_NO_CLIENTE_BASE = ("AND m.wa_id NOT IN (" + _SQL_PRUEBA + ") AND m.wa_id NOT LIKE '5799999%' "
              "AND m.wa_id COLLATE utf8mb4_unicode_ci NOT IN (SELECT DISTINCT asesor_tel COLLATE utf8mb4_unicode_ci FROM leads WHERE asesor_tel IS NOT NULL AND asesor_tel<>'') "
              "AND m.etapa NOT LIKE 'seg\\_%' AND m.etapa NOT LIKE 'admin\\_%' "
              "AND m.etapa NOT IN (@ETAPAS@)")
NO_CLIENTE         = _NO_CLIENTE_BASE.replace("@ETAPAS@", "'asesor_activo','noop','proveedor'")
NO_CLIENTE_VE_PROV = _NO_CLIENTE_BASE.replace("@ETAPAS@", "'asesor_activo','noop'")

# ═══ 1. CARRERA DEL CONSENTIMIENTO ═══════════════════════════════════════════
# El cliente autoriza y segundos después el bot se lo vuelve a pedir (staticData pisado por
# ejecuciones en paralelo). Arreglado el 3-ago leyendo la BD; esto vigila que no vuelva.
# 2026-08-11 — LA ALERTA TIENE QUE DISTINGUIR DOS COSAS QUE NO SON IGUALES (caso Adriana Poveda, #265):
#   (a) el bot repite el MURO COMPLETO tras autorizar  -> eso es el bug de verdad (21 clientes en 18 días);
#   (b) el bot manda el EMPUJÓN SUAVE ("Solo falta que toques ✅ Sí, autorizo") -> eso NO es el bug: es la
#       degradación DISEÑADA para las carreras (el freno temporal `store.muro` ya evitó repetir el muro).
# Adriana escribió 366 ms antes de que terminara la ejecución de su botón: ninguna lectura podía saberlo
# todavía. Recibió el empujón suave, siguió y quedó registrada como lead. Avisar de eso como si fuera "el
# error de siempre" es peor que no avisar: enseña a desconfiar del panel, y el día que aparezca el bug real
# nadie lo va a mirar. Se distinguen por el TEXTO: el muro completo lleva la URL de la política; el empujón no.
# Y aunque sea el muro completo, si el cliente igual terminó registrado se baja a severidad 2 (no es urgencia).
for tel, nom, cuando, seg, quedo in q("""
    SELECT c.telefono, COALESCE(c.nombre,''), DATE_FORMAT(c.creado_en,'%d/%m %H:%i:%s'),
           TIMESTAMPDIFF(SECOND, c.creado_en, MIN(m.creado_en)),
           EXISTS(SELECT 1 FROM leads l
                  WHERE l.telefono COLLATE utf8mb4_unicode_ci = c.telefono COLLATE utf8mb4_unicode_ci
                    AND l.creado_en >= c.creado_en)
    FROM consentimientos c
    JOIN mensajes m ON m.wa_id COLLATE utf8mb4_unicode_ci = c.telefono COLLATE utf8mb4_unicode_ci
    WHERE c.decision='SI' AND m.etapa='consent' AND m.creado_en > c.creado_en
      AND c.creado_en >= NOW() - INTERVAL 3 DAY
      AND m.salida LIKE '%politica-de-datos-personales%'
    GROUP BY c.telefono, c.nombre, c.creado_en
    HAVING TIMESTAMPDIFF(SECOND, c.creado_en, MIN(m.creado_en)) <= 90"""):
    _reg = str(quedo) == "1"
    anota("carrera_consent", 2 if _reg else 1, tel+"|"+cuando,
          "%s (%s) autorizó el %s y el bot le volvió a mostrar el MURO COMPLETO %ss después%s"
          % (nom or tel, tel, cuando, seg,
             " (aun así quedó registrado, pero se le hizo repetir)" if _reg else " — y NO quedó registrado"))

# ═══ 2. CLIENTE PERDIDO ══════════════════════════════════════════════════════
# Escribió y NUNCA quedó registrado como lead.
#
# 2026-08-06 (caso Carlos Chiquillo, Bomberos de Piedecuesta): la versión anterior EXIGÍA que la
# conversación ya se hubiera cerrado por inactividad, así que el aviso llegaba ~1½ horas tarde (30 min
# de espera del cierre + la corrida horaria). Carlos dijo su pedido COMPLETO en el primer mensaje
# ("3 máscaras full face 3M ref 6800") y quedó varado en el menú de marca: el rescate del bot no se
# arma sin LÍNEA conocida (regla de oro: ante la duda NUNCA adivinar el asesor), así que nadie se
# habría enterado a tiempo. Ahora la vara es el SILENCIO (20 min sin escribir), con o sin cierre, y
# basta UN mensaje si trae contenido real (>=25 caracteres). Deicy lo ve en su panel y decide a quién
# pasarlo: el bot no adivina, la persona sí sabe.
# 2026-08-13 (caso "Laconic ceramic", fábrica de cerámica de la India): tres defectos hacían que un
# PROVEEDOR de spam extranjero se viera como cliente perdido URGENTE (5 de las 15 alertas en 10 días):
#   (a) el recorrido escondía las filas 'proveedor' (aquí se usa NO_CLIENTE_VE_PROV para verlas);
#   (b) el "PIDIÓ:" se cortaba en el primer renglón ("Hola.") porque el separador del GROUP_CONCAT era el
#       MISMO salto de línea que traen los mensajes multilínea — el pitch de venta ("stock premium a
#       3,80 $") quedaba invisible y no había cómo juzgar la alerta; ahora cada mensaje se aplana a una
#       línea ANTES de concatenar y el separador vuelve a ser inequívoco;
#   (c) los adjuntos ("📎 image ⟦m:...⟧" mide 34 caracteres) se podían colar como "PIDIÓ".
# La severidad la decide vigilante_reglas.clasifica_perdido: atendido-a-propósito o número extranjero
# baja a severidad 2 (panel + 🟡 en WhatsApp, sin correo urgente); el colombiano varado sigue en 1.
for wa, nom, n, ini, ult, pedido in q("""
    SELECT m.wa_id, COALESCE(MAX(m.nombre),''), SUM(m.entrada<>'(inactividad)'),
           DATE_FORMAT(MIN(m.creado_en),'%d/%m %H:%i'),
           GROUP_CONCAT(DISTINCT LEFT(m.etapa,18) ORDER BY m.creado_en SEPARATOR '>'),
           COALESCE(SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN CHAR_LENGTH(m.entrada)>=25 AND m.entrada NOT LIKE '📎%'
                    THEN REPLACE(REPLACE(m.entrada, CHAR(13), ' '), CHAR(10), ' ') END
                    ORDER BY CHAR_LENGTH(m.entrada) DESC SEPARATOR '\\n'), '\\n', 1), '')
    FROM mensajes m
    WHERE m.creado_en >= NOW() - INTERVAL 2 DAY """ + NO_CLIENTE_VE_PROV + """
      AND NOT EXISTS (SELECT 1 FROM leads l
                      WHERE l.telefono COLLATE utf8mb4_unicode_ci = m.wa_id COLLATE utf8mb4_unicode_ci)
    GROUP BY m.wa_id
    HAVING MAX(m.creado_en) < NOW() - INTERVAL 20 MINUTE
       AND (SUM(m.entrada<>'(inactividad)')>=2 OR MAX(CHAR_LENGTH(m.entrada))>=25)"""):
    sev, nota, silencio = clasifica_perdido(wa, ult)
    anota("cliente_perdido", sev, wa+"|"+ini,
          "%s (%s) escribió %s %s desde el %s y NO quedó registrado — recorrido: %s%s%s"
          % (nom or wa, wa, n, ("vez" if str(n) == "1" else "veces"), ini, ult,
             ("  ·  PIDIÓ: "+pedido[:160]) if pedido else "", nota), silencio=silencio)

# ═══ 2c. ¿LA TABLA `sesiones` DEJÓ DE LLENARSE? ══════════════════════════════
# 2026-08-10: el nodo que guarda la sesión por cliente (la cura de la carrera del staticData, caso
# Sonia #234) llevaba CUATRO DÍAS fallando en silencio — su SQL no lo podía preparar el driver de n8n
# y el nodo va con onError:continueRegularOutput, así que nadie se enteró y el arreglo estaba inerte.
# Un arreglo que puede morir callado necesita su propio vigilante: si hoy hubo conversaciones de
# clientes y la tabla no se movió, algo se rompió.
_conv_hoy = q("""SELECT COUNT(DISTINCT wa_id) FROM mensajes
                 WHERE creado_en >= CURDATE() AND etapa IN
                   ('marca','nombre','ciudad','ciudadOtra','ocupacion','ocuArd','punto','detalle','confirmGrupo','cierre')""")
_ses_hoy  = q("SELECT COUNT(*) FROM sesiones WHERE actualizado >= CURDATE()")
_n_conv = int(_conv_hoy[0][0]) if _conv_hoy else 0
_n_ses  = int(_ses_hoy[0][0])  if _ses_hoy  else 0
if _n_conv >= 3 and _n_ses == 0:
    anota("sesiones_no_guardan", 1, "sesiones|" + AHORA.strftime("%Y-%m-%d"),
          "Hoy hubo %s conversaciones de clientes y la tabla `sesiones` NO registró ninguna: el nodo "
          "'Guardar sesión (MySQL)' está fallando en silencio y la protección contra la carrera del "
          "staticData quedó inerte" % _n_conv)

# ═══ 2d. ¿UN REPORTE DEL ASESOR SE PERDIÓ? ═══════════════════════════════════
# 2026-08-11 (lo notó Deicy: "no han reportado nada y en el chat de cada uno sí reportaron"): el bot le
# dice "✅ ¡Registrado, gracias!" al asesor SIN comprobar que la fila se haya actualizado. Cuando el
# cliente cerraba dos veces en menos de 45 min, el pendiente apuntaba a una fila que el candado
# anti-duplicado nunca insertó -> el UPDATE tocaba 0 filas y el reporte se perdía en silencio.
# 4 de 128 se perdieron así, uno de ellos una venta GANADA de $1.270.000. La consulta ya busca la fila
# real; esto vigila que la promesa que se le hace al asesor sea cierta.
# OJO con el detector: NO sirve buscar un lead con `reportado_en` cercano a la confirmación, porque al
# RE-reportar un lead esa fecha se sobrescribe y las confirmaciones viejas quedarían huérfanas — daba 31
# falsos positivos en 30 días. El invariante que sí se sostiene es: el cliente que aparece en una
# confirmación tiene que tener SU lead con estado. Eso no lo borra un re-reporte.
_leads_por_nombre = {}
for _lid, _nom, _est, _cre in q("SELECT id, COALESCE(nombre,''), COALESCE(estado,''), creado_en FROM leads"):
    _leads_por_nombre.setdefault(_nom.strip().lower(), []).append((_lid, _est, _cre))

for _cuando, _tel_ase, _salida in q("""
    SELECT DATE_FORMAT(creado_en,'%d/%m %H:%i'), wa_id, REPLACE(salida, CHAR(10), '§')
    FROM mensajes WHERE etapa='seg_ok' AND creado_en >= NOW() - INTERVAL 4 DAY ORDER BY creado_en"""):
    # el nombre del cliente es la primera línea de la confirmación que no es encabezado ni etiqueta
    _cliente = ""
    for _p in [p for p in _salida.split("§") if p.strip()]:
        _s = _p.strip().lstrip("👤 ").strip()
        if _s and not any(k in _p for k in ("Registrado", "Estado", "Motivo", "Valor", "Cuando", "📝")) and len(_s) < 60:
            _cliente = _s
            break
    if not _cliente:
        continue
    _cands = _leads_por_nombre.get(_cliente.lower(), [])
    if _cands and any(e for _, e, _c in _cands):
        continue          # su lead sí quedó con estado -> el reporte llegó
    anota("reporte_perdido", 1, "segok|" + _cuando + "|" + _tel_ase,
          "El asesor %s reportó a *%s* el %s y el bot le confirmó '✅ ¡Registrado!', pero ese lead sigue "
          "SIN estado en la base: el reporte se perdió y no aparece en el informe%s"
          % (_tel_ase, _cliente, _cuando, "" if _cands else " (y no existe ningún lead con ese nombre)"))

# ═══ 3. PIDIÓ EMPLEO ═════════════════════════════════════════════════════════
# No es cliente ni proveedor: el bot le insiste con el permiso de datos y el menú de marcas.
for wa, nom, txt_, cuando in q("""
    SELECT m.wa_id, COALESCE(MAX(m.nombre),''),
           LEFT(MAX(m.entrada),80), DATE_FORMAT(MIN(m.creado_en),'%d/%m %H:%i')
    FROM mensajes m
    WHERE m.creado_en >= NOW() - INTERVAL 2 DAY """ + NO_CLIENTE + """
      AND (m.entrada LIKE '%hoja de vida%' OR m.entrada LIKE '%quiero trabajar%'
        OR m.entrada LIKE '%trabajar con ustedes%' OR m.entrada LIKE '%trabajar para ustedes%'
        OR m.entrada LIKE '%vacante%' OR m.entrada LIKE '%buscando empleo%')
    GROUP BY m.wa_id"""):
    anota("pide_empleo", 2, wa+"|"+cuando,
          "%s (%s) escribió buscando trabajo el %s: \"%s\"" % (nom or wa, wa, cuando, txt_))

# ═══ 4. TAREAS AUTOMÁTICAS QUE FALLARON ══════════════════════════════════════
# Un cron que se cae en silencio es peor que uno que no existe: se cree que está funcionando.
for log in ("cron_reporte.log", "cron_seguimiento.log", "cron_duplicados.log", "cron_backup.log", "cron_vigilante.log", "cron_mcp_token.log"):
    ruta = BASE + "/reportes/" + log
    if not os.path.exists(ruta): continue
    if (AHORA - datetime.datetime.fromtimestamp(os.path.getmtime(ruta))).days > 2: continue
    txt_ = open(ruta, errors="replace").read()[-4000:]
    if "Traceback" in txt_ or "Error" in txt_:
        ultima = [l for l in txt_.splitlines() if l.strip()][-1][:200]
        anota("cron_fallido", 1, log + "|" + AHORA.strftime("%Y-%m-%d"),
              "La tarea automática %s registró un error. Última línea: %s" % (log, ultima))

# ═══ 5. TOKEN DE DESPLIEGUE POR VENCER ═══════════════════════════════════════
# El 30-jul venció sin que nadie se enterara: 4 días sin poder desplegar arreglos.
try:
    p = open(KEY_N8N).read().strip().split(".")[1]
    exp = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))).get("exp")
    if exp:
        dias = (datetime.datetime.fromtimestamp(exp) - AHORA).days
        if dias < 10:
            anota("token_n8n", 1, "exp" + str(exp),
                  "El token de despliegue de n8n vence en %d día(s) (%s). Generar uno nuevo en Settings > n8n API."
                  % (dias, datetime.datetime.fromtimestamp(exp).strftime("%d/%m/%Y")))
except Exception as e:
    anota("token_n8n", 2, "ilegible|" + AHORA.strftime("%Y-%m-%d"), "No se pudo leer el token de n8n: %s" % e)

# ═══ 6. LEADS MUY VIEJOS SIN REPORTAR ════════════════════════════════════════
for asesor, n, viejo in q("""
    SELECT asesor, COUNT(*), DATE_FORMAT(MIN(creado_en),'%d/%m')
    FROM leads WHERE modo_prueba=0 AND (estado IS NULL OR estado='')
      AND creado_en < NOW() - INTERVAL 10 DAY
    GROUP BY asesor HAVING COUNT(*) >= 5"""):
    anota("sin_reportar", 2, asesor + "|" + AHORA.strftime("%Y-%W"),
          "%s tiene %s leads sin reportar de más de 10 días (el más viejo del %s)" % (asesor, n, viejo))

# ═══ 7. ADJUNTOS ATASCADOS EN LA COLA DEL ASESOR ═════════════════════════════
# (2026-08-12, auditoría): las fotos/audios de los clientes se ENCOLAN en staticData (mediaPend) cuando la
# ventana de 24h del asesor está cerrada, y solo salen cuando el asesor le escribe al bot. Si el asesor no
# escribe, la cola envejece EN SILENCIO: se hallaron 6 adjuntos de 4 clientes esperando a Karime hasta 167
# HORAS. Nadie lo veía: ni el panel ni este vigilante. Se lee el staticData EN SITIO (sqlite immutable, sin
# copiar la BD de 3GB — orden de Deicy 05-ago) y se alerta por asesor si algo lleva >6h esperando.
# 2026-08-13 (caso Karime, 2ª ronda): el bot YA se destraba solo — manda al asesor 1 plantilla de destrabe
# al día (media_nudge, desde el 12-ago). Si la cola SIGUE atascada es porque el asesor no responde NI a la
# plantilla (Karime: 1 sola interacción desde el 22-jul, 1 de 79 leads reportados). La alerta ahora dice
# cuántos empujones se le han mandado y cuándo la poda de 7 días descartará lo más viejo: con eso Deicy
# sabe que lo que falta no es tecnología sino una LLAMADA. Los archivos podados no se pierden del todo:
# el media_id queda en la tabla `mensajes` y se puede reenviar a mano (~30 días de vida en Meta).
try:
    import sqlite3
    _con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
    _sd = _con.execute("SELECT staticData FROM workflow_entity WHERE id='botArdisaFase1x'").fetchone()
    _con.close()
    _mp = (json.loads(_sd[0]) if _sd and _sd[0] else {}).get("global", {}).get("mediaPend", {}) or {}
    _ms = int(AHORA.timestamp() * 1000)
    for _dst, _items in _mp.items():
        _viejos = [i for i in (_items or []) if (_ms - int(i.get("t", _ms))) > 6 * 3600 * 1000]
        if not _viejos:
            continue
        _hrs = max(int((_ms - int(i.get("t", _ms))) / 3600000) for i in _viejos)
        _clientes = sorted(set((i.get("cliente") or "?") for i in _viejos))
        _asesor = q("SELECT asesor FROM leads WHERE asesor_tel='%s' ORDER BY id DESC LIMIT 1" % esc(_dst))
        _nom = _asesor[0][0] if _asesor else _dst
        # ¿ya se le mandó la plantilla de destrabe? (las deja registradas el bot con etapa media_nudge)
        _nud = q("SELECT COUNT(*), COALESCE(DATE_FORMAT(MAX(creado_en),'%d/%m %H:%i'),'') FROM mensajes "
                 "WHERE wa_id='" + esc(_dst) + "' AND etapa='media_nudge'")
        _n_nud = int(_nud[0][0]) if _nud else 0
        # la poda del bot descarta de la cola lo que cumpla 7 días: avisar la fecha ANTES de que pase
        _min_t = min(int(i.get("t", _ms)) for i in _viejos)
        _poda = datetime.datetime.fromtimestamp(_min_t / 1000) + datetime.timedelta(days=7)
        # 2026-08-14 (pedido Deicy): una cola que NO cambia no se re-avisa cada día. La clave lleva el
        # ESTADO de la cola (adjunto más viejo + cuántos son + etapa nueva/grave/final): misma cola en
        # la misma etapa = misma clave = el UNIQUE de la tabla la calla. Solo re-suena si llega otro
        # adjunto, si cumple un día entero, o en la víspera del descarte (máximo 3 avisos por cola).
        _etq, _sev = etapa_cola(_hrs, (_poda - AHORA).total_seconds() / 3600)
        anota("cola_adjuntos", _sev, "%s|%dx%d|%s" % (_dst, _min_t, len(_viejos), _etq),
              "%d adjunto(s) de %d cliente(s) llevan hasta %d horas esperando a %s (+%s): su ventana de 24h "
              "está cerrada.%s Cualquier mensaje del asesor al bot libera la cola en <2 min. ⚠️ Lo más "
              "viejo se descarta de la cola el %s (recuperable a mano). Clientes: %s"
              % (len(_viejos), len(_clientes), _hrs, _nom, _dst,
                 ((" El bot ya le envió %d plantilla(s) de destrabe (última el %s) y NO ha respondido — "
                   "toca llamarlo directamente.") % (_n_nud, _nud[0][1])) if _n_nud else "",
                 _poda.strftime("%d/%m %H:%M"), ", ".join(_clientes)[:100]))
except Exception as e:
    anota("cola_adjuntos", 2, "ilegible|" + AHORA.strftime("%Y-%m-%d"),
          "No se pudo revisar la cola de adjuntos (staticData): %s" % e)

# ═══ 8. ¿EL BOT ESTÁ VIVO? workflow activo + webhook responde (2026-08-12, auditoría) ═══
# El 17-jul el workflow quedó INACTIVO tras un cambio de IP y nadie lo supo hasta que un cliente se quejó;
# importar/actualizar n8n también lo desactiva. Aquí se comprueba directo contra la API de n8n (la key ya se
# lee para el chequeo del token) y se toca el webhook: si el bot está muerto, es una alerta grave.
try:
    import urllib.request
    _key = open(KEY_N8N).read().strip()
    _req = urllib.request.Request("http://127.0.0.1:5678/api/v1/workflows/botArdisaFase1x",
                                  headers={"X-N8N-API-KEY": _key})
    with urllib.request.urlopen(_req, timeout=15) as _r:
        _activo = json.loads(_r.read()).get("active")
    if _activo is not True:
        anota("bot_inactivo", 1, "inactivo|" + AHORA.strftime("%Y-%m-%d-%H"),
              "El workflow del bot (botArdisaFase1x) está DESACTIVADO en n8n: el bot NO responde a nadie. "
              "Reactívalo en n8n.ardisa.com (interruptor 'Active') o pide soporte. Suele pasar tras importar o "
              "actualizar n8n.")
    else:
        # activo, pero ¿el webhook contesta? (registro perezoso: solo cuenta si NO da 5xx/timeout)
        try:
            _wr = urllib.request.Request("http://127.0.0.1:5678/webhook/bot-wsp-ardisa-f1", data=b'{"entry":[]}',
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(_wr, timeout=15).read()
        except Exception as _we:
            anota("bot_webhook", 1, "webhook|" + AHORA.strftime("%Y-%m-%d-%H"),
                  "El bot está activo en n8n pero su webhook no respondió bien: %s. Revisa n8n/nginx." % str(_we)[:150])
except Exception as e:
    anota("bot_inactivo", 2, "apicheck|" + AHORA.strftime("%Y-%m-%d"),
          "No se pudo verificar si el bot está activo (API de n8n): %s" % str(e)[:150])

# ═══ 9. ¿EL BOT QUEDÓ MUDO EN HORARIO HÁBIL? (self-watch, 2026-08-12) ═══
# Un cron caído o un bot que no procesa mensajes no siempre deja Traceback. Si en la última hora HÁBIL
# (L-S, 8-17) hay CERO mensajes nuevos y el bot históricamente sí recibe a esa hora, algo está mudo.
try:
    _hh = AHORA.hour; _wd = AHORA.weekday()   # 0=lun ... 6=dom
    if _wd < 6 and 9 <= _hh <= 17:            # dentro de horario, con al menos 1h de margen desde apertura
        _rec = q("SELECT COUNT(*) FROM mensajes WHERE creado_en > NOW() - INTERVAL 65 MINUTE")
        _hist = q("SELECT COUNT(*) FROM mensajes WHERE HOUR(creado_en)=HOUR(NOW()) "
                  "AND creado_en > NOW() - INTERVAL 21 DAY AND creado_en < NOW() - INTERVAL 1 DAY")
        _n_rec = int(_rec[0][0]) if _rec else 0
        _n_hist = int(_hist[0][0]) if _hist else 0
        if _n_rec == 0 and _n_hist >= 10:     # a esta hora suele haber tráfico y hoy no hay NADA
            anota("bot_mudo", 1, "mudo|" + AHORA.strftime("%Y-%m-%d-%H"),
                  "En la última hora (hábil) el bot no registró NINGÚN mensaje, cuando a esta hora normalmente "
                  "recibe varios. Puede estar caído o desconectado de WhatsApp: revísalo.")
except Exception as e:
    print("check bot_mudo falló: %s" % e)

# ═══ 10. SALUD DE LA COTIZACIÓN SAP (Fase 2, 2026-08-13) ═══
# El diseño de la Fase 2 degrada con gracia: si el MCP falla, el cliente recibe un mensaje neutro y pasa al
# asesor (etapa cotiza_fallo) — o sea que NADIE nota cuando la cotización se muere; se vería como si los
# clientes "prefirieran al asesor". Este chequeo hace visible esa degradación: token vacío con el piloto
# encendido = todo va a fallar (sev 1); fallos reales en 24h = contarlos (sev 2, sev 1 si son 3+).
try:
    _cfg = dict(q("SELECT clave, valor FROM config WHERE clave IN ('usar_cotiza','mcp_sap_token')"))
    if str(_cfg.get("usar_cotiza", "")).strip().lower() == "si":
        if not str(_cfg.get("mcp_sap_token", "")).strip():
            anota("cotiza_config", 1, "token|" + AHORA.strftime("%Y-%m-%d"),
                  "La cotización SAP está ENCENDIDA (usar_cotiza=si) pero el token del MCP está VACÍO en la "
                  "BD: toda consulta va a caer al asesor. Corre `python3 mcp_token_login.py` o revisa "
                  "reportes/cron_mcp_token.log (refrescador).")
        # 14-ago: las pruebas de Deicy no cuentan como degradación. 15-ago: NINGUNA prueba cuenta —
        # el demo de Oscar (BSUID) seguía colándose y era el que inflaba la alerta.
        _f = q("SELECT COUNT(*), COALESCE(MAX(DATE_FORMAT(creado_en,'%d/%m %H:%i')),'') FROM mensajes "
               "WHERE etapa='cotiza_fallo' AND creado_en >= NOW() - INTERVAL 1 DAY "
               "AND wa_id NOT IN (" + _SQL_PRUEBA + ")")
        _nf = int(_f[0][0]) if _f else 0
        if _nf:
            # clave por el ÚLTIMO fallo (no por día): solo re-avisa si hay un fallo NUEVO — el mismo
            # fallo de ayer no se re-cuenta al cambiar el calendario (pedido Deicy 14-ago)
            anota("cotiza_fallos", 1 if _nf >= 3 else 2, "fallos|" + str(_f[0][1]),
                  "%d consulta(s) de cotización SAP fallaron en las últimas 24h (última: %s). El cliente no "
                  "se pierde (recibe el mensaje neutro y pasa al asesor), pero la Fase 2 está degradada: "
                  "revisa el servidor MCP y reportes/cron_mcp_token.log." % (_nf, _f[0][1]))
except Exception as e:
    print("check cotiza falló: %s" % e)

# ── Guardar (idempotente) y avisar solo lo NUEVO y GRAVE ─────────────────────
if SECO:
    for t, sev, c, det, sil in hallazgos:
        print("[%s] sev%d%s  %s" % (t, sev, " (silenciosa)" if sil else "", det))
    print("\n%d hallazgo(s) — modo seco, no se guardó nada" % len(hallazgos))
    raise SystemExit(0)

# ── CERRAR LO QUE YA SE RESOLVIÓ ─────────────────────────────────────────────
# Hay DOS naturalezas de alerta y tratarlas igual es lo que rompe el panel:
#
#   "ausencia"  → la regla se re-evalúa ENTERA en cada corrida sobre una ventana que llega hasta AHORA
#                 (la cola de adjuntos, el bot mudo, el token por vencer, los crones, la cotización SAP).
#                 Si esta corrida ya no la encuentra, la causa desapareció. Y si me equivoco no se pierde
#                 nada: la corrida siguiente la vuelve a encontrar y la REABRE (ver más abajo).
#
#   "desenlace" → habla de UNA persona en UN momento y su ventana de detección es corta (2-3 días). Dejar
#                 de verla NO significa que se resolvió: significa que envejeció. Un cliente perdido sigue
#                 perdido el cuarto día. Estas solo se cierran comprobando el desenlace REAL: que esa
#                 persona sí acabó registrada como lead. Cerrarlas por ausencia sería mentir.
CIERRE_POR_DESENLACE = {"cliente_perdido", "carrera_consent"}
# `reporte_perdido` no se cierra sola A PROPÓSITO: es la del reporte del asesor que nunca llegó a la BD
# (uno de los cuatro era una venta ganada de $1.270.000). Ahí no hay señal automática de "ya lo arreglaron",
# así que se cierra a mano con `python3 vigilante.py --cerrar <id>` cuando alguien la haya reparado.
NO_SE_CIERRA_SOLA = {"reporte_perdido"}

_vivas = set((t, str(c)[:120]) for t, sev, c, det, sil in hallazgos)
cerradas = 0
for _id, _tipo, _clave in q("SELECT id, tipo, clave FROM alertas WHERE resuelto_en IS NULL"):
    if (_tipo, _clave) in _vivas or _tipo in NO_SE_CIERRA_SOLA:
        continue                                  # la causa sigue ahí (o solo la cierra una persona)
    if _tipo in CIERRE_POR_DESENLACE:
        # la clave de estas empieza por el wa_id/teléfono de la persona: "573001234567|13/08 13:11"
        _hay = q("SELECT COUNT(*) FROM leads WHERE telefono='%s'" % esc(_clave.split("|")[0]))
        if not (_hay and _hay[0][0] != "0"):
            continue                              # sigue sin lead: sigue perdida, no se cierra
    q("UPDATE alertas SET resuelto_en=NOW() WHERE id=%d" % int(_id))
    cerradas += 1

nuevos = []
for t, sev, c, det, sil in hallazgos:
    antes = q("SELECT id, COALESCE(resuelto_en,'') FROM alertas WHERE tipo='%s' AND clave='%s'"
              % (esc(t), esc(c)))
    if antes:
        _id, _res = antes[0][0], antes[0][1]
        if not _res:
            continue                              # ya estaba ABIERTA: no se re-avisa (anti-spam de siempre)
        # Estaba cerrada y el problema VOLVIÓ. Hay que reabrirla explícitamente: el UNIQUE(tipo,clave)
        # impide volver a insertarla, así que sin esto cerrar una alerta la silenciaría PARA SIEMPRE —
        # el arreglo del ruido se habría comido la próxima alerta de verdad.
        q("UPDATE alertas SET resuelto_en=NULL, creado_en=NOW(), severidad=%d, detalle='%s', avisado_wa=%d "
          "WHERE id=%d" % (sev, esc(det), 1 if sil else 0, int(_id)))
        if not sil:
            nuevos.append((t, sev, det))
        continue
    # las silenciosas nacen con avisado_wa=1: quedan para auditoría/panel pero WhatsApp jamás las envía
    q("INSERT IGNORE INTO alertas (creado_en,tipo,severidad,clave,detalle,avisado_wa) "
      "VALUES (NOW(),'%s',%d,'%s','%s',%d)" % (esc(t), sev, esc(c), esc(det), 1 if sil else 0))
    if not sil:
        nuevos.append((t, sev, det))

graves = [x for x in nuevos if x[1] == 1]
print("%s | hallazgos: %d | nuevos: %d | graves nuevos: %d | cerradas: %d"
      % (AHORA.strftime("%Y-%m-%d %H:%M"), len(hallazgos), len(nuevos), len(graves), cerradas))

if graves:
    cuerpo = ("El vigilante del bot detectó situaciones que requieren atención:\n\n"
              + "\n".join("• " + d for _, _, d in graves)
              + "\n\nQuedaron registradas en la tabla `alertas` y aparecen en el panel de WhatsApp "
                "(escribe 'informe' al bot).\n\nEste chequeo es automático y corre cada hora.")
    avisar_correo("Alerta del bot WhatsApp — %d situacion(es) nueva(s)" % len(graves), cuerpo)
    print("Correo de alerta enviado a: %s" % ", ".join(DEST))
