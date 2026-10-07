/**
 * Actualizador INVIMA (datos.gov.co / Socrata).
 * Descarga medicamentos (vigentes, en tramite, vencidos) y dispositivos medicos / otras tecnologias.
 * Reglas de seguridad:
 *  - Si un dataset falla tras los reintentos, NO se toca el archivo vigente.
 *  - Si el total nuevo cae bajo el umbral del actual, se descarta.
 *  - Los registros se escriben en streaming (un JSON por linea) a un .tmp: la descarga
 *    completa nunca se acumula en memoria. Luego .tmp -> rename (escritura atomica)
 *    y backups con fecha (se conservan N).
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

/** GRUPO del dataset de dispositivos, normalizado (mayusculas, un solo espacio). */
function normalizarGrupo(g) {
  return t(g).toUpperCase().replace(/\s+/g, ' ');
}

/** 'dm' (dispositivo medico) o 'ins' (insumo) segun el GRUPO; ver cfg.categoriaPorGrupo. */
function categoriaDispositivo(grupo) {
  const g = normalizarGrupo(grupo);
  if (cfg.categoriaPorGrupo[g]) return cfg.categoriaPorGrupo[g];
  if (g.startsWith('REACTIVO')) return 'ins';
  return 'dm';
}

/** INVIMA usa 1900-01-01 como "sin fecha" en dispositivos: se deja vacio. */
function fecha(v) {
  const s = t(v);
  return s.startsWith('1900-01-01') ? '' : s;
}

function minificarMedicamento(r, src) {
  return {
    p: t(r.producto), rs: t(r.registrosanitario),
    // el dataset de tramite no trae estado: se marca explicitamente (igual que agregar_tramite2.py)
    e: t(r.estadoregistro) || (src === 'tramite' ? 'En trámite' : ''), t: t(r.titular),
    pa: t(r.principioactivo), ff: t(r.formafarmaceutica),
    fv: t(r.fechavencimiento || r.fechainactivo), fe: t(r.fechaexpedicion),
    mod: t(r.modalidad), atc: t(r.atc), datc: t(r.descripcionatc), via: t(r.viaadministracion),
    con: t(r.concentracion), um: t(r.unidadmedida), cant: t(r.cantidad), dc: t(r.descripcioncomercial),
    nr: t(r.nombrerol), tr: t(r.tiporol), exp: t(r.expediente), src, cat: 'med'
  };
}

/** Dataset y4qt-w6tk (Registros sanitarios de dispositivos medicos y otras tecnologias). */
function minificarDispositivo(r) {
  const gr = normalizarGrupo(r.grupo);
  return {
    // la columna PRODUCTO viene como "prodcuto" (sic) en datos.gov.co; se aceptan ambas
    p: t(r.prodcuto ?? r.producto), rs: t(r.registro_sanitario), e: t(r.estado_registro), t: t(r.titular),
    fv: fecha(r.fecha_vencimiento), gr,
    ma: t(r.marca), pre: t(r.presentacion_comercial), vu: t(r.vida_util), nv: t(r.nivel_riesgo), uso: t(r.usos),
    ct: t(r.ciudad_titular), pt: t(r.pais_titular),
    nr: t(r.nombre_rol), tr: t(r.rol), mod: t(r.modalidad), exp: t(r.expediente),
    src: 'dispositivos', cat: categoriaDispositivo(gr)
  };
}

function minificar(r, src) {
  return src === 'dispositivos' ? minificarDispositivo(r) : minificarMedicamento(r, src);
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

/** Escritor en streaming de lineas JSON (respeta la contrapresion del disco). */
function abrirEscritor(ruta) {
  const ws = fs.createWriteStream(ruta, { encoding: 'utf8' });
  let error = null;
  let avisarDrain = null;
  ws.on('error', e => { error = e; if (avisarDrain) avisarDrain(); });
  ws.on('drain', () => { if (avisarDrain) avisarDrain(); });
  return {
    async escribir(lineas) {
      if (error) throw error;
      if (!lineas.length) return;
      const ok = ws.write(lineas.join('\n') + '\n');
      if (!ok) await new Promise(res => { avisarDrain = res; });
      avisarDrain = null;
      if (error) throw error;
    },
    cerrar() {
      return new Promise((res, rej) => {
        if (error) return rej(error);
        ws.end(err => (err || error) ? rej(err || error) : res());
      });
    },
    abortar() { try { ws.destroy(); } catch { /* nada */ } }
  };
}

async function descargarDataset(nombre, uid, escritor) {
  log(`Descargando ${nombre} (${uid})...`);
  let offset = 0, total = 0;
  for (;;) {
    // $order=:id => paginacion estable (sin esto Socrata puede repetir/saltar filas)
    const url = `${cfg.baseApi}${uid}.json?$limit=${cfg.pagina}&$offset=${offset}&$order=:id`;
    const filas = await pedirPagina(url);
    await escritor.escribir(filas.map(f => JSON.stringify(minificar(f, nombre))));
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

function sello() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function rotarBackups() {
  const prefijo = 'invima_datos_';
  const lista = fs.readdirSync(cfg.dataDir)
    .filter(f => f.startsWith(prefijo) && (f.endsWith('.json') || f.endsWith('.jsonl')))
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

  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const tmp = cfg.archivoDatos + '.tmp';
  const escritor = abrirEscritor(tmp);

  try {
    const resumen = {};
    let totalNuevo = 0;
    for (const [nombre, uid] of Object.entries(cfg.datasets)) {
      resumen[nombre] = await descargarDataset(nombre, uid, escritor);
      totalNuevo += resumen[nombre];
    }
    await escritor.cerrar();
    if (resumen.tramite === 0) log('AVISO: el dataset de tramite devolvio 0 registros.');

    const actual = datos.total();
    if (!totalNuevo) throw new Error('No se descargo ningun registro');
    if (actual && totalNuevo < actual * cfg.umbralMinimo) {
      throw new Error(`Total nuevo (${totalNuevo}) < ${cfg.umbralMinimo * 100}% del actual (${actual}). Se conserva el archivo vigente.`);
    }

    log('Guardando archivo...');
    const fechaSello = sello();
    if (fs.existsSync(cfg.archivoDatos)) {
      fs.renameSync(cfg.archivoDatos, path.join(cfg.dataDir, `invima_datos_${fechaSello}.jsonl`));
    }
    // Primer paso al formato nuevo: el arreglo JSON anterior queda como respaldo con fecha
    if (fs.existsSync(cfg.archivoDatosLegado)) {
      fs.renameSync(cfg.archivoDatosLegado, path.join(cfg.dataDir, `invima_datos_${fechaSello}.json`));
    }
    fs.renameSync(tmp, cfg.archivoDatos);
    rotarBackups();

    await datos.cargar(); // recarga en caliente, sin reiniciar
    const seg = Math.round((Date.now() - inicio) / 1000);
    const c = datos.conteos();
    log(`ACTUALIZACION COMPLETADA: ${totalNuevo.toLocaleString('es-CO')} registros en ${seg}s ` +
        `(vigentes ${resumen.vigentes}, tramite ${resumen.tramite}, vencidos ${resumen.vencidos}, dispositivos ${resumen.dispositivos}) ` +
        `— medicamentos ${c.med}, dispositivos medicos ${c.dm}, insumos ${c.ins}`);
    escribirEstado({ estadoUltimo: 'ok', ultimaActualizacionOk: new Date().toISOString(), total: totalNuevo, resumen, conteos: c, error: null });
    return { ok: true, total: totalNuevo, resumen, conteos: c };
  } catch (e) {
    escritor.abortar();
    try { fs.unlinkSync(tmp); } catch { /* no existia */ }
    log(`ERROR: ${e.message} — se conserva el archivo anterior.`);
    escribirEstado({ estadoUltimo: 'error', error: e.message });
    return { ok: false, motivo: e.message };
  } finally {
    corriendo = false;
    log('='.repeat(60));
  }
}

module.exports = { actualizar, log, minificar, categoriaDispositivo, normalizarGrupo };
