const { Router } = require('express');
const datos = require('../services/datos.service');
const { exportarExcel } = require('../services/exportar.service');

const router = Router();

// GET /api/exportar?q=acetaminofen&estado=all|vig|ven&orden=p&asc=1
router.get('/exportar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 caracteres para exportar' });
  if (!datos.total()) return res.status(503).json({ error: 'Datos aun no cargados' });

  const estado = ['all', 'vig', 'ven'].includes(req.query.estado) ? req.query.estado : 'all';
  const orden = ['p', 'rs', 'e', 't', 'pa', 'ff', 'fv', 'src'].includes(req.query.orden) ? req.query.orden : '';
  const asc = req.query.asc !== '0';

  try {
    await exportarExcel(res, { q, estado, orden, asc });
  } catch (err) {
    console.error('Error exportando Excel:', err);
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo generar el Excel' });
    else res.destroy(err);
  }
});

module.exports = router;
