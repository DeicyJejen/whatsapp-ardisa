// PRUEBA: la ciudad que el cliente ESCRIBE no es su solicitud, y sin producto no se cierra.
//
// Caso Andrea Mendoza (573014293326, lead #317, 18-ago). Escribió "Hola! Estoy buscando asesoría",
// eligió Carpincentro, dio su nombre y, donde había un menú de ciudades, escribió "Medellín". El bot:
//   (a) le repitió el menú (fricción: tuvo que tocar "Otra ciudad" y escribirla otra vez);
//   (b) guardó "Medellín" como si fuera lo que quiere comprar;
//   (c) descartó su mensaje inicial —29 minutos antes, fuera de la ventana de 25 min del log— y
//   (d) cerró el lead: a Karime le llegó una solicitud cuyo *Detalle* era «Medellín».
// Las tres reglas que fija esta prueba: la ciudad escrita se acepta como ciudad y NUNCA como producto;
// lo que el cliente escribió no caduca mientras la conversación siga viva; y sin producto no se cierra.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573014293326';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Andrea', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');
const ses = (sd) => sd.ses[WA] || {};

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// El recorrido de Andrea hasta el paso de la ciudad
function hastaCiudad(sd, primer) {
  correr({ datos: ev({ texto: primer || 'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Andrea Mendoza' }), sd, pend:{ cons_si:1 } });
}

// ══ 1. "Medellín" escrito donde hay menú: es su CIUDAD, no su solicitud ═══════════
{
  const sd = base();
  hastaCiudad(sd);
  const r = correr({ datos: ev({ texto:'Medellín' }), sd, pend:{ cons_si:1 } });
  chequear('No le repite el menú de ciudades', !/selecciona tu \*?ciudad/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0,120));
  chequear('Queda registrada la ciudad Medellín', /medell/i.test(ses(sd).ciudad || ''), 'ciudad=' + S(ses(sd).ciudad));
  chequear('Como "Otra ciudad" (no hay tienda allá)', ses(sd).ciudadId === 'OTRA', 'ciudadId=' + S(ses(sd).ciudadId));
  chequear('Y NO se guarda como lo que quiere comprar', !/medell/i.test(S(ses(sd).notas) + S(ses(sd).detalle)),
           'notas=' + S(ses(sd).notas) + ' detalle=' + S(ses(sd).detalle));
  chequear('Avanza al siguiente paso (no se queda en la ciudad)', ses(sd).paso !== 'ciudad' && ses(sd).paso !== 'ciudadOtra',
           'paso=' + S(ses(sd).paso));
}

// ══ 2. Sin producto NO se cierra: se le pregunta (aunque el texto no "suene" vago) ══
{
  const sd = base();
  hastaCiudad(sd);
  correr({ datos: ev({ texto:'Medellín' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OCA_FINAL' }), sd, pend:{ cons_si:1 } });
  chequear('Le pregunta QUÉ necesita (no cierra creyendo que "Medellín" era el pedido)',
           /qué producto|qué necesitas/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0,160));
  chequear('Y NO cierra el lead a medias', !sd.leads.some(l => l.wa === WA), 'leads=' + S(sd.leads.map(l=>l.detalle)));
  // Responde y ahí sí cierra, con SU producto (no la ciudad)
  const r2 = correr({ datos: ev({ texto:'melamina rh blanca' }), sd, pend:{ cons_si:1 } });
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  chequear('Cuando responde, cierra', /registrada/i.test(S(r2.wpp_body)) && !!lead, S(r2.wpp_body).slice(0,120));
  chequear('El asesor recibe el PRODUCTO, no la ciudad', !!lead && /melamina/i.test(lead.detalle) && !/^medell/i.test(lead.detalle),
           'detalle=' + S(lead && lead.detalle));
}

// ══ 3. La ciudad escrita "a mano" tras el botón Otra ciudad tampoco es solicitud ══
{
  const sd = base();
  hastaCiudad(sd);
  correr({ datos: ev({ texto:'Para la ciudad de Ibagué' }), sd, pend:{ cons_si:1 } });
  chequear('"Para la ciudad de Ibagué" se entiende como Ibagué', /ibagu/i.test(ses(sd).ciudad || ''), 'ciudad=' + S(ses(sd).ciudad));
  chequear('Y no queda como su solicitud', !/ibagu/i.test(S(ses(sd).notas) + S(ses(sd).detalle)),
           'notas=' + S(ses(sd).notas));
}

// ══ 4. Lo que escribió al principio NO caduca porque la conversación se demore ════
{
  const sd = base();
  // Primer mensaje: su pedido real. Sin IA (Anthropic caído) vive SOLO en el log del cliente.
  correr({ datos: ev({ texto:'Necesito 20 laminas de melamina rh' }), sd, pend:{ cons_si:0 } });
  chequear('(el pedido quedó en el log del cliente)', /melamina/i.test(S(sd.cliMsgs[WA])), S(sd.cliMsgs[WA]).slice(0,90));
  // La clienta se demora: 40 minutos entre su primer mensaje y el cierre (Andrea tardó 29).
  sd.cliMsgs[WA] = sd.cliMsgs[WA].map(m => ({ t: Date.now() - 40*60000, m: m.m || m }));
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Andrea Mendoza' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'PT_0', opcion_id:'PT_0' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OCA_FINAL' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'es para un clóset' }), sd, pend:{ cons_si:1 } });
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  chequear('El lead se cierra', !!lead, 'leads=' + S(sd.leads.length));
  chequear('40 minutos después, el asesor SIGUE recibiendo lo que pidió al principio',
           !!lead && /melamina/i.test(lead.detalle), 'detalle=' + S(lead && lead.detalle));
}

// ══ 5. RED DE LA IA: el producto que el vocabulario no conoce tampoco se interroga ══
// La lista de palabras nunca va a tener todo lo que se vende (recebo, geotextil, acronal, caballete).
// Por eso el cierre mira también lo que la IA reconoció en TODA la conversación — y descarta las
// palabras que no son un producto ("asesoría", "cotización"), o la IA se contestaría a sí misma.
{
  const IA_RECEBO = { en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION', productos:['recebo'],
                      confianza:'alta', es_info:false, es_reclamo:false };
  const sd = base();
  correr({ datos: ev({ texto:'Necesito recebo para la base', ia:IA_RECEBO }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Andrea Mendoza' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  chequear('"recebo" (no está en el vocabulario, la IA sí lo vio) NO se interroga',
           !/qué producto/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0,140));
}
{
  const IA_VAGA = { en_alcance:true, marca:'', grupo_pista:'', productos:['asesoría'], confianza:'baja',
                    es_info:false, es_reclamo:false };
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Andrea Mendoza' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'PT_0', opcion_id:'PT_0' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OCA_FINAL' }), sd, pend:{ cons_si:1 } });
  chequear('Si la IA solo dice "asesoría", eso NO cuenta como producto: se pregunta',
           /qué producto|qué necesitas/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0,140));
  chequear('Y no se cierra un lead sin saber qué necesita', !sd.leads.some(l => l.wa === WA),
           'leads=' + S(sd.leads.map(l => l.detalle)));
}

// ══ 6. "Producto" tampoco es un producto (lead #325, 19-ago) ═══════════════════
// Confiar en lo que el cliente escribe en el paso final no puede cubrir una respuesta que no dice nada.
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Yesid Lizarazo' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'PT_0', opcion_id:'PT_0' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🔨 Carpintero', opcion_id:'OCA_CARP' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'Producto' }), sd, pend:{ cons_si:1 } });
  chequear('Responder "Producto" no cierra el lead: se le pregunta cuál',
           /qué producto|qué necesitas/i.test(S(r.wpp_body)) && !sd.leads.some(l => l.wa === WA),
           S(r.wpp_body).slice(0,120));
  const r2 = correr({ datos: ev({ texto:'tapacanto pvc blanco' }), sd, pend:{ cons_si:1 } });
  chequear('Y cuando lo dice, cierra normal', sd.leads.some(l => l.wa === WA && /tapacanto/i.test(l.detalle)),
           S(sd.leads.map(l => l.detalle)).slice(0,120));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
