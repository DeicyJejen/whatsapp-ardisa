// Dos casos reales del 03-04/08:
//  A) Mario Saavedra (lead #214): mando una FOTO a las 08:47 y cerro a las 08:59. En esos 12 minutos ~50
//     ejecuciones de otros clientes pisaron store.medias y la foto NUNCA le llego a Karime; solo la lectura de
//     la IA. Ahora los media id se releen de la BD (campo `adj` de la consulta), que no se pisa.
//  B) Luis Nino (lead #210): explico lo que necesitaba en NOTA DE VOZ. El bot no transcribe audios, se quedo sin
//     una sola palabra para rutear y cayo al grupo por defecto (Acabados) cuando era ferreteria. Ahora pide una
//     linea escrita en vez de adivinar (decision Deicy "opcion C").
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{} });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// Sesion lista para cerrar (ya paso nombre/ciudad/perfil), como estaba Mario a las 08:59.
function listoParaCerrar(WA, extra) {
  const sd = base();
  sd.ses[WA] = Object.assign({ paso:'detalle', t:Date.now(), consent:true, nombre:'Mario Saavedra',
                               ciudad:'Cali', marca:'Carpincentro', ocupacion:'🔨 Carpintero' }, extra||{});
  return sd;
}
const ev = (WA, o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                      opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const medias = (r) => (r.aviso_medias || (r.pend_cierre ? '(pendiente)' : null));

// ══ A) La foto llega al asesor aunque la memoria se haya perdido ════════════════
{
  const WA = '573148794340';
  // store.medias VACIO a proposito: es justo lo que la carrera se llevo. La BD sigue teniendo el adjunto.
  const sd = listoParaCerrar(WA);
  const r = correr({ datos: ev(WA, { texto:'FORMICA LAMITECH FRENCH GREY 2233 PW cantidad 1' }),
                     sd, pend:{ cons_si:1, adj:'1104789358661320:image' } });
  chequear('Cierra el lead', r.etapa === 'cierre', 'etapa=' + r.etapa);
  const paq = (sd.pendCierre[WA] || {});
  const ms  = paq.medias || r.aviso_medias || [];
  chequear('La foto SÍ se le reenvía al asesor (la trae la BD)',
           ms.length === 1 && ms[0].image && ms[0].image.id === '1104789358661320',
           JSON.stringify(ms).slice(0,160));
  // Con la ventana de 24h CERRADA la tarjeta es una plantilla, que no puede llevar imagenes: por eso el texto
  // dice "el cliente envio adjuntos: RESPONDE este chat y te los reenvio" (minuscula) en vez de "📎 Adjunto:".
  chequear('La tarjeta le avisa del adjunto',
           /adjunt/i.test(JSON.stringify(paq.aviso || r.aviso_body || '')),
           JSON.stringify(paq.aviso || r.aviso_body || '').slice(0,180));
}
{
  const WA = '573148794340';
  const sd = listoParaCerrar(WA);
  const r = correr({ datos: ev(WA, { texto:'FORMICA LAMITECH FRENCH GREY' }),
                     sd, pend:{ cons_si:1, adj:'111:image,222:image,333:audio' } });
  const ms = (sd.pendCierre[WA]||{}).medias || r.aviso_medias || [];
  chequear('Varios adjuntos: se le mandan todos', ms.length === 3, JSON.stringify(ms).slice(0,160));
}
{
  const WA = '573148794340';
  const sd = listoParaCerrar(WA, { mediaId:'1104789358661320', mediaType:'image' });
  const r = correr({ datos: ev(WA, { texto:'FORMICA LAMITECH' }),
                     sd, pend:{ cons_si:1, adj:'1104789358661320:image' } });   // el MISMO id por los dos lados
  const ms = (sd.pendCierre[WA]||{}).medias || r.aviso_medias || [];
  chequear('No se manda la misma foto dos veces', ms.length === 1, JSON.stringify(ms).slice(0,160));
}
{
  const WA = '573148794340';
  const sd = listoParaCerrar(WA);
  const r = correr({ datos: ev(WA, { texto:'FORMICA LAMITECH' }), sd, pend:{ cons_si:1, adj:'' } });
  const ms = (sd.pendCierre[WA]||{}).medias || r.aviso_medias || [];
  chequear('Sin adjuntos no inventa ninguno', ms.length === 0, JSON.stringify(ms).slice(0,120));
}

// ══ B) La nota de voz: pedir una línea en vez de adivinar ═══════════════════════
{
  const WA = '573213940603';
  const sd = base();
  sd.ses[WA] = { paso:'detalle', t:Date.now(), consent:true, nombre:'Luis Niño', ciudad:'Bucaramanga',
                 marca:'Ardisa', ocupacion:'🏠 Cliente final' };
  const r = correr({ datos: ev(WA, { es_media:true, mtype:'audio', media_id:'2109372649616237' }),
                     sd, pend:{ cons_si:1, adj:'2109372649616237:audio' } });
  const c = JSON.stringify(r.wpp_body || '');
  chequear('Nota de voz sola: NO cierra adivinando el grupo', r.etapa !== 'cierre', 'etapa=' + r.etapa);
  chequear('Le pide UNA línea escrita', /una l[ií]nea/i.test(c), c.slice(0,180));
  chequear('Le confirma que el audio ya va para el asesor', /nota de voz/i.test(c), c.slice(0,180));

  // Escribe la linea -> ahora SI rutea y cierra
  const r2 = correr({ datos: ev(WA, { texto:'necesito una manguera de media pulgada',
                        ia:{ en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION', productos:['manguera'],
                             confianza:'alta', es_reclamo:false, es_info:false } }),
                      sd, pend:{ cons_si:1, adj:'2109372649616237:audio' } });
  chequear('Con la línea escrita ya cierra', r2.etapa === 'cierre', 'etapa=' + r2.etapa);
  const ms = (sd.pendCierre[WA]||{}).medias || r2.aviso_medias || [];
  chequear('Y el audio igual le llega al asesor',
           ms.length === 1 && ms[0].audio && ms[0].audio.id === '2109372649616237', JSON.stringify(ms).slice(0,160));
}
{
  // Solo se pide UNA vez: si manda otro audio, no lo dejamos en un bucle
  const WA = '573213940603';
  const sd = base();
  sd.ses[WA] = { paso:'detalle', t:Date.now(), consent:true, nombre:'Luis Niño', ciudad:'Bucaramanga',
                 marca:'Ardisa', ocupacion:'🏠 Cliente final', pidioTexto:1 };
  const r = correr({ datos: ev(WA, { es_media:true, mtype:'audio', media_id:'999' }),
                     sd, pend:{ cons_si:1, adj:'999:audio' } });
  chequear('Segundo audio: ya no insiste, cierra con lo que hay', r.etapa === 'cierre', 'etapa=' + r.etapa);
}
{
  // Una FOTO sí la lee la IA -> no debe pedir texto (solo aplica a audio/video)
  const WA = '573148794340';
  const sd = listoParaCerrar(WA);
  const r = correr({ datos: ev(WA, { es_media:true, mtype:'image', media_id:'555',
                        ia:{ en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['formica'],
                             confianza:'alta', es_reclamo:false, es_info:false } }),
                     sd, pend:{ cons_si:1, adj:'555:image' } });
  chequear('Una FOTO no pide texto (la IA sí la lee)', r.etapa === 'cierre', 'etapa=' + r.etapa);
}
{
  // Audio CON pie de foto: ya hay texto, no hay que pedir nada
  const WA = '573213940603';
  const sd = base();
  sd.ses[WA] = { paso:'detalle', t:Date.now(), consent:true, nombre:'Luis Niño', ciudad:'Bucaramanga',
                 marca:'Ardisa', ocupacion:'🏠 Cliente final' };
  const r = correr({ datos: ev(WA, { es_media:true, mtype:'audio', media_id:'777', media_caption:'cemento gris 20 bultos' }),
                     sd, pend:{ cons_si:1, adj:'777:audio' } });
  chequear('Audio con texto escrito: cierra normal', r.etapa === 'cierre', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
