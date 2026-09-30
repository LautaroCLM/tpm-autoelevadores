# Diseño Técnico Completo: Baja Lógica (Soft Delete) de Autoelevadores
**Proyecto:** TPM Autoelevadores  
**Fecha:** 28 de Septiembre de 2026  
**Fase:** DISEÑO TÉCNICO (Sin implementación de código, migraciones ni cambios en base de datos)  

---

## 1. COMPARACIÓN TÉCNICA: `activo BOOLEAN` vs `deleted_at TIMESTAMPTZ`

### OPCIÓN A — `activo BOOLEAN NOT NULL DEFAULT TRUE`
- **Simplicidad:** Muy alta. Filtrado binario directo (`WHERE activo = true`).
- **Consultas SQL / Supabase:** Sencillas (`.eq('activo', true)`).
- **Limitación Principal:** No registra la fecha ni la hora exacta en la que se dio de baja el equipo.

### OPCIÓN B — `deleted_at TIMESTAMPTZ DEFAULT NULL`
- **Simplicidad:** Estándar de la industria para auditoría de activos.
- **Claridad Semántica:** Representa la estampa de tiempo exacta de desincorporación administrativa.
- **Consultas SQL / Supabase:** `.is('deleted_at', null)` para activos, `.not('deleted_at', 'is', null)` para dados de baja.
- **Trazabilidad de Planta:** Permite auditar qué inspecciones se realizaron hasta antes de la fecha/hora de baja.

### 📌 Decisión de Arquitectura Recomendada para TPM Autoelevadores:
**OPCIÓN B (`deleted_at TIMESTAMPTZ`)**. En plantas industriales y auditorías de seguridad TPM (Total Productive Maintenance), es fundamental registrar la estampa de tiempo exacta (`timestamptz`) de desincorporación para auditar inspecciones e historial de mantenimiento pasados.

---

## 2. REUTILIZACIÓN DE `interno` Y `qr_codigo` (ÍNDICES PARCIALES EN POSTGRESQL)

Actualmente en Supabase existen las restricciones:
- `interno text not null unique`
- `qr_codigo text unique not null`

### Solución de Diseño:
Reemplazar los índices `UNIQUE` globales por **índices `UNIQUE` parciales condicionales**:
```sql
CREATE UNIQUE INDEX idx_equipos_interno_activo ON public.equipos (interno) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_equipos_qr_activo ON public.equipos (qr_codigo) WHERE deleted_at IS NULL;
```

### Comportamiento Diseñado por Escenario:
- **Caso 1 (Equipo viejo activo):** `deleted_at IS NULL`. El índice parcial impide registrar un equipo nuevo con el mismo `interno` o `qr_codigo` (Error Postgres `23505`).
- **Caso 2 (Equipo viejo dado de baja):** `deleted_at IS NOT NULL`. Al asignarse la fecha de baja, el equipo viejo sale del índice parcial `WHERE deleted_at IS NULL`, liberando automáticamente el `interno` y el `qr_codigo`.
- **Caso 3 (Intentar reactivar el equipo viejo cuando un nuevo equipo ya tomó el `interno` o `qr_codigo`):** Al ejecutar `UPDATE equipos SET deleted_at = NULL WHERE id = id_viejo`, PostgreSQL evalúa el índice parcial. Si el nuevo equipo ya ocupa el `interno` o `qr_codigo`, la reactivación se **cancela con error `23505`**. La UI requerirá reasignar un nuevo código al equipo viejo antes de reactivarlo.
- **Caso 4 (Crear equipo nuevo reutilizando mismo `interno`):** Permitido. El equipo nuevo (ID: `BBB`) tendrá su propio historial independiente, manteniendo el equipo viejo (ID: `AAA`) su historial intacto.
- **Caso 5 (Crear equipo nuevo reutilizando mismo `qr_codigo`):** Permitido. El escaneo de la placa QR física buscará equipos activos (`deleted_at IS NULL`) y abrirá la ficha del equipo nuevo.

---

## 3. COMPORTAMIENTO DEL CÓDIGO QR Y RUTA `/equipo/[qr_codigo]`

### Para el OPERADOR:
- Al escanear un QR de un equipo dado de baja (`deleted_at IS NOT NULL`):
- Renderiza una **Pantalla Informativa de Bloqueo de Seguridad**:
  - Título: *"Autoelevador Fuera de Flota / Dado de Baja"*
  - Detalle: *"Este autoelevador fue desincorporado de la planta el [DD/MM/AAAA a las HH:mm hs]. Prohibida su operación."*
  - Deshabilita la entrada de horómetro y oculta el botón *"INICIAR CHECKLIST TPM"*.
  - Enlace rápido para regresar al escáner de equipos activos.

### Para el SUPERVISOR:
- Si el usuario logueado posee el rol `supervisor` o `mantenimiento`:
- Muestra la **Ficha Técnica en Archivo / Histórica**:
  - Banner distintivo: *"FICHA TÉCNICA EN ARCHIVO (DADO DE BAJA EL [FECHA])"*.
  - Acceso completo a la bitácora técnica de inspecciones pasadas, respuestas y fallas.
  - Botón administrativo *"Reactivar Autoelevador"*.

---

## 4. CONCURRENCIA E INSPECCIONES OFFLINE

### Escenario:
1. Operador abre equipo A (`deleted_at IS NULL`) en pantalla.
2. Dispositivo queda offline.
3. Operador realiza la inspección offline.
4. Supervisor da de baja el equipo A desde otro dispositivo online (`deleted_at = NOW()`).
5. Operador recupera señal; la app intenta sincronizar la inspección.

### Ajuste Conceptual en RPC `registrar_inspeccion_completa`:
```sql
SELECT horometro_actual, deleted_at INTO v_equipo_horometro_actual, v_equipo_deleted_at
FROM public.equipos
WHERE id = v_equipo_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'EQUIPO_NO_ENCONTRADO: El autoelevador especificado no existe.'
    USING ERRCODE = 'data_exception';
END IF;

IF v_equipo_deleted_at IS NOT NULL THEN
  RAISE EXCEPTION 'EQUIPO_DADO_DE_BAJA: El autoelevador fue dado de baja administrativa antes de finalizar esta inspección.'
    USING ERRCODE = 'check_violation';
END IF;
```

### Manejo en el Sincronizador Offline (`OfflineIndicator.tsx` / `queue.ts`):
- La respuesta `EQUIPO_DADO_DE_BAJA` es un error de validación lógica de negocio (`isFatal: true`).
- El sincronizador **remueve la inspección de la cola IndexedDB (`fatal++`)**, impidiendo reintentos infinitos y garantizando que la cola no se bloquee.

---

## 5. CACHÉ INDEXEDDB (`equipos_cache`)

- **Actualización Online:** Al dar de baja un equipo, `updateEquipo` actualiza Supabase. Tras la confirmación, `saveEquiposCache()` refresca IndexedDB filtrando únicamente los equipos activos.
- **Dispositivo Offline:** Si un dispositivo estaba offline al momento de la baja, la lista local mostrará temporalmente el equipo. Sin embargo, como el formulario de inspección será rechazado por la RPC al sincronizar (punto 4), no habrá corrupción de datos. Al recuperar conectividad, `fetchEquipos()` hace `store.clear()` y descarga solo la flota activa.

---

## 6. DASHBOARD DEL SUPERVISOR (EVOLUCIÓN UX DE FLOTA)

- **Filtros Rápidos en Pestaña Flota:**
  - `[ Activos (12) ]` (Predeterminado)
  - `[ Dados de Baja (3) ]`
  - `[ Todos (15) ]`
- **Acciones en Tarjeta de Equipo Activo:**
  - `"Service"`, `"Placa QR"`, `"Editar"`, `"Dar de Baja"`.
- **Acciones en Tarjeta de Equipo Dado de Baja:**
  - Badge `"DADO DE BAJA EL DD/MM/AAAA"`, `"Ver Historial"`, `"Reactivar"`.

---

## 7. PRESERVACIÓN DE HISTORIAL Y CLAVES FORÁNEAS

- **Conservación 100%:** `inspecciones`, `respuestas_item`, `fallas`, `storage.objects` (fotos), `perfiles` (operadores) se conservan intactos.
- **Prevención de `DELETE` Físico:** Se puede configurar las FKs de `inspecciones.equipo_id` y `fallas.equipo_id` con `ON DELETE RESTRICT` para impedir cualquier `DELETE` físico accidental en el futuro.

---

## 8. FOTOGRAFÍAS DE FALLAS EN STORAGE

- Con Soft Delete, las filas de `fallas` **nunca se borran**.
- Las URLs `foto_url` de las fallas pasadas permanecen 100% funcionales y vinculadas a la evidencia técnica.
- **Limpieza de Storage:** No se requiere limpieza de imágenes de equipos dados de baja porque se desea preservar las fotos de auditoría.

---

## 9. SEGURIDAD Y POLÍTICAS RLS CON SOFT DELETE

### RLS de Lectura para Operadores / Anónimos:
```sql
CREATE POLICY "equipos_public_select" ON public.equipos
  FOR SELECT
  USING (deleted_at IS NULL OR public.is_supervisor_or_maint());
```

### RLS de Modificación para Supervisores:
Mantener `equipos_admin_insert`, `equipos_admin_update`, `equipos_admin_delete` restringidas a `public.is_supervisor_or_maint()`.

---

## 10. PROTECCIÓN DE `interno` Y `qr_codigo` EN BACKEND

### Solución Recomendada: Trigger de Inmutabilidad en PostgreSQL
```sql
CREATE OR REPLACE FUNCTION public.prevent_equipo_code_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.interno != NEW.interno OR OLD.qr_codigo != NEW.qr_codigo THEN
    RAISE EXCEPTION 'CODIGO_INMUTABLE: No está permitido modificar el número de interno ni el código QR de un equipo existente.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_equipo_code_immutable
  BEFORE UPDATE ON public.equipos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_equipo_code_change();
```

---

## 11. VALIDACIÓN Y CORRECCIÓN DE HORÓMETRO

- **Operadores (RPC `registrar_inspeccion_completa`):** Validación estricta `v_horometro >= horometro_actual`.
- **Supervisores (Modal de Edición / API):** Permite correcciones administrativas con justificación registrada cuando el valor ingresado es menor por error de tipeo previo o cambio de medidor de tablero.

---

## 12. DISEÑO CONCEPTUAL DE MIGRACIÓN SQL (HYPOTHETICAL)

```sql
-- 1. Columna Soft Delete
ALTER TABLE public.equipos ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Índices Parciales Condicionales
DROP INDEX IF EXISTS equipos_interno_key;
DROP INDEX IF EXISTS equipos_qr_codigo_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipos_interno_activo ON public.equipos (interno) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipos_qr_activo ON public.equipos (qr_codigo) WHERE deleted_at IS NULL;

-- 3. Trigger de Inmutabilidad
-- (prevent_equipo_code_change)

-- 4. RLS Public Select
DROP POLICY IF EXISTS "equipos_public_select" ON public.equipos;
CREATE POLICY "equipos_public_select" ON public.equipos
  FOR SELECT USING (deleted_at IS NULL OR public.is_supervisor_or_maint());
```

---

## 13. PLAN DE IMPLEMENTACIÓN POR FASES

- **Fase 1: Base de Datos & Migración SQL** (`deleted_at`, índices parciales, trigger inmutabilidad).
- **Fase 2: RPC & RLS** (Actualizar `registrar_inspeccion_completa` y política de lectura).
- **Fase 3: API TypeScript (`lib/api/tpm.ts`)** (`darDeBajaEquipo`, `reactivarEquipo`, `fetchEquipos`).
- **Fase 4: Consola Supervisor (`app/dashboard/page.tsx`)** (Filtros Activos/Baja, modales de baja/reactivación).
- **Fase 5: Ficha Técnica & QR (`app/equipo/[qr_codigo]/page.tsx`)** (Bloqueo operador / Vista histórica supervisor).
- **Fase 6: Caché e IndexedDB (`lib/offline/plant-cache.ts`)** (Filtro de equipos activos).
- **Fase 7: Pruebas de Integración.**

---

## 14. MATRIZ DE PRUEBAS DE VALIDACIÓN

| Caso | Resultado Esperado |
| --- | --- |
| **Crear equipo activo** | Se crea con `deleted_at = NULL` e índice parcial lo valida. |
| **Editar equipo activo** | Modifica datos técnicos sin permitir alterar `interno` ni `qr_codigo`. |
| **Dar de baja equipo** | Asigna `deleted_at = NOW()`. No se borran filas en `equipos`, `inspecciones` ni `fallas`. |
| **Historial después de baja** | Consultable 100% por supervisores en `/dashboard` y `/equipo/[qr_codigo]`. |
| **QR de equipo dado de baja** | Operadores ven pantalla *"Equipo fuera de flota / Dado de baja"*. No se permite inspección. |
| **Operador intenta inspeccionar equipo dado de baja** | Rechazado por RPC con error `EQUIPO_DADO_DE_BAJA`. |
| **Supervisor consulta equipo dado de baja** | Muestra ficha histórica completa con fotos de fallas vinculadas. |
| **Reactivar equipo** | Asigna `deleted_at = NULL` si no hay conflicto de código con otro activo. |
| **Crear nuevo equipo con mismo interno que uno dado de baja** | Permitido por el índice parcial `WHERE deleted_at IS NULL`. |
| **Crear nuevo equipo con mismo QR que uno dado de baja** | Permitido por el índice parcial. Escaneo abre el nuevo equipo. |
| **Inspección offline + baja simultánea** | Al reconectar, la RPC rechaza y el sincronizador remueve el item de IndexedDB (`isFatal: true`). |
| **Recuperación de conexión** | `fetchEquipos()` limpia IndexedDB y descarga solo equipos activos. |
| **Operador intenta modificar equipo** | Rechazado por RLS PostgreSQL (`42501`). |
| **Operador intenta eliminar equipo** | Rechazado por RLS PostgreSQL (`42501`). |
| **Supervisor modifica QR directamente vía API REST** | Rechazado por el Trigger `prevent_equipo_code_change`. |
| **Supervisor modifica interno directamente vía API REST** | Rechazado por el Trigger `prevent_equipo_code_change`. |
| **Horómetro menor al histórico** | Permitido a supervisor con justificación; bloqueado a operador en RPC. |

---

## 15. RESULTADO FINAL Y ARQUITECTURA RECOMENDADA

- **Modelo Elegido:** **Soft Delete con `deleted_at TIMESTAMPTZ` + Índices Parciales Condicionales + Trigger de Inmutabilidad de Códigos en PostgreSQL**.
- **Beneficio Principal:** Elimina la pérdida irreversible de historial industrial de inspecciones y fallas, manteniendo la seguridad RLS y el correcto funcionamiento offline.
