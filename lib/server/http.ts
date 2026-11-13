import { NextResponse } from 'next/server';

const PROD_ORIGIN = 'https://tpm-autoelevadores.vercel.app';

/**
 * Orígenes exactos permitidos. Antes se usaba `includes('localhost')`, que también
 * aceptaba dominios como `localhost.evil.com`.
 */
const EXACT_ORIGINS = new Set<string>([
  PROD_ORIGIN,
  'capacitor://localhost',
  'https://localhost', // WebView Android de Capacitor
  'http://localhost',
]);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (EXACT_ORIGINS.has(origin)) return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (appUrl && origin === appUrl) return true;

  // Servidor de desarrollo local con puerto (ej: http://localhost:3000)
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

export function corsHeaders(req: Request | undefined, methods: string): Record<string, string> {
  const origin = req?.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : PROD_ORIGIN,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-tpm-client',
    Vary: 'Origin',
  };
}

export function jsonWithCors(
  data: unknown,
  req: Request,
  methods: string,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return NextResponse.json(data, {
    status,
    headers: { ...corsHeaders(req, methods), ...extraHeaders },
  });
}

export function preflight(req: Request, methods: string) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(req, methods) });
}
