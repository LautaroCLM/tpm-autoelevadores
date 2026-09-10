import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

function calcularEstadoMantenimiento(actual, proximo) {
  if (proximo == null) {
    return { nivel: 'sin_programar', diff: null, label: 'Sin programar' };
  }
  const diff = Number((proximo - actual).toFixed(1));
  if (diff <= 0) {
    return {
      nivel: 'vencido',
      diff,
      exceso: Math.abs(diff),
      label: `Vencido (${Math.abs(diff).toFixed(1)} hs exceso)`
    };
  }
  if (diff <= 200) {
    return {
      nivel: 'proximo',
      diff,
      restante: diff,
      label: `Próximo (${diff.toFixed(1)} hs restantes)`
    };
  }
  return {
    nivel: 'al_dia',
    diff,
    restante: diff,
    label: `Al día (${diff.toFixed(1)} hs restantes)`
  };
}

async function run() {
  const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey);

  console.log('🔍 Obteniendo equipos actuales...');
  const { data: equipos, error } = await supabase
    .from('equipos')
    .select('id, interno, marca, modelo, horometro_actual, horometro_proximo_mantenimiento, estado')
    .order('interno', { ascending: true });

  if (error) {
    console.error('❌ Error al consultar equipos:', error.message);
    return;
  }

  console.log('\n📊 Estado PREVIO de Mantenimiento:');
  equipos.forEach(eq => {
    const estado = calcularEstadoMantenimiento(eq.horometro_actual, eq.horometro_proximo_mantenimiento);
    console.log(`- Interno #${eq.interno} (${eq.marca}): Actual: ${eq.horometro_actual} hs | Próx: ${eq.horometro_proximo_mantenimiento} hs -> ${estado.nivel.toUpperCase()} [${estado.label}]`);
  });

  console.log('\n🔧 Ajustando Interno #04 a horometro_proximo_mantenimiento = 4100 hs (Vencido)...');
  const target04 = equipos.find(e => e.interno === '04');
  if (target04) {
    const { error: updateErr } = await supabase
      .from('equipos')
      .update({ horometro_proximo_mantenimiento: 4100 })
      .eq('interno', '04');

    if (updateErr) {
      console.error('❌ Error al actualizar Interno #04:', updateErr.message);
    } else {
      console.log('✅ Interno #04 actualizado exitosamente a 4100 hs.');
    }
  }

  const { data: updatedEquipos } = await supabase
    .from('equipos')
    .select('id, interno, marca, modelo, horometro_actual, horometro_proximo_mantenimiento, estado, qr_codigo')
    .order('interno', { ascending: true });

  console.log('\n================================================================');
  console.log('🎯 ESTADO FINAL DE LOS EQUIPOS EN SUPABASE:');
  console.log('================================================================');
  
  let countVencidos = 0;
  let countProximos = 0;
  let countAlDia = 0;

  updatedEquipos.forEach(eq => {
    const estado = calcularEstadoMantenimiento(eq.horometro_actual, eq.horometro_proximo_mantenimiento);
    if (estado.nivel === 'vencido') countVencidos++;
    if (estado.nivel === 'proximo') countProximos++;
    if (estado.nivel === 'al_dia') countAlDia++;

    const icon = estado.nivel === 'vencido' ? '🔴' : estado.nivel === 'proximo' ? '🟡' : '🟢';
    console.log(`${icon} Interno #${eq.interno}: ${eq.horometro_actual} hs vs Próx: ${eq.horometro_proximo_mantenimiento} hs | Dif: ${estado.diff} hs | Nivel: ${estado.nivel.toUpperCase()} (${estado.label})`);
  });

  console.log('\n📈 RESUMEN DE ALERTAS (Métricas Dashboard):');
  console.log(`- Mantenimiento Vencido: ${countVencidos}`);
  console.log(`- Mantenimiento Próximo: ${countProximos}`);
  console.log(`- Mantenimiento Al Día:  ${countAlDia}`);
  console.log('================================================================\n');
}

run();
