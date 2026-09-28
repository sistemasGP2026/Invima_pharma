/**
 * Actualizador INVIMA (datos.gov.co / Socrata).
 * Reglas de seguridad:
 *  - Si un dataset falla tras los reintentos, NO se toca el JSON vigente.
 *  - Si el total nuevo cae bajo el umbral del actual, se descarta.
 *  - Escritura atomica (.tmp -> rename) y backups con fecha (se conservan N).
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const datos = require('./datos.service');

let corriendo = false;

function log(msg) {
  const linea = `${new Date().toLocaleString('sv-SE', { timeZone: cfg.cronTz })} - ${msg}`;
  console.log(linea);
  try {
    fs.mkdirSync(path.dirname(cfg.archivoLog), { recursive: true });
    fs.appendFileSync(cfg.archivoLog, linea + '\n', 'utf8');
  } catch { /* el log nunca debe tumbar el proceso */ }
}

const dormir = ms => new Promise(r => setTimeout(r, ms));
const t = v => (v == null ? '' : String(v)).trim();

function minificar(r, src) {
  return {
    p: t(r.producto), rs: t(r.registrosanitario), e: t(r.estadoregistro), t: t(r.titular),
    pa: t(r.principioactivo), ff: t(r.formafarmaceutica),
    fv: t(r.fechavencimiento || r.fechainactivo), fe: t(r.fechaexpedicion),
    mod: t(r.modalidad), atc: t(r.atc), datc: t(r.descripcionatc), via: t(r.viaadministracion),
    con: t(r.concentracion), um: t(r.unidadmedida), cant: t(r.cantidad), dc: t(r.descripcioncomercial),
    nr: t(r.nombrerol), tr: t(r.tiporol), exp: t(r.expediente), src
  };
}

async function pedirPagina(url) {
  let ultimo;
  for (let i = 1; i <= cfg.reintentos; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs), headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('Respuesta no es un arreglo');
      return j;
    } catch (e) {
      ultimo = e;
      log(`    intento ${i}/${cfg.reintentos} fallo: ${e.message}`);
      if (i < cfg.reintentos) await dormir(Math.min(60000, 3000 * 2 ** (i - 1)));
    }
  }
  throw new Error(`Pagina fallida tras ${cfg.reintentos} intentos: ${ultimo.message}`);
}

async function descargarDataset(nombre, uid, acumulador) {
  log(`Descargando ${nombre} (${uid})...`);
  let offset = 0, total = 0;
  for (;;) {
    // $order=:id => paginacion estable (sin esto Socrata puede repetir/saltar filas)
    const url = `${cfg.baseApi}${uid}.json?$limit=${cfg.pagina}&$offset=${offset}&$order=:id`;
    const filas = await pedirPagina(url);
    for (const f of filas) acumulador.push(minificar(f, nombre));
    total += filas.length;
    if (filas.length < cfg.pagina) break;
    offset += cfg.pagina;
    if (total % 20000 === 0) log(`  ${nombre}: ${total.toLocaleString('es-CO')}...`);
  }
  log(`  ${nombre}: ${total.toLocaleString('es-CO')} registros`);
  return total;
}

function escribirEstado(obj) {
  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    let previo = {};
    try { previo = JSON.parse(fs.readFileSync(cfg.archivoEstado, 'utf8')); } catch { /* primera vez */ }
    fs.writeFileSync(cfg.archivoEstado, JSON.stringify({ ...previo, ...obj }, null, 2), 'utf8');
  } catch { /* no critico */ }
}

function rotarBackups() {
  const prefijo = 'invima_datos_';
  const lista = fs.readdirSync(cfg.dataDir)
    .filter(f => f.startsWith(prefijo) && f.endsWith('.json'))
    .sort().reverse();
  for (const f of lista.slice(cfg.backupsAConservar)) fs.unlinkSync(path.join(cfg.dataDir, f));
}

async function actualizar() {
  if (corriendo) { log('Ya hay una actualizacion en curso; se omite.'); return { ok: false, motivo: 'en_curso' }; }
  corriendo = true;
  const inicio = Date.now();
  escribirEstado({ ultimoIntento: new Date().toISOString(), estadoUltimo: 'en_curso' });
  log('='.repeat(60));
  log('INICIO ACTUALIZACION');

  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    const nuevos = [];
    const resumen = {};
    for (const [nombre, uid] of Object.entries(cfg.datasets)) {
      resumen[nombre] = await descargarDataset(nombre, uid, nuevos);
    }
    if (resumen.tramite === 0) log('AVISO: el dataset de tramite devolvio 0 registros.');

    const actual = datos.total();
    if (!nuevos.length) throw new Error('No se descargo ningun registro');
    if (actual && nuevos.length < actual * cfg.umbralMinimo) {
      throw new Error(`Total nuevo (${nuevos.length}) < ${cfg.umbralMinimo * 100}% del actual (${actual}). Se conserva el archivo vigente.`);
    }

    log('Guardando archivo...');
    const tmp = cfg.archivoDatos + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(nuevos), 'utf8');

    if (fs.existsSync(cfg.archivoDatos)) {
      const d = new Date();
      const sello = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      fs.renameSync(cfg.archivoDatos, path.join(cfg.dataDir, `invima_datos_${sello}.json`));
    }
    fs.renameSync(tmp, cfg.archivoDatos);
    rotarBackups();

    await datos.cargar(); // recarga en caliente, sin reiniciar
    const seg = Math.round((Date.now() - inicio) / 1000);
    log(`ACTUALIZACION COMPLETADA: ${nuevos.length.toLocaleString('es-CO')} registros en ${seg}s (vigentes ${resumen.vigentes}, tramite ${resumen.tramite}, vencidos ${resumen.vencidos})`);
    escribirEstado({ estadoUltimo: 'ok', ultimaActualizacionOk: new Date().toISOString(), total: nuevos.length, resumen, error: null });
    return { ok: true, total: nuevos.length, resumen };
  } catch (e) {
    log(`ERROR: ${e.message} — se conserva el archivo anterior.`);
    escribirEstado({ estadoUltimo: 'error', error: e.message });
    return { ok: false, motivo: e.message };
  } finally {
    corriendo = false;
    log('='.repeat(60));
  }
}

module.exports = { actualizar, log };
