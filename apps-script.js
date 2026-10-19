const URL_API = 'https://htnkfocyfgbrmhgcdwps.supabase.co/functions/v1/ingest';
const URL_NOTIFY = 'https://htnkfocyfgbrmhgcdwps.supabase.co/functions/v1/notify';
const URL_EFF = 'https://htnkfocyfgbrmhgcdwps.supabase.co/functions/v1/ingest-eff';
const KEY = 'PONER_CLAVE_AQUI';
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
// Distritos: se escriben completos. Si en tu hoja aparece una abreviatura, agrégala aquí.
const ALIAS_DISTRITOS = {
  'SMP': 'SAN MARTIN DE PORRES', 'SJL': 'SAN JUAN DE LURIGANCHO', 'SJM': 'SAN JUAN DE MIRAFLORES',
  'VMT': 'VILLA MARIA DEL TRIUNFO', 'VES': 'VILLA EL SALVADOR', 'SMDP': 'SAN MARTIN DE PORRES',
  'S M P': 'SAN MARTIN DE PORRES', 'S J L': 'SAN JUAN DE LURIGANCHO'
};
const ABR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
const HEX = '0123456789abcdef'.split('');
// Estados que existen en la hoja y a propósito no se muestran a las asesoras
const IGNORADOS = [];

function limpiar(s) { return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function sinTilde(s) { return limpiar(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function hoja(ss, nombres, opcional) {
  const buscados = nombres.map(limpiar), hojas = ss.getSheets();
  for (let i = 0; i < hojas.length; i++) {
    if (buscados.indexOf(limpiar(hojas[i].getName())) !== -1) return hojas[i];
  }
  if (opcional) return null;
  throw new Error('No encuentro la pestaña ' + nombres.join(' o ') + '. Las pestañas que veo son: ' +
    hojas.map(function (h) { return '[' + h.getName() + ']'; }).join(' '));
}

function iso(f) { return f instanceof Date ? Utilities.formatDate(f, 'America/Lima', 'yyyy-MM-dd') : null; }

function clase(e) {
  if (e.indexOf('INSTALAD') === 0) return 'inst';
  if (['PROGRAMADA', 'EN PROGRESO', 'REPROGRAMADA', 'GRABADO'].indexOf(e) !== -1) return 'prog';
  if (['CANCELADA', 'ANULADA', 'DESAPROBADA', 'NO PROCEDE', 'POSIBLE FRAUDE'].indexOf(e) !== -1) return 'canc';
  return null;
}

// El motivo se recorta y se le quitan números largos (documentos, teléfonos) y correos
function motivo(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim().replace(/\S+@\S+/g, '').replace(/\d{6,}/g, '***').trim();
  return s.length > 70 ? s.substring(0, 67) + '...' : s;
}

function sync() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const m = Number(Utilities.formatDate(new Date(), 'America/Lima', 'M')) - 1;
  const nombres = ['INGRESOS ' + MESES[m]];
  if (m === 8) nombres.push('INGRESOS SEPTIEMBRE');

  const shI = hoja(ss, nombres);
  const v = shI.getDataRange().getValues();
  const H = v[0].map(limpiar);
  const iF = H.indexOf('FECHA'), iA = H.indexOf('ASESOR'), iN = H.indexOf('NOMBRE'), iE = H.indexOf('ESTADO');
  const iO = v[0].map(sinTilde).findIndex(function (x) { return x.indexOf('OBSERVACION') === 0; });
  const iI = v[0].map(sinTilde).findIndex(function (x) {
    return x.indexOf('INSTALACION') !== -1 || (x.indexOf('FECHA') !== -1 && x.indexOf('INST') !== -1);
  });
  Logger.log('Títulos: ' + v[0].map(limpiar).join(' | '));
  Logger.log('Fecha de instalación: ' + (iI >= 0 ? 'columna ' + (iI + 1) + ' (' + limpiar(v[0][iI]) + ')' : 'NO ENCONTRADA, se usa FECHA'));
  if ([iF, iA, iN, iE].indexOf(-1) !== -1) throw new Error('Faltan títulos en la fila 1. Veo: ' + H.join(' | '));
  const rows = [], nov = [], est = {}, sinc = {};
  let sinFecha = 0;
  for (let r = 1; r < v.length; r++) {
    const row = v[r], a = limpiar(row[iA]), c = limpiar(row[iN]), e = limpiar(row[iE]), k = clase(e);
    if (e) { est[e] = (est[e] || 0) + 1; if (!k && IGNORADOS.indexOf(e) === -1) sinc[e] = 1; }
    if (!k || !a || !c || a === 'LAZO') continue;
    const fi = iI >= 0 ? row[iI] : null;
    if (k === 'inst' && !(fi instanceof Date)) sinFecha++;
    const f = (k === 'inst' && fi instanceof Date) ? fi : row[iF];
    const item = {
      k: k, a: a, c: c, s: e, t: k === 'prog' ? e : '', d: iso(f),
      l: f instanceof Date ? Utilities.formatDate(f, 'America/Lima', 'dd/MM') : (limpiar(f).substring(0, 8) || 'SET')
    };
    rows.push(item);
    nov.push({ k: k, a: a, c: c, s: e, o: iO >= 0 && k === 'canc' ? motivo(row[iO]) : '' });
  }

  const prog = [];
  const shP = hoja(ss, ['PROGRAMADA'], true);
  if (shP) {
    const pv = shP.getDataRange().getValues();
    const PH = pv[1].map(limpiar);
    const pA = PH.indexOf('ASESOR'), pN = PH.indexOf('NOMBRE'), pE = PH.indexOf('ESTADO'), pF = PH.lastIndexOf('FECHA'), pT = PH.indexOf('TRAMO');
    if ([pA, pN, pE, pF, pT].indexOf(-1) !== -1) throw new Error('Faltan títulos en PROGRAMADA. Veo: ' + PH.join(' | '));
    for (let r = 2; r < pv.length; r++) {
      const row = pv[r], a = limpiar(row[pA]), c = limpiar(row[pN]), e = limpiar(row[pE]);
      if (['PROGRAMADA', 'EN PROGRESO', 'REPROGRAMADA'].indexOf(e) === -1 || !a || !c || a === 'LAZO') continue;
      const t = row[pT];
      prog.push({
        a: a, c: c, d: iso(row[pF]),
        t: t instanceof Date ? Utilities.formatDate(t, 'America/Lima', 'HH:mm') : String(t || '').trim()
      });
    }
  }

  const diag = {
    hoja: shI.getName(), filas: v.length - 1,
    titulos: { FECHA: iF >= 0, ASESOR: iA >= 0, NOMBRE: iN >= 0, ESTADO: iE >= 0, 'FECHA INSTALACION': iI >= 0 },
    estados: est, sinClasificar: Object.keys(sinc), instSinFecha: sinFecha,
    programada: { hoja: !!shP, filas: prog.length }
  };
  const res = UrlFetchApp.fetch(URL_API, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-key': KEY },
    payload: JSON.stringify({ rows: rows, prog: prog }),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
  const codigo = res.getResponseCode();
  try { diag.desconocidos = JSON.parse(res.getContentText()).unknown || []; } catch (e) {}

  try { avisar(prog); } catch (e) { Logger.log('avisos: ' + e); }
  try { novedades(nov, MESES[m]); } catch (e) { Logger.log('novedades: ' + e); }
  try { efectividad(shI, diag); } catch (e) { Logger.log('efectividad: ' + e); }
  try { ventasHoja(ss, m); } catch (e) { Logger.log('ventas: ' + e); }
  try { animo(); } catch (e) { Logger.log('animo: ' + e); }
  try { cierreDia(rows, prog); } catch (e) { Logger.log('cierre: ' + e); }
  if (codigo !== 200) throw new Error('La app respondió ' + codigo);
}

// ---------- Aviso de horario (1 hora antes del tramo) ----------
function tramo(t) {
  const m = String(t || '').toUpperCase().match(/(\d{1,2})\s*(AM|PM)\s*A\s*(\d{1,2})\s*(AM|PM)/);
  if (!m) return null;
  const h = function (n, ap) { n = Number(n) % 12; return ap === 'PM' ? n + 12 : n; };
  return { ini: h(m[1], m[2]), fin: h(m[3], m[4]), txt: m[1] + m[2] + ' A ' + m[3] + m[4] };
}

function avisar(prog) {
  const hoy = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  const ahora = Number(Utilities.formatDate(new Date(), 'America/Lima', 'H')) * 60 + Number(Utilities.formatDate(new Date(), 'America/Lima', 'm'));
  const props = PropertiesService.getScriptProperties();
  const enviados = JSON.parse(props.getProperty('AVISADOS') || '{}');
  Object.keys(enviados).forEach(function (k) { if (k.indexOf(hoy) !== 0) delete enviados[k]; });

  const grupos = {};
  prog.forEach(function (p) {
    if (p.d !== hoy) return;
    const t = tramo(p.t);
    if (!t) return;
    if (ahora < t.ini * 60 - 45 || ahora >= t.fin * 60) return;
    const k = hoy + '|' + p.a + '|' + p.c + '|' + t.txt;
    if (enviados[k]) return;
    const g = p.a + '|' + t.txt;
    grupos[g] = grupos[g] || { a: p.a, t: t.txt, c: [], k: [] };
    grupos[g].c.push(p.c);
    grupos[g].k.push(k);
  });
  const lista = Object.keys(grupos).map(function (g) { return grupos[g]; });
  if (!lista.length) { props.setProperty('AVISADOS', JSON.stringify(enviados)); return; }

  const res = UrlFetchApp.fetch(URL_NOTIFY, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-key': KEY },
    payload: JSON.stringify({ avisos: lista.map(function (g) { return { a: g.a, t: g.t, c: g.c }; }) }),
    muteHttpExceptions: true
  });
  Logger.log('avisos ' + res.getResponseCode() + ' ' + res.getContentText());
  if (res.getResponseCode() === 200) {
    const r = JSON.parse(res.getContentText()).avisos || [];
    lista.forEach(function (g) {
      const hecho = r.filter(function (x) { return x.a === g.a && x.t === g.t && x.sent > 0; }).length > 0;
      if (hecho) g.k.forEach(function (k) { enviados[k] = 1; });
    });
  }
  props.setProperty('AVISADOS', JSON.stringify(enviados));
}

// ---------- Aviso cuando una venta cambia de estado ----------
function hash8(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s).map(function (b) {
    return ('0' + (b & 255).toString(16)).slice(-2);
  }).join('').substring(0, 8);
}

const COD = { 'EN PROGRESO': 'P', 'REPROGRAMADA': 'R', 'CANCELADA': 'C', 'ANULADA': 'A', 'DESAPROBADA': 'D', 'NO PROCEDE': 'N', 'POSIBLE FRAUDE': 'F', 'PROGRAMADA': 'Q', 'GRABADO': 'G' };

function novedades(nov, mes) {
  const props = PropertiesService.getScriptProperties();
  const todas = props.getProperties();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('EST_') === 0 && k.indexOf('EST_' + mes + '_') !== 0) props.deleteProperty(k);
    if (k.indexOf('BASE_') === 0 && k !== 'BASE_' + mes) props.deleteProperty(k);
  });
  const base = props.getProperty('BASE_' + mes) === '1';
  const ant = {}, sig = {};
  HEX.forEach(function (x) {
    ant[x] = JSON.parse(props.getProperty('EST_' + mes + '_' + x) || '{}');
    sig[x] = JSON.parse(JSON.stringify(ant[x]));
  });

  const cambios = [], vistos = {};
  nov.forEach(function (r) {
    const code = r.k === 'inst' ? 'I' : COD[r.s];
    if (!code) return;
    const h = hash8(r.a + '|' + r.c);
    if (vistos[h]) return;
    vistos[h] = 1;
    const b = h.charAt(0), previo = ant[b][h];
    sig[b][h] = code;
    if (base && previo !== code && !(previo === undefined && ['P', 'G', 'Q'].indexOf(code) !== -1)) {
      cambios.push({ a: r.a, c: r.c, s: r.s, k: code, o: r.o });
    }
  });

  let confirmar = true;
  if (cambios.length > 25) {
    Logger.log('novedades: ' + cambios.length + ' cambios juntos, se omiten los avisos');
  } else if (cambios.length) {
    const msgs = armarMsgs(cambios);
    const res = UrlFetchApp.fetch(URL_NOTIFY, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-ingest-key': KEY },
      payload: JSON.stringify({ msgs: msgs, staff: resumenStaff(cambios) }),
      muteHttpExceptions: true
    });
    Logger.log('novedades ' + res.getResponseCode() + ' ' + res.getContentText());
    confirmar = res.getResponseCode() === 200;
  }
  if (!confirmar) return;

  const out = { ['BASE_' + mes]: '1' };
  HEX.forEach(function (x) { out['EST_' + mes + '_' + x] = JSON.stringify(sig[x]); });
  props.setProperties(out);
}

function resumenStaff(c) {
  const tag = { I: 'instalada', R: 'reprogramada', C: 'cancelada', A: 'anulada', D: 'desaprobada', N: 'no procede', P: 'en proceso', F: 'posible fraude', Q: 'programada', G: 'grabada' };
  let body = c.slice(0, 5).map(function (x) { return x.a + ': ' + (tag[x.k] || x.s.toLowerCase()) + ' ' + x.c; }).join(' · ') +
    (c.length > 5 ? ' · y ' + (c.length - 5) + ' más' : '');
  if (body.length > 230) body = body.substring(0, 227) + '...';
  return { title: c.length + (c.length === 1 ? ' novedad' : ' novedades') + ' en ventas', body: body };
}

function armarMsgs(cambios) {
  const por = {};
  cambios.forEach(function (x) { (por[x.a] = por[x.a] || []).push(x); });
  return Object.keys(por).map(function (a) {
    const L = por[a];
    const ins = L.filter(function (x) { return x.k === 'I'; });
    const partes = [];
    if (ins.length === 1) partes.push('¡Se instaló la venta de ' + ins[0].c + '! 🎉');
    else if (ins.length > 1) partes.push('¡Se instalaron ' + ins.length + ' ventas: ' + ins.map(function (x) { return x.c; }).join(', ') + '! 🎉');
    L.filter(function (x) { return x.k !== 'I'; }).forEach(function (x) {
      if (x.k === 'R') partes.push('La instalación de ' + x.c + ' fue reprogramada. Revisa el nuevo horario en la app.');
      else if (x.k === 'Q') partes.push('¡Se programó la instalación de ' + x.c + '! 📅 Revisa el horario en la app.');
      else if (x.k === 'G') return;
      else if (x.k === 'P') partes.push('Tienes una nueva instalación en proceso: ' + x.c + '.');
      else partes.push(x.c + ' pasó a ' + x.s + (x.o ? ' · Motivo: ' + x.o : '') + '. Si puedes recuperarla, coméntalo con tu supervisor 💪');
    });
    let body = partes.join(' ');
    if (body.length > 230) body = body.substring(0, 227) + '...';
    return body ? { a: a, title: L.length > 1 ? 'Novedades de tus ventas' : 'Novedad de tu venta', body: body } : null;
  }).filter(Boolean);
}

// Efectividad del Back Office: rango I1:J8 (estado y porcentaje)
function efectividad(sh, diag) {
  const v = sh.getDataRange().getValues(), H = v[0].map(limpiar), eff = [];
  let fuente = 'ninguna';
  const c = H.findIndex(function (x) { return x.indexOf('COUNTA') === 0; });
  if (c > 0) {
    // Tabla dinámica con conteos (ESTADO | COUNTA DE ESTADO): el programa calcula los porcentajes
    const lista = [];
    for (let i = 1; i < v.length; i++) {
      const k = limpiar(v[i][c - 1]);
      if (!k) { if (lista.length) break; else continue; }
      if (k.indexOf('TOTAL') !== -1) break;
      const n = Number(v[i][c]);
      if (isNaN(n)) continue;
      lista.push({ k: k, n: n });
    }
    const tot = lista.reduce(function (s, x) { return s + x.n; }, 0);
    if (tot > 0) { lista.forEach(function (x) { eff.push({ k: x.k, p: Math.round(x.n / tot * 10000) / 100 }); }); fuente = 'conteos'; }
  } else {
    // Cuadro con porcentajes en I1:J20
    const r = sh.getRange('I1:J20').getValues();
    for (let i = 0; i < r.length; i++) {
      const k = limpiar(r[i][0]);
      if (!k) continue;
      if (k.indexOf('TOTAL') !== -1) break;
      let p = r[i][1];
      if (typeof p === 'string') p = parseFloat(p.replace('%', '').replace(',', '.'));
      else if (typeof p === 'number' && p <= 1) p = p * 100;
      if (typeof p !== 'number' || isNaN(p)) continue;
      eff.push({ k: k, p: Math.round(p * 100) / 100 });
    }
    if (eff.length) fuente = 'porcentajes';
  }
  const suma = Math.round(eff.reduce(function (s, x) { return s + x.p; }, 0) * 100) / 100;
  diag.efectividad = { fuente: fuente, filas: eff.length, suma: suma };
  const texto = eff.map(function (x) { return x.k + ' ' + x.p; }).join(' | ');
  eff.push({ k: '__DIAG__', p: 0, d: diag });   // revisión de la hoja, la app la muestra en Ayuda
  const res = UrlFetchApp.fetch(URL_EFF, {
    method: 'post', contentType: 'application/json', headers: { 'x-ingest-key': KEY },
    payload: JSON.stringify({ eff: eff }), muteHttpExceptions: true
  });
  Logger.log('efectividad ' + res.getResponseCode() + ' (' + fuente + ') ' + texto);
}

// ---------- Resumen del día para el JEFE y el supervisor (8:00 a 8:30 p. m., lunes a sábado) ----------
function cierreDia(rows, prog) {
  const f = function (p) { return Utilities.formatDate(new Date(), 'America/Lima', p); };
  const hoy = f('yyyy-MM-dd'), min = Number(f('H')) * 60 + Number(f('m'));
  const props = PropertiesService.getScriptProperties();
  if (f('u') === '7' || min < 1200 || min >= 1230 || props.getProperty('CIERRE') === hoy) return;
  const inst = rows.filter(function (r) { return r.k === 'inst'; });
  const hoyN = inst.filter(function (r) { return r.d === hoy; }).length;
  const body = 'Hoy: ' + hoyN + ' instaladas · En camino: ' + prog.length + ' · Mes: ' + inst.length + ' instaladas';
  const res = UrlFetchApp.fetch(URL_NOTIFY, {
    method: 'post', contentType: 'application/json', headers: { 'x-ingest-key': KEY },
    payload: JSON.stringify({ staff: { title: 'Cierre del día', body: body } }), muteHttpExceptions: true
  });
  Logger.log('cierre ' + res.getResponseCode() + ' ' + res.getContentText());
  if (res.getResponseCode() === 200) props.setProperty('CIERRE', hoy);
}

function num(x) {
  if (typeof x === 'number') return x;
  const s = String(x || '').replace(/[^0-9.,]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function distrito(x) {
  const s = sinTilde(x).replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return ALIAS_DISTRITOS[s] || s;
}

// Planes, distritos y recibos: pestaña INSTALADAS del mes (títulos en la fila 2). El DOC se envía enmascarado.
function ventasHoja(ss, m) {
  const sh = hoja(ss, ['INSTALADAS ' + ABR[m]], true);
  if (!sh) { Logger.log('ventas: no encuentro la pestaña INSTALADAS ' + ABR[m]); return; }
  const v = sh.getDataRange().getValues(), H = v[1].map(limpiar);
  const ix = function (t) { return H.indexOf(t); };
  const iA = ix('ASESOR'), iD = ix('DOC'), iE = ix('ESTADO'), iP = ix('PLAN'), iR = ix('PRECIO'), iS = ix('DISTRITO'), iC = ix('RECIBO');
  if ([iA, iP, iS, iC].indexOf(-1) !== -1) { Logger.log('ventas: faltan títulos. Veo: ' + H.join(' | ')); return; }
  const out = [];
  for (let r = 2; r < v.length; r++) {
    const row = v[r], a = limpiar(row[iA]);
    if (!a || a === 'LAZO') continue;
    if (iE >= 0 && limpiar(row[iE]).indexOf('INSTALAD') === -1) continue;
    const d = iD >= 0 ? String(row[iD] || '').replace(/\D/g, '') : '';
    out.push({
      a: a, doc: d.length >= 4 ? '***' + d.slice(-4) : '', p: limpiar(row[iP]),
      pr: iR >= 0 ? num(row[iR]) : 0, d: distrito(row[iS]), r: num(row[iC])
    });
  }
  if (!out.length) { Logger.log('ventas: sin filas'); return; }
  const res = UrlFetchApp.fetch(URL_EFF, {
    method: 'post', contentType: 'application/json', headers: { 'x-ingest-key': KEY },
    payload: JSON.stringify({ ventas: out }), muteHttpExceptions: true
  });
  Logger.log('ventas ' + res.getResponseCode() + ' ' + res.getContentText());
}

function corrida() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    PropertiesService.getScriptProperties().setProperty('ULT', String(Date.now()));
    sync();
  } catch (e) {
    fallar(e);
  } finally {
    lock.releaseLock();
  }
}

// Avisa al supervisor y al jefe cuando la sincronización falla (una vez por tipo de error y día)
function fallar(e) {
  Logger.log('FALLÓ: ' + e);
  const props = PropertiesService.getScriptProperties();
  const msg = String(e && e.message ? e.message : e).substring(0, 110);
  const clave = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd') + '|' + msg;
  if (props.getProperty('FALLA') === clave) return;
  try {
    UrlFetchApp.fetch(URL_NOTIFY, {
      method: 'post', contentType: 'application/json', headers: { 'x-ingest-key': KEY },
      payload: JSON.stringify({ staff: { title: '⚠ Falló la sincronización', body: msg + ' · Revisa tu hoja de Google.' } }),
      muteHttpExceptions: true
    });
  } catch (x) { Logger.log('no se pudo avisar: ' + x); }
  props.setProperty('FALLA', clave);
}

// Se ejecuta cuando alguien edita la hoja; como máximo una vez por minuto
function alEditar() {
  const ult = Number(PropertiesService.getScriptProperties().getProperty('ULT') || 0);
  if (Date.now() - ult < 60000) return;
  corrida();
}

// ---------- Mensaje de ánimo de la mañana (9:00 a 9:30, lunes a sábado) ----------
const ANIMO = [
  '{n}, hoy empieza una nueva oportunidad de sumar. ¡Vamos con todo! 💪',
  '¡Buen día, {n}! Cada llamada te acerca a una instalada más 🚀',
  'Hoy puede ser tu mejor día del mes, {n}. ¡A brillar! ✨',
  '{n}, revisa tus programadas de hoy y cierra con éxito 🎯',
  '¡Arriba ese ánimo, {n}! Las ganas hacen la diferencia 🔥',
  'Un día más para acercarte a tu meta, {n}. ¡Tú puedes! 🙌',
  '{n}, sonríe al teléfono: se nota y vende 😄',
  'Hoy suma una más que ayer, {n}. ¡Paso a paso! 👣',
  '¡Feliz día, {n}! Tu constancia es tu mejor herramienta ⚡',
  '{n}, tu bono de la semana se construye hoy 💰',
  'Empieza con energía, {n}: el primer contacto del día marca el ritmo 📞',
  '¡Vamos equipo! {n}, hoy le ponemos todo ✊',
  '{n}, confía en tu trabajo: los resultados llegan 🌟',
  'Mira tu avance en la app, {n}, y ponte un reto para hoy 🎯',
  '¡Buen día, {n}! Un cliente contento te lleva al siguiente 🤝',
  'Hoy es un gran día para cerrar ventas, {n} 💪',
  '{n}, cada instalada es un logro. ¡Celébralas! 🎉',
  '¡A darle, {n}! La meta del mes se gana día a día 📅',
  '{n}, hoy tienes todo para sorprender: actitud y ganas 🔥',
  'Respira, enfócate y a sumar, {n} 🚀',
  '¡Qué empiece el día, {n}! Tu esfuerzo siempre cuenta 🙌',
  '{n}, recuerda tus programadas: contacta a tus clientes y confírmalos 📲',
  'Hoy puede llegar esa venta que te sube de tramo, {n} 🏆',
  '¡Buen día, {n}! Pequeñas acciones, grandes resultados ✨',
  '{n}, el equipo cuenta contigo. ¡A por un gran día! 💫',
  'Tú pones las ganas, nosotros los aplausos, {n} 👏',
  '¡Vamos con fuerza, {n}! Hoy sumamos otra 💥',
  '{n}, empieza tu día con una meta clara: ¿cuántas hoy? 🎯',
  'Cada día es una nueva oportunidad de lograrlo, {n} 🌅',
  '¡Arriba, {n}! Lo mejor del mes aún está por venir 🚀',
  '{n}, empieza fuerte y cierra el día con orgullo 💪'
];

function animo() {
  const f = function (p) { return Utilities.formatDate(new Date(), 'America/Lima', p); };
  const hoy = f('yyyy-MM-dd'), min = Number(f('H')) * 60 + Number(f('m'));
  const props = PropertiesService.getScriptProperties();
  if (f('u') === '7' || min < 540 || min >= 570 || props.getProperty('ANIMO') === hoy) return;
  const res = UrlFetchApp.fetch(URL_NOTIFY, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-key': KEY },
    payload: JSON.stringify({ bc: { title: 'Buenos días ☀️', body: ANIMO[(Number(f('d')) - 1) % ANIMO.length] } }),
    muteHttpExceptions: true
  });
  Logger.log('animo ' + res.getResponseCode() + ' ' + res.getContentText());
  if (res.getResponseCode() === 200) props.setProperty('ANIMO', hoy);
}

function crearActivador() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('corrida').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('alEditar').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  Logger.log('Activadores creados: cada 5 minutos y al editar la hoja');
}
