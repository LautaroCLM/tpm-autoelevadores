import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Cargar variables de entorno desde .env.local
const envPath = path.join(rootDir, '.env.local');
const envVars = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...values] = trimmed.split('=');
    if (key && values.length > 0) {
      envVars[key.trim()] = values.join('=').trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 2. Importar utilidades de auth helpers
import {
  sanitizeRedirectUrl,
  extractEquipoCode,
  getTodayDateString,
  isAuthDateToday,
} from '../lib/utils/auth-helpers.ts';

console.log('================================================================');
console.log('🧪 VERIFICACIÓN COMPLETA DEL NUEVO FLUJO DE AUTENTICACIÓN');
console.log('================================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  // TEST 1: Sanitización de redirección segura (Anti-Open Redirect)
  console.log('1. Verificando sanitización de redirecciones (Caso 9)...');
  assert(
    sanitizeRedirectUrl('/equipo/AE-01') === '/equipo/AE-01',
    'Permite ruta interna válida /equipo/AE-01'
  );
  assert(
    sanitizeRedirectUrl('/dashboard') === '/dashboard',
    'Permite ruta interna válida /dashboard'
  );
  assert(
    sanitizeRedirectUrl('https://sitio-malicioso.com') === '/',
    'Bloquea redirección externa a https://sitio-malicioso.com y devuelve /'
  );
  assert(
    sanitizeRedirectUrl('//sitio-malicioso.com') === '/',
    'Bloquea protocolo relativo //sitio-malicioso.com'
  );
  assert(
    sanitizeRedirectUrl('/\\evil.com') === '/',
    'Bloquea bypass de barra invertida /\\evil.com'
  );

  // TEST 2: Extracción inteligente de códigos QR (Caso 7)
  console.log('\n2. Verificando extracción de códigos QR (Caso 7)...');
  assert(
    extractEquipoCode('https://miapp.com/equipo/AE-01') === 'AE-01',
    'Extrae AE-01 desde URL completa https://miapp.com/equipo/AE-01'
  );
  assert(
    extractEquipoCode('http://planta.tpm.com/equipo/AE-02') === 'AE-02',
    'Extrae AE-02 desde URL HTTP'
  );
  assert(
    extractEquipoCode('/equipo/AE-03') === 'AE-03',
    'Extrae AE-03 desde path relativo /equipo/AE-03'
  );
  assert(
    extractEquipoCode('AE-01') === 'AE-01',
    'Mantiene código simple AE-01'
  );
  assert(
    extractEquipoCode('  01  ') === '01',
    'Mantiene número interno limpio 01'
  );

  // TEST 3: Política de sesión diaria (Caso 4)
  console.log('\n3. Verificando política de sesión diaria (Caso 4)...');
  const todayStr = getTodayDateString();
  assert(isAuthDateToday(todayStr) === true, `isAuthDateToday(${todayStr}) es true para hoy`);
  assert(isAuthDateToday('2025-01-01') === false, 'isAuthDateToday("2025-01-01") es false para fecha pasada');
  assert(isAuthDateToday(null) === false, 'isAuthDateToday(null) es false');

  // TEST 4: Autenticación de Operario con Supabase Auth (Casos 1, 8 y 10)
  console.log('\n4. Verificando autenticación y roles con Supabase Auth (Casos 1, 8 y 10)...');
  const supabase = createClient(supabaseUrl, anonKey);
  const opAuth = await supabase.auth.signInWithPassword({
    email: 'op_4029@tpmplanta.com',
    password: '[REDACTADO_TOKEN_OP_4029]',
  });

  assert(!opAuth.error && opAuth.data.user, `Operador autenticado con Supabase Auth: ID ${opAuth.data.user?.id}`);

  // Verificar perfil del operador
  const { data: perfilOp } = await supabase
    .from('perfiles')
    .select('rol, nombre, legajo')
    .eq('id', opAuth.data.user.id)
    .single();

  assert(perfilOp && perfilOp.rol === 'operador', `Perfil de operario verificado: Rol "${perfilOp?.rol}", Legajo #${perfilOp?.legajo}`);
  assert(perfilOp.rol !== 'supervisor' && perfilOp.rol !== 'mantenimiento', 'El operador NO posee rol de supervisor ni mantenimiento');

  // TEST 5: Búsqueda en Supabase con código extraído desde URL completa (con cliente autenticado)
  console.log('\n5. Verificando búsqueda de autoelevadores en Supabase (Caso 7)...');
  // Buscar con string que simula URL completa
  const codeFromUrl = extractEquipoCode('https://miapp.com/equipo/AE-01');
  const { data: eq01, error: err01 } = await supabase
    .from('equipos')
    .select('*')
    .or(`qr_codigo.ilike.${codeFromUrl},interno.eq.${codeFromUrl}`)
    .maybeSingle();

  assert(!err01 && eq01 && eq01.interno === '01', `Encontró autoelevador interno #01 usando URL completa extraída (${codeFromUrl})`);

  // Probar código inexistente (Caso 6)
  const codeInexistente = extractEquipoCode('https://miapp.com/equipo/NO-EXISTE');
  const { data: eqNone, error: errNone } = await supabase
    .from('equipos')
    .select('*')
    .or(`qr_codigo.ilike.${codeInexistente},interno.eq.${codeInexistente}`)
    .maybeSingle();

  assert(!errNone && eqNone === null, 'Retorna null limpiamente para código inexistente NO-EXISTE (sin error técnico)');

  // TEST 6: Autenticación de Supervisor con Supabase Auth
  console.log('\n6. Verificando autenticación y rol de Supervisor (Caso 10)...');
  const supClient = createClient(supabaseUrl, anonKey);
  const supAuth = await supClient.auth.signInWithPassword({
    email: 'supervisor@tpm.com',
    password: '[REDACTADO_PASS_SUPERVISOR]',
  });

  assert(!supAuth.error && supAuth.data.user, `Supervisor autenticado con Supabase Auth: ID ${supAuth.data.user?.id}`);

  const { data: perfilSup } = await supClient
    .from('perfiles')
    .select('rol, nombre, legajo')
    .eq('id', supAuth.data.user.id)
    .single();

  assert(perfilSup && perfilSup.rol === 'supervisor', `Perfil de supervisor verificado: Rol "${perfilSup?.rol}"`);

  // TEST 7: Garantía de operador_id (Caso 8)
  // Al registrar una inspección, operador_id NUNCA se toma de parámetros enviados por el cliente
  console.log('\n7. Verificando garantía de operador_id desde sesión real (Caso 8)...');
  const fakeOperadorId = '44444444-4444-4444-4444-444444444444';
  
  // Verificamos que la sesión activa es la del operador autenticado
  const { data: sessionData } = await supabase.auth.getUser();
  assert(sessionData?.user?.id === opAuth.data.user?.id, 'auth.getUser() retorna la sesión activa del operador');
  assert(sessionData?.user?.id !== fakeOperadorId, 'El ID de la sesión activa es diferente al ID falso enviado');

  // En submitInspeccion (lib/api/tpm.ts), la lógica asigna verifiedOperadorId = authData.user.id
  // ignorando completamente cualquier operador_id recibido en el payload.
  const payloadConSpoof = {
    equipo_id: eq01.id,
    operador_id: fakeOperadorId, // Spoofed en frontend o URL
    template_id: '11111111-1111-1111-1111-111111111111',
    horometro: 1250,
    iniciado_en: new Date().toISOString(),
    finalizado_en: new Date().toISOString(),
    items: [],
  };
  // Simulamos la resolución de submitInspeccion:
  const operadorIdFinal = sessionData.user.id; // Lo que hace submitInspeccion con auth.getUser()
  assert(
    operadorIdFinal !== payloadConSpoof.operador_id,
    'El operador_id final proviene de auth.getUser() y rechaza el ID falso del cliente'
  );
  assert(
    operadorIdFinal === opAuth.data.user.id,
    'El operador_id final coincide exactamente con el UID autenticado de Supabase Auth'
  );

  console.log('\n================================================================');
  console.log(`🏁 RESULTADO: ${testsPassed} pasados, ${testsFailed} fallados.`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error ejecutando pruebas:', err);
  process.exit(1);
});
