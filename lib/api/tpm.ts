import { createClient } from '../supabase/client';
import {
  Equipo,
  ChecklistTemplate,
  ChecklistItem,
  Inspeccion,
  Falla,
  InspeccionPayload,
} from '../types/tpm';
import {
  getMockEquipos,
  getMockEquipoByQR,
  getMockEquipoById,
  getMockTemplateAndItems,
  saveMockInspeccion,
  getMockInspecciones,
  getMockFallas,
  updateMockFallaEstado,
} from '../data/mock-db';
import { enqueueInspeccion } from '../offline/queue';

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
  if (!isSupabaseConfigured()) {
    return await getMockEquipoByQR(qrCodigo);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('equipos')
    .select('*')
    .eq('qr_codigo', qrCodigo)
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

export async function submitInspeccion(payload: InspeccionPayload): Promise<{
  success: boolean;
  inspeccionId?: string;
  queuedOffline?: boolean;
  error?: string;
}> {
  // Modo desarrollo sin configuración de Supabase
  if (!isSupabaseConfigured()) {
    const res = await saveMockInspeccion(payload);
    return { success: true, inspeccionId: res.inspeccionId };
  }

  try {
    const supabase = createClient();

    // 1. Cabecera de inspección
    const { data: inspData, error: inspError } = await (supabase.from('inspecciones') as any)
      .insert({
        equipo_id: payload.equipo_id,
        operador_id: payload.operador_id,
        template_id: payload.template_id,
        horometro: payload.horometro,
        iniciado_en: payload.iniciado_en,
        finalizado_en: payload.finalizado_en,
        estado_resultante: payload.estado_resultante,
      })
      .select('id')
      .single();

    if (inspError || !inspData) {
      throw new Error(inspError?.message || 'Error al guardar inspección en Supabase');
    }

    const inspeccionId = inspData.id as string;

    // 2. Guardar respuestas de cada ítem
    for (const resp of payload.respuestas) {
      const { data: respData, error: respError } = await (supabase.from('respuestas_item') as any)
        .insert({
          inspeccion_id: inspeccionId,
          item_id: resp.item_id,
          valor_bool: resp.valor_bool,
          valor_numero: resp.valor_numero,
          valor_texto: resp.valor_texto,
          es_falla: resp.es_falla,
        })
        .select('id')
        .single();

      if (respError) {
        console.error('Error al guardar respuesta de ítem:', respError);
        continue;
      }

      // 3. Si es falla, registrar en tabla fallas
      if (resp.es_falla && resp.falla && respData) {
        let uploadedPhotoUrl = resp.falla.foto_url || null;

        if (resp.falla.foto_base64 && resp.falla.foto_base64.startsWith('data:image')) {
          try {
            const base64Data = resp.falla.foto_base64.split(',')[1];
            const mimeMatch = resp.falla.foto_base64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
            const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const ext = contentType.split('/')[1] || 'jpg';
            const fileName = `${payload.equipo_id}/${inspeccionId}_${resp.item_id}.${ext}`;

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
            } else {
              console.warn('Error subiendo foto al bucket de Supabase:', uploadErr);
            }
          } catch (uploadException) {
            console.warn('Excepción al procesar imagen para storage:', uploadException);
          }
        }

        await (supabase.from('fallas') as any).insert({
          respuesta_id: respData.id,
          equipo_id: payload.equipo_id,
          gravedad: resp.falla.gravedad,
          descripcion: resp.falla.descripcion,
          foto_url: uploadedPhotoUrl,
          detectado_por: payload.operador_id,
          estado_reparacion: 'pendiente',
        });
      }
    }

    return { success: true, inspeccionId };
  } catch (err: any) {
    console.error('Falla al enviar inspección a Supabase. Encolando en almacenamiento local:', err);
    // Guardado explícito en IndexedDB sin fingir éxito en servidor
    try {
      await enqueueInspeccion(payload);
      return {
        success: false,
        queuedOffline: true,
        inspeccionId: 'offline-queued',
        error: err?.message || 'Error de conexión con el servidor',
      };
    } catch (queueErr) {
      console.error('Error crítico al encolar localmente:', queueErr);
      return {
        success: false,
        queuedOffline: false,
        error: `Error al guardar localmente: ${err?.message}`,
      };
    }
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

