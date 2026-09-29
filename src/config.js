require('dotenv').config();
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const dataDir = path.resolve(raiz, process.env.DATA_DIR || 'data');

module.exports = {
  raiz,
  puerto: parseInt(process.env.PORT || '8081', 10),
  dataDir,
  archivoDatos: path.join(dataDir, 'invima_datos.json'),
  archivoEstado: path.join(dataDir, 'estado.json'),
  archivoLog: path.join(raiz, 'logs', 'actualizacion.log'),
  cron: process.env.CRON_ACTUALIZACION || '0 7 * * 1',
  cronTz: process.env.CRON_TZ || 'America/Bogota',
  datasets: { vigentes: 'i7cb-raxc', tramite: 'vgr4-gemg', vencidos: 'qj5z-zabx' },
  baseApi: process.env.INVIMA_API_BASE || 'https://www.datos.gov.co/resource/',
  pagina: 2000,          // filas por peticion
  timeoutMs: 90000,      // por peticion
  reintentos: parseInt(process.env.INVIMA_REINTENTOS || '5', 10),         // por pagina
  backupsAConservar: 3,
  // Si el nuevo total cae por debajo de este % del actual, se descarta (descarga incompleta)
  umbralMinimo: 0.9
};
