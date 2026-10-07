const { Router } = require('express');
const datos = require('../services/datos.service');

const router = Router();
const ORDENES = ['p', 'rs', 'e', 't', 'pa', 'ff', 'fv', 'src', 'cat'];

// GET /api/buscar?q=...&estado=all|vig|ven&orden=p&asc=1&pagina=1&pp=25
router.get('/buscar', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 caracteres' });
  if (!datos.total()) return res.status(503).json({ error: 'Datos aún no cargados; intenta de nuevo en unos segundos' });

  const estado = ['all', 'vig', 'ven'].includes(req.query.estado) ? req.query.estado : 'all';
  const orden = ORDENES.includes(req.query.orden) ? req.query.orden : '';
  const asc = req.query.asc !== '0';
  const pp = Math.min(200, Math.max(1, parseInt(req.query.pp, 10) || 25));
  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);

  const { filas, vig, ven, med, dm, ins } = datos.buscarConCache({ q, estado, orden, asc });
  const ini = (pagina - 1) * pp;
  // vig/ven/med/dm/ins = conteos dentro de los resultados; registros = total en memoria.
  // 'k' es la clave interna de busqueda: no se envia al navegador.
  const pagFilas = filas.slice(ini, ini + pp).map(({ k, ...r }) => r);
  res.json({ total: filas.length, vig, ven, med, dm, ins, registros: datos.total(), pagina, pp, filas: pagFilas });
});

module.exports = router;
