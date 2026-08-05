// LA BD MANDA AL ENTREGAR (05/08, caso Claudia Parra #224): el paquete del aviso se arma AL CERRAR y una
// carrera de cierres solapados puede dejarlo con solo el último mensaje ("2 galones de tiner"), aunque la
// fila de MySQL — que el candado + "Sumar detalle" mantienen completa — tenga el pedido entero. Ahora el
// finalizador recibe la fila real de la BD (nodo "Leer lead BD") y corrige la tarjeta ANTES de entregarla.
const fs = require('fs');
const FINALIZAR = fs.readFileSync(__dirname + '/n_finalizar.js', 'utf8');

function correr(json, sd) {
  const $ = (n) => ({ first: () => ({ json: json }) });
  return new Function('$json','$getWorkflowStaticData','$', FINALIZAR)(json, () => sd, $)[0].json;
}
const WA = '573157740463';
const NATALIA = '573107577394', MIGUEL = '573182988592';
const base = () => ({ pendCierre:{}, medias:{}, cliMsgs:{}, segPend:{}, win:{}, mediaPend:{}, holdAviso:[] });
const tpl = (to, p6) => ({ messaging_product:'whatsapp', to, type:'template',
  template:{ name:'aviso_lead_btn', language:{code:'es'}, components:[
    { type:'body', parameters:[{type:'text',text:'Claudia Parra'},{type:'text',text:'+'+WA},
      {type:'text',text:'Bucaramanga'},{type:'text',text:'Ardisa — Acabados'},
      {type:'text',text:'🏠 Cliente final'},{type:'text',text:p6}] }] } });
const paquete = (extra) => Object.assign({ token:1785933555455, t:Date.now()-30000, destino:NATALIA,
  aviso:{ messaging_product:'whatsapp', to:NATALIA, type:'text',
          text:{ body:'🔔 Nuevo cliente\n👤 Claudia Parra\n📝 Solicitud: 2 galones de tiner' } },
  avisoTpl:null, avisoCopia:null, copiaTo:null, avisoExtra:'', segPrompt:null, medias:[],
  lead:{ telefono:WA, nombre:'Claudia Parra', detalle:'2 galones de tiner', asesor:'Natalia',
         asesor_tel:NATALIA, modo_prueba:0 }, fuera:false, sendAfter:0, marca:'Ardisa' }, extra||{});
const LISTA = '2 cuñetes de pintura\n1 valde supermansky\n➕ 3 metros de plástico negro\n➕ 2 galones de tiner';
const bd = (extra) => Object.assign({ wa_id:WA, pend_token:1785933555455, bd_id:224,
  bd_detalle:LISTA, bd_asesor:'Natalia Amaris Martínez', bd_asesor_tel:NATALIA }, extra||{});

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. EL CASO CLAUDIA: la tarjeta parcial sale COMPLETA ═══════════════════════
{
  const sd = base(); sd.pendCierre[WA] = paquete();
  const r = correr(bd(), sd);
  const body = ((r.aviso_body||{}).text||{}).body||'';
  chequear('La tarjeta lleva el pedido completo de la BD', /Pedido completo/.test(body) && /cuñetes/.test(body), body.slice(0,180));
  chequear('Y el lead que sigue en la tubería también', /cuñetes/.test((r.lead||{}).detalle||''), (r.lead||{}).detalle);
}
// ══ 2. FUERA DE HORARIO: lo retenido para las 8:00 ya va corregido ═════════════
{
  const sd = base();
  sd.pendCierre[WA] = paquete({ fuera:true, sendAfter:Date.now()+3600000,
                                avisoTpl:tpl(NATALIA,'Cotización Acabados — 2 galones de tiner') });
  const r = correr(bd(), sd);
  chequear('Se retiene (hold) como siempre', r.fin === 'hold', 'fin=' + r.fin);
  const h = sd.holdAviso[0]||{};
  chequear('El texto retenido lleva el pedido completo', /cuñetes/.test(JSON.stringify(h.aviso||'')), JSON.stringify(h.aviso||'').slice(0,150));
  const p6 = ((((h.avisoTpl||{}).template||{}).components||[{}])[0].parameters||[]).slice(-1)[0]||{};
  chequear('La PLANTILLA retenida también (sin saltos de línea)',
           /Pedido completo/.test(p6.text||'') && !/\n/.test(p6.text||''), JSON.stringify(p6.text||'').slice(0,160));
}
// ══ 3. ASESOR: si la BD dice OTRO, la tarjeta va al de la BD ═══════════════════
{
  const sd = base();
  const pk = paquete({ destino:MIGUEL, medias:[{messaging_product:'whatsapp', to:MIGUEL, type:'image', image:{id:'MID1'}}] });
  pk.aviso.to = MIGUEL;
  sd.pendCierre[WA] = pk;
  sd.segPend['tok1'] = { telefono:WA, asesor_num:MIGUEL, t:Date.now() };
  sd.win[NATALIA] = Date.now();   // ventana de Natalia abierta para que el adjunto salga ya
  const r = correr(bd(), sd);
  chequear('El aviso se redirige al asesor de la BD', (r.aviso_body||{}).to === NATALIA, 'to=' + (r.aviso_body||{}).to);
  chequear('Con la nota de asignación', /asignada a ti/.test(JSON.stringify(r.aviso_body||'')));
  chequear('Los adjuntos del paquete también', JSON.stringify(r.aviso_medias||'').indexOf(NATALIA)>=0,
           JSON.stringify(r.aviso_medias||'').slice(0,120));
  chequear('Y el botón de reporte apunta al asesor real', sd.segPend['tok1'].asesor_num === NATALIA,
           'asesor_num=' + sd.segPend['tok1'].asesor_num);
}
// ══ 4. SIN fila en la BD: todo queda como estaba ═══════════════════════════════
{
  const sd = base(); sd.pendCierre[WA] = paquete();
  const r = correr(bd({ bd_id:null, bd_detalle:null, bd_asesor:null, bd_asesor_tel:null }), sd);
  const body = ((r.aviso_body||{}).text||{}).body||'';
  chequear('Sin fila en la BD la tarjeta no se toca', !/Pedido completo/.test(body) && /tiner/.test(body), body.slice(0,120));
}
// ══ 5. BD CAÍDA: no se pierde nada (reintenta al minuto) ═══════════════════════
{
  const sd = base(); sd.pendCierre[WA] = paquete();
  const r = correr({ error:'connect ECONNREFUSED' }, sd);   // el nodo MySQL falló: sin wa_id
  chequear('BD caída -> super (sin entregar)', r.fin === 'super', 'fin=' + r.fin);
  chequear('Y el paquete SIGUE en pendCierre para reintentar', !!sd.pendCierre[WA], 'se borró');
}
// ══ 6. El token sobrevive el viaje por MySQL (número vs texto) ═════════════════
{
  const sd = base(); sd.pendCierre[WA] = paquete();
  const r = correr(bd({ pend_token:'1785933555455' }), sd);   // vuelve como TEXTO
  chequear('Token como texto igual entrega', r.fin === 'ok', 'fin=' + r.fin);
}
// ══ 7. Paquete de info/reclamo (lead null): la BD no lo toca ═══════════════════
{
  const sd = base();
  sd.pendCierre[WA] = paquete({ lead:null, tipo:'info',
    aviso:{ messaging_product:'whatsapp', to:WA, type:'text', text:{body:'Servicio al Cliente...'} } });
  const r = correr(bd(), sd);
  chequear('El mensaje de info va al CLIENTE, intacto', (r.aviso_body||{}).to === WA &&
           !/Pedido completo/.test(JSON.stringify(r.aviso_body||'')), 'to=' + (r.aviso_body||{}).to);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
