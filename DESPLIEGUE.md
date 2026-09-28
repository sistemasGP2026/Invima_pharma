# INVIMA Consultor — despliegue en 10.10.1.24 (Windows)

Servidor Express que sirve el consultor, se actualiza solo cada **lunes 7:00 AM** (hora Colombia)
y exporta a Excel (.xlsx real, ExcelJS) los resultados filtrados. Reemplaza a Python + Programador de tareas.

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

## 3. Verificar
- Estado y ultima actualizacion:  http://10.10.1.24:8081/api/estado
- Log:  logs\actualizacion.log
- Forzar una actualizacion ahora:  npm run actualizar   (luego  pm2 restart invima  para recargar en memoria)
- Cambiar la frecuencia: CRON_ACTUALIZACION en .env (ej. "0 7 * * 1" = lunes 7 AM) y  pm2 restart invima

## Seguridad de la actualizacion
- Si datos.gov.co falla o la descarga queda incompleta (<90% del total actual), NO se reemplaza el JSON.
- Se guardan los ultimos 3 respaldos con fecha: data\invima_datos_AAAAMMDD.json
- Escritura atomica: nunca queda un JSON a medias.

## Notas
- El servidor mantiene ~300 mil registros en memoria (~1 GB). Requiere >= 2 GB libres.
- La exportacion respeta busqueda, filtro de estado y orden de la pantalla (GET /api/exportar).
- El PM2 arranca solo tras reinicio del servidor si se configuro pm2-startup / tarea de inicio (igual que api-sgi).
