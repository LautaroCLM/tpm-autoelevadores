import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { checkRateLimit, getClientIp, logSecurityEvent } from '../../../../lib/utils/rateLimit';
import { jsonWithCors, preflight } from '../../../../lib/server/http';
import { emailOperador } from '../../../../lib/utils/pin';

export const dynamic = 'force-dynamic';

const METHODS = 'POST, OPTIONS';

export async function OPTIONS(req: Request) {
  return preflight(req, METHODS);
}

function jsonResponse(data: any, req: Request, status = 200) {
  return jsonWithCors(data, req, METHODS, status);
}

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  // 1. LIMITACIÓN DE INTENTOS POR IP (VOLUMÉTRICA)
  const rateLimitIp = checkRateLimit(`quick_login_ip_${clientIp}`, {
    maxRequests: 20, // 20 intentos por minuto por IP para admitir redes NAT industriales
    windowMs: 60 * 1000,
  });

  if (!rateLimitIp.success) {
    logSecurityEvent({
      action: 'AUTH_QUICK_LOGIN',
      ip: clientIp,
      outcome: 'RATE_LIMITED',
      reason: 'Exceso de solicitudes por IP',
    });

    const response = jsonResponse(
      {
        error: `Demasiadas solicitudes desde esta red. Por favor espere ${rateLimitIp.resetSeconds} segundos antes de reintentar.`,
      },
      req,
      429
    );
    response.headers.set('Retry-After', String(rateLimitIp.resetSeconds));
    return response;
  }

  try {
    const body = await req.json().catch(() => null);
    const legajo = body?.legajo;
    const qrToken = body?.token || body?.qr_token || body?.key;
    const personalPin = body?.pin || body?.password;

    if (!legajo) {
      logSecurityEvent({
        action: 'AUTH_QUICK_LOGIN',
        ip: clientIp,
        outcome: 'REJECTED',
        reason: 'Petición sin legajo',
      });
      return jsonResponse({ error: 'Número de legajo requerido' }, req, 400);
    }

    const cleanLegajo = String(legajo).replace(/^LEG-?/i, '').trim();

    // 2. LIMITACIÓN DE INTENTOS POR CUENTA (ANTI BRUTE-FORCE A LEGAJO ESPECÍFICO)
    const rateLimitAccount = checkRateLimit(`quick_login_legajo_${cleanLegajo}`, {
      maxRequests: 5, // Máximo 5 intentos por minuto por cuenta de operario
      windowMs: 60 * 1000,
    });

    if (!rateLimitAccount.success) {
      logSecurityEvent({
        action: 'AUTH_QUICK_LOGIN',
        ip: clientIp,
        identifier: cleanLegajo,
        outcome: 'RATE_LIMITED',
        reason: 'Exceso de intentos sobre legajo específico',
      });

      const response = jsonResponse(
        {
          error: `Demasiados intentos fallidos para el legajo ${cleanLegajo}. Por seguridad, espere ${rateLimitAccount.resetSeconds} segundos.`,
        },
        req,
        429
      );
      response.headers.set('Retry-After', String(rateLimitAccount.resetSeconds));
      return response;
    }

    // 3. CONTROL DE SEGURIDAD ESTRICTO: NO SE PERMITE ACCESO SIN CREDENCIAL REAL
    // El legajo es un identificador público. Jamás constituye prueba de identidad por sí solo.
    if (!qrToken && !personalPin) {
      logSecurityEvent({
        action: 'AUTH_QUICK_LOGIN',
        ip: clientIp,
        identifier: cleanLegajo,
        outcome: 'UNAUTHORIZED',
        reason: 'Intento de acceso por solo legajo sin token ni PIN',
      });

      return jsonResponse(
        {
          error:
            'Credencial requerida. El legajo es un identificador público y no constituye prueba de identidad. Escanee una credencial QR autorizada o ingrese su clave/PIN de operador.',
        },
        req,
        401
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || (!anonKey && !serviceKey)) {
      return jsonResponse({ error: 'Configuración de autenticación no disponible' }, req, 500);
    }

    // 3. VALIDACIÓN DE EXISTENCIA DEL OPERADOR EN BASE DE DATOS
    const supabaseAdmin = createClient(url, serviceKey || anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: perfilExistente, error: perfilErr } = await supabaseAdmin
      .from('perfiles')
      .select('id, nombre, legajo, rol')
      .eq('legajo', cleanLegajo)
      .eq('rol', 'operador')
      .maybeSingle();

    if (perfilErr || !perfilExistente) {
      logSecurityEvent({
        action: 'AUTH_QUICK_LOGIN',
        ip: clientIp,
        identifier: cleanLegajo,
        outcome: 'REJECTED',
        reason: 'Operador inexistente o no activo',
      });
      // Mensaje genérico para evitar enumeración de usuarios
      return jsonResponse({ error: 'Credenciales inválidas para este operador' }, req, 401);
    }

    // Resolver el email real de Auth por el ID del perfil, para que el ingreso no dependa
    // de que el legajo actual coincida con el usado al crear la cuenta.
    let email = emailOperador(cleanLegajo);
    if (serviceKey) {
      const { data: authLookup } = await supabaseAdmin.auth.admin.getUserById(perfilExistente.id);
      if (authLookup?.user?.email) {
        email = authLookup.user.email;
      }
    }

    let userSession: any = null;
    let authUser: any = null;

    // 4. FLUJO A: AUTENTICACIÓN MEDIANTE CREDENCIAL QR CRIPTOGRÁFICA INDEPENDIENTE
    if (qrToken) {
      const cleanToken = String(qrToken).trim();
      const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

      // Consultar token en la tabla segura de tokens QR
      const { data: tokenRow, error: tokenErr } = await supabaseAdmin
        .from('operador_qr_tokens')
        .select('id, revoked')
        .eq('operador_id', perfilExistente.id)
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (tokenErr) {
        // Si la tabla aún no existe o hay error de esquema, registrar y rechazar
        logSecurityEvent({
          action: 'AUTH_QR_TOKEN',
          ip: clientIp,
          identifier: cleanLegajo,
          outcome: 'REJECTED',
          reason: `Error consultando tabla de tokens QR: ${tokenErr.message}`,
        });
        return jsonResponse(
          { error: 'El sistema de credenciales QR criptográficas no está disponible o requiere migración.' },
          req,
          401
        );
      }

      if (!tokenRow) {
        logSecurityEvent({
          action: 'AUTH_QR_TOKEN',
          ip: clientIp,
          identifier: cleanLegajo,
          outcome: 'REJECTED',
          reason: 'Token QR no coincide con ningún registro activo',
        });
        return jsonResponse(
          { error: 'Credencial QR no válida o no registrada. Por favor ingrese su PIN o consulte al supervisor.' },
          req,
          401
        );
      }

      if (tokenRow.revoked) {
        logSecurityEvent({
          action: 'AUTH_QR_TOKEN',
          ip: clientIp,
          identifier: cleanLegajo,
          outcome: 'REJECTED',
          reason: 'Token QR se encuentra explícitamente revocado',
        });
        return jsonResponse(
          { error: 'Esta credencial QR ha sido revocada. Solicite una nueva tarjeta a su supervisor.' },
          req,
          401
        );
      }

      // Token válido: actualizar fecha de último uso sin modificar contraseñas
      await supabaseAdmin
        .from('operador_qr_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', tokenRow.id);

      // Generar sesión de Supabase Auth mediante generateLink / verifyOtp
      if (serviceKey) {
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email,
        });

        if (!linkErr && linkData?.properties?.hashed_token) {
          const supabaseAuthClient = createClient(url, anonKey || serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data: verifyData } = await supabaseAuthClient.auth.verifyOtp({
            token_hash: linkData.properties.hashed_token,
            type: 'email',
          });

          if (verifyData?.session) {
            userSession = verifyData.session;
            authUser = verifyData.user;
          }
        }
      }

      if (!userSession) {
        logSecurityEvent({
          action: 'AUTH_QR_TOKEN',
          ip: clientIp,
          identifier: cleanLegajo,
          outcome: 'REJECTED',
          reason: 'Fallo al generar sesión Supabase Auth para token válido',
        });
        return jsonResponse(
          { error: 'No se pudo generar la sesión de autenticación. Ingrese con su PIN o verifique la conexión con el servidor.' },
          req,
          500
        );
      }
    } else {
      // 5. FLUJO B: AUTENTICACIÓN TRADICIONAL MEDIANTE PIN PERSONAL DEL OPERADOR
      const cleanPin = String(personalPin).trim();
      const supabaseAuthClient = createClient(url, anonKey || serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: authData, error: authErr } = await supabaseAuthClient.auth.signInWithPassword({
        email,
        password: cleanPin,
      });

      if (authErr || !authData.user) {
        logSecurityEvent({
          action: 'AUTH_PIN_LOGIN',
          ip: clientIp,
          identifier: cleanLegajo,
          outcome: 'REJECTED',
          reason: 'PIN o contraseña incorrecta',
        });

        return jsonResponse(
          {
            error: 'PIN de operador incorrecto. Verifique sus datos o intente nuevamente.',
          },
          req,
          401
        );
      }

      userSession = authData.session;
      authUser = authData.user;
    }

    // 6. ACCESO CONCEDIDO
    logSecurityEvent({
      action: qrToken ? 'AUTH_QR_TOKEN' : 'AUTH_PIN_LOGIN',
      ip: clientIp,
      identifier: cleanLegajo,
      outcome: 'ALLOWED',
    });

    return jsonResponse(
      {
        success: true,
        email: authUser?.email || email,
        user: authUser,
        session: userSession,
        perfil: perfilExistente,
      },
      req,
      200
    );
  } catch (err: any) {
    logSecurityEvent({
      action: 'AUTH_QUICK_LOGIN',
      ip: clientIp,
      outcome: 'REJECTED',
      reason: err?.message || 'Error no controlado',
    });

    return jsonResponse({ error: 'Error al procesar la autenticación' }, req, 500);
  }
}
