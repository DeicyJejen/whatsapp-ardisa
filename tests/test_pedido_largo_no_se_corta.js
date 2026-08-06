// Caso Johans (lead #245, 06/08 3:43 pm): pidió una obra sanitaria completa — 14 renglones, 566
// caracteres — y al asesor le llegaron 323: se cortó en "9 UND Yee reducida Ø4" y se perdieron los
// ítems MÁS VALIOSOS (válvula antirretorno, tanque séptico 500L, filtro anaerobio, trampa de grasas,
// tanque de 5000L). Deicy: "no está teniendo en cuenta lo que el cliente escribe".
//
// Causa: tres cortes de 300/400 caracteres heredados de cuando las solicitudes eran de una línea.
// Regla desde hoy: un pedido real cabe entero (1200 por mensaje, 1600 acumulado). La tarjeta al
// asesor se topa en 1800 (WhatsApp muere a 4096) y avisa que abra el chat; el lead en la BD guarda
// TODO (la columna es TEXT).
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573022245235';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
const sesion = () => ({ paso:'detalle', t:Date.now(), consent:true, nombre:'Johans', ciudad:'Bucaramanga',
  ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'CONSTRUCCION', interes:'Construcción', ocupacion:'🏢 Empresa' });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Johans', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);

// El pedido REAL de Johans, textual (566 caracteres)
const PEDIDO = [
  '6 UND  Tubería PVC-S (sanitaria) Ø2" de 6 m',
  '6 UND  Tubería PVC-S (sanitaria) Ø4" de 6 m',
  '3 UND  Tubería PVC ventilación Ø2" de 6m',
  '24 UND Codo 90° Ø2" (sanitaria)',
  '3 UND  Codo 90° Ø4" (sanitaria)',
  '9 UND Codo 45° Ø4" (sanitaria)',
  '9 UND Sifón Ø2" (sanitaria)',
  '6 UND Yee Ø2" (sanitaria)',
  '9 UND  Yee reducida Ø4"x Ø2" (sanitaria)',
  '3 UND Válvula antirretorno Ø4" (sanitaria)',
  '3 UND Tanque Séptico Ovoide de 500 L',
  '3 UND Filtro anaerobio de 500 Lts c.t. negro',
  '3 UND Trampa de grasas de 105 Lts c.t.',
  '3 UND Tanque de almacenamiento aguas servidas prefabricado en polietileno de 5000l.',
].join('\n');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. El pedido de Johans llega COMPLETO al lead y a la tarjeta ═══════════════
{
  // 1ª pasada: descubrir a qué asesor lo rutea la rotación...
  const sd0 = base(); sd0.ses[WA] = sesion();
  const r0 = correr({ datos: ev({ texto:PEDIDO }), sd: sd0, pend:{ cons_si:1, pend_id:0 } });
  const tel = ((r0.lead || (sd0.pendCierre[WA]||{}).lead || {}).asesor_tel) || '';
  // ...y repetir con su ventana de 24h ABIERTA (el caso normal en producción: la tarjeta va como TEXTO,
  // no como plantilla). Con la ventana cerrada manda la plantilla, que Meta limita a 700 caracteres.
  const sd = base(); sd.ses[WA] = sesion(); sd.win = { [tel]: Date.now() };
  const r = correr({ datos: ev({ texto:PEDIDO }), sd, pend:{ cons_si:1, pend_id:0 } });
  const lead = r.lead || (sd.pendCierre[WA]||{}).lead || {};
  const tarjeta = JSON.stringify(r.aviso_body || (sd.pendCierre[WA]||{}).aviso || '');
  chequear('La tarjeta viaja como TEXTO cuando la ventana está abierta', /"type":"text"/.test(tarjeta), tarjeta.slice(0,80));

  chequear('El pedido cierra el lead', r.etapa === 'cierre', 'etapa=' + r.etapa);
  // los 5 ítems que la versión vieja perdía
  ['Válvula antirretorno', 'Tanque Séptico Ovoide', 'Filtro anaerobio', 'Trampa de grasas', '5000l'].forEach(item => {
    chequear('El Excel conserva "' + item + '"', String(lead.detalle||'').includes(item),
             'detalle(' + String(lead.detalle||'').length + ' chars)=' + String(lead.detalle||'').slice(-90));
  });
  chequear('Y la tarjeta al asesor también los lleva',
           tarjeta.includes('Tanque Séptico') && tarjeta.includes('5000l'), tarjeta.slice(-160));
  chequear('El primer renglón sigue estando (no se corta por el otro lado)',
           String(lead.detalle||'').includes('Tubería PVC-S'), String(lead.detalle||'').slice(0,80));
}

// ══ 2. Un pedido ENORME no rompe el mensaje de WhatsApp (tope 4096) ════════════
{
  const sd = base(); sd.ses[WA] = sesion();
  const gigante = Array.from({length:120}, (_,i) => (i+1) + ' UND Tubería PVC sanitaria de 6 metros referencia larga').join('\n');
  const r = correr({ datos: ev({ texto:gigante }), sd, pend:{ cons_si:1, pend_id:0 } });
  const av = r.aviso_body || (sd.pendCierre[WA]||{}).aviso || {};
  const cuerpo = (av.text && av.text.body) ? av.text.body : JSON.stringify(av);
  chequear('La tarjeta jamás supera el límite de WhatsApp (4096)', cuerpo.length < 4096, 'largo=' + cuerpo.length);
  chequear('Y le dice al asesor que abra el chat para ver el pedido completo',
           /pedido largo/i.test(cuerpo), cuerpo.slice(-160));
  // Ventana cerrada -> va por PLANTILLA (Meta corta a 700): el enlace al chat debe sobrevivir al corte
  if(/template/.test(cuerpo)){
    const params=(((av.template||{}).components||[])[0]||{}).parameters||[];
    const sol=String((params[5]||{}).text||'');
    chequear('En la plantilla sobrevive el enlace wa.me pese al recorte de Meta',
             /wa\.me/.test(sol) && sol.length<=700, 'sol('+sol.length+')='+sol.slice(-120));
  } else { total++; ok++; console.log('  OK   | (ventana abierta: viajó como texto, no aplica la plantilla)'); }
}

// ══ 3. Un pedido corto de siempre no cambia en nada ════════════════════════════
{
  const sd = base(); sd.ses[WA] = sesion();
  const r = correr({ datos: ev({ texto:'20 bultos de cemento gris' }), sd, pend:{ cons_si:1, pend_id:0 } });
  const lead = r.lead || (sd.pendCierre[WA]||{}).lead || {};
  chequear('Pedido corto: el detalle es exactamente lo que escribió',
           String(lead.detalle||'').includes('20 bultos de cemento gris') && String(lead.detalle||'').length < 120,
           'detalle=' + lead.detalle);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
