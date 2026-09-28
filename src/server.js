const express = require('express');
const compression = require('compression');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const cfg = require('./config');
const datos = require('./services/datos.service');
const { actualizar, log } = require('./services/actualizador.service');
const exportarRoutes = require('./routes/exportar.routes');
const buscarRoutes = require('./routes/buscar.routes');

const app = express();
app.disable('x-powered-by');
app.use(compression()); // el JSON de ~150 MB baja a ~20 MB por la red

app.get('/', (req, res) => res.redirect('/INVIMA_Consultor.html'));

// El JSON se sirve desde data/ (fuera de public) y se puede cambiar en caliente
app.get('/invima_datos.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(cfg.archivoDatos, err => { if (err && !res.headersSent) res.status(404).end(); });
});

app.get('/api/estado', (req, res) => {
  let estado = {};
  try { estado = JSON.parse(fs.readFileSync(cfg.archivoEstado, 'utf8')); } catch { /* aun sin estado */ }
  res.json({ registros: datos.total(), cargadoEn: datos.cargadoEnFecha(), cron: cfg.cron, ...estado });
});

app.use('/api', buscarRoutes);
app.use('/api', exportarRoutes);
app.use(express.static(path.join(cfg.raiz, 'public')));

async function iniciar() {
  try {
    const n = await datos.cargar();
    log(`Datos cargados en memoria: ${n.toLocaleString('es-CO')} registros`);
  } catch (e) {
    log(`No se pudieron cargar los datos: ${e.message}`);
  }

  app.listen(cfg.puerto, '0.0.0.0', () => log(`Servidor INVIMA en http://0.0.0.0:${cfg.puerto}`));

  if (!cron.validate(cfg.cron)) throw new Error(`CRON_ACTUALIZACION invalido: ${cfg.cron}`);
  cron.schedule(cfg.cron, () => { actualizar(); }, { timezone: cfg.cronTz });
  log(`Actualizacion programada: "${cfg.cron}" (${cfg.cronTz})`);

  // Primera vez sin datos: descargar de inmediato
  if (!datos.total()) { log('Sin datos locales: se lanza la primera descarga.'); actualizar(); }
}

iniciar().catch(e => { console.error(e); process.exit(1); });
