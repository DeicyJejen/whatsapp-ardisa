#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# CHAT HÍBRIDO del monitor (2026-08-12, pedido Deicy tras ver el "chat híbrido" de Wizard Bot/Claro):
# mini-workflow de n8n "Panel Ardisa - Enviar" que le permite al PANEL responderle al cliente por el
# MISMO número del bot. El panel (PHP) llama al webhook en 127.0.0.1 con un secreto compartido; el
# workflow valida, envía por la API de WhatsApp usando la CREDENCIAL CIFRADA (el token nunca sale de
# n8n), guarda la respuesta en `mensajes` (etapa 'panel') y marca la conversación como "atendida por
# humano" en la tabla `humano` (30 min renovables) para que el Cerebro se calle mientras tanto.
#
# Uso:  python3 build_panel.py            -> genera e IMPRIME el plan
#       python3 build_panel.py --deploy   -> crea/actualiza el workflow en n8n y lo activa
#
# OJO (memoria n8n-mysql-marcadores): el nodo MySQL de n8n usa $1,$2 — JAMÁS '?' (falla en silencio).
import json, sys, subprocess, urllib.request

PHONE_NUMBER_ID = "1221127187754818"                    # 316 oficial (mismo del bot, MODO_CONEXION=PRODUCCION)
WPP_CRED_ID, WPP_CRED_NAME = "WaSomosArd0001", "WhatsApp Token Somos Ardisa (nuevo)"
MYSQL_CRED_ID, MYSQL_CRED_NAME = "mysqlLeadsArd001", "MySQL Leads Ardisa"
WF_NAME = "Panel Ardisa - Enviar (chat hibrido)"
PATH = "panel-enviar-ardisa"
SECRET = open("/etc/monitor-ardisa.secret").read().strip()   # el mismo que lee el PHP del panel

CODE_VALIDAR = r"""
// Valida el secreto compartido y sanea los campos. Si algo no cuadra, ok=false -> 403 sin enviar nada.
const b = ($json.body || $json) || {};
const sec = String(b.secret||'');
const to = String(b.to||'').replace(/[^0-9]/g,'');
const text = String(b.text||'').trim().slice(0, 3500);
const ok = (sec === '__SECRET__') && to.length >= 10 && to.length <= 15 && text.length >= 1;
// El payload de Meta se arma AQUÍ: un objeto literal dentro de {{ }} en el nodo HTTP se corta en la
// primera '}}' (las llaves del objeto se confunden con el cierre de la expresión de n8n).
return [{ json: { ok, to, text, payload: { messaging_product:'whatsapp', to, type:'text', text:{ body:text } } } }];
""".replace("__SECRET__", SECRET)

def node(name, tipo, ver, params, x, y, extra=None):
    n = {"parameters": params, "name": name, "type": tipo, "typeVersion": ver, "position": [x, y], "id": name.lower().replace(" ", "-").replace("(", "").replace(")", "")[:36]}
    if extra: n.update(extra)
    return n

nodes = [
    node("Webhook panel", "n8n-nodes-base.webhook", 2,
         {"httpMethod": "POST", "path": PATH, "responseMode": "responseNode", "options": {}}, 0, 0),
    node("Validar", "n8n-nodes-base.code", 2, {"jsCode": CODE_VALIDAR}, 200, 0),
    node("¿Autorizado?", "n8n-nodes-base.if", 2,
         {"conditions": {"options": {"caseSensitive": True, "typeValidation": "loose"}, "combinator": "and",
          "conditions": [{"id": "a1", "leftValue": "={{ $json.ok }}", "rightValue": True,
                          "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]}, "options": {}}, 400, 0),
    node("Enviar WhatsApp", "n8n-nodes-base.httpRequest", 4.2,
         {"method": "POST", "url": "https://graph.facebook.com/v21.0/%s/messages" % PHONE_NUMBER_ID,
          "authentication": "predefinedCredentialType", "nodeCredentialType": "httpHeaderAuth",
          "sendBody": True, "specifyBody": "json",
          "jsonBody": "={{ JSON.stringify($('Validar').first().json.payload) }}",
          "options": {"timeout": 15000}}, 620, -80,
         {"retryOnFail": True, "maxTries": 2, "waitBetweenTries": 1200,
          "credentials": {"httpHeaderAuth": {"id": WPP_CRED_ID, "name": WPP_CRED_NAME}}}),
    # Guarda la respuesta en el historial para que el panel la pinte (etapa 'panel' -> burbuja "Ardisa (panel)").
    node("Guardar en historial", "n8n-nodes-base.mySql", 2.5,
         {"operation": "executeQuery",
          "query": "INSERT INTO mensajes (creado_en, wa_id, nombre, entrada, salida, etapa) VALUES (NOW(), $1, '', '', $2, 'panel')",
          "options": {"queryReplacement": "={{ [$('Validar').first().json.to, $('Validar').first().json.text] }}"}}, 840, -80,
         {"credentials": {"mySql": {"id": MYSQL_CRED_ID, "name": MYSQL_CRED_NAME}}}),
    # Marca "atendida por humano" 30 min (renovable con cada respuesta): el Cerebro ve humano_on y se calla.
    node("Tomar conversación", "n8n-nodes-base.mySql", 2.5,
         {"operation": "executeQuery",
          "query": "INSERT INTO humano (telefono, hasta, quien) VALUES ($1, NOW() + INTERVAL 30 MINUTE, 'panel') ON DUPLICATE KEY UPDATE hasta=VALUES(hasta), quien=VALUES(quien)",
          "options": {"queryReplacement": "={{ [$('Validar').first().json.to] }}"}}, 1060, -80,
         {"credentials": {"mySql": {"id": MYSQL_CRED_ID, "name": MYSQL_CRED_NAME}}}),
    node("Responder OK", "n8n-nodes-base.respondToWebhook", 1.1,
         {"respondWith": "json", "responseBody": "={{ JSON.stringify({ok:true}) }}", "options": {}}, 1280, -80),
    node("Responder 403", "n8n-nodes-base.respondToWebhook", 1.1,
         {"respondWith": "json", "responseBody": "={{ JSON.stringify({ok:false}) }}",
          "options": {"responseCode": 403}}, 620, 120),
]
connections = {
    "Webhook panel": {"main": [[{"node": "Validar", "type": "main", "index": 0}]]},
    "Validar": {"main": [[{"node": "¿Autorizado?", "type": "main", "index": 0}]]},
    "¿Autorizado?": {"main": [[{"node": "Enviar WhatsApp", "type": "main", "index": 0}],
                               [{"node": "Responder 403", "type": "main", "index": 0}]]},
    "Enviar WhatsApp": {"main": [[{"node": "Guardar en historial", "type": "main", "index": 0}]]},
    "Guardar en historial": {"main": [[{"node": "Tomar conversación", "type": "main", "index": 0}]]},
    "Tomar conversación": {"main": [[{"node": "Responder OK", "type": "main", "index": 0}]]},
}
wf = {"name": WF_NAME, "nodes": nodes, "connections": connections, "settings": {"executionOrder": "v1"}}

# node --check de cada nodo Code (regla build-valida-sintaxis)
import tempfile, os
for n in nodes:
    if n["type"].endswith(".code"):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(n["parameters"]["jsCode"]); tmp = f.name
        p = subprocess.run(["node", "--check", tmp], capture_output=True)
        os.unlink(tmp)
        if p.returncode != 0:
            sys.exit("ABORT sintaxis JS en '%s':\n%s" % (n["name"], p.stderr.decode()))
print("OK nodos: %d | secreto: cargado de /etc/monitor-ardisa.secret (no va a git)" % len(nodes))

if "--deploy" not in sys.argv:
    sys.exit(0)

# ── Deploy vía API (la key 'claud' se lee de la BD de n8n EN SITIO, solo-lectura) ──
key = subprocess.check_output(["sudo", "-n", "python3", "-c",
    "import sqlite3; c=sqlite3.connect('file:/opt/n8n/data/database.sqlite?immutable=1',uri=True); "
    "print([r[0] for r in c.execute(\"SELECT apiKey FROM user_api_keys WHERE label='claud'\")][0])"], text=True).strip()

def api(method, path, data=None):
    req = urllib.request.Request("http://127.0.0.1:5678/api/v1" + path,
        data=json.dumps(data).encode() if data is not None else None, method=method,
        headers={"X-N8N-API-KEY": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "{}")

# ¿ya existe? (por nombre) -> PUT; si no -> POST
existentes = [w for w in api("GET", "/workflows?limit=250").get("data", []) if w.get("name") == WF_NAME]
if existentes:
    wid = existentes[0]["id"]
    try: api("POST", "/workflows/%s/deactivate" % wid)
    except Exception: pass
    api("PUT", "/workflows/%s" % wid, wf)
else:
    wid = api("POST", "/workflows", wf)["id"]
api("POST", "/workflows/%s/activate" % wid)
live = api("GET", "/workflows/%s" % wid)
print("DEPLOY OK | id=%s | active=%s | webhook=http://127.0.0.1:5678/webhook/%s" % (wid, live.get("active"), PATH))
