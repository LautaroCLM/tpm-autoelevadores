import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getCorsHeaders(req?: Request) {
  const requestOrigin = req?.headers.get('origin') || '';
  const allowedOrigins = [
    'https://tpm-autoelevadores.vercel.app',
    'http://localhost',
    'capacitor://localhost',
  ];

  let origin = '*';
  if (requestOrigin) {
    const isAllowed = allowedOrigins.some((allowed) => requestOrigin.startsWith(allowed));
    if (isAllowed || requestOrigin.includes('localhost') || requestOrigin.startsWith('capacitor:')) {
      origin = requestOrigin;
    }
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(req),
  });
}

function jsonResponse(data: any, req: Request, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: getCorsHeaders(req),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const legajo = body?.legajo;
    const profileId = body?.profileId;

    if (!legajo) {
      return jsonResponse({ error: 'Legajo requerido' }, req, 400);
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
        req,
        500
      );
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cleanLegajo = String(legajo).replace(/^LEG-?/i, '').trim();
    const email = `op_${cleanLegajo}@tpmplanta.com`;
    const tempPassword = `op_pass_${cleanLegajo}_${Date.now()}`;

    // 1. VALIDACIÓN DE SEGURIDAD ESTRICTA: El operador DEBE existir previamente en la tabla public.perfiles
    const { data: perfilExistente, error: perfilErr } = await supabaseAdmin
      .from('perfiles')
      .select('id, nombre, legajo, rol')
      .eq('legajo', cleanLegajo)
      .eq('rol', 'operador')
      .maybeSingle();

    if (perfilErr || !perfilExistente) {
      // Rechazar legajos arbitrarios o no registrados para evitar creación de cuentas no autorizadas
      return jsonResponse({ error: 'Operador no registrado en el sistema de planta' }, req, 404);
    }

    let targetUser: any = null;

    // 2. Buscar si el usuario ya existe en Supabase Auth por el UUID exacto de su perfil
    try {
      const { data: userById } = await supabaseAdmin.auth.admin.getUserById(perfilExistente.id);
      if (userById?.user) {
        targetUser = userById.user;
      }
    } catch {
      // Ignorar error y continuar a búsqueda por email
    }

    // 3. Si no se encontró por ID de perfil, buscar por email en auth.users
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
            u.user_metadata?.legajo === cleanLegajo
        );
      }
    }

    // 4. Si el operador legalmente registrado en public.perfiles aún no tiene cuenta en Auth, asociarla de forma segura
    if (!targetUser) {
      const { data: createdAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          nombre: perfilExistente.nombre,
          legajo: cleanLegajo,
          rol: 'operador',
        },
      });

      if (createErr || !createdAuth?.user) {
        return jsonResponse(
          { error: createErr?.message || 'No se pudo sincronizar la cuenta de autenticación del operador' },
          req,
          500
        );
      }

      targetUser = createdAuth.user;

      // Actualizar el ID en public.perfiles para mantener consistencia 1:1 de UUID
      await supabaseAdmin.from('perfiles').update({ id: targetUser.id }).eq('legajo', cleanLegajo);
    }

    // 5. Establecer la contraseña temporal de un solo uso para que el cliente realice signInWithPassword
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      password: tempPassword,
    });

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, req, 500);
    }

    return jsonResponse(
      {
        success: true,
        email: targetUser.email || email,
        password: tempPassword,
      },
      req
    );
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Error interno del servidor' }, req, 500);
  }
}
