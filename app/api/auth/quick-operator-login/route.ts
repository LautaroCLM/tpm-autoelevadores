import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const legajo = body?.legajo;
    const profileId = body?.profileId;

    if (!legajo) {
      return NextResponse.json({ error: 'Legajo requerido' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Faltan credenciales en variables de entorno' }, { status: 500 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cleanLegajo = String(legajo).replace(/^LEG-?/i, '').trim();
    const email = `op_${cleanLegajo}@tpmplanta.com`;
    const tempPassword = `op_pass_${cleanLegajo}_${Date.now()}`;

    // Buscar usuario en Supabase Auth por email o profileId
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();

    if (listErr || !usersData?.users) {
      return NextResponse.json(
        { error: listErr?.message || 'Error consultando usuarios de autenticación' },
        { status: 500 }
      );
    }

    const targetUser = usersData.users.find(
      (u) =>
        u.email === email ||
        u.id === profileId ||
        u.user_metadata?.legajo === cleanLegajo ||
        u.user_metadata?.legajo === legajo
    );

    if (!targetUser) {
      return NextResponse.json({ error: 'Operador no encontrado en autenticación' }, { status: 404 });
    }

    // Establecer contraseña temporal para autenticación directa del cliente
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      password: tempPassword,
    });

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      email: targetUser.email || email,
      password: tempPassword,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error interno del servidor' }, { status: 500 });
  }
}
