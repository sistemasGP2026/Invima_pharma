# INVIMA Consultor — despliegue en 10.10.1.24 (Windows)

Servidor Express que sirve el consultor, se actualiza solo cada **lunes 7:00 AM** (hora Colombia)
y exporta a Excel (.xlsx real, ExcelJS) los resultados filtrados. Reemplaza a Python + Programador de tareas.

Datos (datos.gov.co, INVIMA), todos en la misma actualizacion semanal:
- Medicamentos: vigentes (i7cb-raxc), en tramite (vgr4-gemg) y vencidos (qj5z-zabx)
- Dispositivos medicos y otras tecnologias (y4qt-w6tk, ~430 mil registros). Segun su columna GRUPO se clasifican en
  **Dispositivos medicos** (medico-quirurgicos) e **Insumos** (reactivos de diagnostico in vitro y odontologicos).
  El mapeo esta en `src/config.js` (`categoriaPorGrupo`).

## 1. Instalar (PowerShell, en C:\Users\Admis\Desktop\Proyectos GP\invima-server)
    npm install
    copy .env.example .env
    copy <ruta-vieja>\invima_datos.json data\invima_datos.json     (opcional; si no existe, descarga sola al arrancar)

## 2. Arrancar con PM2 (igual que api-sgi)
    pm2 start ecosystem.config.js
    pm2 save

Puerto por defecto **8081** (el 8080 lo usa api-sgi; el 2000 lo corta el firewall entre subredes).
Abrir en la red: http://10.10.1.24:8081/INVIMA_Consultor.html
Si otra PC no entra: regla de firewall de Windows de entrada para el puerto 8081.

## 3. Actualizar el codigo (git pull)
    git pull origin main
    pm2 restart invima

Si los datos locales todavia no incluyen dispositivos medicos, el servidor lanza la descarga completa
al arrancar (unos 10-30 minutos; se ve en logs\actualizacion.log). Mientras tanto sigue atendiendo con los
datos anteriores y, al terminar, recarga en caliente: las tarjetas de dispositivos e insumos se llenan solas.

## 4. Verificar
- Estado, ultima actualizacion y conteos:  http://10.10.1.24:8081/api/estado
- Log:  logs\actualizacion.log
- Forzar una actualizacion ahora:  npm run actualizar   (luego  pm2 restart invima  para recargar en memoria)
- Cambiar la frecuencia: CRON_ACTUALIZACION en .env (ej. "0 7 * * 1" = lunes 7 AM) y  pm2 restart invima

## Seguridad de la actualizacion
- Si datos.gov.co falla o la descarga queda incompleta (<90% del total actual), NO se reemplaza el archivo.
- Se guardan los ultimos 3 respaldos con fecha: data\invima_datos_AAAAMMDD.jsonl
- Escritura atomica: nunca queda un archivo a medias.

## Notas
- Archivo de datos: data\invima_datos.jsonl (un registro por linea, ~400 MB). Se escribe y se lee en streaming,
  por eso ni la descarga ni el arranque necesitan el archivo completo en memoria. El invima_datos.json del
  formato anterior se sigue leyendo hasta la primera actualizacion, que lo deja como respaldo con fecha.
- El servidor mantiene ~740 mil registros en memoria (~700 MB; los textos repetidos se guardan una sola vez).
  El limite del proceso sigue en 2 GB (ecosystem.config.js).
- La busqueda no distingue tildes ("algodon" encuentra "ALGODÓN") y tambien busca por marca y usos.
- La exportacion respeta busqueda, filtro de estado y orden de la pantalla (GET /api/exportar); incluye la columna
  Tipo (Medicamento / Dispositivo medico / Insumo) y los campos propios de dispositivos.
- El PM2 arranca solo tras reinicio del servidor si se configuro pm2-startup / tarea de inicio (igual que api-sgi).
