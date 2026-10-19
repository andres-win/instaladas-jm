# INSTALADAS JM

PWA de seguimiento de ventas instaladas para asesores de Grupo JM.
App publicada en: https://andres-win.github.io/instaladas-jm/

## Stack
- Frontend: un solo archivo `index.html` (HTML/CSS/JS), PWA con `manifest.json` y `sw.js`
- Hosting: GitHub Pages (se actualiza solo al subir cambios a la rama main)
- Backend: Supabase (base de datos, login de supervisores, funciones, notificaciones push)
- Datos: Google Sheet sincronizado a Supabase con Apps Script (cada 5 minutos y al editar la hoja)

## Archivos del proyecto
- `index.html`: toda la app
- `sw.js`: service worker (pide siempre la versión fresca y maneja los avisos)
- `manifest.json`: datos para instalar la app en el celular
- `apps-script.js`: copia del script de Google Sheet (la clave real NO está aquí)
- `supabase.sql`: copia de la estructura y las funciones de la base de datos

## Usuarios
- Asesor: entra con su código o link `?a=codigo`
- Supervisor / Back Office / Jefe: correo y contraseña (Supabase Auth)

## Cómo trabajar
1. Editar siempre desde VS Code (no subir archivos directo en la página de GitHub).
2. Control de código fuente: escribir un mensaje, Confirmar, Sincronizar cambios.
3. GitHub Pages publica la versión nueva en 1 a 10 minutos.

## Seguridad (hecho)
- Todas las tablas de Supabase tienen RLS activado.
- Los asesores solo ven sus datos mediante funciones que validan su código.
- `staff_view` solo responde a cargos que no son ASESOR.
- La contraseña de supervisores ya no se guarda en el navegador (solo el usuario).
- Clave de sincronización (INGEST_KEY) cambiada; vive en Supabase (Edge Function Secrets) y en la línea 4 de Apps Script.

## Reglas importantes
- El repositorio es PÚBLICO: nunca subir claves, contraseñas ni datos de clientes.
- En `apps-script.js` la clave debe decir PONER_CLAVE_AQUI antes de subir cualquier cambio.
- Si falla la sincronización con error 401, revisar que la clave de Apps Script y la de Supabase coincidan.

## Pendientes
- Guardar en `supabase.sql` las políticas RLS y los triggers.
- Mejoras nuevas a la app.