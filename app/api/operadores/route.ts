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

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !serviceKey) {
      return jsonResponse({ error: 'Supabase credentials missing' }, req, 500);
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre, legajo, rol, created_at')
      .eq('rol', 'operador')
      .order('nombre', { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, req, 500);
    }

    return jsonResponse(data || [], req);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Error interno' }, req, 500);
  }
}
