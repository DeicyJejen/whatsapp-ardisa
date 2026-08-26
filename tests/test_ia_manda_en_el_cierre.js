// Decision de Deicy 04/08: "deberia dejarle mas capacidad a la IA de interpretar; asi la persona
// coloque linea Acabados, si la descripcion dice productos de carpinteria debe recepcionarlo bien".
//
// Caso Claudia Ardila (lead #218): la IA dijo Carpincentro (confianza alta, 3 tableros identificados)
// y el lead salio como Ardisa - Acabados, porque ELLA eligio esos botones. El cliente no tiene por
// que saber que un tablero duratex es Carpincentro. Ahora el veredicto de la IA manda sobre el boton.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573175122973';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Claudia Ardila', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);

// Veredictos tal como los devuelve la IA
const IA_TABLEROS = { en_alcance:true, marca:'Carpincentro', grupo_pista:'desconocido',
  productos:['lámina duratex 18mm','lámina yutex 18mm','lámina graffo 18mm'],
  confianza:'alta', es_info:false, es_reclamo:false };
const IA_CEMENTO = { en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION',
  productos:['cemento gris 50kg'], confianza:'alta', es_info:false, es_reclamo:false };
const IA_DUDOSA = { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['algo de madera'],
  confianza:'baja', es_info:false, es_reclamo:false };
const IA_SIN_PROD = { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:[],
  confianza:'alta', es_info:false, es_reclamo:false };

// Sesion a punto de cerrar, con la linea y el grupo que ELIGIO EL CLIENTE por botones
function apuntoDeCerrar(extra) {
  const sd = base();
  sd.ses[WA] = Object.assign({ paso:'detalle', t:Date.now(), consent:true, nombre:'Claudia Ardila',
                               ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', ocupacion:'🏠 Cliente final' }, extra);
  return sd;
}
const cerrar = (sd, texto, ia) => correr({ datos: ev({ texto, ia }), sd, pend:{ cons_si:1 } });
const leadDe = (sd, r) => (sd.pendCierre[WA] || {}).lead || r.lead || {};

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ EL CASO DE CLAUDIA: eligió Ardisa/Acabados, pero pidió tableros ═════════════
{
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  const r = cerrar(sd, 'Tiene lámina duratex yutex y graffo de 18 mm?', IA_TABLEROS);
  const lead = leadDe(sd, r);
  chequear('Cierra el lead', r.etapa === 'cierre', 'etapa=' + r.etapa);
  chequear('La IA corrige la línea: Carpincentro (aunque tocó Ardisa)', lead.marca === 'Carpincentro',
           'marca=' + lead.marca);
  chequear('Y lo atiende quien maneja tableros', /Karime/i.test(lead.asesor || ''), 'asesor=' + lead.asesor);
  // OJO: al cerrar, la sesion se REEMPLAZA por {paso:'cerrado'}. Lo que sobrevive es el lead.
  chequear('El lead sale con la línea corregida, no con la del botón',
           lead.marca === 'Carpincentro' && /Carpincentro/i.test(lead.solicitud || ''),
           'marca=' + lead.marca + ' solicitud=' + lead.solicitud);
}

// ══ Mismo caso pero el cliente ni eligió: la IA decide sola ════════════════════
{
  // en un paso que NO cierra (aun le falta la ciudad), el veredicto debe quedar guardado
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados', paso:'ciudad' });
  correr({ datos: ev({ texto:'lámina duratex de 18mm', ia:IA_TABLEROS }), sd, pend:{ cons_si:1 } });
  chequear('El veredicto se guarda venga en el mensaje que venga',
           ((sd.ses[WA]||{}).iaBest||{}).marca === 'Carpincentro',
           'iaBest=' + JSON.stringify((sd.ses[WA]||{}).iaBest));
}

// ══ Dentro de Ardisa: corrige el GRUPO, no solo la línea ═══════════════════════
{
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  const r = cerrar(sd, 'necesito 20 bultos de cemento gris', IA_CEMENTO);
  const lead = leadDe(sd, r);
  // Acabados = Karina/Natalia · Construccion = Miguel/Yormy. Si corrigio, lo atiende Construccion.
  chequear('Eligió Acabados pero pidió cemento -> lo atiende Construcción',
           /Miguel|Yormy/i.test(lead.asesor || ''), 'asesor=' + lead.asesor + ' solicitud=' + lead.solicitud);
  chequear('Y la línea sigue siendo Ardisa', lead.marca === 'Ardisa', 'marca=' + lead.marca);
}

// ══ CONSERVADOR: sin evidencia fuerte NO se toca la elección del cliente ═══════
{
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  const r = cerrar(sd, 'necesito tablero de madera de 15mm para un mueble', IA_DUDOSA);
  // Con evidencia debil el bot NO cierra ni adivina: PREGUNTA (confirmGrupo). Y sobre todo, no
  // se lleva el lead a Carpincentro por una corazonada. Como no cierra, la sesion sigue viva.
  chequear('Confianza BAJA: no corrige la línea del cliente',
           (sd.ses[WA]||{}).marca === 'Ardisa' && !(sd.ses[WA]||{}).marcaCorregida,
           'marca=' + (sd.ses[WA]||{}).marca + ' etapa=' + r.etapa);
  chequear('Confianza BAJA: pregunta en vez de adivinar', r.etapa === 'confirmGrupo', 'etapa=' + r.etapa);
  // 2026-08-24 (Deicy, caso Carlos Conde): si toca preguntar, se pregunta MOSTRÁNDOLE lo que ya escribió.
  // El menú pelado ("¿qué necesitas?") un segundo después de que el cliente describió su producto se lee
  // como que el bot no escuchó, y el cliente termina repitiendo lo que ya dijo.
  chequear('Al preguntar la línea se le muestra lo que ya dijo (no repite su solicitud)',
           /ya quedó anotada/.test(JSON.stringify(r.wpp_body || '')) &&
           /tablero de madera de 15mm/.test(JSON.stringify(r.wpp_body || '')),
           JSON.stringify(r.wpp_body || '').slice(0, 200));
}
{
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  const r = cerrar(sd, 'necesito material para el piso de la sala', IA_SIN_PROD);
  chequear('Sin producto concreto: no corrige la línea del cliente',
           (sd.ses[WA]||{}).marca === 'Ardisa' && !(sd.ses[WA]||{}).marcaCorregida,
           'marca=' + (sd.ses[WA]||{}).marca + ' etapa=' + r.etapa);
}
{
  const sd = apuntoDeCerrar({ marca:'Carpincentro' });
  const r = cerrar(sd, 'formica blanca', { en_alcance:true, marca:'Carpincentro', grupo_pista:'',
    productos:['fórmica blanca'], confianza:'alta', es_info:false, es_reclamo:false });
  chequear('Si la IA coincide con el botón, no cambia nada',
           leadDe(sd, r).marca === 'Carpincentro' && !(sd.ses[WA]||{}).marcaCorregida,
           'marca=' + leadDe(sd, r).marca + ' corregida=' + (sd.ses[WA]||{}).marcaCorregida);
}

// ══ El veredicto más reciente manda (la conversación avanza) ═══════════════════
{
  // el primer mensaje llega en un paso que NO cierra; el segundo cierra. Gana el ultimo.
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados', paso:'ciudad' });
  correr({ datos: ev({ texto:'lámina duratex', ia:IA_TABLEROS }), sd, pend:{ cons_si:1 } });
  sd.ses[WA].paso = 'detalle';
  const r = cerrar(sd, 'mejor dicho necesito 20 bultos de cemento gris', IA_CEMENTO);
  chequear('Si cambia de idea, manda lo último que pidió', leadDe(sd, r).marca === 'Ardisa',
           'marca=' + leadDe(sd, r).marca);
}


// ══ AFINADO 24-ago (Deicy, caso Carlos Conde) ═══════════════════════════════════
// "Quintuplex tablero 25mm de espesor" tocando Ardisa: la IA dijo Carpincentro pero con confianza BAJA,
// y la baja no podía corregir NADA — el lead salía a Ardisa y encima le preguntaban la línea que su propio
// texto ya delataba. Ahora la baja SÍ corrige, pero con DOBLE respaldo: la IA propone y el vocabulario del
// cliente confirma. Sin vocabulario que la respalde, o con palabras de la otra línea, no mueve nada.
{
  const IA_BAJA_CARP = { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['tablero quintuplex 25mm'],
                         confianza:'baja', es_info:false, es_reclamo:false };
  const sd = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  const r = cerrar(sd, 'Quintuplex tablero 25mm de espesor', IA_BAJA_CARP);
  const lead = leadDe(sd, r);
  chequear('Confianza BAJA + vocabulario de carpintería: AHORA sí corrige (tablero -> Carpincentro)',
           (lead.marca === 'Carpincentro') || ((sd.ses[WA]||{}).marca === 'Carpincentro'),
           'lead=' + lead.marca + ' ses=' + ((sd.ses[WA]||{}).marca));

  // Guardarraíl 1: la IA propone Carpincentro pero el texto habla de la OTRA línea -> no se toca.
  const sd2 = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  cerrar(sd2, 'necesito cemento gris de 50 kilos', Object.assign({}, IA_BAJA_CARP, { productos:['cemento gris'] }));
  chequear('BAJA que contradice el texto: NO corrige (manda el vocabulario)',
           (sd2.ses[WA]||{}).marca === 'Ardisa', 'marca=' + ((sd2.ses[WA]||{}).marca));

  // Guardarraíl 2: sin vocabulario que la respalde, la confianza baja sigue sin poder mover la línea.
  const sd3 = apuntoDeCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' });
  cerrar(sd3, 'necesito algo para arreglar mi casa', Object.assign({}, IA_BAJA_CARP, { productos:['algo'] }));
  chequear('BAJA sin vocabulario que la respalde: NO corrige',
           (sd3.ses[WA]||{}).marca === 'Ardisa', 'marca=' + ((sd3.ses[WA]||{}).marca));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
