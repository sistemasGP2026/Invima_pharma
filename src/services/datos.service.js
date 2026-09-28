/**
 * Datos en memoria + filtrado (misma logica que el buscador del HTML).
 */
const fs = require('fs');
const cfg = require('../config');

let DATA = [];
let cargadoEn = null;

async function cargar() {
  if (!fs.existsSync(cfg.archivoDatos)) {
    DATA = [];
    return 0;
  }
  const txt = await fs.promises.readFile(cfg.archivoDatos, 'utf8');
  const nuevo = JSON.parse(txt);
  if (!Array.isArray(nuevo)) throw new Error('invima_datos.json no es un arreglo');
  DATA = nuevo;
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

module.exports = { cargar, total, cargadoEnFecha, buscar };
