/**
 * Datos en memoria + filtrado (misma logica que el buscador del HTML).
 */
const fs = require('fs');
const cfg = require('../config');

let DATA = [];
let cargadoEn = null;
const cache = new Map(); // ultimos resultados, para paginar sin recalcular
const MAX_CACHE = 5;

async function cargar() {
  if (!fs.existsSync(cfg.archivoDatos)) {
    DATA = [];
    return 0;
  }
  const txt = await fs.promises.readFile(cfg.archivoDatos, 'utf8');
  const nuevo = JSON.parse(txt);
  if (!Array.isArray(nuevo)) throw new Error('invima_datos.json no es un arreglo');
  DATA = nuevo;
  cache.clear();
  cargadoEn = new Date();
  return DATA.length;
}

function total() { return DATA.length; }
function cargadoEnFecha() { return cargadoEn; }

function buscar({ q = '', estado = 'all', orden = '', asc = true } = {}) {
  const terms = String(q).trim().toLowerCase().split(' ').filter(t => t.length >= 2);
  if (!terms.length) return [];
  const res = DATA.filter(r => {
    const hay = ((r.p || '') + ' ' + (r.rs || '') + ' ' + (r.t || '') + ' ' + (r.pa || '') + ' ' + (r.dc || '') + ' ' + (r.datc || '')).toLowerCase();
    if (!terms.every(t => hay.includes(t))) return false;
    return estado === 'all' || (estado === 'vig' && r.e === 'Vigente') || (estado === 'ven' && r.e === 'Vencido');
  });
  if (orden) {
    const dir = asc ? 1 : -1;
    res.sort((a, b) => dir * String(a[orden] || '').toLowerCase().localeCompare(String(b[orden] || '').toLowerCase(), 'es'));
  }
  return res;
}

/** Igual que buscar() pero recuerda los ultimos resultados y cuenta vigentes/vencidos. */
function buscarConCache(f) {
  const key = [String(f.q || '').trim().toLowerCase(), f.estado || 'all', f.orden || '', f.asc === false ? 0 : 1].join('|');
  let hit = cache.get(key);
  if (!hit) {
    const filas = buscar(f);
    let vig = 0, ven = 0;
    for (const r of filas) { if (r.e === 'Vigente') vig++; else if (r.e === 'Vencido') ven++; }
    hit = { filas, vig, ven };
    cache.set(key, hit);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }
  return hit;
}

module.exports = { cargar, total, cargadoEnFecha, buscar, buscarConCache };
