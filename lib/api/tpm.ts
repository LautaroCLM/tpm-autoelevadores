import { createClient } from '../supabase/client';
import {
  Equipo,
  ChecklistTemplate,
  ChecklistItem,
  Inspeccion,
  Falla,
  InspeccionPayload,
  InspeccionConDetalle,
} from '../types/tpm';
import {
  getMockEquipos,
  getMockEquipoByQR,
  getMockEquipoById,
  getMockTemplateAndItems,
  saveMockInspeccion,
  getMockInspecciones,
  getMockInspeccionesByEquipo,
  getMockFallas,
  updateMockFallaEstado,
} from '../data/mock-db';
import { enqueueInspeccion } from '../offline/queue';
import { extractEquipoCode } from '../utils/auth-helpers';

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('placeholder') && !key.includes('placeholder'));
}

export async function fetchEquipos(): Promise<Equipo[]> {
  if (!isSupabaseConfigured()) {
    return await getMockEquipos();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('equipos')
    .select('*')
    .order('interno', { ascending: true });

  if (error) {
    console.error('Error fetching equipos from Supabase:', error);
    throw new Error(`Error al consultar equipos: ${error.message}`);
  }

  return (data || []) as Equipo[];
}

export async function fetchEquipoByQR(qrCodigo: string): Promise<Equipo | null> {
  const cleanCode = extractEquipoCode(qrCodigo);
  if (!cleanCode) return null;

  if (!isSupabaseConfigured()) {
    return await getMockEquipoByQR(cleanCode);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('equipos')
    .select('*')
    .or(`qr_codigo.ilike.${cleanCode},interno.eq.${cleanCode}`)
    .maybeSingle();

  if (error) {
    console.error('Error fetching equipo by QR from Supabase:', error);
    throw new Error(`Error al buscar equipo por QR: ${error.message}`);
  }

  return (data || null) as Equipo | null;
}

export async function fetchEquipoById(id: string): Promise<Equipo | null> {
  if (!isSupabaseConfigured()) {
    return await getMockEquipoById(id);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('equipos')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching equipo by ID from Supabase:', error);
    throw new Error(`Error al buscar equipo por ID: ${error.message}`);
  }

  return (data || null) as Equipo | null;
}

export async function fetchActiveChecklistTemplate(): Promise<{
  template: ChecklistTemplate;
  items: ChecklistItem[];
}> {
  if (!isSupabaseConfigured()) {
    return await getMockTemplateAndItems();
  }

  const supabase = createClient();
  const { data: template, error: tmplErr } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('activo', true)
    .limit(1)
    .maybeSingle();

  if (tmplErr || !template) {
    console.error('Error fetching checklist template from Supabase:', tmplErr);
    throw new Error(`Error al cargar plantilla TPM: ${tmplErr?.message || 'No se encontró plantilla activa'}`);
  }

  const { data: items, error: itemsErr } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('template_id', (template as ChecklistTemplate).id)
    .order('orden', { ascending: true });

  if (itemsErr || !items || items.length === 0) {
    console.error('Error fetching checklist items from Supabase:', itemsErr);
    throw new Error(`Error al cargar ítems del checklist: ${itemsErr?.message || 'Plantilla sin ítems'}`);
  }

  return {
    template: template as ChecklistTemplate,
    items: items as ChecklistItem[],
  };
}
/**
 * Determina de forma precisa si un error se debe a falta de conectividad/red
 * o si es un error de negocio/validación retornado por PostgreSQL / Supabase.
 */
export function isNetworkError(err: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  if (!err) return false;

  // Si tiene código de error de Postgres / PostgREST (como P0001, 23505, 42501) o status HTTP 4xx, NO es de red
  if (err.code && typeof err.code === 'string' && (err.code.startsWith('P') || err.code.length === 5)) {
    return false;
  }
  if (err.status && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    return false;
  }

  const msg = (err.message || (typeof err === 'string' ? err : '')).toLowerCase();
  const networkKeywords = [
    'failed to fetch',
    'networkerror',
    'network error',
    'fetch error',
    'load failed',
    'timeout',
    'connection refused',
    'err_name_not_resolved',
    'err_internet_disconnected',
    'err_connection_refused',
    'the operation was aborted',
  ];

  return networkKeywords.some((keyword) => msg.includes(keyword));
}

export async function submitInspeccion(payload: InspeccionPayload): Promise<{
  success: boolean;
  inspeccionId?: string;
  queuedOffline?: boolean;
  error?: string;
  idempotent?: boolean;
}> {
  // Asegurar clave de idempotencia única generada por el cliente
  payload.client_generated_id = payload.client_generated_id || crypto.randomUUID();

  // Modo desarrollo sin configuración de Supabase
  if (!isSupabaseConfigured()) {
    const res = await saveMockInspeccion(payload);
    return { success: true, inspeccionId: res.inspeccionId };
  }

  try {
    const supabase = createClient();

    // Validar usuario autenticado y asegurar operador_id real
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return {
        success: false,
        queuedOffline: false,
        error: 'Sesión no válida o expirada. Inicie sesión nuevamente.',
      };
    }
    payload.operador_id = authData.user.id;

    // 1. Subir fotos de fallas a Supabase Storage con paths deterministas antes del RPC
    const rpcRespuestas = [];

    for (const resp of payload.respuestas) {
      let uploadedPhotoUrl = resp.falla?.foto_url || null;

      if (resp.es_falla && resp.falla?.foto_base64 && resp.falla.foto_base64.startsWith('data:image')) {
        try {
          const base64Data = resp.falla.foto_base64.split(',')[1];
          const mimeMatch = resp.falla.foto_base64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
          const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const ext = contentType.split('/')[1] || 'jpg';
          // Nombre determinista por equipo, UUID de cliente e ítem
          const fileName = `${payload.equipo_id}/${payload.client_generated_id}_${resp.item_id}.${ext}`;

          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: contentType });

          const { error: uploadErr } = await supabase.storage
            .from('fallas-fotos')
            .upload(fileName, blob, { contentType, upsert: true });

          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage
              .from('fallas-fotos')
              .getPublicUrl(fileName);
            uploadedPhotoUrl = publicUrlData.publicUrl;
            resp.falla.foto_url = uploadedPhotoUrl;
          } else {
            console.warn('Error subiendo foto al bucket de Supabase:', uploadErr);
            if (isNetworkError(uploadErr)) {
              throw uploadErr;
            }
          }
        } catch (uploadException: any) {
          if (isNetworkError(uploadException)) {
            throw uploadException;
          }
          console.warn('Excepción al procesar imagen para storage:', uploadException);
        }
      }

      rpcRespuestas.push({
        item_id: resp.item_id,
        valor_bool: resp.valor_bool,
        valor_numero: resp.valor_numero,
        valor_texto: resp.valor_texto,
        es_falla: resp.es_falla,
        falla: resp.es_falla && resp.falla ? {
          gravedad: resp.falla.gravedad,
          descripcion: resp.falla.descripcion || null,
          foto_url: uploadedPhotoUrl,
        } : undefined,
      });
    }

    // 2. Ejecutar la función RPC atómica en PostgreSQL
    const rpcPayload = {
      client_generated_id: payload.client_generated_id,
      equipo_id: payload.equipo_id,
      operador_id: payload.operador_id,
      template_id: payload.template_id,
      horometro: payload.horometro,
      iniciado_en: payload.iniciado_en,
      finalizado_en: payload.finalizado_en,
      estado_resultante: payload.estado_resultante,
      respuestas: rpcRespuestas,
    };

    const { data, error: rpcError } = await (supabase as any).rpc('registrar_inspeccion_completa', {
      p_payload: rpcPayload as any,
    });

    if (rpcError) {
      if (isNetworkError(rpcError)) {
        throw rpcError;
      }
      return {
        success: false,
        queuedOffline: false,
        error: rpcError.message || 'Error al validar o registrar la inspección en la base de datos',
      };
    }

    const rpcResult = data as { success: boolean; inspeccion_id: string; idempotent?: boolean } | null;
    return {
      success: true,
      inspeccionId: rpcResult?.inspeccion_id,
      idempotent: rpcResult?.idempotent,
    };
  } catch (err: any) {
    console.error('Error procesando inspección:', err);

    // Solo encolar offline si efectivamente hay un problema de red
    if (isNetworkError(err)) {
      try {
        await enqueueInspeccion(payload);
        return {
          success: false,
          queuedOffline: true,
          inspeccionId: 'offline-queued',
          error: 'Sin conexión: la inspección se guardó en este dispositivo y se sincronizará automáticamente',
        };
      } catch (queueErr) {
        return {
          success: false,
          queuedOffline: false,
          error: `Error al guardar localmente en el dispositivo: ${err?.message}`,
        };
      }
    }

    // Error lógico o de base de datos: reportar el error real sin encolar
    return {
      success: false,
      queuedOffline: false,
      error: err?.message || 'Error al procesar la inspección en la base de datos',
    };
  }
}

export async function fetchInspecciones(): Promise<Inspeccion[]> {
  if (!isSupabaseConfigured()) {
    return await getMockInspecciones();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('inspecciones')
    .select('*')
    .order('iniciado_en', { ascending: false });

  if (error) {
    console.error('Error fetching inspecciones from Supabase:', error);
    throw new Error(`Error al consultar inspecciones: ${error.message}`);
  }

  return (data || []) as Inspeccion[];
}

export async function fetchInspeccionesByEquipo(equipoId: string): Promise<InspeccionConDetalle[]> {
  if (!isSupabaseConfigured()) {
    return await getMockInspeccionesByEquipo(equipoId);
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from('inspecciones')
    .select(`
      *,
      respuestas_item (
        *,
        checklist_items (*),
        fallas (*)
      )
    `)
    .eq('equipo_id', equipoId)
    .order('iniciado_en', { ascending: false });

  if (error) {
    console.error('Error fetching inspecciones by equipo:', error);
    throw new Error(`Error al consultar historial de inspecciones: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Ordenar respuestas_item según el orden natural de cada ítem de checklist
  const inspecciones = data.map((insp: any) => {
    const respuestas = (insp.respuestas_item || []).sort((a: any, b: any) => {
      const ordenA = a.checklist_items?.orden ?? 999;
      const ordenB = b.checklist_items?.orden ?? 999;
      return ordenA - ordenB;
    });
    return {
      ...insp,
      respuestas_item: respuestas,
    };
  });

  // Intentar cargar perfiles de operadores para resolver nombres legibles
  try {
    const { data: perfiles } = await (supabase.from('perfiles') as any)
      .select('id, nombre, legajo');

    if (perfiles && (perfiles as any[]).length > 0) {
      const perfilMap = new Map((perfiles as any[]).map((p: any) => [p.id, p]));
      return inspecciones.map((insp: any) => {
        const p = perfilMap.get(insp.operador_id);
        return {
          ...insp,
          operador_nombre: p?.nombre,
          operador_legajo: p?.legajo || undefined,
        };
      });
    }
  } catch (profileErr) {
    console.warn('No se pudieron consultar perfiles de operador para el historial:', profileErr);
  }

  return inspecciones as InspeccionConDetalle[];
}


export async function fetchFallas(): Promise<Falla[]> {
  if (!isSupabaseConfigured()) {
    return await getMockFallas();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('fallas')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching fallas from Supabase:', error);
    throw new Error(`Error al consultar fallas: ${error.message}`);
  }

  return (data || []) as Falla[];
}

export async function updateFallaEstado(
  fallaId: string,
  nuevoEstado: Falla['estado_reparacion']
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return await updateMockFallaEstado(fallaId, nuevoEstado);
  }

  const supabase = createClient();
  const { error } = await (supabase.from('fallas') as any)
    .update({
      estado_reparacion: nuevoEstado,
      resuelto_en: nuevoEstado === 'cerrado' || nuevoEstado === 'reparado' ? new Date().toISOString() : null,
    })
    .eq('id', fallaId);

  if (error) {
    console.error('Error updating falla estado in Supabase:', error);
    throw new Error(`Error al actualizar estado de la falla: ${error.message}`);
  }

  return true;
}

export async function createEquipo(equipoData: {
  interno: string;
  marca?: string;
  modelo?: string;
  combustible?: string;
  qr_codigo: string;
  horometro_actual?: number;
  horometro_proximo_mantenimiento?: number | null;
  estado?: 'operativo' | 'observado' | 'fuera_de_servicio';
}): Promise<{ success: boolean; equipo?: Equipo; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase no está configurado' };
  }

  const supabase = createClient();
  const { data, error } = await (supabase
    .from('equipos') as any)
    .insert({
      interno: equipoData.interno.trim(),
      marca: equipoData.marca?.trim() || null,
      modelo: equipoData.modelo?.trim() || null,
      combustible: equipoData.combustible || 'GLP',
      qr_codigo: equipoData.qr_codigo.trim().toUpperCase(),
      horometro_actual: equipoData.horometro_actual || 0,
      horometro_proximo_mantenimiento: equipoData.horometro_proximo_mantenimiento || null,
      estado: equipoData.estado || 'operativo',
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating equipo in Supabase:', error);
    return { success: false, error: error.message };
  }

  return { success: true, equipo: data as Equipo };
}

export async function updateEquipo(
  id: string,
  updates: Partial<Equipo>
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase no está configurado' };
  }

  const supabase = createClient();
  const { error } = await (supabase
    .from('equipos') as any)
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating equipo in Supabase:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function deleteEquipo(id: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase no está configurado' };
  }

  const supabase = createClient();
  const { error } = await (supabase
    .from('equipos') as any)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting equipo from Supabase:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

