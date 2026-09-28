/**
 * Exportador Excel generico (ExcelJS) — no sabe nada del negocio.
 * Recibe datos + definicion de columnas + el Response de Express y escribe el .xlsx
 * directo al stream (sin archivo temporal). Usa el WorkbookWriter en modo streaming
 * para que miles de filas no revienten la memoria.
 *
 * opciones:
 *   res            Response de Express (obligatorio)
 *   data           Array de objetos; cada 'key' de columnas enlaza con una propiedad
 *   columnas       [{ header, key, width?, numFmt? }]
 *   nombreArchivo  'reporte.xlsx'
 *   nombreHoja     'Datos'
 *   centrados      indices 1-based de columnas centradas (el resto va a la izquierda)
 *   minAncho / maxAncho   limites del ancho automatico (12 / 60)
 *   congelarEncabezado    true
 *   autoFiltro            true
 *   colorEncabezado       'FF1F4E79' (ARGB)
 */
const ExcelJS = require('exceljs');

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function anchoAutomatico(columnas, data, minAncho, maxAncho) {
  const anchos = columnas.map(c => String(c.header ?? '').length + 2);
  for (const fila of data) {
    for (let i = 0; i < columnas.length; i++) {
      const v = fila[columnas[i].key];
      if (v === null || v === undefined) continue;
      const largo = (typeof v === 'string' ? v : String(v)).length + 2;
      if (largo > anchos[i]) anchos[i] = largo;
    }
  }
  return anchos.map((a, i) => columnas[i].width || Math.min(maxAncho, Math.max(minAncho, a)));
}

async function escribirExcel(opciones) {
  const {
    res,
    data = [],
    columnas,
    nombreArchivo = 'reporte.xlsx',
    nombreHoja = 'Datos',
    centrados = [],
    minAncho = 12,
    maxAncho = 60,
    congelarEncabezado = true,
    autoFiltro = true,
    colorEncabezado = 'FF1F4E79'
  } = opciones;

  if (!res) throw new Error('excelParser: falta res');
  if (!Array.isArray(columnas) || !columnas.length) throw new Error('excelParser: faltan columnas');

  const seguro = String(nombreArchivo).replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', MIME_XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${seguro}"`);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  const hoja = workbook.addWorksheet(nombreHoja.slice(0, 31), {
    views: congelarEncabezado ? [{ state: 'frozen', ySplit: 1 }] : []
  });

  const anchos = anchoAutomatico(columnas, data, minAncho, maxAncho);
  hoja.columns = columnas.map((c, i) => ({ header: c.header, key: c.key, width: anchos[i] }));

  const centro = new Set(centrados);
  const alinear = i => ({ vertical: 'middle', horizontal: centro.has(i + 1) ? 'center' : 'left' });

  // Encabezado
  const enc = hoja.getRow(1);
  enc.height = 22;
  columnas.forEach((_, i) => {
    const cel = enc.getCell(i + 1);
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorEncabezado } };
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  enc.commit();

  // Filas
  for (const fila of data) {
    const r = hoja.addRow(fila);
    for (let i = 0; i < columnas.length; i++) {
      const cel = r.getCell(i + 1);
      cel.alignment = alinear(i);
      if (columnas[i].numFmt) cel.numFmt = columnas[i].numFmt;
    }
    r.commit();
  }

  if (autoFiltro) {
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  }

  await hoja.commit();
  await workbook.commit(); // cierra y termina el stream (res.end)
}

module.exports = { escribirExcel, MIME_XLSX };
