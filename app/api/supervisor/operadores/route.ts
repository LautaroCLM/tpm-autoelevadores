import { checkRateLimit, getClientIp, logSecurityEvent } from '../../../../lib/utils/rateLimit';
import { jsonWithCors, preflight } from '../../../../lib/server/http';
import { verifySupervisorAuth, cerrarSesionesUsuario } from '../../../../lib/server/supervisorAuth';
import { emailOperador, validarLegajo, validarPin } from '../../../../lib/utils/pin';

export const dynamic = 'force-dynamic';

const METHODS = 'GET, POST, OPTIONS';

export async function OPTIONS(req: Request) {
  return preflight(req, METHODS);
}

function json(data: unknown, req: Request, status = 200) {
  return jsonWithCors(data, req, METHODS, status, { 'Cache-Control': 'no-store' });
}

/**
 * GET /api/supervisor/operadores
 * Lista operadores con el estado de su tarjeta QR (sin exponer hashes ni tokens).
 */
export async function GET(req: Request) {
  const auth = await verifySupervisorAuth(req);
  if (!auth.ok) return json({ error: auth.error }, req, auth.status);

  const { data: operadores, error } = await auth.supabaseAdmin
    .from('perfiles')
    .select('id, nombre, legajo, created_at')
    .eq('rol', 'operador')
    .order('nombre', { ascending: true });

  if (error) return json({ error: 'No se pudo consultar operadores' }, req, 500);

  const ids = (operadores || []).map((o: { id: string }) => o.id);
  let tokensActivos: { operador_id: string; created_at: string | null; last_used_at: string | null }[] = [];

  if (ids.length > 0) {
    const { data: tokens } = await auth.supabaseAdmin
      .from('operador_qr_tokens')
      .select('operador_id, created_at, last_used_at')
      .in('operador_id', ids)
      .eq('revoked', false);
    tokensActivos = tokens || [];
  }

  const porOperador = new Map(tokensActivos.map((t) => [t.operador_id, t]));

  return json({
    operadores: (operadores || []).map((o: { id: string; nombre: string; legajo: string | null; created_at: string | null }) => {
      const tok = porOperador.get(o.id);
      return {
        id: o.id,
        nombre: o.nombre,
        legajo: o.legajo,
        created_at: o.created_at,
        qr_activo: Boolean(tok),
        qr_emitido_en: tok?.created_at ?? null,
        qr_ultimo_uso: tok?.last_used_at ?? null,
      };
    }),
  }, req);
}

/**
 * POST /api/supervisor/operadores
 * - { action: 'crear', nombre, legajo, pin }  → da de alta un operador nuevo
 * - { action: 'set_pin', operador_id, pin }   → asigna o resetea el PIN de un operador
 */
export async function POST(req: Request) {
  const clientIp = getClientIp(req);
  const rl = checkRateLimit(`supervisor_operadores_${clientIp}`, { maxRequests: 30, windowMs: 60 * 1000 });
  if (!rl.success) {
    return json({ error: `Límite de operaciones excedido. Espere ${rl.resetSeconds} segundos.` }, req, 429);
  }

  const auth = await verifySupervisorAuth(req);
  if (!auth.ok) return json({ error: auth.error }, req, auth.status);
  const admin = auth.supabaseAdmin;

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === 'crear') {
    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
    const legajo = typeof body?.legajo === 'string' ? body.legajo.trim().replace(/^LEG-?/i, '') : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

    if (!nombre || nombre.length > 80) return json({ error: 'Ingrese nombre y apellido (máx. 80 caracteres)' }, req, 400);
    const legajoErr = validarLegajo(legajo);
    if (legajoErr) return json({ error: legajoErr }, req, 400);
    const pinErr = validarPin(pin);
    if (pinErr) return json({ error: pinErr }, req, 400);

    const { data: existente } = await admin.from('perfiles').select('id').eq('legajo', legajo).maybeSingle();
    if (existente) return json({ error: `El legajo ${legajo} ya está asignado a otro empleado` }, req, 409);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emailOperador(legajo),
      password: pin,
      email_confirm: true,
      user_metadata: { nombre, legajo, rol: 'operador' },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || '';
      const yaExiste = /already|registered|exists/i.test(msg);
      return json(
        { error: yaExiste ? `Ya existe una cuenta para el legajo ${legajo}` : 'No se pudo crear la cuenta del operador' },
        req,
        yaExiste ? 409 : 500
      );
    }

    const { error: perfilErr } = await admin
      .from('perfiles')
      .upsert({ id: created.user.id, nombre, legajo, rol: 'operador' }, { onConflict: 'id' });

    if (perfilErr) {
      // Revertir la cuenta de Auth para no dejar usuarios huérfanos
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return json({ error: 'No se pudo registrar el perfil del operador' }, req, 500);
    }

    logSecurityEvent({ action: 'OPERADOR_CREATE', ip: clientIp, identifier: legajo, outcome: 'ALLOWED' });
    return json({ success: true, operador: { id: created.user.id, nombre, legajo } }, req, 201);
  }

  if (action === 'set_pin') {
    const operadorId = typeof body?.operador_id === 'string' ? body.operador_id : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';

    if (!operadorId) return json({ error: 'Parámetro operador_id requerido' }, req, 400);
    const pinErr = validarPin(pin);
    if (pinErr) return json({ error: pinErr }, req, 400);

    const { data: operador } = await admin
      .from('perfiles')
      .select('id, legajo, rol')
      .eq('id', operadorId)
      .maybeSingle();

    if (!operador) return json({ error: 'Operador no encontrado' }, req, 404);
    if (operador.rol !== 'operador') {
      return json({ error: 'Solo se puede asignar PIN a operarios' }, req, 400);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(operador.id, { password: pin });
    if (updErr) {
      logSecurityEvent({
        action: 'OPERADOR_SET_PIN',
        ip: clientIp,
        identifier: operador.legajo || undefined,
        outcome: 'REJECTED',
        reason: updErr.message,
      });
      return json({ error: 'No se pudo actualizar el PIN' }, req, 500);
    }

    // Un PIN nuevo suele significar que el anterior se filtró: cerrar las sesiones abiertas
    const sesionesCerradas = await cerrarSesionesUsuario(admin, operador.id);

    logSecurityEvent({
      action: 'OPERADOR_SET_PIN',
      ip: clientIp,
      identifier: operador.legajo || undefined,
      outcome: 'ALLOWED',
    });
    return json({ success: true, sesionesCerradas }, req);
  }

  return json({ error: 'Acción no válida. Valores permitidos: crear, set_pin' }, req, 400);
}
