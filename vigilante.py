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
# Uso:  python3 vigilante.py            -> detecta, guarda y avisa por correo si hay algo nuevo grave
#       python3 vigilante.py --seco     -> solo muestra en pantalla, no guarda ni envía
import subprocess, os, sys, ssl, smtplib, datetime, base64, json
from email.message import EmailMessage

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
AHORA     = datetime.datetime.now()

def q(sql):
    out = subprocess.check_output(
        ["sudo","-n","mysql","--default-character-set=utf8mb4","bot_ardisa","-N","-B","-e",sql],
        text=True, errors="replace")
    return [l.split("\t") for l in out.splitlines() if l.strip()]

def esc(s):
    return str(s).replace("\\","\\\\").replace("'","''").replace("\n"," ")[:400]

hallazgos = []   # (tipo, severidad, clave, detalle)
def anota(tipo, sev, clave, detalle):
    hallazgos.append((tipo, sev, str(clave)[:120], detalle))

# ── Excluir a quien NO es cliente: asesores, la línea de monitoreo y los números de prueba ──
NO_CLIENTE = ("AND m.wa_id <> '573205662947' AND m.wa_id NOT LIKE '5799999%' "
              "AND m.wa_id COLLATE utf8mb4_unicode_ci NOT IN (SELECT DISTINCT asesor_tel COLLATE utf8mb4_unicode_ci FROM leads WHERE asesor_tel IS NOT NULL AND asesor_tel<>'') "
              "AND m.etapa NOT LIKE 'seg\\_%' AND m.etapa NOT LIKE 'admin\\_%' "
              "AND m.etapa NOT IN ('asesor_activo','noop','proveedor')")

# ═══ 1. CARRERA DEL CONSENTIMIENTO ═══════════════════════════════════════════
# El cliente autoriza y segundos después el bot se lo vuelve a pedir (staticData pisado por
# ejecuciones en paralelo). Arreglado el 3-ago leyendo la BD; esto vigila que no vuelva.
for tel, nom, cuando, seg in q("""
    SELECT c.telefono, COALESCE(c.nombre,''), DATE_FORMAT(c.creado_en,'%d/%m %H:%i:%s'),
           TIMESTAMPDIFF(SECOND, c.creado_en, MIN(m.creado_en))
    FROM consentimientos c
    JOIN mensajes m ON m.wa_id COLLATE utf8mb4_unicode_ci = c.telefono COLLATE utf8mb4_unicode_ci
    WHERE c.decision='SI' AND m.etapa='consent' AND m.creado_en > c.creado_en
      AND c.creado_en >= NOW() - INTERVAL 3 DAY
    GROUP BY c.telefono, c.nombre, c.creado_en
    HAVING TIMESTAMPDIFF(SECOND, c.creado_en, MIN(m.creado_en)) <= 90"""):
    anota("carrera_consent", 1, tel+"|"+cuando,
          "%s (%s) autorizó el %s y el bot se lo volvió a pedir %ss después" % (nom or tel, tel, cuando, seg))

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
for wa, nom, n, ini, ult, pedido in q("""
    SELECT m.wa_id, COALESCE(MAX(m.nombre),''), SUM(m.entrada<>'(inactividad)'),
           DATE_FORMAT(MIN(m.creado_en),'%d/%m %H:%i'),
           GROUP_CONCAT(DISTINCT LEFT(m.etapa,18) ORDER BY m.creado_en SEPARATOR '>'),
           COALESCE(SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN CHAR_LENGTH(m.entrada)>=25 THEN m.entrada END
                    ORDER BY CHAR_LENGTH(m.entrada) DESC SEPARATOR '\\n'), '\\n', 1), '')
    FROM mensajes m
    WHERE m.creado_en >= NOW() - INTERVAL 2 DAY """ + NO_CLIENTE + """
      AND NOT EXISTS (SELECT 1 FROM leads l
                      WHERE l.telefono COLLATE utf8mb4_unicode_ci = m.wa_id COLLATE utf8mb4_unicode_ci)
    GROUP BY m.wa_id
    HAVING MAX(m.creado_en) < NOW() - INTERVAL 20 MINUTE
       AND (SUM(m.entrada<>'(inactividad)')>=2 OR MAX(CHAR_LENGTH(m.entrada))>=25)"""):
    anota("cliente_perdido", 1, wa+"|"+ini,
          "%s (%s) escribió %s veces desde el %s y NO quedó registrado — recorrido: %s%s"
          % (nom or wa, wa, n, ini, ult, ("  ·  PIDIÓ: "+pedido[:120]) if pedido else ""))

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
for log in ("cron_reporte.log", "cron_seguimiento.log", "cron_duplicados.log", "cron_backup.log", "cron_vigilante.log"):
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

# ── Guardar (idempotente) y avisar solo lo NUEVO y GRAVE ─────────────────────
if SECO:
    for t, sev, c, det in hallazgos: print("[%s] sev%d  %s" % (t, sev, det))
    print("\n%d hallazgo(s) — modo seco, no se guardó nada" % len(hallazgos))
    raise SystemExit(0)

nuevos = []
for t, sev, c, det in hallazgos:
    antes = q("SELECT COUNT(*) FROM alertas WHERE tipo='%s' AND clave='%s'" % (esc(t), esc(c)))
    if antes and antes[0][0] != "0":
        continue                                  # ya estaba: no se re-avisa (anti-spam)
    q("INSERT IGNORE INTO alertas (creado_en,tipo,severidad,clave,detalle) "
      "VALUES (NOW(),'%s',%d,'%s','%s')" % (esc(t), sev, esc(c), esc(det)))
    nuevos.append((t, sev, det))

graves = [x for x in nuevos if x[1] == 1]
print("%s | hallazgos: %d | nuevos: %d | graves nuevos: %d"
      % (AHORA.strftime("%Y-%m-%d %H:%M"), len(hallazgos), len(nuevos), len(graves)))

if graves:
    cuerpo = ("El vigilante del bot detectó situaciones que requieren atención:\n\n"
              + "\n".join("• " + d for _, _, d in graves)
              + "\n\nQuedaron registradas en la tabla `alertas` y aparecen en el panel de WhatsApp "
                "(escribe 'informe' al bot).\n\nEste chequeo es automático y corre cada hora.")
    msg = EmailMessage()
    msg["From"] = "Grupo Ardisa (Vigilante del Bot) <%s>" % SMTP_USER
    msg["To"] = ", ".join(DEST)
    msg["Subject"] = "Alerta del bot WhatsApp — %d situacion(es) nueva(s)" % len(graves)
    msg.set_content(cuerpo)
    s = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=60); s.ehlo()
    s.starttls(context=ssl.create_default_context()); s.ehlo(); s.login(SMTP_USER, SMTP_PASS)
    s.send_message(msg); s.quit()
    print("Correo de alerta enviado a: %s" % ", ".join(DEST))
