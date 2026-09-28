const { Router } = require('express');
const datos = require('../services/datos.service');

const router = Router();
const ORDENES = ['p', 'rs', 'e', 't', 'pa', 'ff', 'fv', 'src'];

// GET /api/buscar?q=...&estado=all|vig|ven&orden=p&asc=1&pagina=1&pp=25
router.get('/buscar', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 caracteres' });
  if (!datos.total()) return res.status(503).json({ error: 'Datos aun no cargados' });

  const estado = ['all', 'vig', 'ven'].includes(req.query.estado) ? req.query.estado : 'all';
  const orden = ORDENES.includes(req.query.orden) ? req.query.orden : '';
  const asc = req.query.asc !== '0';
  const pp = Math.min(200, Math.max(1, parseInt(req.query.pp, 10) || 25));
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);

  const { filas, vig, ven } = datos.buscarConCache({ q, estado, orden, asc });
  const ini = (pagina - 1) * pp;
  res.json({ total: filas.length, vig, ven, registros: datos.total(), pagina, pp, filas: filas.slice(ini, ini + pp) });
});

module.exports = router;
