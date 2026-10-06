import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

console.log('================================================================');
console.log('🚀 TPM AUTOELEVADORES — SEED DE USUARIOS (SUPABASE ADMIN API)');
console.log('================================================================\n');

if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL no está configurada en .env.local');
  process.exit(1);
}

if (!serviceRoleKey || serviceRoleKey.includes('placeholder') || serviceRoleKey.includes('your-service-role')) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está configurada en .env.local');
  console.error('\nPara obtenerla:');
  console.error('1. Andá a supabase.com > Tu Proyecto > Project Settings (⚙️) > API');
  console.error('2. En la sección "Project API keys", copiá el valor de "service_role secret"');
  console.error('3. Pegala en tu archivo .env.local como:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...\n');
  process.exit(1);
}

// 2. Inicializar cliente con Service Role (permisos de Admin)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function resolveUserPassword(user) {
  // 1. Clave específica por legajo o rol desde variables de entorno
  const envKeyLegajo = user.legajo ? `SEED_PASSWORD_${user.legajo}` : null;
  const envKeyRol = `SEED_PASSWORD_${user.rol.toUpperCase()}`;

  if (envKeyLegajo && (process.env[envKeyLegajo] || envVars[envKeyLegajo])) {
    return (process.env[envKeyLegajo] || envVars[envKeyLegajo]).trim();
  }
  if (process.env[envKeyRol] || envVars[envKeyRol]) {
    return (process.env[envKeyRol] || envVars[envKeyRol]).trim();
  }
  if (process.env.DEFAULT_SEED_PASSWORD || envVars.DEFAULT_SEED_PASSWORD) {
    return (process.env.DEFAULT_SEED_PASSWORD || envVars.DEFAULT_SEED_PASSWORD).trim();
  }

  // 2. Generación aleatoria criptográfica segura (sin claves fijas en repositorio)
  return 'TmpSec_' + crypto.randomBytes(12).toString('hex') + '!';
}

// 3. Lista de usuarios de planta a crear / sincronizar (sin contraseñas fijas)
const RAW_USERS = [
  {
    email: 'op_4029@tpmplanta.com',
    nombre: 'Macri Eduardo',
    legajo: '4029',
    rol: 'operador',
  },
  {
    email: 'op_5118@tpmplanta.com',
    nombre: 'Cervantes Diego',
    legajo: '5118',
    rol: 'operador',
  },
  {
    email: 'op_2045@tpmplanta.com',
    nombre: 'Casal Gustavo',
    legajo: '2045',
    rol: 'operador',
  },
  {
    email: 'op_3082@tpmplanta.com',
    nombre: 'Lavin Leo',
    legajo: '3082',
    rol: 'operador',
  },
  {
    email: 'supervisor@tpm.com',
    nombre: 'Ruben Orlando Colman',
    legajo: 'SUP-01',
    rol: 'supervisor',
  },
];

const USERS_TO_SEED = RAW_USERS.map((u) => ({
  ...u,
  password: resolveUserPassword(u),
  qrPayload: u.legajo ? `TPM:OP:${u.legajo}` : null,
}));

async function seedUsers() {
  console.log(`📡 Conectando a Supabase Admin: ${supabaseUrl}`);

  // Listar usuarios existentes para garantizar idempotencia
  const { data: existingData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Error al consultar usuarios existentes:', listErr.message);
    process.exit(1);
  }

  const existingUsers = existingData?.users || [];
  console.log(`🔍 Usuarios existentes en Auth: ${existingUsers.length}\n`);

  for (const item of USERS_TO_SEED) {
    console.log(`👤 Procesando: ${item.nombre} (${item.email})...`);

    const match = existingUsers.find((u) => u.email?.toLowerCase() === item.email.toLowerCase());
    let userId = '';

    if (match) {
      userId = match.id;
      // Actualizar contraseña y metadata en auth.users
      const { data: updatedAuth, error: updateErr } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: item.password,
          email_confirm: true,
          user_metadata: {
            nombre: item.nombre,
            legajo: item.legajo,
            rol: item.rol,
          },
        }
      );

      if (updateErr) {
        console.error(`   ⚠️ Error actualizando auth.users para ${item.email}:`, updateErr.message);
      } else {
        console.log(`   🔄 Cuenta en auth.users actualizada (ID: ${userId})`);
      }
    } else {
      // Crear nuevo usuario usando Admin API (crea auth.users + auth.identities)
      const { data: createdAuth, error: createErr } = await supabase.auth.admin.createUser({
        email: item.email,
        password: item.password,
        email_confirm: true,
        user_metadata: {
          nombre: item.nombre,
          legajo: item.legajo,
          rol: item.rol,
        },
      });

      if (createErr || !createdAuth?.user) {
        console.error(`   ❌ Error creando usuario ${item.email}:`, createErr?.message);
        continue;
      }

      userId = createdAuth.user.id;
      console.log(`   ✅ Cuenta creada en auth.users + auth.identities (ID: ${userId})`);
    }

    // Sincronizar fila en public.perfiles con el UUID real
    const { error: perfilErr } = await supabase.from('perfiles').upsert(
      {
        id: userId,
        nombre: item.nombre,
        legajo: item.legajo,
        rol: item.rol,
      },
      { onConflict: 'id' }
    );

    if (perfilErr) {
      console.error(`   ❌ Error al guardar en public.perfiles:`, perfilErr.message);
    } else {
      console.log(`   📋 Perfil sincronizado en public.perfiles [Rol: ${item.rol}, Legajo: ${item.legajo}]\n`);
    }
  }

  console.log('================================================================');
  console.log('🎉 PROCESO COMPLETADO — CREDENCIALES GENERADAS EXITOSAMENTE');
  console.log('================================================================\n');

  console.log('📌 USUARIOS SINCRONIZADOS EN SUPABASE:\n');
  USERS_TO_SEED.forEach((u) => {
    console.log(`• ${u.nombre} (${u.rol.toUpperCase()}):`);
    console.log(`  - Email: ${u.email}`);
    console.log(`  - Legajo: ${u.legajo || 'N/A'}`);
    if (u.qrPayload) {
      console.log(`  - Identificador QR: ${u.qrPayload}`);
    } else {
      console.log(`  - Acceso: Formulario Login Supervisor (/login)`);
    }
    console.log(`  - Clave: [Configurada mediante variable de entorno o generada de forma segura]`);
    console.log('');
  });
}

seedUsers().catch((err) => {
  console.error('❌ Error inesperado ejecutando seed:', err);
  process.exit(1);
});
