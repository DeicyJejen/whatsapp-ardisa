// Caso real Mario Saavedra / "Diseño Disaing SAS" (573148794340), 04/08 08:47.
// Meta entrego DOS webhooks con 22 ms de diferencia (ejecuciones n8n 80717 y 80718):
//   80717 13:47:35.259  boton "✅ Sí, autorizo"  -> etapa 'marca'   (cons_si:0)
//   80718 13:47:35.281  una FOTO                 -> etapa 'consent' (cons_si:0)  <- le repitio el muro
// Las dos leyeron el MISMO pasado: staticData sin autorizar Y la BD sin la fila del consentimiento, porque
// la estaba escribiendo la otra ejecucion en ese mismo instante. Ademas 80718 termino DESPUES y su escritura
// de staticData PISO el 'marca' de 80717 -> el cliente tuvo que volver a tocar "Sí, autorizo".
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573148794340';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Diseño Disaing SAS', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');
const esMuro = (r) => /politica-de-datos-personales/.test(cuerpo(r));
const clon   = (o) => JSON.parse(JSON.stringify(o));

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

const HOLA  = ev({ texto:'Hola! Estoy buscando asesoría Buenos días' });
const SI    = ev({ opcion_id:'CONSENT_SI', opcion_txt:'✅ Sí, autorizo' });
const FOTO  = ev({ es_media:true, mtype:'image', media_id:'1104789358661320' });

// ══ EL CASO REAL: boton y foto a la vez, las dos leyendo el pasado ══════════════
{
  const sd = base();
  const r0 = correr({ datos:HOLA, sd, pend:{ cons_si:0 } });
  chequear('08:47:28 el primer mensaje SÍ muestra el muro', esMuro(r0), cuerpo(r0).slice(0,90));

  const antes = clon(sd);                      // lo que las DOS ejecuciones simultaneas alcanzaron a leer
  const rBoton = correr({ datos:SI,   sd,               pend:{ cons_si:0 } });   // 80717
  const rFoto  = correr({ datos:FOTO, sd:antes,         pend:{ cons_si:0 } });   // 80718, sobre el MISMO estado

  chequear('El botón autoriza y avanza a la marca', rBoton.etapa === 'marca', 'etapa=' + rBoton.etapa);
  chequear('La foto simultánea NO le repite el muro', !esMuro(rFoto), cuerpo(rFoto).slice(0,120));
  chequear('A la foto se le acusa recibo', /Recibimos tu foto/i.test(cuerpo(rFoto)), cuerpo(rFoto).slice(0,120));
  chequear('La foto queda guardada para el asesor',
           (antes.ses[WA]||{}).pendMediaId === '1104789358661320', JSON.stringify(antes.ses[WA]||{}).slice(0,120));

  // 80718 terminó DESPUÉS: su staticData es el que queda. No puede devolver al cliente al muro.
  Object.keys(sd).forEach(k => delete sd[k]); Object.assign(sd, antes);
  const rSigue = correr({ datos: ev({ opcion_id:'MAR_CARP', opcion_txt:'🟡 Carpincentro' }), sd, pend:{ cons_si:1 } });
  chequear('Tras la carrera el cliente NO tiene que volver a autorizar', !esMuro(rSigue), cuerpo(rSigue).slice(0,120));
}

// ══ El freno es TEMPORAL: pasados 45 s el muro vuelve completo ══════════════════
{
  const sd = base();
  correr({ datos:HOLA, sd, pend:{ cons_si:0 } });
  sd.muro[WA] = Date.now() - 60*1000;                 // se mostró hace 60 s
  const r = correr({ datos: ev({ texto:'sigo esperando' }), sd, pend:{ cons_si:0 } });
  chequear('A los 60 s el muro SÍ se vuelve a mostrar (si el primero se perdió)', esMuro(r), cuerpo(r).slice(0,90));
}
{
  const sd = base();
  correr({ datos:HOLA, sd, pend:{ cons_si:0 } });
  const r = correr({ datos: ev({ texto:'necesito formica' }), sd, pend:{ cons_si:0 } });
  chequear('A los pocos segundos NO se repite, pero se le señala el botón',
           !esMuro(r) && /Sí, autorizo/.test(cuerpo(r)), cuerpo(r).slice(0,120));
}

// ══ NEGATIVO: un cliente nuevo nunca puede quedarse sin muro ════════════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Buenas, necesito cotizar cemento' }), sd, pend:{ cons_si:0 } });
  chequear('Cliente NUEVO siempre ve el muro completo', esMuro(r), cuerpo(r).slice(0,90));
}
{
  const sd = base();
  const r = correr({ datos: FOTO, sd, pend:{ cons_si:0 } });
  chequear('Foto de un cliente NUEVO también ve el muro completo', esMuro(r), cuerpo(r).slice(0,90));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
