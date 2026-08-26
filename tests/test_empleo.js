// Caso real: MaicolD (573124078070) escribio "Me llamo Maicol y quisiera trabajar con ustedes" el 02/08 12:49.
// El bot le repitio el permiso de datos y el menu de marcas 3 veces hasta que se fue. No es cliente ni proveedor.
// Regla Deicy (04/08): "el que busca trabajo, dile que esto es canal comercial y pasale el correo de ayuda".
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573124078070';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, ses:{} });
const txt = (t, ia) => ({ wa_id:WA, profileName:'MaicolD', texto:t, mtype:'', media_id:'',
                          opcion_id:'', opcion_txt:'', es_media:false, ia:ia||null });
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ El caso de MaicolD, tal cual paso ═══════════════════════════════════════════
{
  const sd = base();
  const r = correr({ datos: txt('Me llamo Maicol y quisiera trabajar con ustedes'), sd, pend:{} });
  const c = cuerpo(r);
  chequear('Lo reconoce como aspirante, no le pide permiso de datos', r.etapa === 'empleo', 'etapa=' + r.etapa);
  chequear('Le dice que este canal es COMERCIAL', /canal es nuestra \*l[ií]nea comercial\*|l[ií]nea comercial/i.test(c), c.slice(0,180));
  chequear('Le da el correo de selección', /trabajaenardisa@ardisa\.com/.test(c), c.slice(0,180));
  chequear('NO lo registra como lead ni lo pasa a un asesor', !r.lead && !r.aviso_body, 'lead=' + JSON.stringify(r.lead));
  chequear('NO le muestra el muro del consentimiento', !/politica-de-datos-personales|autorizaci[oó]n/i.test(c), c.slice(0,180));

  // Insiste (el escribio 3 veces): no le repetimos el texto largo
  const r2 = correr({ datos: txt('Tengo experiencia, les puedo enviar mi hoja de vida'), sd, pend:{} });
  chequear('Si insiste, sigue en empleo', r2.etapa === 'empleo', 'etapa=' + r2.etapa);
  chequear('Si insiste, le responde corto (no repite el texto largo)',
           cuerpo(r2).length < cuerpo(r).length && /trabajaenardisa@ardisa\.com/.test(cuerpo(r2)), cuerpo(r2).slice(0,160));
}

// ══ Otras formas de pedir empleo ════════════════════════════════════════════════
for (const frase of ['Buenas, tienen alguna vacante disponible?',
                     'Quiero dejar mi hoja de vida',
                     'Estoy buscando empleo',
                     'Estan contratando personal?']) {
  const sd = base();
  const r = correr({ datos: txt(frase), sd, pend:{} });
  chequear('Empleo: "' + frase.slice(0,34) + '"', r.etapa === 'empleo' && /trabajaenardisa@ardisa\.com/.test(cuerpo(r)),
           'etapa=' + r.etapa);
}

// ══ NEGATIVOS: clientes de verdad que NO pueden caer aqui ═══════════════════════
const clientes = [
  ['Necesito un trabajo de carpinteria para mi cocina', { en_alcance:true, marca:'Carpincentro', grupo_pista:'',
      productos:['carpinteria'], confianza:'alta', es_reclamo:false, es_info:false }],
  ['Busco trabajo de ebanisteria a la medida', { en_alcance:true, marca:'Carpincentro', grupo_pista:'',
      productos:['ebanisteria'], confianza:'alta', es_reclamo:false, es_info:false }],
  ['Quiero cotizar 20 bultos de cemento gris', { en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION',
      productos:['cemento'], confianza:'alta', es_reclamo:false, es_info:false }],
];
for (const [frase, ia] of clientes) {
  const sd = base();
  const r = correr({ datos: txt(frase, ia), sd, pend:{} });
  chequear('CLIENTE, no aspirante: "' + frase.slice(0,34) + '"', r.etapa !== 'empleo', 'etapa=' + r.etapa);
}

// Un aspirante que ademas trae ruido comercial: si la IA NO ve una compra real, sigue siendo empleo
{
  const sd = base();
  const r = correr({ datos: txt('Soy instalador de ceramica y quisiera trabajar con ustedes',
                                { en_alcance:false, marca:'', grupo_pista:'', productos:[],
                                  confianza:'baja', es_reclamo:false, es_info:false }), sd, pend:{} });
  chequear('Instalador que se ofrece a trabajar -> empleo, no lead', r.etapa === 'empleo', 'etapa=' + r.etapa);
}

// ══ EL QUE YA FUE DESPACHADO NO VUELVE AL CARRIL COMERCIAL (24-ago-2026, Edinson Uribe 4:58 pm) ══
// La IA acertó: era una hoja de vida, y se le dio la salida al correo de selección. Pero sus dos mensajes
// siguientes —"ya la envié a trabajaenardisa@ardisa.com" y "muchas gracias, hasta pronto"— se tomaron como
// su SOLICITUD: se creó un lead y se le asignó una asesora de ventas a alguien que buscaba empleo.
// Solo se vuelve al carril comercial si nombra un producto.
{
  const conDespacho = (t) => {
    const sd = base();
    sd.ses[WA] = { paso:'detalle', t:Date.now(), consent:true, nombre:'Edinson Uribe', ciudad:'Bucaramanga',
                   ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados',
                   ocupacion:'📐 Especialista', despachado:Date.now() };
    const r = correr({ datos: txt(t, null), sd, pend:{} });
    return { etapa: r.etapa, cerro: r.etapa === 'cierre' || !!sd.pendCierre[WA] };
  };
  const a = conDespacho('Vale, pero ya la envíe a este correo: trabajaenardisa@ardisa.com');
  chequear('Tras la salida de empleo, un mensaje de cortesía NO crea lead', !a.cerro, 'etapa=' + a.etapa);
  const b = conDespacho('Vale, muchísimas gracias! Hasta pronto');
  chequear('Ni una despedida', !b.cerro, 'etapa=' + b.etapa);
  const c = conDespacho('necesito 20 bultos de cemento gris');
  chequear('Pero si nombra un producto, se atiende como cliente normal', c.cerro, 'etapa=' + c.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
