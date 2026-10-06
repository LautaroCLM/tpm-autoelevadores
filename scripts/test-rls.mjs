import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function runAudit() {
  console.log('================================================================');
  console.log('🧪 VERIFICACIÓN EN VIVO DE POLÍTICAS RLS (SUPABASE)');
  console.log('================================================================\n');

  // 1. Prueba como Operador (Macri Eduardo)
  const opTestEmail = process.env.TEST_OPERATOR_EMAIL || (env.match(/TEST_OPERATOR_EMAIL=(.*)/)?.[1]?.trim()) || 'op_4029@tpmplanta.com';
  const opTestPassword = process.env.TEST_OPERATOR_PASSWORD || (env.match(/TEST_OPERATOR_PASSWORD=(.*)/)?.[1]?.trim());

  if (!opTestPassword) {
    console.log('⚠️ TEST_OPERATOR_PASSWORD no configurada en .env.local. Defina la variable para ejecutar la prueba de RLS.');
    return;
  }

  const clientOp = createClient(url, anonKey);
  const authOp = await clientOp.auth.signInWithPassword({
    email: opTestEmail,
    password: opTestPassword,
  });

  if (authOp.error || !authOp.data.user) {
    console.error('❌ Error al iniciar sesión como operador:', authOp.error?.message);
    return;
  }
  console.log('👤 Sesión iniciada como OPERADOR: Macri Eduardo (UID:', authOp.data.user.id + ')\n');

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

  // ----------------------------------------------------------------------------
  // NUEVAS PRUEBAS DE SEGURIDAD ANÓNIMA (Pantalla de inicio sin login)
  // ----------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('🌐 VERIFICACIÓN DE ACCESO ANÓNIMO (SIN LOGIN)');
  console.log('----------------------------------------------------------------');

  // Test E: Anónimo lee operadores para botones de acceso rápido
  console.log('\n5. Probando SELECT en perfiles con rol = "operador" como ANÓNIMO...');
  const resAnonOps = await clientAnon
    .from('perfiles')
    .select('*')
    .eq('rol', 'operador')
    .order('nombre');

  if (resAnonOps.error) {
    console.log('   ❌ ERROR AL CONSULTAR:', resAnonOps.error.message, `(${resAnonOps.error.code})`);
  } else {
    console.log(`   ✅ CORRECTO: Se obtuvieron ${resAnonOps.data?.length || 0} operadores para botones rápidos:`);
    resAnonOps.data?.forEach((op) => {
      console.log(`      • ${op.nombre} (Legajo #${op.legajo})`);
    });
  }

  // Test F: Anónimo intenta leer perfiles de supervisor
  console.log('\n6. Probando SELECT en perfiles de SUPERVISOR como ANÓNIMO...');
  const resAnonSup = await clientAnon
    .from('perfiles')
    .select('*')
    .eq('rol', 'supervisor');

  if (resAnonSup.error) {
    console.log('   🔒 PROTEGIDO CON ERROR:', resAnonSup.error.message);
  } else if (!resAnonSup.data || resAnonSup.data.length === 0) {
    console.log('   🔒 PROTEGIDO: 0 supervisores expuestos a clientes anónimos.');
  } else {
    console.log(`   ⚠️ EXPUESTO: Se listaron ${resAnonSup.data.length} supervisores a usuarios anónimos!`);
  }

  // Test G: Anónimo intenta modificar equipos
  console.log('\n7. Probando UPDATE en equipos como ANÓNIMO...');
  const resAnonUpdateEq = await clientAnon
    .from('equipos')
    .update({ marca: 'Hacked' })
    .eq('interno', '01')
    .select();

  if (resAnonUpdateEq.error) {
    console.log('   🔒 BLOQUEADO POR RLS CON ERROR:', resAnonUpdateEq.error.message);
  } else if (!resAnonUpdateEq.data || resAnonUpdateEq.data.length === 0) {
    console.log('   🔒 BLOQUEADO POR RLS: 0 filas modificadas.');
  } else {
    console.log('   ⚠️ VULNERABLE: Cliente anónimo pudo modificar equipos!');
  }

  // Test H: Anónimo intenta insertar inspección
  console.log('\n8. Probando INSERT en inspecciones como ANÓNIMO...');
  const resAnonInsp = await clientAnon
    .from('inspecciones')
    .insert({ equipo_id: '00000000-0000-0000-0000-000000000000' })
    .select();

  if (resAnonInsp.error) {
    console.log('   🔒 BLOQUEADO POR RLS:', resAnonInsp.error.message);
  } else {
    console.log('   ⚠️ VULNERABLE: Cliente anónimo pudo crear inspección!');
  }

  // Test I: Anónimo intenta insertar falla
  console.log('\n9. Probando INSERT en fallas como ANÓNIMO...');
  const resAnonFalla = await clientAnon
    .from('fallas')
    .insert({ descripcion: 'Test anon intruso' })
    .select();

  if (resAnonFalla.error) {
    console.log('   🔒 BLOQUEADO POR RLS:', resAnonFalla.error.message);
  } else {
    console.log('   ⚠️ VULNERABLE: Cliente anónimo pudo crear falla!');
  }

  console.log('\n================================================================\n');
}

runAudit();

