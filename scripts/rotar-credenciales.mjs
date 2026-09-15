import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Cargar variables desde .env.local
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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('================================================================');
console.log('🔐 ROTACIÓN SEGURA DE CREDENCIALES PRE-PRODUCCIÓN');
console.log('================================================================\n');

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error('❌ Error: Variables de Supabase incompletas en .env.local.');
  process.exit(1);
}

// Clientes Supabase
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Generadores de contraseñas seguras
function generateSupervisorPassword(length = 32) {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = uppers + lowers + numbers + symbols;

  let pwd = '';
  pwd += uppers[crypto.randomInt(0, uppers.length)];
  pwd += lowers[crypto.randomInt(0, lowers.length)];
  pwd += numbers[crypto.randomInt(0, numbers.length)];
  pwd += symbols[crypto.randomInt(0, symbols.length)];

  for (let i = 4; i < length; i++) {
    pwd += all[crypto.randomInt(0, all.length)];
  }

  // Mezclar aleatoriamente
  const arr = pwd.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function generateOperatorPassword(length = 8) {
  // Alfanumérico legible de 8 caracteres
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars[crypto.randomInt(0, chars.length)];
  }
  return pwd;
}

function maskSecret(str) {
  if (!str) return '[VACÍO]';
  return `${str.slice(0, 2)}${'*'.repeat(Math.max(str.length - 4, 3))}${str.slice(-2)} (${str.length} chars)`;
}

// Lista de usuarios esperados
const TARGET_USERS = [
  {
    email: 'supervisor@tpm.com',
    rol: 'supervisor',
    nombre: 'Ing. Marcos Rivas',
    legajo: 'SUP-01',
    type: 'supervisor',
  },
  {
    email: 'op_4029@tpmplanta.com',
    rol: 'operador',
    nombre: 'Juan Pérez',
    legajo: '4029',
    type: 'operador',
  },
  {
    email: 'op_5118@tpmplanta.com',
    rol: 'operador',
    nombre: 'Carlos Gómez',
    legajo: '5118',
    type: 'operador',
  },
  {
    email: 'op_2045@tpmplanta.com',
    rol: 'operador',
    nombre: 'Lucas Martínez',
    legajo: '2045',
    type: 'operador',
  },
  {
    email: 'op_3082@tpmplanta.com',
    rol: 'operador',
    nombre: 'Martín Rodríguez',
    legajo: '3082',
    type: 'operador',
  },
];

async function executeRotation() {
  console.log('Paso 1: Verificando existencia de los 5 usuarios en Supabase Auth Admin API...');
  const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Error listando usuarios en Supabase Auth:', listErr.message);
    process.exit(1);
  }

  const existingUsers = listData.users || [];
  console.log(`ℹ️ Total de usuarios en base de datos auth.users: ${existingUsers.length}`);

  const userMap = new Map();
  for (const target of TARGET_USERS) {
    const found = existingUsers.find(
      (u) => u.email?.toLowerCase() === target.email.toLowerCase()
    );
    if (!found) {
      console.error(`❌ ERROR CRÍTICO: Usuario objetivo ${target.email} NO existe en Supabase Auth.`);
      console.error('Abortando rotación sin realizar modificaciones.');
      process.exit(1);
    }
    userMap.set(target.email, found);
    console.log(`  ✓ Encontrado: ${target.email} (ID: ${found.id})`);
  }

  console.log('\nTodos los 5 usuarios verificados correctamente.\n');

  // Paso 2: Generación de nuevas credenciales seguras
  console.log('Paso 2: Generando credenciales seguras en memoria...');
  const newCredentials = [];

  for (const target of TARGET_USERS) {
    const userAuth = userMap.get(target.email);
    let pwd = '';
    if (target.type === 'supervisor') {
      pwd = generateSupervisorPassword(32); // >= 24 chars, alta entropía
    } else {
      pwd = generateOperatorPassword(8); // 8 chars alfanuméricos
    }

    newCredentials.push({
      ...target,
      id: userAuth.id,
      newPassword: pwd,
    });
    console.log(`  ✓ Clave generada para ${target.email} (${target.rol}): ${maskSecret(pwd)}`);
  }

  // Paso 3: Aplicar rotación en Supabase Auth
  console.log('\nPaso 3: Aplicando rotación en Supabase Auth mediante Admin API...');
  for (const cred of newCredentials) {
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(cred.id, {
      password: cred.newPassword,
    });

    if (updateErr) {
      console.error(`❌ Error al actualizar contraseña para ${cred.email}:`, updateErr.message);
      console.error('Abortando proceso.');
      process.exit(1);
    }
    console.log(`  ✅ Contraseña actualizada en auth.users para ${cred.email} (ID: ${cred.id})`);
  }

  // Paso 4: Guardar credenciales en archivo local ignorado por Git (.credenciales-rotadas.txt)
  console.log('\nPaso 4: Guardando credenciales en archivo local (.credenciales-rotadas.txt)...');
  const credFilePath = path.join(rootDir, '.credenciales-rotadas.txt');
  const timestamp = new Date().toISOString();

  let fileContent = `================================================================================\n`;
  fileContent += `TPM AUTOELEVADORES - REPORTE LOCAL DE CREDENCIALES ROTADAS\n`;
  fileContent += `FECHA DE GENERACIÓN: ${timestamp}\n`;
  fileContent += `================================================================================\n`;
  fileContent += `ADVERTENCIA DE SEGURIDAD:\n`;
  fileContent += `- Este archivo contiene secretos en texto plano para configuración operativa inicial.\n`;
  fileContent += `- Está ignorado por Git (.gitignore).\n`;
  fileContent += `- NO compartir por canales no seguros.\n`;
  fileContent += `- Distribuir a los operadores sus contraseñas por canal seguro.\n`;
  fileContent += `================================================================================\n\n`;

  const supCred = newCredentials.find((c) => c.type === 'supervisor');
  fileContent += `[SUPERVISOR]\n`;
  fileContent += `Email: ${supCred.email}\n`;
  fileContent += `Nombre: ${supCred.nombre}\n`;
  fileContent += `Rol: ${supCred.rol}\n`;
  fileContent += `Nueva Contraseña: ${supCred.newPassword}\n\n`;

  fileContent += `[OPERADORES DE PLANTA]\n`;
  const opCreds = newCredentials.filter((c) => c.type === 'operador');
  opCreds.forEach((op, idx) => {
    fileContent += `${idx + 1}. Legajo: ${op.legajo}\n`;
    fileContent += `   Email: ${op.email}\n`;
    fileContent += `   Nombre: ${op.nombre}\n`;
    fileContent += `   Rol: ${op.rol}\n`;
    fileContent += `   Identificador QR credencial: TPM:OP:${op.legajo}\n`;
    fileContent += `   Nueva Contraseña / Clave de acceso: ${op.newPassword}\n\n`;
  });

  if (fs.existsSync(credFilePath)) {
    const prev = fs.readFileSync(credFilePath, 'utf8');
    fs.writeFileSync(credFilePath, `${fileContent}\n--- HISTORIAL ANTERIOR ---\n\n${prev}`, 'utf8');
  } else {
    fs.writeFileSync(credFilePath, fileContent, 'utf8');
  }
  console.log(`  ✅ Archivo guardado correctamente en: .credenciales-rotadas.txt`);

  // Paso 5: Actualizar variables de prueba en .env.local
  console.log('\nPaso 5: Sincronizando variables de prueba en .env.local...');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    const op4029 = newCredentials.find((c) => c.email === 'op_4029@tpmplanta.com');
    const sup = newCredentials.find((c) => c.email === 'supervisor@tpm.com');

    if (op4029) {
      if (envContent.includes('TEST_OPERATOR_PASSWORD=')) {
        envContent = envContent.replace(/TEST_OPERATOR_PASSWORD=.*/g, `TEST_OPERATOR_PASSWORD=${op4029.newPassword}`);
      } else {
        envContent += `\nTEST_OPERATOR_PASSWORD=${op4029.newPassword}`;
      }
    }
    if (sup) {
      if (envContent.includes('TEST_SUPERVISOR_PASSWORD=')) {
        envContent = envContent.replace(/TEST_SUPERVISOR_PASSWORD=.*/g, `TEST_SUPERVISOR_PASSWORD=${sup.newPassword}`);
      } else {
        envContent += `\nTEST_SUPERVISOR_PASSWORD=${sup.newPassword}`;
      }
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`  ✅ .env.local actualizado con las nuevas credenciales de test (TEST_OPERATOR_PASSWORD, TEST_SUPERVISOR_PASSWORD).`);
  }

  // Paso 6: Verificación de Login con NUEVAS credenciales
  console.log('\nPaso 6: Verificando autenticación con las NUEVAS credenciales...');
  const newLoginResults = [];
  for (const cred of newCredentials) {
    const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
      email: cred.email,
      password: cred.newPassword,
    });

    if (authErr || !authData.user) {
      console.error(`  ❌ ERROR al autenticar nuevo login para ${cred.email}:`, authErr?.message);
      newLoginResults.push({ email: cred.email, status: 'ERROR', error: authErr?.message });
    } else {
      console.log(`  ✅ Login OK: ${cred.email} (Rol: ${cred.rol}, Legajo: ${cred.legajo})`);
      newLoginResults.push({ email: cred.email, status: 'OK' });
      await anonClient.auth.signOut();
    }
  }

  // Resumen final
  console.log('\n================================================================');
  console.log('🎉 RESUMEN DE ROTACIÓN');
  console.log('================================================================');
  console.log('1. Usuarios actualizados en Supabase Auth:');
  newCredentials.forEach((c) => console.log(`   - ${c.email}: ROTADA EXITOSAMENTE`));

  console.log('\n2. Resultado de autenticación con credenciales nuevas:');
  newLoginResults.forEach((r) => console.log(`   - ${r.email}: ${r.status}`));

  const allNewOk = newLoginResults.every((r) => r.status === 'OK');

  if (allNewOk) {
    console.log('\n✅ ROTACIÓN Y VERIFICACIÓN DE LOGIN COMPLETADAS AL 100% SIN ERRORES.');
  } else {
    console.error('\n❌ HUBO ERRORES EN LA VERIFICACIÓN.');
    process.exit(1);
  }
}

executeRotation().catch((err) => {
  console.error('Error fatal durante la rotación:', err);
  process.exit(1);
});
