export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string;
          nombre: string;
          legajo: string | null;
          rol: 'operador' | 'supervisor' | 'mantenimiento';
          created_at: string;
        };
        Insert: {
          id: string;
          nombre: string;
          legajo?: string | null;
          rol: 'operador' | 'supervisor' | 'mantenimiento';
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          legajo?: string | null;
          rol?: 'operador' | 'supervisor' | 'mantenimiento';
          created_at?: string;
        };
      };
      equipos: {
        Row: {
          id: string;
          interno: string;
          marca: string | null;
          modelo: string | null;
          combustible: string | null;
          qr_codigo: string;
          horometro_actual: number;
          horometro_proximo_mantenimiento: number | null;
          estado: 'operativo' | 'observado' | 'fuera_de_servicio';
          created_at: string;
        };
        Insert: {
          id?: string;
          interno: string;
          marca?: string | null;
          modelo?: string | null;
          combustible?: string | null;
          qr_codigo: string;
          horometro_actual?: number;
          horometro_proximo_mantenimiento?: number | null;
          estado?: 'operativo' | 'observado' | 'fuera_de_servicio';
          created_at?: string;
        };
        Update: {
          id?: string;
          interno?: string;
          marca?: string | null;
          modelo?: string | null;
          combustible?: string | null;
          qr_codigo?: string;
          horometro_actual?: number;
          horometro_proximo_mantenimiento?: number | null;
          estado?: 'operativo' | 'observado' | 'fuera_de_servicio';
          created_at?: string;
        };
      };
      checklist_templates: {
        Row: {
          id: string;
          nombre: string;
          version: number;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          version?: number;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          version?: number;
          activo?: boolean;
          created_at?: string;
        };
      };
      checklist_items: {
        Row: {
          id: string;
          template_id: string;
          seccion: string;
          etiqueta: string;
          tipo_dato: 'booleano' | 'numero' | 'texto';
          orden: number;
        };
        Insert: {
          id?: string;
          template_id: string;
          seccion: string;
          etiqueta: string;
          tipo_dato: 'booleano' | 'numero' | 'texto';
          orden: number;
        };
        Update: {
          id?: string;
          template_id?: string;
          seccion?: string;
          etiqueta?: string;
          tipo_dato?: 'booleano' | 'numero' | 'texto';
          orden?: number;
        };
      };
      inspecciones: {
        Row: {
          id: string;
          equipo_id: string;
          operador_id: string;
          template_id: string;
          horometro: number;
          iniciado_en: string;
          finalizado_en: string | null;
          estado_resultante: 'operativo' | 'observado' | 'fuera_de_servicio' | null;
        };
        Insert: {
          id?: string;
          equipo_id: string;
          operador_id: string;
          template_id: string;
          horometro: number;
          iniciado_en?: string;
          finalizado_en?: string | null;
          estado_resultante?: 'operativo' | 'observado' | 'fuera_de_servicio' | null;
        };
        Update: {
          id?: string;
          equipo_id?: string;
          operador_id?: string;
          template_id?: string;
          horometro?: number;
          iniciado_en?: string;
          finalizado_en?: string | null;
          estado_resultante?: 'operativo' | 'observado' | 'fuera_de_servicio' | null;
        };
      };
      respuestas_item: {
        Row: {
          id: string;
          inspeccion_id: string;
          item_id: string;
          valor_bool: boolean | null;
          valor_numero: number | null;
          valor_texto: string | null;
          es_falla: boolean;
        };
        Insert: {
          id?: string;
          inspeccion_id: string;
          item_id: string;
          valor_bool?: boolean | null;
          valor_numero?: number | null;
          valor_texto?: string | null;
          es_falla?: boolean;
        };
        Update: {
          id?: string;
          inspeccion_id?: string;
          item_id?: string;
          valor_bool?: boolean | null;
          valor_numero?: number | null;
          valor_texto?: string | null;
          es_falla?: boolean;
        };
      };
      fallas: {
        Row: {
          id: string;
          respuesta_id: string;
          equipo_id: string;
          gravedad: 'leve' | 'media' | 'critica';
          descripcion: string | null;
          foto_url: string | null;
          detectado_por: string | null;
          estado_reparacion: 'pendiente' | 'en_revision' | 'reparando' | 'reparado' | 'cerrado';
          created_at: string;
          resuelto_en: string | null;
        };
        Insert: {
          id?: string;
          respuesta_id: string;
          equipo_id: string;
          gravedad: 'leve' | 'media' | 'critica';
          descripcion?: string | null;
          foto_url?: string | null;
          detectado_por?: string | null;
          estado_reparacion?: 'pendiente' | 'en_revision' | 'reparando' | 'reparado' | 'cerrado';
          created_at?: string;
          resuelto_en?: string | null;
        };
        Update: {
          id?: string;
          respuesta_id?: string;
          equipo_id?: string;
          gravedad?: 'leve' | 'media' | 'critica';
          descripcion?: string | null;
          foto_url?: string | null;
          detectado_por?: string | null;
          estado_reparacion?: 'pendiente' | 'en_revision' | 'reparando' | 'reparado' | 'cerrado';
          created_at?: string;
          resuelto_en?: string | null;
        };
      };
    };
  };
};
