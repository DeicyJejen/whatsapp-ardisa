#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ═══════════════════════════════════════════════════════════════════════════════
#  ¿YA APROBÓ META LA PLANTILLA CON FOTO?  ·  Grupo Ardisa
#
#  La plantilla `foto_cliente` (encabezado de IMAGEN) es la única forma de mandarle
#  al asesor la foto del cliente cuando su ventana de 24 h está cerrada. Se creó el
#  19-ago y quedó en revisión de Meta. Este script mira cada tanto si ya la aprobaron
#  y, en cuanto pasa, enciende el interruptor de la BD (`config.tpl_foto`): el bot
#  empieza a usarla sin desplegar y el cron de la cola entrega lo que esté esperando.
#
#  El token de Meta NO se guarda en disco: se descifra en memoria desde la credencial
#  de n8n, igual que hace el bot. Por eso necesita sudo (lee el sqlite de n8n).
#
#  Uso:  sudo python3 activar_tpl_foto.py          (una pasada; lo llama el cron)
#        sudo python3 activar_tpl_foto.py --estado (solo informa, no activa nada)
# ═══════════════════════════════════════════════════════════════════════════════
import base64, hashlib, json, subprocess, sqlite3, sys, urllib.request, datetime

WABA   = "2042712039788056"
NOMBRE = "foto_cliente"
CRED   = "WaSomosArd0001"
SOLO   = "--estado" in sys.argv
AHORA  = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")


def token():
    """Descifra el token permanente de Meta desde la credencial cifrada de n8n."""
    cfg = subprocess.run(["docker", "exec", "n8n", "cat", "/home/node/.n8n/config"],
                         capture_output=True, text=True).stdout
    key = json.loads(cfg)["encryptionKey"].encode()
    con = sqlite3.connect("file:/opt/n8n/data/database.sqlite?immutable=1", uri=True)
    blob = con.execute("select data from credentials_entity where id=?", (CRED,)).fetchone()[0]
    raw = base64.b64decode(blob)
    salt, d, prev = raw[8:16], b"", b""
    while len(d) < 48:                       # EVP_BytesToKey (MD5), como crypto-js
        prev = hashlib.md5(prev + key + salt).digest(); d += prev
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    dec = Cipher(algorithms.AES(d[:32]), modes.CBC(d[32:48])).decryptor()
    out = dec.update(raw[16:]) + dec.finalize()
    return json.loads(out[:-out[-1]].decode())["value"].replace("Bearer ", "").strip()


def plantillas(tok):
    req = urllib.request.Request(
        "https://graph.facebook.com/v20.0/%s/message_templates?limit=60" % WABA,
        headers={"Authorization": "Bearer " + tok})
    return json.loads(urllib.request.urlopen(req, timeout=30).read()).get("data", [])


def sql(q):
    return subprocess.run(["mysql", "--default-character-set=utf8mb4", "bot_ardisa", "-N", "-B", "-e", q],
                          capture_output=True, text=True).stdout.strip()


t = [x for x in plantillas(token()) if x.get("name") == NOMBRE]
if not t:
    print("%s | la plantilla '%s' NO existe en la cuenta" % (AHORA, NOMBRE)); raise SystemExit(1)

estado = t[0].get("status")
actual = sql("SELECT valor FROM config WHERE clave='tpl_foto'")

if estado != "APPROVED":
    print("%s | '%s' sigue en %s (interruptor: '%s')" % (AHORA, NOMBRE, estado, actual))
    if estado == "REJECTED":
        print("   motivo: %s" % t[0].get("rejected_reason", "(no informado)"))
    raise SystemExit(0)

if actual == NOMBRE:
    print("%s | '%s' APROBADA y ya estaba encendida" % (AHORA, NOMBRE)); raise SystemExit(0)
if SOLO:
    print("%s | '%s' APROBADA — falta encender el interruptor" % (AHORA, NOMBRE)); raise SystemExit(0)

sql("UPDATE config SET valor='%s' WHERE clave='tpl_foto'" % NOMBRE)
cola = sql("SELECT COUNT(*) FROM mensajes WHERE etapa='media_nudge' AND creado_en >= NOW() - INTERVAL 2 DAY")
print("%s | ✅ '%s' APROBADA -> interruptor ENCENDIDO. Las fotos en cola salen en el próximo minuto "
      "(avisos de destrabe recientes: %s)" % (AHORA, NOMBRE, cola or "0"))
