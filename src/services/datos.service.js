/**
 * Datos en memoria + filtrado (misma logica que el buscador del HTML).
 *
 * El archivo de datos es JSON Lines (un registro por linea) y se lee en streaming, de modo
 * que nunca hay que tener el archivo completo como texto en memoria. Al cargar:
 *  - se "internan" los textos repetidos (titulares, estados, grupos, marcas...): cada valor
 *    distinto existe una sola vez en memoria aunque aparezca en miles de registros;
 *  - se precalcula por registro una clave de busqueda normalizada (minusculas, sin tildes),
 *    asi la busqueda es rapida y encuentra "ALGODÓN" escribiendo "algodon".
 */
const fs = require('fs');
const readline = require('readline');
const cfg = require('../config');

let DATA = [];
let cargadoEn = null;
let CONTEOS = contar([]);
const cache = new Map(); // ultimos resultados, para paginar sin recalcular
const MAX_CACHE = 5;

/** Texto para comparar: minusculas, sin tildes ni caracteres fuera de Latin-1 (cadena de 1 byte/caracter en V8). */
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\xff]/g, '');
}

/** Campos sobre los que se busca (medicamentos y dispositivos). */
function clave(r) {
  return normalizar([r.p, r.rs, r.t, r.pa, r.dc, r.datc, r.ma, r.pre, r.uso, r.gr].filter(Boolean).join(' '));
}

const SIN_INTERNAR = new Set(['rs', 'exp', 'k']);

function preparar(r, pool) {
  if (!r.cat) r.cat = r.src === 'dispositivos' ? 'dm' : 'med'; // archivos del formato anterior
  for (const k in r) {
    const v = r[k];
    if (typeof v !== 'string' || SIN_INTERNAR.has(k)) continue;
    const c = pool.get(v);
    if (c === undefined) pool.set(v, v); else r[k] = c;
  }
  r.k = clave(r);
  return r;
}

function contar(lista) {
  const c = { total: lista.length, vigentes: 0, vencidos: 0, otros: 0, med: 0, dm: 0, ins: 0 };
  for (const r of lista) {
    if (r.e === 'Vigente') c.vigentes++; else if (r.e === 'Vencido') c.vencidos++; else c.otros++;
    if (r.cat === 'dm') c.dm++; else if (r.cat === 'ins') c.ins++; else c.med++;
  }
  return c;
}

async function cargar() {
  // Se libera primero lo que hay en memoria: asi la recarga semanal nunca duplica el consumo
  // (unos segundos sin datos un lunes a las 7 AM, en vez de arriesgar el limite de memoria del proceso).
  DATA = [];
  cache.clear();
  const pool = new Map();
  const nuevo = [];
  if (fs.existsSync(cfg.archivoDatos)) {
    const rl = readline.createInterface({ input: fs.createReadStream(cfg.archivoDatos, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const linea of rl) {
      if (!linea.trim()) continue;
      nuevo.push(preparar(JSON.parse(linea), pool));
    }
  } else if (fs.existsSync(cfg.archivoDatosLegado)) {
    // Formato anterior (arreglo JSON completo); desaparece con la primera actualizacion
    const arr = JSON.parse(await fs.promises.readFile(cfg.archivoDatosLegado, 'utf8'));
    if (!Array.isArray(arr)) throw new Error('invima_datos.json no es un arreglo');
    for (const r of arr) nuevo.push(preparar(r, pool));
  } else {
    DATA = [];
    CONTEOS = contar(DATA);
    cache.clear();
    return 0;
  }
  DATA = nuevo;
  CONTEOS = contar(DATA);
  cache.clear();
  cargadoEn = new Date();
  return DATA.length;
}

function total() { return DATA.length; }
function conteos() { return CONTEOS; }
function cargadoEnFecha() { return cargadoEn; }

function buscar({ q = '', estado = 'all', orden = '', asc = true } = {}) {
  const terms = normalizar(q).split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length) return [];
  const res = DATA.filter(r => {
    for (const t of terms) if (!r.k.includes(t)) return false;
    return estado === 'all' || (estado === 'vig' && r.e === 'Vigente') || (estado === 'ven' && r.e === 'Vencido');
  });
  if (orden) {
    const dir = asc ? 1 : -1;
    res.sort((a, b) => dir * String(a[orden] || '').toLowerCase().localeCompare(String(b[orden] || '').toLowerCase(), 'es'));
  }
  return res;
}

/** Igual que buscar() pero recuerda los ultimos resultados y cuenta vigentes/vencidos y por tipo. */
function buscarConCache(f) {
  const key = [normalizar(f.q || '').trim(), f.estado || 'all', f.orden || '', f.asc === false ? 0 : 1].join('|');
  let hit = cache.get(key);
  if (!hit) {
    const filas = buscar(f);
    const c = contar(filas);
    hit = { filas, vig: c.vigentes, ven: c.vencidos, med: c.med, dm: c.dm, ins: c.ins };
    cache.set(key, hit);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }
  return hit;
}

module.exports = { cargar, total, conteos, cargadoEnFecha, buscar, buscarConCache, normalizar };
