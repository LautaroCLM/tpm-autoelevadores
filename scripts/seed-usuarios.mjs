import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
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

// 3. Lista de usuarios de planta a crear / sincronizar
const USERS_TO_SEED = [
  {
    email: 'op_4029@tpmplanta.com',
    password: '[REDACTADO_TOKEN_OP_4029]',
    nombre: 'Juan Pérez',
    legajo: '4029',
    rol: 'operador',
    qrPayload: 'TPM:OP:4029:[REDACTADO_TOKEN_OP_4029]',
  },
  {
    email: 'op_5118@tpmplanta.com',
    password: '[REDACTADO_TOKEN_OP_5118]',
    nombre: 'Carlos Gómez',
    legajo: '5118',
    rol: 'operador',
    qrPayload: 'TPM:OP:5118:[REDACTADO_TOKEN_OP_5118]',
  },
  {
    email: 'op_2045@tpmplanta.com',
    password: '[REDACTADO_TOKEN_OP_2045]',
    nombre: 'Lucas Martínez',
    legajo: '2045',
    rol: 'operador',
    qrPayload: 'TPM:OP:2045:[REDACTADO_TOKEN_OP_2045]',
  },
  {
    email: 'op_3082@tpmplanta.com',
    password: '[REDACTADO_TOKEN_OP_3082]',
    nombre: 'Martín Rodríguez',
    legajo: '3082',
    rol: 'operador',
    qrPayload: 'TPM:OP:3082:[REDACTADO_TOKEN_OP_3082]',
  },
  {
    email: 'supervisor@tpm.com',
    password: '[REDACTADO_PASS_SUPERVISOR]',
    nombre: 'Ing. Marcos Rivas',
    legajo: 'SUP-01',
    rol: 'supervisor',
    qrPayload: null,
  },
];

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

  console.log('📌 CREDENCIALES PARA PROBAR EN LA APP:\n');
  USERS_TO_SEED.forEach((u) => {
    console.log(`• ${u.nombre} (${u.rol.toUpperCase()}):`);
    console.log(`  - Email: ${u.email}`);
    console.log(`  - Clave / Token: ${u.password}`);
    if (u.qrPayload) {
      console.log(`  - String para QR: ${u.qrPayload}`);
    } else {
      console.log(`  - Acceso: Formulario Login Supervisor (/login)`);
    }
    console.log('');
  });
}

seedUsers().catch((err) => {
  console.error('❌ Error inesperado ejecutando seed:', err);
  process.exit(1);
});
