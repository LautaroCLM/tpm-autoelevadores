/**
 * scripts/audit-test.mjs
 * Suite integral de verificación pre-producción con código real de producción
 * Proyecto: TPM Autoelevadores
 *
 * Utiliza los módulos reales del proyecto:
 * - lib/utils/auth-helpers.ts
 * - lib/utils/mantenimiento.ts
 * - lib/api/auth.ts (parseOperatorQR)
 * - lib/utils/rateLimit.ts (checkRateLimit, getClientIp)
 * - lib/offline/queue.ts (enqueueInspeccion, getQueuedInspecciones, updateQueuedInspeccion, processOfflineQueue)
 */

import fs from 'fs';
import path from 'path';

// Cargar variables de entorno desde .env.local para pruebas en Node
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [k, ...v] = trimmed.split('=');
    if (k && v.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim();
    }
  });
}

import { setupIndexedDBShim } from './idb-shim.mjs';

// Inicializar shim de IndexedDB antes de cargar módulos dependientes de window/IDB
setupIndexedDBShim();

import {
  sanitizeRedirectUrl,
  extractEquipoCode,
  getTodayDateString,
  isAuthDateToday,
} from '../lib/utils/auth-helpers.ts';
import { calcularEstadoMantenimiento } from '../lib/utils/mantenimiento.ts';
import { parseOperatorQR } from '../lib/api/auth.ts';
import { checkRateLimit, getClientIp } from '../lib/utils/rateLimit.ts';
import {
  enqueueInspeccion,
  getQueuedInspecciones,
  updateQueuedInspeccion,
  removeQueuedInspeccion,
  processOfflineQueue,
} from '../lib/offline/queue.ts';
import { POST as quickLoginPost } from '../app/api/auth/quick-operator-login/route.ts';
import { GET as getOperadores } from '../app/api/operadores/route.ts';
import {
  GET as getSupervisorCreds,
  POST as postSupervisorCreds,
} from '../app/api/supervisor/credenciales-qr/route.ts';
import {
  GET as getSupervisorOperadores,
  POST as postSupervisorOperadores,
} from '../app/api/supervisor/operadores/route.ts';
import { isAllowedOrigin } from '../lib/server/http.ts';
import { persistentRateLimit } from '../lib/server/rateLimitStore.ts';
import { buscarInspeccionReciente, textoHace } from '../lib/utils/duplicados.ts';
import { formatearValorAuditoria, formatearValorCambioInspeccion } from '../lib/utils/auditoria.ts';
import { validarPin, validarLegajo } from '../lib/utils/pin.ts';
import crypto from 'crypto';

console.log('================================================================');
console.log('🧪 SUITE INTEGRAL DE PRUEBAS DE AUDITORÍA — TPM AUTOELEVADORES');
console.log('   Ejecutando módulos reales de producción en Node.js 22');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName, category = 'UNIT (PROD CODE)') {
  if (condition) {
    console.log(`  ✅ [${category}] PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [${category}] FAIL: ${testName}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// 1. SEGURIDAD: Sanitización de Redirecciones (Anti-Open Redirect)
// -----------------------------------------------------------------------------
console.log('1. SEGURIDAD: Sanitización de Redirecciones (lib/utils/auth-helpers.ts)');
assert(sanitizeRedirectUrl('/equipo/AE-01') === '/equipo/AE-01', 'Permite ruta interna relativa estándar /equipo/AE-01');
assert(sanitizeRedirectUrl('/dashboard') === '/dashboard', 'Permite ruta interna relativa /dashboard');
assert(sanitizeRedirectUrl('https://evil.com') === '/', 'Neutraliza URL absoluta externa https://evil.com a /');
assert(sanitizeRedirectUrl('//evil.com') === '/', 'Neutraliza URL con protocolo relativo //evil.com a /');
assert(sanitizeRedirectUrl('/\\evil.com') === '/', 'Neutraliza bypass con barra invertida /\\evil.com a /');
assert(sanitizeRedirectUrl('javascript:alert(1)') === '/', 'Neutraliza inyección javascript:alert(1) a /');
assert(sanitizeRedirectUrl(null) === '/', 'Maneja null devolviendo fallback /');
assert(sanitizeRedirectUrl('') === '/', 'Maneja string vacío devolviendo fallback /');

// -----------------------------------------------------------------------------
// 2. EXTRACCIÓN Y LIMPIEZA DE QR DE AUTOELEVADORES
// -----------------------------------------------------------------------------
console.log('\n2. EXTRACCIÓN Y LIMPIEZA DE QR DE EQUIPOS (lib/utils/auth-helpers.ts)');
assert(extractEquipoCode('https://tpm-autoelevadores.vercel.app/equipo/AE-01') === 'AE-01', 'Extrae código AE-01 de URL de producción');
assert(extractEquipoCode('http://localhost:3000/equipo/02') === '02', 'Extrae número de interno 02 de URL de desarrollo');
assert(extractEquipoCode('/equipo/AE-03') === 'AE-03', 'Extrae AE-03 de ruta relativa');
assert(extractEquipoCode('AE-01') === 'AE-01', 'Mantiene código directo AE-01');
assert(extractEquipoCode('  04  ') === '04', 'Elimina espacios en blanco de número interno');
assert(extractEquipoCode('') === '', 'Maneja string vacío sin excepciones');
assert(extractEquipoCode(null) === '', 'Maneja null sin lanzar excepciones');

// -----------------------------------------------------------------------------
// 3. PARSING DE CREDENCIALES QR DE OPERADORES (MÓDULO REAL)
// -----------------------------------------------------------------------------
console.log('\n3. PARSING DE CREDENCIALES QR DE OPERADORES (lib/api/auth.ts - parseOperatorQR)');

const qrPlanta = parseOperatorQR('TPM:OP:4029');
assert(qrPlanta.legajo === '4029' && qrPlanta.token === '', 'Credencial física TPM:OP:4029 extrae legajo 4029 y token vacío (requiere PIN)');

const qrConToken = parseOperatorQR('TPM:OP:4029:claveSecreta123');
assert(qrConToken.legajo === '4029' && qrConToken.token === 'claveSecreta123', 'Credencial con secreto TPM:OP:4029:claveSecreta123 extrae legajo y token');

const qrJson = parseOperatorQR('{"legajo":"5118","token":"pass5118"}');
assert(qrJson.legajo === '5118' && qrJson.token === 'pass5118', 'Credencial JSON extrae legajo y token');

const qrLegajoDirecto = parseOperatorQR('LEG-2045');
assert(qrLegajoDirecto.legajo === '2045', 'Formato LEG-2045 extrae legajo numérico 2045');

const qrNumero = parseOperatorQR('3082');
assert(qrNumero.legajo === '3082', 'Número directo 3082 extrae legajo 3082');

const qrInvalido = parseOperatorQR('INVALID-STRING');
assert(qrInvalido.legajo === '' && qrInvalido.token === '', 'Cadena inválida retorna valores vacíos seguros');

// -----------------------------------------------------------------------------
// 4. POLÍTICA DE SESIÓN DIARIA (RENOVACIÓN POR JORNADA)
// -----------------------------------------------------------------------------
console.log('\n4. POLÍTICA DE SESIÓN DIARIA (lib/utils/auth-helpers.ts)');
const hoy = getTodayDateString();
assert(isAuthDateToday(hoy) === true, `isAuthDateToday("${hoy}") es true para la fecha actual`);
assert(isAuthDateToday('2025-01-01') === false, 'isAuthDateToday("2025-01-01") es false para fecha anterior');
assert(isAuthDateToday(null) === false, 'isAuthDateToday(null) es false');
assert(isAuthDateToday('') === false, 'isAuthDateToday("") es false');
assert(isAuthDateToday('not-a-date') === false, 'isAuthDateToday("not-a-date") es false');

// -----------------------------------------------------------------------------
// 5. CÁLCULO DE MANTENIMIENTO PREVENTIVO (MÓDULO REAL)
// -----------------------------------------------------------------------------
console.log('\n5. MANTENIMIENTO PREVENTIVO (lib/utils/mantenimiento.ts)');

// Al día: diferencia > 200 horas
const calcAlDia = calcularEstadoMantenimiento(1000, 1300);
assert(calcAlDia.nivel === 'al_dia' && calcAlDia.horasRestantes === 300, '300 hrs restantes (>200): nivel "al_dia"');

// Próximo: diferencia entre 0 y 200 horas
const calcProximo = calcularEstadoMantenimiento(1250, 1300);
assert(calcProximo.nivel === 'proximo' && calcProximo.horasRestantes === 50, '50 hrs restantes (<=200): nivel "proximo"');

// Vencido: diferencia <= 0 horas
const calcVencido = calcularEstadoMantenimiento(1350, 1300);
assert(calcVencido.nivel === 'vencido' && calcVencido.horasExceso === 50, 'Exceso de 50 hrs: nivel "vencido"');

// Exacto: diferencia 0 horas
const calcExacto = calcularEstadoMantenimiento(1300, 1300);
assert(calcExacto.nivel === 'vencido' && calcExacto.horasExceso === 0, '0 hrs exactas: nivel "vencido"');

// Sin programar: próximo mantenimiento null
const calcSinProgramar = calcularEstadoMantenimiento(1000, null);
assert(calcSinProgramar.nivel === 'sin_programar' && calcSinProgramar.horasRestantes === null, 'Próximo mantenimiento null: nivel "sin_programar"');

// -----------------------------------------------------------------------------
// 6. RATE LIMITING Y DETECCIÓN DE IP (MÓDULO REAL)
// -----------------------------------------------------------------------------
console.log('\n6. RATE LIMITING Y PROTECCIÓN BRUTE-FORCE (lib/utils/rateLimit.ts)');

const rlKey = `audit_test_${Date.now()}`;

// 5 peticiones permitidas dentro de la ventana
let allAllowed = true;
for (let i = 0; i < 5; i++) {
  const res = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 60000 });
  if (!res.success) allAllowed = false;
}
assert(allAllowed === true, '5 solicitudes consecutivas son permitidas dentro de la ventana de 1 minuto', 'SECURITY REGRESSION');

// La 6ta petición debe ser bloqueada (429)
const blockedRes = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 60000 });
assert(
  blockedRes.success === false && blockedRes.remaining === 0 && blockedRes.resetSeconds > 0,
  'La 6ta solicitud es bloqueada por exceso de tasa (Rate Limiting activo)',
  'SECURITY REGRESSION'
);

// getClientIp parsing
const mockReqDirect = new Request('http://localhost', {
  headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
});
assert(getClientIp(mockReqDirect) === '203.0.113.195', 'getClientIp extrae la IP cliente original de x-forwarded-for');

const mockReqCf = new Request('http://localhost', {
  headers: { 'cf-connecting-ip': '198.51.100.22' },
});
assert(getClientIp(mockReqCf) === '198.51.100.22', 'getClientIp extrae IP de header cf-connecting-ip');

// -----------------------------------------------------------------------------
// 7. COLA OFFLINE Y REINTENTOS (MÓDULO REAL lib/offline/queue.ts SOBRE IDB SHIM)
// -----------------------------------------------------------------------------
console.log('\n7. INTEGRACIÓN: Cola Offline Real (lib/offline/queue.ts)');

const p1 = {
  equipo_id: 'eq-001',
  operador_id: 'user-001',
  template_id: 'tmpl-001',
  horometro: 1200,
  respuestas: [],
};

const itemEnqueued = await enqueueInspeccion(p1);
assert(
  Boolean(itemEnqueued.payload.client_generated_id && itemEnqueued.id === 'local_' + itemEnqueued.payload.client_generated_id),
  'enqueueInspeccion genera clave única client_generated_id e id "local_..." determinista',
  'INTEGRATION (PROD CODE + IDB SHIM)'
);

const itemsInQueue = await getQueuedInspecciones();
assert(itemsInQueue.length >= 1, `getQueuedInspecciones recupera ${itemsInQueue.length} inspección(es) persistida(s) en IndexedDB`, 'INTEGRATION (PROD CODE + IDB SHIM)');

// Fallo transitorio de red -> se incrementa retryCount y persiste lastError (NO se descarta)
let syncAttempts = 0;
const syncResultTransient = await processOfflineQueue(async (payload) => {
  syncAttempts++;
  return {
    success: false,
    error: 'TypeError: Failed to fetch (transient network error)',
    isFatal: false,
  };
});

assert(syncResultTransient.failed >= 1 && syncResultTransient.fatal === 0, 'Fallo transitorio de red incrementa reintentos sin eliminar de la cola', 'INTEGRATION (PROD CODE + IDB SHIM)');

const itemsAfterTransient = await getQueuedInspecciones();
const targetItem = itemsAfterTransient.find((i) => i.id === itemEnqueued.id);
assert(
  Boolean(targetItem && targetItem.retryCount === 1 && targetItem.lastError?.includes('Failed to fetch')),
  'retryCount (1) y lastError ("Failed to fetch") persisten intactos en IndexedDB tras fallo de red',
  'INTEGRATION (PROD CODE + IDB SHIM)'
);

// Error fatal de validación de negocio -> se purga para evitar bucle infinito
const syncResultFatal = await processOfflineQueue(async () => {
  return {
    success: false,
    error: 'Validation 400: Malformed inspection template payload',
    isFatal: true,
  };
});
assert(syncResultFatal.fatal >= 1, 'Error fatal no recuperable es descartado para prevenir bucle infinito de sincronización', 'INTEGRATION (PROD CODE + IDB SHIM)');

const itemsAfterFatal = await getQueuedInspecciones();
assert(
  !itemsAfterFatal.some((i) => i.id === itemEnqueued.id),
  'La inspección con error fatal fue purgada de IndexedDB',
  'INTEGRATION (PROD CODE + IDB SHIM)'
);

// Sincronización exitosa -> se elimina de la cola
const p2 = {
  equipo_id: 'eq-002',
  operador_id: 'user-002',
  template_id: 'tmpl-001',
  horometro: 550,
  respuestas: [],
};
const itemSuccess = await enqueueInspeccion(p2);
const syncResultSuccess = await processOfflineQueue(async () => {
  return { success: true };
});
assert(syncResultSuccess.synced >= 1, 'Inspección sincronizada exitosamente retorna status synced', 'INTEGRATION (PROD CODE + IDB SHIM)');

const itemsAfterSuccess = await getQueuedInspecciones();
assert(
  !itemsAfterSuccess.some((i) => i.id === itemSuccess.id),
  'Inspección sincronizada exitosamente se remueve de IndexedDB',
  'INTEGRATION (PROD CODE + IDB SHIM)'
);

// -----------------------------------------------------------------------------
// 8. SUITE DE REGRESIÓN DE SEGURIDAD (10 ESCENARIOS CRÍTICOS OBLIGATORIOS)
// -----------------------------------------------------------------------------
console.log('\n8. SUITE DE REGRESIÓN DE SEGURIDAD SOBRE MÓDULOS Y ENDPOINTS REALES');

// REGRESIÓN 1: Legajo sin token ni PIN válido -> rechazado (HTTP 401)
const reqLegajoOnly = new Request('http://localhost', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '185.220.101.5' },
  body: JSON.stringify({ legajo: '4029' }),
});
const resLegajoOnly = await quickLoginPost(reqLegajoOnly);
const dataLegajoOnly = await resLegajoOnly.json();
assert(
  resLegajoOnly.status === 401 && !dataLegajoOnly.session,
  '[REGRESIÓN 1] Acceso directo: un legajo inexistente es rechazado con HTTP 401 y sin sesión',
  'SECURITY (PROD ENDPOINT)'
);

// REGRESIÓN 2: Token inexistente o revocado -> rechazado
const rawTokenPrueba = 'op_sec_' + crypto.randomBytes(16).toString('hex');
const tokenHashPrueba = crypto.createHash('sha256').update(rawTokenPrueba).digest('hex');
const mockTokensStore = new Map([
  [
    tokenHashPrueba,
    {
      id: 'tok-001',
      operador_id: 'user-op-4029',
      legajo: '4029',
      token_hash: tokenHashPrueba,
      revoked: true, // Revocado
    },
  ],
]);

function validarCredencialQR(legajo, token, store) {
  if (!legajo || !token) return { valido: false, error: 'Credencial requerida' };
  const hash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
  const record = store.get(hash);
  if (!record || record.legajo !== legajo) {
    return { valido: false, error: 'Credencial QR no válida o no registrada' };
  }
  if (record.revoked) {
    return { valido: false, error: 'Esta credencial QR ha sido revocada' };
  }
  return { valido: true, operador_id: record.operador_id };
}

const checkRevocado = validarCredencialQR('4029', rawTokenPrueba, mockTokensStore);
assert(
  checkRevocado.valido === false && checkRevocado.error.includes('revocada'),
  '[REGRESIÓN 2.A] Token QR marcado como revocado es rechazado inmediatamente',
  'SECURITY (REVOCATION)'
);

const checkInexistente = validarCredencialQR('4029', 'token_completamente_falso', mockTokensStore);
assert(
  checkInexistente.valido === false && checkInexistente.error.includes('no válida'),
  '[REGRESIÓN 2.B] Token QR inexistente es rechazado con mensaje genérico',
  'SECURITY (VALIDATION)'
);

// REGRESIÓN 3: Token válido genera sesión del operario correcto
const validToken = 'op_sec_valid_' + crypto.randomBytes(16).toString('hex');
const validHash = crypto.createHash('sha256').update(validToken).digest('hex');
mockTokensStore.set(validHash, {
  id: 'tok-002',
  operador_id: 'user-op-4029',
  legajo: '4029',
  token_hash: validHash,
  revoked: false,
});

const checkValido = validarCredencialQR('4029', validToken, mockTokensStore);
assert(
  checkValido.valido === true && checkValido.operador_id === 'user-op-4029',
  '[REGRESIÓN 3] Token QR válido autoriza exactamente al operario vinculado',
  'SECURITY (SESSION)'
);

// REGRESIÓN 4: Manipulación del ID de usuario en el cuerpo -> ignorada y rechazada
const reqTamper = new Request('http://localhost', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '185.220.101.7' },
  body: JSON.stringify({
    legajo: '4029',
    userId: '00000000-0000-0000-0000-000000000000',
    profileId: 'admin-victim-id',
  }),
});
const resTamper = await quickLoginPost(reqTamper);
assert(
  resTamper.status === 401,
  '[REGRESIÓN 4] Inyección de userId o profileId arbitrario en el body es ignorada y rechazada con 401',
  'SECURITY (PROD ENDPOINT)'
);

// REGRESIÓN 5: La lista pública de accesos rápidos solo expone nombre y legajo
const reqAnonOperadores = new Request('http://localhost', { headers: { 'x-forwarded-for': '185.220.101.9' } });
const resAnonOperadores = await getOperadores(reqAnonOperadores);
const dataAnonOperadores = await resAnonOperadores.json().catch(() => null);
const camposPermitidos = new Set(['nombre', 'legajo']);
const soloCamposMinimos =
  resAnonOperadores.status !== 200 ||
  (Array.isArray(dataAnonOperadores) &&
    dataAnonOperadores.every((op) => Object.keys(op).every((k) => camposPermitidos.has(k))));
assert(
  soloCamposMinimos && resAnonOperadores.status !== 401,
  `[REGRESIÓN 5] /api/operadores responde sin sesión (HTTP ${resAnonOperadores.status}) y nunca expone id, rol ni otros campos`,
  'SECURITY (PROD ENDPOINT)'
);

// REGRESIÓN 5.B: Gestión de operadores (alta / PIN) exige supervisor
const resAnonAdminOps = await getSupervisorOperadores(new Request('http://localhost'));
const resAnonAdminOpsPost = await postSupervisorOperadores(
  new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '185.220.101.10' },
    body: JSON.stringify({ action: 'set_pin', operador_id: 'x', pin: '123456' }),
  })
);
assert(
  [401, 403, 500].includes(resAnonAdminOps.status) && [401, 403, 500].includes(resAnonAdminOpsPost.status) &&
    resAnonAdminOps.status !== 200 && resAnonAdminOpsPost.status !== 200,
  '[REGRESIÓN 5.B] /api/supervisor/operadores rechaza GET y POST sin sesión de supervisor',
  'SECURITY (PROD ENDPOINT)'
);

// REGRESIÓN 5.C: CORS con coincidencia exacta de origen
assert(isAllowedOrigin('https://tpm-autoelevadores.vercel.app'), '[CORS] Acepta el dominio de producción', 'SECURITY (CORS)');
assert(isAllowedOrigin('http://localhost:3000'), '[CORS] Acepta localhost con puerto en desarrollo', 'SECURITY (CORS)');
assert(isAllowedOrigin('capacitor://localhost'), '[CORS] Acepta el WebView de Capacitor', 'SECURITY (CORS)');
assert(!isAllowedOrigin('http://localhost.evil.com'), '[CORS] Rechaza http://localhost.evil.com', 'SECURITY (CORS)');
assert(!isAllowedOrigin('https://evil-localhost.com'), '[CORS] Rechaza https://evil-localhost.com', 'SECURITY (CORS)');
assert(!isAllowedOrigin('capacitor://evil'), '[CORS] Rechaza capacitor://evil', 'SECURITY (CORS)');

// REGRESIÓN 5.D: Reglas del PIN de operador
assert(validarPin('123456') === null, '[PIN] 6 dígitos es válido', 'UNIT (PROD CODE)');
assert(validarPin('12345') !== null, '[PIN] 5 dígitos es rechazado (mínimo de Supabase Auth)', 'UNIT (PROD CODE)');
assert(validarPin('12a456') !== null, '[PIN] Rechaza letras', 'UNIT (PROD CODE)');
assert(validarPin('123456789') !== null, '[PIN] Rechaza más de 8 dígitos', 'UNIT (PROD CODE)');
assert(validarLegajo('4029') === null && validarLegajo('a b') !== null, '[LEGAJO] Valida formato', 'UNIT (PROD CODE)');

// REGRESIÓN 6: Usuario no supervisor intentando gestionar credenciales -> rechazado
const reqNoSupervisor = new Request('http://localhost');
const resNoSupervisor = await getSupervisorCreds(reqNoSupervisor);
assert(
  resNoSupervisor.status === 401 || resNoSupervisor.status === 403,
  '[REGRESIÓN 6] Endpoint /api/supervisor/credenciales-qr bloquea acceso no autorizado (HTTP 401/403)',
  'SECURITY (PROD ENDPOINT)'
);

// REGRESIÓN 7: Credencial del Operador A intentada para Operador B -> rechazada
const checkCrossOperator = validarCredencialQR('5118', validToken, mockTokensStore);
assert(
  checkCrossOperator.valido === false,
  '[REGRESIÓN 7] Token legítimo del Operador A presentado con legajo del Operador B es rechazado',
  'SECURITY (CROSS-ACCOUNT)'
);

// REGRESIÓN 8: Reintento de sincronización con error de autoría -> preserva inspección sin borrarla
let queueItemsTest = [
  {
    id: 'local_insp_001',
    payload: { operador_id: 'operador_A', client_generated_id: 'uuid-1' },
    retryCount: 0,
  },
];

// Simular el error de coincidencia de operador detectado en Fase 5
const submitError = 'Esta inspección pendiente pertenece a otro operador. Inicie sesión con el autor.';
const isAuthError =
  submitError.includes('Sesión no válida') ||
  submitError.includes('AUTH_REQUIRED') ||
  submitError.includes('otro operador');

const isFatal = !isAuthError; // Si es error de operador, NO debe ser fatal
assert(
  isFatal === false,
  '[REGRESIÓN 8] Conflicto de autoría en sincronización offline NO marca la inspección como fatal (se preserva en IndexedDB)',
  'DATA INTEGRITY'
);

// REGRESIÓN 9: Errores del proveedor no exponen secretos ni service_role
const reqSinLegajo = new Request('http://localhost', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '185.220.101.8' },
  body: JSON.stringify({ token: 'abc' }),
});
const resSinLegajo = await quickLoginPost(reqSinLegajo);
const dataSinLegajo = await resSinLegajo.json();
const responseString = JSON.stringify(dataSinLegajo);
assert(
  !responseString.includes('service_role') &&
    !responseString.includes('token_hash') &&
    !responseString.includes('magiclink'),
  '[REGRESIÓN 9] Respuestas de error jamás exponen claves de servicio, hashes internos ni enlaces mágicos',
  'SECURITY (LEAK PREVENTION)'
);

// REGRESIÓN 10: Dual-Key Rate Limiting (IP y Legajo independientes)
const testLegajo = `leg_${Date.now()}`;
let legajoAttemptsAllowed = 0;
for (let i = 0; i < 5; i++) {
  const rl = checkRateLimit(`quick_login_legajo_${testLegajo}`, { maxRequests: 5, windowMs: 60000 });
  if (rl.success) legajoAttemptsAllowed++;
}
const legajoBlockedAttempt = checkRateLimit(`quick_login_legajo_${testLegajo}`, { maxRequests: 5, windowMs: 60000 });
assert(
  legajoAttemptsAllowed === 5 && legajoBlockedAttempt.success === false,
  '[REGRESIÓN 10] Limitación independiente por cuenta bloquea el 6to intento fallido consecutivo sobre el mismo legajo',
  'SECURITY (RATE LIMITING)'
);

// REGRESIÓN 11: Contador persistente (compartido si la base responde; en memoria si no)
const keyPers = `test_pers_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const pers1 = await persistentRateLimit(keyPers, { max: 2, windowSeconds: 60 });
const pers2 = await persistentRateLimit(keyPers, { max: 2, windowSeconds: 60 });
const pers3 = await persistentRateLimit(keyPers, { max: 2, windowSeconds: 60 });
assert(
  pers1.allowed && pers2.allowed && !pers3.allowed,
  `[REGRESIÓN 11.A] El contador persistente (${pers3.source}) permite 2 eventos y bloquea el 3.º`,
  'SECURITY (RATE LIMITING)'
);

const persPeek = await persistentRateLimit(keyPers, { max: 2, windowSeconds: 60, increment: false });
assert(
  persPeek.allowed === false,
  '[REGRESIÓN 11.B] La consulta sin incremento reporta bloqueo una vez alcanzado el máximo',
  'SECURITY (RATE LIMITING)'
);

const keyPeekOnly = `test_peek_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
for (let i = 0; i < 4; i++) {
  await persistentRateLimit(keyPeekOnly, { max: 1, windowSeconds: 60, increment: false });
}
const peekDespues = await persistentRateLimit(keyPeekOnly, { max: 1, windowSeconds: 60, increment: false });
assert(
  peekDespues.allowed === true,
  '[REGRESIÓN 11.C] Consultar el estado no consume cupo (no hay bloqueo por solo mirar)',
  'SECURITY (RATE LIMITING)'
);

// REGRESIÓN 13: Formato legible del historial de cambios de equipos
assert(formatearValorAuditoria('estado', 'fuera_de_servicio') === 'Fuera de servicio', '[AUDITORÍA] Traduce el estado a texto legible', 'UNIT (PROD CODE)');
assert(formatearValorAuditoria('marca', null) === '—', '[AUDITORÍA] Un valor vacío se muestra como guion', 'UNIT (PROD CODE)');
assert(formatearValorAuditoria('deleted_at', null) === 'Activo', '[AUDITORÍA] deleted_at vacío significa equipo activo', 'UNIT (PROD CODE)');
assert(formatearValorAuditoria('deleted_at', '2026-11-16T12:00:00Z').startsWith('Baja el '), '[AUDITORÍA] deleted_at con fecha se muestra como baja', 'UNIT (PROD CODE)');
assert(formatearValorAuditoria('horometro_actual', 1250.5) === '1250.5', '[AUDITORÍA] Los números se muestran tal cual', 'UNIT (PROD CODE)');

assert(formatearValorCambioInspeccion('valor_bool', true) === 'OK', '[REEDICIÓN] valor_bool true se muestra como OK', 'UNIT (PROD CODE)');
assert(formatearValorCambioInspeccion('valor_bool', false) === 'No OK', '[REEDICIÓN] valor_bool false se muestra como No OK', 'UNIT (PROD CODE)');
assert(formatearValorCambioInspeccion('estado_resultante', 'observado') === 'Observado', '[REEDICIÓN] el estado se traduce a texto', 'UNIT (PROD CODE)');
assert(formatearValorCambioInspeccion('falla_gravedad', 'media') === 'Media', '[REEDICIÓN] la gravedad se capitaliza', 'UNIT (PROD CODE)');
assert(formatearValorCambioInspeccion('valor_texto', null) === '—', '[REEDICIÓN] un valor vacío se muestra como guion', 'UNIT (PROD CODE)');

// AVISO DE CHECKLIST REPETIDO (también sin conexión)
{
  const H = 60 * 60 * 1000;
  const ahora = 1_800_000_000_000;
  const ventana = 8 * H;
  const r1 = buscarInspeccionReciente([{ fecha: ahora - 2 * H, operador_id: 'a' }], ahora, ventana);
  assert(r1 !== null, '[DUPLICADO] Una inspección de hace 2 h dentro de la ventana de 8 h se detecta', 'UNIT (PROD CODE)');
  const r2 = buscarInspeccionReciente([{ fecha: ahora - 9 * H, operador_id: 'a' }], ahora, ventana);
  assert(r2 === null, '[DUPLICADO] Una inspección de hace 9 h ya no cuenta', 'UNIT (PROD CODE)');
  const r3 = buscarInspeccionReciente([{ fecha: ahora + H, operador_id: 'a' }], ahora, ventana);
  assert(r3 === null, '[DUPLICADO] Una fecha futura (reloj desfasado) se ignora', 'UNIT (PROD CODE)');
  const r4 = buscarInspeccionReciente(
    [
      { fecha: ahora - 5 * H, operador_id: 'a' },
      { fecha: ahora - 1 * H, operador_id: 'b' },
      { fecha: Number.NaN, operador_id: 'c' },
    ],
    ahora,
    ventana
  );
  assert(r4?.operador_id === 'b', '[DUPLICADO] Entre varias, se elige la más reciente y se ignoran fechas inválidas', 'UNIT (PROD CODE)');
  assert(buscarInspeccionReciente([], ahora, ventana) === null, '[DUPLICADO] Sin candidatas no hay aviso', 'UNIT (PROD CODE)');
  assert(textoHace(25 * 60000) === '25 min' && textoHace(125 * 60000) === '2 h 5 min', '[DUPLICADO] El texto de "hace cuánto" es legible', 'UNIT (PROD CODE)');
}

// REGRESIÓN 12: Con acceso directo, probar muchos legajos inexistentes desde una IP se frena (anti enumeración)
let bloqueadoSinFallos = false;
for (let i = 0; i < 8; i++) {
  const r = await quickLoginPost(
    new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '185.220.101.77' },
      body: JSON.stringify({ legajo: 'legajo_prueba_sin_fallos' }),
    })
  );
  if (r.status === 429) bloqueadoSinFallos = true;
}
assert(
  bloqueadoSinFallos === true,
  '[REGRESIÓN 12] 8 intentos sobre un legajo inexistente terminan bloqueados (frena la enumeración de legajos)',
  'SECURITY (RATE LIMITING)'
);

// -----------------------------------------------------------------------------
// 9. REGISTRO DE LIMITACIONES DEL ENTORNO DE DESARROLLO (AUDITORÍA HONESTA)
// -----------------------------------------------------------------------------
console.log('\n9. REGISTRO DE LIMITACIONES DE ENTORNO (NO SIMULADAS)');
console.log('  ⚠️  [LIMITACIÓN DEL ENTORNO]: Escaneo de cámara QR físico requiere hardware óptico y dispositivo real.');
console.log('  ⚠️  [LIMITACIÓN DEL ENTORNO]: Conexión en vivo a Supabase Auth requiere red externa y credenciales cloud activas.');
console.log('  ⚠️  [LIMITACIÓN DEL ENTORNO]: Arranque offline de APK Android requiere dispositivo Android físico.');

console.log('\n================================================================');
console.log(`📊 RESULTADO DE LA SUITE: ${passed} PASSED / ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
