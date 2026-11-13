import { Database } from './database';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Perfil = Tables<'perfiles'>;
export type Equipo = Tables<'equipos'>;
export type ChecklistTemplate = Tables<'checklist_templates'>;
export type ChecklistItem = Tables<'checklist_items'>;
export type Inspeccion = Tables<'inspecciones'>;
export type RespuestaItem = Tables<'respuestas_item'>;
export type Falla = Tables<'fallas'>;

export type RolUsuario = 'operador' | 'supervisor' | 'mantenimiento';
export type EstadoEquipo = 'operativo' | 'observado' | 'fuera_de_servicio';
export type GravedadFalla = 'leve' | 'media' | 'critica';
export type EstadoReparacion = 'pendiente' | 'en_revision' | 'reparando' | 'reparado' | 'cerrado';
export type TipoDatoItem = 'booleano' | 'numero' | 'texto';

/** Acción registrada en el historial de cambios de un autoelevador. */
export type AccionAuditoriaEquipo =
  | 'alta'
  | 'edicion'
  | 'baja'
  | 'reactivacion'
  | 'estado_inspeccion'
  | 'sistema';

/** Una entrada del historial de cambios de un autoelevador (tabla equipos_auditoria). */
export interface EquipoAuditoria {
  id: string;
  equipo_id: string;
  interno: string | null;
  accion: AccionAuditoriaEquipo;
  usuario_id: string | null;
  usuario_nombre: string | null;
  /** Por campo modificado: valor anterior y nuevo. */
  cambios: Record<string, { antes: unknown; despues: unknown }>;
  creado_en: string;
}

export interface ChecklistItemResponse {
  item_id: string;
  valor_bool: boolean | null;
  valor_numero: number | null;
  valor_texto: string | null;
  es_falla: boolean;
  // Metadata de falla si es_falla = true
  falla?: {
    gravedad: GravedadFalla;
    descripcion: string;
    foto_url?: string;
    foto_base64?: string;
  };
}

export interface InspeccionPayload {
  client_generated_id?: string;
  equipo_id: string;
  operador_id: string;
  template_id: string;
  horometro: number;
  iniciado_en: string;
  finalizado_en: string;
  estado_resultante: EstadoEquipo;
  respuestas: ChecklistItemResponse[];
}

export interface OfflineQueuedInspeccion {
  id: string; // client-generated local id (uuid)
  timestamp: number;
  payload: InspeccionPayload;
  retryCount: number;
  lastError?: string;
  isFatal?: boolean;
}

export interface InspeccionConDetalle extends Inspeccion {
  respuestas_item: (RespuestaItem & {
    checklist_items: ChecklistItem | null;
    fallas: Falla[];
  })[];
  operador_nombre?: string;
  operador_legajo?: string;
}

export interface StoragePurgaTask {
  id: string;
  bucket_id: string;
  file_path: string;
  falla_id: string | null;
  estado: 'pendiente' | 'procesando' | 'completado' | 'fallido';
  intentos: number;
  ultimo_error: string | null;
  creado_en: string;
  ultimo_intento_en: string | null;
  completado_en: string | null;
}

