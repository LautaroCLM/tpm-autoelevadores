-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: POLÍTICAS RLS BASADAS EN ROLES REALES Y STORAGE
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-09
-- ==============================================================================

-- 1. FUNCIÓN HELPER PARA VERIFICAR ROLES EN RLS (SECURITY DEFINER)
create or replace function public.is_supervisor_or_maint()
returns boolean as $$
begin
  return exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('supervisor', 'mantenimiento')
  );
end;
$$ language plpgsql security definer;

-- 2. ELIMINAR POLÍTICAS ABIERTAS PREVIAS
-- Equipos
drop policy if exists "Equipos visibles para usuarios autenticados" on public.equipos;
drop policy if exists "Equipos select" on public.equipos;
drop policy if exists "Equipos update" on public.equipos;
drop policy if exists "equipos_select" on public.equipos;
drop policy if exists "equipos_admin_insert" on public.equipos;
drop policy if exists "equipos_admin_update" on public.equipos;
drop policy if exists "equipos_admin_delete" on public.equipos;

-- Plantillas e Ítems
drop policy if exists "Plantillas visibles para usuarios autenticados" on public.checklist_templates;
drop policy if exists "templates_select" on public.checklist_templates;
drop policy if exists "Items de plantilla visibles para usuarios autenticados" on public.checklist_items;
drop policy if exists "items_select" on public.checklist_items;

-- Inspecciones
drop policy if exists "Inspecciones lectura" on public.inspecciones;
drop policy if exists "Inspecciones insercion" on public.inspecciones;
drop policy if exists "Inspecciones actualizacion" on public.inspecciones;
drop policy if exists "inspecciones_select" on public.inspecciones;
drop policy if exists "inspecciones_insert_own" on public.inspecciones;

-- Respuestas
drop policy if exists "Respuestas lectura" on public.respuestas_item;
drop policy if exists "Respuestas insercion" on public.respuestas_item;
drop policy if exists "respuestas_select" on public.respuestas_item;
drop policy if exists "respuestas_insert" on public.respuestas_item;

-- Fallas
drop policy if exists "Fallas lectura" on public.fallas;
drop policy if exists "Fallas insercion" on public.fallas;
drop policy if exists "Fallas actualizacion" on public.fallas;
drop policy if exists "fallas_select" on public.fallas;
drop policy if exists "fallas_insert_own" on public.fallas;
drop policy if exists "fallas_update_status" on public.fallas;

-- Perfiles
drop policy if exists "Perfiles lectura" on public.perfiles;
drop policy if exists "perfiles_select" on public.perfiles;
drop policy if exists "perfiles_admin" on public.perfiles;

-- 3. HABILITAR RLS EN TODAS LAS TABLAS
alter table public.perfiles enable row level security;
alter table public.equipos enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_items enable row level security;
alter table public.inspecciones enable row level security;
alter table public.respuestas_item enable row level security;
alter table public.fallas enable row level security;

-- 4. NUEVAS POLÍTICAS RLS BASADAS EN ROLES REALES

-- A. PERFILES:
create policy "perfiles_select" on public.perfiles
  for select using (auth.uid() = id or public.is_supervisor_or_maint());

create policy "perfiles_admin" on public.perfiles
  for all using (public.is_supervisor_or_maint());

-- B. EQUIPOS:
create policy "equipos_select" on public.equipos
  for select using (auth.role() = 'authenticated');

create policy "equipos_admin_insert" on public.equipos
  for insert with check (public.is_supervisor_or_maint());

create policy "equipos_admin_update" on public.equipos
  for update using (public.is_supervisor_or_maint());

-- Trigger para permitir actualizar horómetro/estado desde el trigger de inspección
create policy "equipos_admin_delete" on public.equipos
  for delete using (public.is_supervisor_or_maint());

-- C. PLANTILLAS E ÍTEMS:
create policy "templates_select" on public.checklist_templates
  for select using (auth.role() = 'authenticated');

create policy "items_select" on public.checklist_items
  for select using (auth.role() = 'authenticated');

-- D. INSPECCIONES:
create policy "inspecciones_select" on public.inspecciones
  for select using (auth.role() = 'authenticated');

create policy "inspecciones_insert_own" on public.inspecciones
  for insert with check (auth.uid() = operador_id);

-- E. RESPUESTAS ITEM:
create policy "respuestas_select" on public.respuestas_item
  for select using (auth.role() = 'authenticated');

create policy "respuestas_insert" on public.respuestas_item
  for insert with check (auth.role() = 'authenticated');

-- F. FALLAS:
create policy "fallas_select" on public.fallas
  for select using (auth.role() = 'authenticated');

create policy "fallas_insert_own" on public.fallas
  for insert with check (auth.uid() = detectado_por);

create policy "fallas_update_status" on public.fallas
  for update using (public.is_supervisor_or_maint());

-- 5. TRIGGER DE ACTUALIZACIÓN ATÓMICA DE EQUIPO
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
$$ language plpgsql security definer;

drop trigger if exists on_inspeccion_completed on public.inspecciones;
create or replace trigger on_inspeccion_completed
  after insert or update on public.inspecciones
  for each row
  execute function public.handle_inspeccion_finalizada();

-- 6. POLÍTICAS DE STORAGE PARA 'fallas-fotos'
alter table storage.objects enable row level security;

drop policy if exists "fallas_fotos_upload_authenticated" on storage.objects;
drop policy if exists "fallas_fotos_public_read" on storage.objects;
drop policy if exists "fallas_fotos_supervisor_delete" on storage.objects;

create policy "fallas_fotos_upload_authenticated" on storage.objects
  for insert with check (
    bucket_id = 'fallas-fotos' and auth.role() = 'authenticated'
  );

create policy "fallas_fotos_public_read" on storage.objects
  for select using (
    bucket_id = 'fallas-fotos'
  );

create policy "fallas_fotos_supervisor_delete" on storage.objects
  for delete using (
    bucket_id = 'fallas-fotos' and public.is_supervisor_or_maint()
  );
