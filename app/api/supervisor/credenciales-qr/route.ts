import crypto from 'crypto';
import { getClientIp, logSecurityEvent } from '../../../../lib/utils/rateLimit';
import { persistentRateLimit } from '../../../../lib/server/rateLimitStore';
import { jsonWithCors, preflight } from '../../../../lib/server/http';
import {
  verifySupervisorAuth as verifySupervisor,
  cerrarSesionesUsuario,
} from '../../../../lib/server/supervisorAuth';

export const dynamic = 'force-dynamic';

const METHODS = 'GET, POST, OPTIONS';

export async function OPTIONS(req: Request) {
  return preflight(req, METHODS);
}

function jsonResponse(data: any, req: Request, status = 200) {
  return jsonWithCors(data, req, METHODS, status, { 'Cache-Control': 'no-store' });
}

/** Adaptador para mantener la firma usada abajo. */
async function verifySupervisorAuth(req: Request, _url: string, _serviceKey: string, _anonKey: string) {
  return verifySupervisor(req);
}

/**
 * GET /api/supervisor/credenciales-qr?operador_id=<uuid>
 * Lista el estado de las credenciales QR de un operador (sin exponer hashes ni tokens).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Cabecera Authorization requerida' }, req, 401);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || !anonKey) {
    return jsonResponse({ error: 'Configuración de servidor incompleta' }, req, 500);
  }

  const authCheck = await verifySupervisorAuth(req, url, serviceKey, anonKey);
  if (!authCheck.ok) {
    return jsonResponse({ error: authCheck.error }, req, authCheck.status);
  }

  const { searchParams } = new URL(req.url);
  const operadorId = searchParams.get('operador_id');

  if (!operadorId) {
    return jsonResponse({ error: 'Parámetro operador_id requerido' }, req, 400);
  }

  const { data: tokens, error: tokensErr } = await authCheck.supabaseAdmin!
    .from('operador_qr_tokens')
    .select('id, created_at, revoked, revoked_at, last_used_at')
    .eq('operador_id', operadorId)
    .order('created_at', { ascending: false });

  if (tokensErr) {
    return jsonResponse({ error: tokensErr.message }, req, 500);
  }

  return jsonResponse({ tokens: tokens || [] }, req);
}

/**
 * POST /api/supervisor/credenciales-qr
 * Genera una nueva credencial QR aleatoria o revoca credenciales existentes para un operario.
 */
export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Cabecera Authorization requerida' }, req, 401);
  }

  // Rate limiting para operaciones administrativas
  const rateLimit = await persistentRateLimit(`supervisor_qr:${clientIp}`, {
    max: 30,
    windowSeconds: 60,
  });

  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: `Límite de operaciones administrativas excedido. Espere ${rateLimit.resetSeconds} segundos.` },
      req,
      429
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || !anonKey) {
    return jsonResponse({ error: 'Configuración de servidor incompleta' }, req, 500);
  }

  const authCheck = await verifySupervisorAuth(req, url, serviceKey, anonKey);
  if (!authCheck.ok) {
    return jsonResponse({ error: authCheck.error }, req, authCheck.status);
  }

  try {
    const body = await req.json().catch(() => null);
    const action = body?.action; // 'generate' | 'revoke'
    const operadorId = body?.operador_id;

    if (!operadorId) {
      return jsonResponse({ error: 'Parámetro operador_id requerido' }, req, 400);
    }

    if (action !== 'generate' && action !== 'revoke') {
      return jsonResponse({ error: 'Acción no válida. Valores permitidos: generate, revoke' }, req, 400);
    }

    // Verificar que el operador objetivo exista y tenga rol operador
    const { data: operador, error: opErr } = await authCheck.supabaseAdmin!
      .from('perfiles')
      .select('id, nombre, legajo, rol')
      .eq('id', operadorId)
      .maybeSingle();

    if (opErr || !operador) {
      return jsonResponse({ error: 'Operador no encontrado' }, req, 404);
    }

    if (operador.rol !== 'operador') {
      return jsonResponse({ error: 'Solo se pueden emitir o revocar credenciales QR para operarios' }, req, 400);
    }

    if (!operador.legajo) {
      return jsonResponse({ error: 'El operario no tiene un legajo asignado' }, req, 400);
    }

    if (action === 'generate') {
      // 1. Revocar tokens activos previos del operario (rotación segura)
      await authCheck.supabaseAdmin!
        .from('operador_qr_tokens')
        .update({ revoked: true, revoked_at: new Date().toISOString() })
        .eq('operador_id', operador.id)
        .eq('revoked', false);

      // 2. Generar token criptográfico aleatorio seguro (24 bytes = 48 caracteres hex)
      const rawToken = 'op_sec_' + crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // 3. Almacenar exclusivamente el HASH SHA-256 en la base de datos
      const { data: insertedToken, error: insertErr } = await authCheck.supabaseAdmin!
        .from('operador_qr_tokens')
        .insert({
          operador_id: operador.id,
          token_hash: tokenHash,
          revoked: false,
        })
        .select('id, created_at')
        .single();

      if (insertErr) {
        logSecurityEvent({
          action: 'QR_CREDENTIAL_GENERATE',
          ip: clientIp,
          identifier: operador.legajo,
          outcome: 'REJECTED',
          reason: insertErr.message,
        });
        return jsonResponse({ error: 'Error al registrar credencial en base de datos' }, req, 500);
      }

      logSecurityEvent({
        action: 'QR_CREDENTIAL_GENERATE',
        ip: clientIp,
        identifier: operador.legajo,
        outcome: 'ALLOWED',
      });

      // 4. Devolver la credencial una sola vez para impresión/distribución
      return jsonResponse(
        {
          success: true,
          tokenId: insertedToken.id,
          legajo: operador.legajo,
          nombre: operador.nombre,
          qrPayload: `TPM:OP:${operador.legajo}:${rawToken}`,
          createdAt: insertedToken.created_at,
        },
        req,
        200
      );
    }

    if (action === 'revoke') {
      // Revocar todos los tokens activos del operario
      const { error: revokeErr } = await authCheck.supabaseAdmin!
        .from('operador_qr_tokens')
        .update({ revoked: true, revoked_at: new Date().toISOString() })
        .eq('operador_id', operador.id)
        .eq('revoked', false);

      if (revokeErr) {
        return jsonResponse({ error: 'Error al revocar credencial' }, req, 500);
      }

      // Cerrar las sesiones abiertas del operario para forzar un nuevo ingreso
      const sesionesCerradas = await cerrarSesionesUsuario(authCheck.supabaseAdmin!, operador.id);

      logSecurityEvent({
        action: 'QR_CREDENTIAL_REVOKE',
        ip: clientIp,
        identifier: operador.legajo,
        outcome: 'ALLOWED',
        reason: sesionesCerradas ? undefined : 'No se pudieron cerrar las sesiones abiertas',
      });

      return jsonResponse(
        {
          success: true,
          sesionesCerradas,
          message: `Credenciales QR del operario #${operador.legajo} revocadas exitosamente.`,
        },
        req,
        200
      );
    }

    return jsonResponse({ error: 'Acción no soportada' }, req, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Error interno del servidor' }, req, 500);
  }
}
