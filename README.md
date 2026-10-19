# INSTALADAS JM

PWA de seguimiento de ventas instaladas para asesores de Grupo JM.

## Stack
- Frontend: un solo archivo `index.html` (HTML/CSS/JS), PWA con `manifest.json` y `sw.js`
- Backend: Supabase (base de datos, auth de supervisores, funciones RPC, notificaciones push)
- Datos: Google Sheet sincronizado a Supabase con Apps Script (cada ~30 min)

## Usuarios
- Asesor: entra con código o link `?a=codigo`
- Supervisor / Back Office / Jefe: correo y contraseña (Supabase Auth)

## Pendientes
- Quitar "recordar contraseña" (se guarda en localStorage)
- Revisar políticas RLS de todas las tablas
- Guardar en el repo el script de Apps Script y el SQL de Supabase