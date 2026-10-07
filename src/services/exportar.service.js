/**
 * Capa de negocio de la exportacion: arma filas planas + lista de columnas
 * y delega el estilo/escritura en utils/excelParser.
 */
const { escribirExcel } = require('../utils/excelParser');
const datos = require('./datos.service');

const p2 = n => String(n).padStart(2, '0');

/** Fecha -> 'dd/mm/yyyy' como TEXTO, en UTC (evita el corrimiento de un dia en UTC-5). */
function fmtFecha(d) {
  if (!d) return '';
  const s = String(d).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // formato de origen MM/DD/YYYY
  if (m) return `${p2(m[2])}/${p2(m[1])}/${m[3]}`;
  const dt = new Date(s);
  if (isNaN(dt)) return s;
  return `${p2(dt.getUTCDate())}/${p2(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
}

const FUENTE = { vigentes: 'Vigentes', tramite: 'En Trámite', vencidos: 'Vencidos', dispositivos: 'Dispositivos médicos' };
const TIPO = { med: 'Medicamento', dm: 'Dispositivo médico', ins: 'Insumo' };

const COLUMNAS = [
  { header: 'Tipo', key: 'tipo' },
  { header: 'Producto', key: 'producto' },
  { header: 'Registro Sanitario', key: 'registro' },
  { header: 'Estado', key: 'estado' },
  { header: 'Titular', key: 'titular' },
  { header: 'Fabricante', key: 'fabricante' },
  { header: 'Tipo Rol', key: 'tipoRol' },
  { header: 'Principio Activo', key: 'principio' },
  { header: 'Concentración', key: 'concentracion' },
  { header: 'Unidad Medida', key: 'unidad' },
  { header: 'Forma Farmacéutica', key: 'forma' },
  { header: 'Vía Adm.', key: 'via' },
  { header: 'Marca', key: 'marca' },
  { header: 'Presentación Comercial', key: 'presentacion' },
  { header: 'Grupo INVIMA', key: 'grupo' },
  { header: 'Nivel de Riesgo', key: 'nivelRiesgo' },
  { header: 'Vida Útil', key: 'vidaUtil' },
  { header: 'Usos', key: 'usos' },
  { header: 'Modalidad', key: 'modalidad' },
  { header: 'ATC', key: 'atc' },
  { header: 'Descripción ATC', key: 'descAtc' },
  { header: 'Descripción Comercial', key: 'descComercial' },
  { header: 'Fecha Expedición', key: 'fExpedicion' },
  { header: 'Fecha Vencimiento', key: 'fVencimiento' },
  { header: 'Expediente', key: 'expediente' },
  { header: 'Fuente', key: 'fuente' }
];

// 1-based: Tipo, Registro, Estado, Concentración, Unidad, Vía, Nivel de riesgo, Vida útil, ATC, fechas, Expediente, Fuente
const CENTRADOS = [1, 3, 4, 9, 10, 12, 16, 17, 20, 23, 24, 25, 26];

/** Un registro por fila (ya es plano; solo se renombran y normalizan campos). */
function aplanar(regs) {
  return regs.map(r => ({
    tipo: TIPO[r.cat] || 'Medicamento',
    producto: r.p || '',
    registro: r.rs || '',
    estado: r.e || '',
    titular: r.t || '',
    fabricante: r.nr || '',
    tipoRol: r.tr || '',
    principio: r.pa || '',
    concentracion: r.con || '',
    unidad: r.um || '',
    forma: r.ff || '',
    via: r.via || '',
    marca: r.ma || '',
    presentacion: r.pre || '',
    grupo: r.gr || '',
    nivelRiesgo: r.nv || '',
    vidaUtil: r.vu || '',
    usos: r.uso || '',
    modalidad: r.mod || '',
    atc: r.atc || '',
    descAtc: r.datc || '',
    descComercial: r.dc || '',
    fExpedicion: fmtFecha(r.fe),
    fVencimiento: fmtFecha(r.fv),
    expediente: r.exp || '',
    fuente: FUENTE[r.src] || 'Vencidos'
  }));
}

async function exportarExcel(res, filtros) {
  const filas = aplanar(datos.buscar(filtros));
  const hoy = new Date();
  const nombre = `INVIMA_${hoy.getUTCFullYear()}-${p2(hoy.getUTCMonth() + 1)}-${p2(hoy.getUTCDate())}.xlsx`;
  await escribirExcel({
    res,
    data: filas,
    columnas: COLUMNAS,
    nombreArchivo: nombre,
    nombreHoja: 'Registros INVIMA',
    centrados: CENTRADOS
  });
  return filas.length;
}

module.exports = { exportarExcel, aplanar, fmtFecha, COLUMNAS };
