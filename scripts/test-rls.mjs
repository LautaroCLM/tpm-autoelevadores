import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function runAudit() {
  console.log('================================================================');
  console.log('🧪 VERIFICACIÓN EN VIVO DE POLÍTICAS RLS (SUPABASE)');
  console.log('================================================================\n');

  // 1. Prueba como Operador (Juan Pérez)
  const clientOp = createClient(url, anonKey);
  const authOp = await clientOp.auth.signInWithPassword({
    email: 'op_4029@tpmplanta.com',
    password: '[REDACTADO_TOKEN_OP_4029]',
  });

  if (authOp.error || !authOp.data.user) {
    console.error('❌ Error al iniciar sesión como operador:', authOp.error?.message);
    return;
  }
  console.log('👤 Sesión iniciada como OPERADOR: Juan Pérez (UID:', authOp.data.user.id + ')\n');

  // Test A: Operador intenta UPDATE en equipos
  console.log('1. Probando UPDATE en equipos como Operador...');
  const resUpdate = await clientOp
    .from('equipos')
    .update({ marca: 'Toyota Intruso' })
    .eq('interno', '01')
    .select();

  if (resUpdate.error) {
    console.log('   🔒 RECHAZADO POR RLS CON ERROR:', resUpdate.error.message);
    console.log('   Código de error:', resUpdate.error.code);
  } else if (!resUpdate.data || resUpdate.data.length === 0) {
    console.log('   🔒 BLOQUEADO POR RLS: 0 filas modificadas (filtro USING activo, acceso denegado).');
  } else {
    console.log('   ⚠️ VULNERABLE / ABIERTO: El operador pudo modificar el equipo!');
  }

  // Test B: Operador intenta INSERT en equipos
  console.log('\n2. Probando INSERT en equipos como Operador...');
  const resInsert = await clientOp
    .from('equipos')
    .insert({ interno: '99', qr_codigo: 'AE-99' })
    .select();

  if (resInsert.error) {
    console.log('   🔒 RECHAZADO POR RLS CON ERROR:', resInsert.error.message);
  } else {
    console.log('   ⚠️ VULNERABLE / ABIERTO: El operador pudo crear un equipo!');
  }

  // Test C: Operador lee perfiles
  console.log('\n3. Probando SELECT en perfiles como Operador...');
  const resPerfiles = await clientOp.from('perfiles').select('*');
  console.log('   Perfiles visibles para el operador:', resPerfiles.data?.length || 0);
  if (resPerfiles.data && resPerfiles.data.length === 1) {
    console.log('   🔒 RESTRINGIDO: Solo ve su propio perfil (' + resPerfiles.data[0].nombre + ').');
  } else if (resPerfiles.data && resPerfiles.data.length > 1) {
    console.log('   ⚠️ ABIERTO: El operador puede ver todos los perfiles (' + resPerfiles.data.length + ' usuarios).');
  }

  // Test D: Subida anónima a Storage fallas-fotos
  console.log('\n4. Probando subida ANÓNIMA (sin login) a Storage bucket fallas-fotos...');
  const clientAnon = createClient(url, anonKey);
  const testBuffer = Buffer.from('test');
  const resStorageAnon = await clientAnon
    .storage
    .from('fallas-fotos')
    .upload('test_anon_security.txt', testBuffer, { upsert: true });

  if (resStorageAnon.error) {
    console.log('   🔒 RECHAZADO POR STORAGE RLS:', resStorageAnon.error.message);
  } else {
    console.log('   ⚠️ VULNERABLE / ABIERTO: Se permitió subida anónima al bucket!');
    await clientAnon.storage.from('fallas-fotos').remove(['test_anon_security.txt']);
  }

  console.log('\n================================================================');
}

runAudit();
