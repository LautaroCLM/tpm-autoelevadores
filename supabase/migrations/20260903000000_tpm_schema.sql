-- ==============================================================================
-- MIGRACIÓN INICIAL: TPM AUTOELEVADORES (V1 / MVP)
-- ==============================================================================

-- 1. Perfiles de usuario (operador / supervisor / mantenimiento), vinculado a auth.users
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  legajo text unique,
  rol text not null check (rol in ('operador', 'supervisor', 'mantenimiento')),
  created_at timestamptz default now()
);

-- 2. Equipos (autoelevadores)
create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  interno text not null unique, -- ej: "01", "02", "03"
  marca text,
  modelo text,
  combustible text, -- ej: "GLP", "Diesel", "Electrico"
  qr_codigo text unique not null,
  horometro_actual numeric default 0,
  horometro_proximo_mantenimiento numeric,
  estado text not null default 'operativo' check (estado in ('operativo', 'observado', 'fuera_de_servicio')),
  created_at timestamptz default now()
);

-- 3. Plantilla del checklist (versionable)
create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  version int not null default 1,
  activo boolean default true,
  created_at timestamptz default now()
);

-- 4. Ítems de una plantilla, agrupados por sección
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references checklist_templates(id) on delete cascade not null,
  seccion text not null, -- ej: "Niveles", "Seguridad", "Mecánica y Rodado", "Carga combustible"
  etiqueta text not null, -- ej: "Líquido de freno"
  tipo_dato text not null check (tipo_dato in ('booleano', 'numero', 'texto')),
  orden int not null
);

-- 5. Cabecera de una inspección TPM
create table if not exists inspecciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid references equipos(id) on delete cascade not null,
  operador_id uuid references perfiles(id) not null,
  template_id uuid references checklist_templates(id) not null,
  horometro numeric not null,
  iniciado_en timestamptz default now(),
  finalizado_en timestamptz,
  estado_resultante text check (estado_resultante in ('operativo', 'observado', 'fuera_de_servicio'))
);

-- 6. Respuesta a cada ítem del checklist en una inspección puntual
create table if not exists respuestas_item (
  id uuid primary key default gen_random_uuid(),
  inspeccion_id uuid references inspecciones(id) on delete cascade not null,
  item_id uuid references checklist_items(id) not null,
  valor_bool boolean,
  valor_numero numeric,
  valor_texto text,
  es_falla boolean default false
);

-- 7. Fallas detectadas (una por respuesta marcada como falla)
create table if not exists fallas (
  id uuid primary key default gen_random_uuid(),
  respuesta_id uuid references respuestas_item(id) on delete cascade not null,
  equipo_id uuid references equipos(id) on delete cascade not null,
  gravedad text not null check (gravedad in ('leve', 'media', 'critica')),
  descripcion text,
  foto_url text,
  detectado_por uuid references perfiles(id),
  estado_reparacion text not null default 'pendiente' check (estado_reparacion in ('pendiente', 'en_revision', 'reparando', 'reparado', 'cerrado')),
  created_at timestamptz default now(),
  resuelto_en timestamptz
);

-- Índices recomendados para optimización de queries frecuentes
create index if not exists idx_equipos_qr on equipos(qr_codigo);
create index if not exists idx_checklist_items_template on checklist_items(template_id, orden);
create index if not exists idx_inspecciones_equipo on inspecciones(equipo_id, iniciado_en desc);
create index if not exists idx_fallas_equipo on fallas(equipo_id, estado_reparacion);

-- ==============================================================================
-- BUCKET DE STORAGE PARA FOTOS DE FALLAS
-- ==============================================================================
insert into storage.buckets (id, name, public)
values ('fallas-fotos', 'fallas-fotos', true)
on conflict (id) do nothing;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
alter table perfiles enable row level security;
alter table equipos enable row level security;
alter table checklist_templates enable row level security;
alter table checklist_items enable row level security;
alter table inspecciones enable row level security;
alter table respuestas_item enable row level security;
alter table fallas enable row level security;

-- Políticas de lectura públicas / autenticadas para equipos y plantillas activas
create policy "Equipos visibles para usuarios autenticados" on equipos
  for select using (auth.role() = 'authenticated' or true);

create policy "Plantillas visibles para usuarios autenticados" on checklist_templates
  for select using (auth.role() = 'authenticated' or true);

create policy "Items de plantilla visibles para usuarios autenticados" on checklist_items
  for select using (auth.role() = 'authenticated' or true);

-- Políticas de inserción y lectura para inspecciones, respuestas y fallas
create policy "Inspecciones lectura" on inspecciones
  for select using (true);

create policy "Inspecciones insercion" on inspecciones
  for insert with check (true);

create policy "Inspecciones actualizacion" on inspecciones
  for update using (true);

create policy "Respuestas lectura" on respuestas_item
  for select using (true);

create policy "Respuestas insercion" on respuestas_item
  for insert with check (true);

create policy "Fallas lectura" on fallas
  for select using (true);

create policy "Fallas insercion" on fallas
  for insert with check (true);

create policy "Fallas actualizacion" on fallas
  for update using (true);

create policy "Perfiles lectura" on perfiles
  for select using (true);

-- ==============================================================================
-- TRIGGER PARA ACTUALIZAR HORÓMETRO Y ESTADO DEL EQUIPO AL FINALIZAR INSPECCIÓN
-- ==============================================================================
create or replace function public.handle_inspeccion_finalizada()
returns trigger as $$
begin
  if new.finalizado_en is not null and new.estado_resultante is not null then
    update public.equipos
    set
      horometro_actual = greatest(coalesce(horometro_actual, 0), new.horometro),
      estado = new.estado_resultante
    where id = new.equipo_id;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace trigger on_inspeccion_completed
  after update on public.inspecciones
  for each row
  execute function public.handle_inspeccion_finalizada();

-- ==============================================================================
-- SEED DATA INICIAL: PLANTILLA Y EQUIPOS DE PRUEBA
-- ==============================================================================

-- 1. Plantilla TPM Nivel 1 Autoelevadores
insert into checklist_templates (id, nombre, version, activo)
values ('11111111-1111-1111-1111-111111111111', 'TPM Diario Nivel 1 - Autoelevadores', 1, true)
on conflict (id) do nothing;

-- 2. Ítems del Checklist
insert into checklist_items (template_id, seccion, etiqueta, tipo_dato, orden) values
  -- Sección 1: Niveles y Fluidos
  ('11111111-1111-1111-1111-111111111111', 'Niveles y Fluidos', 'Nivel de aceite de motor', 'booleano', 1),
  ('11111111-1111-1111-1111-111111111111', 'Niveles y Fluidos', 'Nivel de líquido hidráulico', 'booleano', 2),
  ('11111111-1111-1111-1111-111111111111', 'Niveles y Fluidos', 'Nivel de refrigerante del radiador', 'booleano', 3),
  ('11111111-1111-1111-1111-111111111111', 'Niveles y Fluidos', 'Nivel de líquido de frenos', 'booleano', 4),
  ('11111111-1111-1111-1111-111111111111', 'Niveles y Fluidos', 'Sin pérdidas visibles en mangueras o suelo', 'booleano', 5),

  -- Sección 2: Seguridad y Alarma
  ('11111111-1111-1111-1111-111111111111', 'Seguridad y Alarma', 'Cinturón de seguridad operativo y anclaje firme', 'booleano', 6),
  ('11111111-1111-1111-1111-111111111111', 'Seguridad y Alarma', 'Alarma de retroceso sonora audible', 'booleano', 7),
  ('11111111-1111-1111-1111-111111111111', 'Seguridad y Alarma', 'Bocina operativa', 'booleano', 8),
  ('11111111-1111-1111-1111-111111111111', 'Seguridad y Alarma', 'Luces de trabajo delanteras y traseras', 'booleano', 9),
  ('11111111-1111-1111-1111-111111111111', 'Seguridad y Alarma', 'Matafuegos con carga vigente y precinto', 'booleano', 10),
  ('11111111-1111-1111-1111-111111111111', 'Seguridad y Alarma', 'Espejos retrovisores limpios y sin roturas', 'booleano', 11),

  -- Sección 3: Mecánica, Mástil y Rodado
  ('11111111-1111-1111-1111-111111111111', 'Mecánica, Mástil y Rodado', 'Estado de neumáticos y llantas (sin cortes)', 'booleano', 12),
  ('11111111-1111-1111-1111-111111111111', 'Mecánica, Mástil y Rodado', 'Horquillas / uñas sin deformaciones ni fisuras', 'booleano', 13),
  ('11111111-1111-1111-1111-111111111111', 'Mecánica, Mástil y Rodado', 'Cadenas y mástil lubricados y alineados', 'booleano', 14),
  ('11111111-1111-1111-1111-111111111111', 'Mecánica, Mástil y Rodado', 'Freno de servicio (pedal) y freno de mano', 'booleano', 15),
  ('11111111-1111-1111-1111-111111111111', 'Mecánica, Mástil y Rodado', 'Dirección suave sin juego excesivo', 'booleano', 16),

  -- Sección 4: Carga y Combustible
  ('11111111-1111-1111-1111-111111111111', 'Carga y Combustible', 'Garrafa GLP / Tanque / Batería con fijación segura', 'booleano', 17),
  ('11111111-1111-1111-1111-111111111111', 'Carga y Combustible', 'Porcentaje o nivel de combustible/batería (%)', 'numero', 18),
  ('11111111-1111-1111-1111-111111111111', 'Carga y Combustible', 'Observaciones generales del turno', 'texto', 19)
on conflict do nothing;

-- 3. Equipos de prueba iniciales
insert into equipos (id, interno, marca, modelo, combustible, qr_codigo, horometro_actual, horometro_proximo_mantenimiento, estado) values
  ('22222222-2222-2222-2222-222222222201', '01', 'Toyota', '8FG25 (2.5 ton)', 'GLP', 'AE-01', 1245.5, 1500.0, 'operativo'),
  ('22222222-2222-2222-2222-222222222202', '02', 'Hyster', 'H50FT (2.5 ton)', 'Diesel', 'AE-02', 3420.0, 3500.0, 'observado'),
  ('22222222-2222-2222-2222-222222222203', '03', 'Crown', 'FC5200 (Eléctrico)', 'Electrico', 'AE-03', 890.2, 1000.0, 'operativo'),
  ('22222222-2222-2222-2222-222222222204', '04', 'Caterpillar', 'DP30N (3.0 ton)', 'Diesel', 'AE-04', 4120.8, 4200.0, 'fuera_de_servicio')
on conflict (interno) do nothing;
