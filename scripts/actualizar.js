// Actualizacion manual: npm run actualizar   (si el servidor esta corriendo, reinicielo o espere al proximo arranque para recargar en memoria)
const { actualizar } = require('../src/services/actualizador.service');
const datos = require('../src/services/datos.service');
(async () => {
  await datos.cargar().catch(() => {});
  const r = await actualizar();
  process.exit(r.ok ? 0 : 1);
})();
