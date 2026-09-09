import { Equipo, ChecklistTemplate, ChecklistItem, Inspeccion, Falla, InspeccionPayload } from '../types/tpm';

export const INITIAL_EQUIPOS: Equipo[] = [
  {
    id: '22222222-2222-2222-2222-222222222201',
    interno: '01',
    marca: 'Toyota',
    modelo: '8FG25 (2.5 ton)',
    combustible: 'GLP',
    qr_codigo: 'AE-01',
    horometro_actual: 1245.5,
    horometro_proximo_mantenimiento: 1500.0,
    estado: 'operativo',
    created_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    interno: '02',
    marca: 'Hyster',
    modelo: 'H50FT (2.5 ton)',
    combustible: 'Diesel',
    qr_codigo: 'AE-02',
    horometro_actual: 3420.0,
    horometro_proximo_mantenimiento: 3500.0,
    estado: 'observado',
    created_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    interno: '03',
    marca: 'Crown',
    modelo: 'FC5200 (Eléctrico)',
    combustible: 'Electrico',
    qr_codigo: 'AE-03',
    horometro_actual: 890.2,
    horometro_proximo_mantenimiento: 1000.0,
    estado: 'operativo',
    created_at: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222204',
    interno: '04',
    marca: 'Caterpillar',
    modelo: 'DP30N (3.0 ton)',
    combustible: 'Diesel',
    qr_codigo: 'AE-04',
    horometro_actual: 4120.8,
    horometro_proximo_mantenimiento: 4200.0,
    estado: 'fuera_de_servicio',
    created_at: new Date().toISOString(),
  },
];

export const INITIAL_TEMPLATE: ChecklistTemplate = {
  id: '11111111-1111-1111-1111-111111111111',
  nombre: 'TPM Diario Nivel 1 - Autoelevadores',
  version: 1,
  activo: true,
  created_at: new Date().toISOString(),
};

export const INITIAL_ITEMS: ChecklistItem[] = [
  // Sección 1: Niveles y Fluidos
  {
    id: 'item-1',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Niveles y Fluidos',
    etiqueta: 'Nivel de aceite de motor',
    tipo_dato: 'booleano',
    orden: 1,
  },
  {
    id: 'item-2',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Niveles y Fluidos',
    etiqueta: 'Nivel de líquido hidráulico',
    tipo_dato: 'booleano',
    orden: 2,
  },
  {
    id: 'item-3',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Niveles y Fluidos',
    etiqueta: 'Nivel de refrigerante del radiador',
    tipo_dato: 'booleano',
    orden: 3,
  },
  {
    id: 'item-4',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Niveles y Fluidos',
    etiqueta: 'Nivel de líquido de frenos',
    tipo_dato: 'booleano',
    orden: 4,
  },
  {
    id: 'item-5',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Niveles y Fluidos',
    etiqueta: 'Sin pérdidas visibles en mangueras o suelo',
    tipo_dato: 'booleano',
    orden: 5,
  },

  // Sección 2: Seguridad y Alarma
  {
    id: 'item-6',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Seguridad y Alarma',
    etiqueta: 'Cinturón de seguridad operativo y anclaje firme',
    tipo_dato: 'booleano',
    orden: 6,
  },
  {
    id: 'item-7',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Seguridad y Alarma',
    etiqueta: 'Alarma de retroceso sonora audible',
    tipo_dato: 'booleano',
    orden: 7,
  },
  {
    id: 'item-8',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Seguridad y Alarma',
    etiqueta: 'Bocina operativa',
    tipo_dato: 'booleano',
    orden: 8,
  },
  {
    id: 'item-9',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Seguridad y Alarma',
    etiqueta: 'Luces de trabajo delanteras y traseras',
    tipo_dato: 'booleano',
    orden: 9,
  },
  {
    id: 'item-10',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Seguridad y Alarma',
    etiqueta: 'Matafuegos con carga vigente y precinto',
    tipo_dato: 'booleano',
    orden: 10,
  },
  {
    id: 'item-11',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Seguridad y Alarma',
    etiqueta: 'Espejos retrovisores limpios y sin roturas',
    tipo_dato: 'booleano',
    orden: 11,
  },

  // Sección 3: Mecánica, Mástil y Rodado
  {
    id: 'item-12',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Mecánica, Mástil y Rodado',
    etiqueta: 'Estado de neumáticos y llantas (sin cortes)',
    tipo_dato: 'booleano',
    orden: 12,
  },
  {
    id: 'item-13',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Mecánica, Mástil y Rodado',
    etiqueta: 'Horquillas / uñas sin deformaciones ni fisuras',
    tipo_dato: 'booleano',
    orden: 13,
  },
  {
    id: 'item-14',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Mecánica, Mástil y Rodado',
    etiqueta: 'Cadenas y mástil lubricados y alineados',
    tipo_dato: 'booleano',
    orden: 14,
  },
  {
    id: 'item-15',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Mecánica, Mástil y Rodado',
    etiqueta: 'Freno de servicio (pedal) y freno de mano',
    tipo_dato: 'booleano',
    orden: 15,
  },
  {
    id: 'item-16',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Mecánica, Mástil y Rodado',
    etiqueta: 'Dirección suave sin juego excesivo',
    tipo_dato: 'booleano',
    orden: 16,
  },

  // Sección 4: Carga y Combustible
  {
    id: 'item-17',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Carga y Combustible',
    etiqueta: 'Garrafa GLP / Tanque / Batería con fijación segura',
    tipo_dato: 'booleano',
    orden: 17,
  },
  {
    id: 'item-18',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Carga y Combustible',
    etiqueta: 'Nivel de combustible o carga de batería (%)',
    tipo_dato: 'numero',
    orden: 18,
  },
  {
    id: 'item-19',
    template_id: '11111111-1111-1111-1111-111111111111',
    seccion: 'Carga y Combustible',
    etiqueta: 'Observaciones generales del operador',
    tipo_dato: 'texto',
    orden: 19,
  },
];

// Almacenamiento en memoria para modo desarrollo local
let memoryEquipos: Equipo[] = [...INITIAL_EQUIPOS];
let memoryInspecciones: Inspeccion[] = [];
let memoryFallas: Falla[] = [
  {
    id: 'falla-sample-1',
    respuesta_id: 'resp-mock-1',
    equipo_id: '22222222-2222-2222-2222-222222222202',
    gravedad: 'media',
    descripcion: 'Luz trasera izquierda quemada y juego leve en espejo retrovisor',
    foto_url: null,
    detectado_por: 'op-01',
    estado_reparacion: 'en_revision',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    resuelto_en: null,
  },
  {
    id: 'falla-sample-2',
    respuesta_id: 'resp-mock-2',
    equipo_id: '22222222-2222-2222-2222-222222222204',
    gravedad: 'critica',
    descripcion: 'Pérdida de líquido hidráulico abundante por manguera principal de elevación',
    foto_url: null,
    detectado_por: 'op-02',
    estado_reparacion: 'reparando',
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    resuelto_en: null,
  },
];

export async function getMockEquipos(): Promise<Equipo[]> {
  return memoryEquipos;
}

export async function getMockEquipoByQR(qr: string): Promise<Equipo | null> {
  const eq = memoryEquipos.find((e) => e.qr_codigo.toUpperCase() === qr.toUpperCase() || e.interno === qr);
  return eq || null;
}

export async function getMockEquipoById(id: string): Promise<Equipo | null> {
  const eq = memoryEquipos.find((e) => e.id === id);
  return eq || null;
}

export async function getMockTemplateAndItems() {
  return {
    template: INITIAL_TEMPLATE,
    items: INITIAL_ITEMS,
  };
}

export async function saveMockInspeccion(payload: InspeccionPayload): Promise<{ inspeccionId: string; equipo: Equipo }> {
  const inspeccionId = 'insp_' + crypto.randomUUID();

  const newInspeccion: Inspeccion = {
    id: inspeccionId,
    equipo_id: payload.equipo_id,
    operador_id: payload.operador_id,
    template_id: payload.template_id,
    horometro: payload.horometro,
    iniciado_en: payload.iniciado_en,
    finalizado_en: payload.finalizado_en,
    estado_resultante: payload.estado_resultante,
  };

  memoryInspecciones.unshift(newInspeccion);

  // Actualizar equipo
  const equipoIndex = memoryEquipos.findIndex((e) => e.id === payload.equipo_id);
  if (equipoIndex !== -1) {
    memoryEquipos[equipoIndex] = {
      ...memoryEquipos[equipoIndex],
      horometro_actual: Math.max(memoryEquipos[equipoIndex].horometro_actual, payload.horometro),
      estado: payload.estado_resultante,
    };
  }

  // Registrar fallas
  payload.respuestas.forEach((resp) => {
    if (resp.es_falla && resp.falla) {
      const newFalla: Falla = {
        id: 'falla_' + crypto.randomUUID(),
        respuesta_id: 'resp_' + crypto.randomUUID(),
        equipo_id: payload.equipo_id,
        gravedad: resp.falla.gravedad,
        descripcion: resp.falla.descripcion,
        foto_url: resp.falla.foto_base64 || resp.falla.foto_url || null,
        detectado_por: payload.operador_id,
        estado_reparacion: 'pendiente',
        created_at: new Date().toISOString(),
        resuelto_en: null,
      };
      memoryFallas.unshift(newFalla);
    }
  });

  return {
    inspeccionId,
    equipo: memoryEquipos[equipoIndex],
  };
}

export async function getMockInspecciones(): Promise<Inspeccion[]> {
  return memoryInspecciones;
}

export async function getMockFallas(): Promise<Falla[]> {
  return memoryFallas;
}

export async function updateMockFallaEstado(fallaId: string, nuevoEstado: Falla['estado_reparacion']): Promise<boolean> {
  const idx = memoryFallas.findIndex((f) => f.id === fallaId);
  if (idx !== -1) {
    memoryFallas[idx] = {
      ...memoryFallas[idx],
      estado_reparacion: nuevoEstado,
      resuelto_en: nuevoEstado === 'cerrado' || nuevoEstado === 'reparado' ? new Date().toISOString() : null,
    };
    return true;
  }
  return false;
}
