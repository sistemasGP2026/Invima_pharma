require('dotenv').config();
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const dataDir = path.resolve(raiz, process.env.DATA_DIR || 'data');

module.exports = {
  raiz,
  puerto: parseInt(process.env.PORT || '8081', 10),
  dataDir,
  // Un registro por linea (JSON Lines): se escribe y se lee en streaming, sin cargar el archivo completo en memoria
  archivoDatos: path.join(dataDir, 'invima_datos.jsonl'),
  // Formato anterior (arreglo JSON completo): se sigue leyendo si todavia no existe el .jsonl
  archivoDatosLegado: path.join(dataDir, 'invima_datos.json'),
  archivoEstado: path.join(dataDir, 'estado.json'),
  archivoLog: path.join(raiz, 'logs', 'actualizacion.log'),
  cron: process.env.CRON_ACTUALIZACION || '0 7 * * 1',
  cronTz: process.env.CRON_TZ || 'America/Bogota',
  // Medicamentos (vigentes, en tramite, vencidos) + Dispositivos medicos y otras tecnologias (un solo dataset)
  datasets: { vigentes: 'i7cb-raxc', tramite: 'vgr4-gemg', vencidos: 'qj5z-zabx', dispositivos: 'y4qt-w6tk' },
  // Categoria de cada registro del dataset de dispositivos segun su columna GRUPO (normalizada en mayusculas, un solo espacio):
  //   dm  = Dispositivos medicos (medico-quirurgicos)
  //   ins = Insumos (reactivos de diagnostico in vitro y productos odontologicos)
  // Cualquier grupo nuevo que INVIMA agregue y no este aqui se clasifica como 'dm'.
  categoriaPorGrupo: {
    'MEDICO QUIRURGICOS': 'dm',
    'ODONTOLOGICOS': 'ins',
    'REACTIVO DIAGNOSTICO': 'ins',
    'REACTIVOS IN VITRO': 'ins'
  },
  baseApi: process.env.INVIMA_API_BASE || 'https://www.datos.gov.co/resource/',
  pagina: 2000,          // filas por peticion
  timeoutMs: 90000,      // por peticion
  reintentos: parseInt(process.env.INVIMA_REINTENTOS || '5', 10),         // por pagina
  backupsAConservar: 3,
  // Si el nuevo total cae por debajo de este % del actual, se descarta (descarga incompleta)
  umbralMinimo: 0.9
};
