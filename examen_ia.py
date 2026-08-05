#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════════
#  EXAMEN DE LA IA  ·  Grupo Ardisa
#
#  Le hace a la IA las preguntas REALES de tests/casos_ia.json y cuenta cuántas
#  acierta. Sirve para saber si un cambio en el prompt mejora o empeora, en vez
#  de opinar.
#
#  Usa el MISMO prompt y la MISMA herramienta que el bot en producción: los saca
#  del nodo "Preparar IA" de workflow-bot-f1.json, así que si el prompt cambia,
#  el examen cambia con él y no se queda desactualizado.
#
#  La clave de Anthropic NO sale de n8n: se crea un workflow temporal que usa la
#  credencial cifrada que ya existe, se ejecuta, se leen los resultados y se
#  BORRA el workflow.
#
#  Uso:  python3 examen_ia.py            (crea, ejecuta, borra e informa)
#        python3 examen_ia.py --dejar    (no borra el workflow, para depurar)
# ═══════════════════════════════════════════════════════════════════════════════
import json, os, re, sys, time, urllib.request, urllib.error

BASE      = os.path.dirname(os.path.abspath(__file__))
N8N       = "http://127.0.0.1:5678/api/v1"
CRED_ID   = "jCKZpQeEXwbMMxna"
CRED_NOM  = "Anthropic API Key (Fase 2)"
WF_EXAMEN = "examenIaArdisa"

def api(ruta, metodo="GET", cuerpo=None):
    clave = open(os.path.expanduser("~/.config/ardisa/n8n_api_key")).read().strip()
    req = urllib.request.Request(N8N + ruta, method=metodo,
            data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
            headers={"X-N8N-API-KEY": clave, "Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_detalle": e.read().decode()[:300]}

# ── 1. El prompt REAL del bot, sacado del nodo "Preparar IA" ──────────────────
def prompt_del_bot():
    # EXAMEN_WF permite medir OTRO workflow (p.ej. el de antes de un cambio) para comparar.
    ruta_wf = os.environ.get("EXAMEN_WF") or os.path.join(BASE, "workflow-bot-f1.json")
    wf = json.load(open(ruta_wf))
    code = [n for n in wf["nodes"] if n["name"].startswith("Preparar IA")][0]["parameters"]["jsCode"]
    # NLU_SYSTEM = `...`  y  NLU_TOOL = {...}   tal como los escribe build_f1.py
    sis = re.search(r'const NLU_SYSTEM\s*=\s*`(.*?)`;', code, re.S)
    if not sis:
        sis = re.search(r'NLU_SYSTEM\s*=\s*`(.*?)`;', code, re.S)
    # NLU_TOOL es un objeto JS: en vez de recortarlo a mano (fragil), dejamos que Node
    # lo EVALUE y nos lo devuelva como JSON. Asi da igual como este escrito por dentro.
    import subprocess, tempfile
    ini = code.find("const NLU_TOOL")
    if ini < 0: sys.exit("ABORTADO: no encontre NLU_TOOL en el nodo 'Preparar IA'.")
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(code[ini:] + "\nconsole.log(JSON.stringify(NLU_TOOL));\n")
        tmp = f.name
    r = subprocess.run(["node", "-e",
        "const s=require('fs').readFileSync(%r,'utf8');"
        "const i=s.indexOf('console.log');"
        "eval(s.slice(0, s.indexOf('\\n', s.indexOf('};')))+';');"
        "console.log(JSON.stringify(NLU_TOOL));" % tmp],
        capture_output=True, text=True)
    salida = r.stdout.strip().split("\n")[-1] if r.stdout.strip() else ""
    if not salida.startswith("{"):
        # respaldo: recorte hasta el cierre del objeto, contando llaves
        trozo = code[code.find("{", ini):]
        prof = 0
        for k, ch in enumerate(trozo):
            if ch == "{": prof += 1
            elif ch == "}":
                prof -= 1
                if prof == 0: salida = trozo[:k+1]; break
    os.unlink(tmp)
    if not sis or not salida:
        sys.exit("ABORTADO: no pude extraer NLU_SYSTEM/NLU_TOOL del workflow. "
                 "¿Cambió el nodo 'Preparar IA'?")
    return sis.group(1), salida

# ── 2. El workflow temporal que hace las preguntas ───────────────────────────
def armar_workflow(sistema, tool_js, casos, modelo, RUTA):
    prep = (
      "const CASOS = " + json.dumps(casos, ensure_ascii=False) + ";\n"
      "const NLU_SYSTEM = " + json.dumps(sistema, ensure_ascii=False) + ";\n"
      "const NLU_TOOL = " + tool_js + ";\n"
      "return CASOS.map(c => ({ json: { caso: c, ia_body: {\n"
      "  model: " + json.dumps(modelo) + ", max_tokens: 512, system: NLU_SYSTEM,\n"
      "  tools: [NLU_TOOL], tool_choice: { type: 'tool', name: 'clasificar_consulta' },\n"
      "  messages: [{ role: 'user', content: '<mensaje_cliente>\\n' + c.texto + '\\n</mensaje_cliente>' }]\n"
      "} } }));")

    corregir = r"""
// Compara lo que dijo la IA con lo que se esperaba y arma el boletin.
// OJO: el nodo HTTP REEMPLAZA el item, asi que aqui ya no viene 'caso'. Hay que volver a
// emparejarlo con las preguntas por POSICION, igual que hace el bot con 'Unir pendiente'.
const PREGUNTAS = $('Preguntas').all();
const filas = [];
const items = $input.all();
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const c = ((PREGUNTAS[i] || {}).json || {}).caso || {};
  let ia = null;
  try {
    const cont = (it.json.content || []).find(x => x && x.type === 'tool_use');
    ia = cont ? cont.input : null;
  } catch (e) {}
  const marca = ia ? (ia.marca || '') : '(sin respuesta)';
  const grupo = ia ? (ia.grupo_pista || '') : '';
  const dijo  = marca === 'Ardisa' ? ('Ardisa/' + (grupo || '?').toUpperCase()) : marca;
  const esp   = c.esperado || '';
  // Acierta si la MARCA coincide. El grupo se cuenta aparte: equivocar Acabados/Construccion
  // duele menos que mandar un tablero a la linea que no es.
  const marcaOk = esp.split('/')[0] === marca;
  const grupoOk = !esp.includes('/') || esp.split('/')[1] === (grupo || '').toUpperCase();
  filas.push({ lead: c.lead, texto: (c.texto || '').slice(0, 70), esperado: esp, ia_dijo: dijo,
               productos: ia && ia.productos ? ia.productos.join(', ').slice(0, 60) : '',
               confianza: ia ? ia.confianza : '', marca_ok: marcaOk, grupo_ok: grupoOk });
}
const n = filas.length;
const m = filas.filter(f => f.marca_ok).length;
const g = filas.filter(f => f.marca_ok && f.grupo_ok).length;
return [{ json: {
  total: n,
  marca_correcta: m,   pct_marca: n ? Math.round(100 * m / n) : 0,
  linea_y_grupo:  g,   pct_ambos: n ? Math.round(100 * g / n) : 0,
  fallos: filas.filter(f => !f.marca_ok),
  detalle: filas } }];
"""
    return {
      "name": "🧪 Examen de la IA (temporal — se puede borrar)",
      "nodes": [
        {"id":"t1","name":"Empezar","type":"n8n-nodes-base.webhook","typeVersion":2,
         "position":[0,0],"webhookId":RUTA,
         "parameters":{"path":RUTA,"httpMethod":"POST","responseMode":"lastNode",
                       "options":{"rawBody":False}}},
        {"id":"t2","name":"Preguntas","type":"n8n-nodes-base.code","typeVersion":2,
         "position":[220,0],"parameters":{"jsCode":prep}},
        {"id":"t3","name":"IA","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,
         "position":[440,0],"onError":"continueRegularOutput","retryOnFail":True,"maxTries":2,
         "waitBetweenTries":1500,
         "credentials":{"httpHeaderAuth":{"id":CRED_ID,"name":CRED_NOM}},
         "parameters":{"method":"POST","url":"https://api.anthropic.com/v1/messages",
           "authentication":"predefinedCredentialType","nodeCredentialType":"httpHeaderAuth",
           "sendHeaders":True,"headerParameters":{"parameters":[
             {"name":"anthropic-version","value":"2023-06-01"},
             {"name":"content-type","value":"application/json"}]},
           "sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify($json.ia_body) }}",
           "options":{"timeout":30000}}},
        {"id":"t4","name":"Boletín","type":"n8n-nodes-base.code","typeVersion":2,
         "position":[660,0],"parameters":{"jsCode":corregir}},
      ],
      "connections": {
        "Empezar":  {"main":[[{"node":"Preguntas","type":"main","index":0}]]},
        "Preguntas":{"main":[[{"node":"IA","type":"main","index":0}]]},
        "IA":       {"main":[[{"node":"Boletín","type":"main","index":0}]]},
      },
      "settings": {"executionOrder":"v1"},
    }

# ── 3. Correrlo y contar ─────────────────────────────────────────────────────
def main():
    dejar = "--dejar" in sys.argv
    banco = json.load(open(os.path.join(BASE, "tests", "casos_ia.json")))
    casos = [c for c in banco["casos"] if c.get("esperado")]
    if not casos: sys.exit("El banco no tiene casos con respuesta esperada.")

    sistema, tool = prompt_del_bot()
    import subprocess
    modelo = subprocess.run(["python3","-c",
        "import os;os.environ.setdefault('VERIFY_TOKEN','x');import build_f1;print(build_f1.IA_MODEL)"],
        capture_output=True, text=True, cwd=BASE).stdout.strip().split("\n")[-1] or "claude-sonnet-5"

    print("Examen de la IA — Grupo Ardisa")
    print("  preguntas : %d casos reales de clientes" % len(casos))
    print("  modelo    : %s" % modelo)
    print("  prompt    : el mismo del bot (%d caracteres)\n" % len(sistema))

    api("/workflows/%s" % WF_EXAMEN, "DELETE")          # por si quedó de una corrida anterior
    import secrets
    ruta = "examen-ia-" + secrets.token_hex(8)   # ruta imposible de adivinar; el workflow se borra al final
    wf = armar_workflow(sistema, tool, casos, modelo, ruta)
    creado = api("/workflows", "POST", wf)
    if "_error" in creado: sys.exit("No pude crear el workflow: %s" % creado)
    wid = creado["id"]
    print("  workflow temporal creado: %s" % wid)

    try:
        a = api("/workflows/%s/activate" % wid, "POST")
        if "_error" in a: sys.exit("No pude activar el workflow de examen: %s" % a)
        print("  preguntando… (puede tardar ~1 minuto)")
        req = urllib.request.Request("http://127.0.0.1:5678/webhook/" + ruta, method="POST",
                data=b"{}", headers={"Content-Type": "application/json"})
        datos = json.loads(urllib.request.urlopen(req, timeout=300).read().decode() or "{}")
        if isinstance(datos, list) and datos: datos = datos[0]
        informe(datos)
    finally:
        if not dejar:
            api("/workflows/%s" % wid, "DELETE")
            print("  (workflow temporal borrado)")

def informe(d):
    if not d: print("  sin resultados"); return
    print("\n" + "=" * 62)
    print("  RESULTADO")
    print("    línea correcta (Ardisa / Carpincentro) : %s de %s   (%s%%)"
          % (d.get("marca_correcta"), d.get("total"), d.get("pct_marca")))
    print("    línea Y grupo correctos                : %s de %s   (%s%%)"
          % (d.get("linea_y_grupo"), d.get("total"), d.get("pct_ambos")))
    fallos = d.get("fallos") or []
    if fallos:
        print("\n  SE EQUIVOCÓ EN:")
        for f in fallos:
            print("    #%-4s esperado=%-20s dijo=%-20s %s"
                  % (f.get("lead"), f.get("esperado"), f.get("ia_dijo"), f.get("texto")))
    else:
        print("\n  Sin fallos de línea.")
    print("=" * 62)

if __name__ == "__main__":
    if "--borrar" in sys.argv:
        print(api("/workflows/%s" % WF_EXAMEN, "DELETE") or "borrado"); sys.exit()
    main()
