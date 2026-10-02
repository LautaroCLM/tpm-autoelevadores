import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

function jsonResponse(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const legajo = body?.legajo;
    const profileId = body?.profileId;

    if (!legajo) {
      return jsonResponse({ error: 'Legajo requerido' }, 400);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey || serviceKey.includes('placeholder') || serviceKey.includes('your-service-role')) {
      console.error(
        '[QuickLogin Error] SUPABASE_SERVICE_ROLE_KEY no está configurada o es inválida en el servidor/Vercel.'
      );
      return jsonResponse(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY no está configurada en las variables de entorno de Vercel/Servidor. Configúrela en Vercel > Project Settings > Environment Variables.',
        },
        500
      );
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cleanLegajo = String(legajo).replace(/^LEG-?/i, '').trim();
    const email = `op_${cleanLegajo}@tpmplanta.com`;
    const tempPassword = `op_pass_${cleanLegajo}_${Date.now()}`;

    let targetUser: any = null;

    // 1. Intentar buscar por profileId si fue provisto
    if (profileId) {
      try {
        const { data: userById } = await supabaseAdmin.auth.admin.getUserById(profileId);
        if (userById?.user) {
          targetUser = userById.user;
        }
      } catch {
        // Continuar si falla
      }
    }

    // 2. Si no se encontró por ID, buscar en public.perfiles por legajo para obtener el UUID exacto
    if (!targetUser) {
      const { data: perfilData } = await supabaseAdmin
        .from('perfiles')
        .select('id, nombre, legajo')
        .eq('legajo', cleanLegajo)
        .maybeSingle();

      if (perfilData?.id) {
        try {
          const { data: userByPerfilId } = await supabaseAdmin.auth.admin.getUserById(perfilData.id);
          if (userByPerfilId?.user) {
            targetUser = userByPerfilId.user;
          }
        } catch {
          // Continuar
        }
      }
    }

    // 3. Fallback: buscar en listUsers de Supabase Auth por email o legajo en metadata
    if (!targetUser) {
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (!listErr && usersData?.users) {
        targetUser = usersData.users.find(
          (u) =>
            u.email?.toLowerCase() === email.toLowerCase() ||
            u.id === profileId ||
            u.user_metadata?.legajo === cleanLegajo ||
            u.user_metadata?.legajo === legajo
        );
      }
    }

    // 4. Si aún no existe el usuario en Auth, auto-provisionarlo en Supabase Auth
    if (!targetUser) {
      // Buscar información en perfiles
      const { data: perfilInfo } = await supabaseAdmin
        .from('perfiles')
        .select('nombre, legajo')
        .eq('legajo', cleanLegajo)
        .maybeSingle();

      const nombreOperador = perfilInfo?.nombre || `Operador Legajo ${cleanLegajo}`;

      const { data: createdAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          nombre: nombreOperador,
          legajo: cleanLegajo,
          rol: 'operador',
        },
      });

      if (createErr || !createdAuth?.user) {
        return jsonResponse(
          { error: createErr?.message || 'No se pudo registrar el usuario operador en Auth' },
          500
        );
      }

      targetUser = createdAuth.user;

      // Garantizar que la tabla public.perfiles quede sincronizada con el nuevo UUID
      await supabaseAdmin.from('perfiles').upsert(
        {
          id: targetUser.id,
          nombre: nombreOperador,
          legajo: cleanLegajo,
          rol: 'operador',
        },
        { onConflict: 'id' }
      );
    }

    // 5. Actualizar la contraseña del usuario a la clave temporal
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      password: tempPassword,
    });

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 500);
    }

    return jsonResponse({
      success: true,
      email: targetUser.email || email,
      password: tempPassword,
    });
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Error interno del servidor' }, 500);
  }
}
