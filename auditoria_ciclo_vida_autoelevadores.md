# Informe de Auditoría Técnica Profunda: Ciclo de Vida de Autoelevadores y Rol Supervisor
**Proyecto:** TPM Autoelevadores  
**Fecha:** 28 de Septiembre de 2026  
**Modalidad:** READ-ONLY (Sin modificaciones de código, esquema, migraciones ni ejecuciones destructivas)  

---

## 1. ESTADO GENERAL POR ÁREA

| Área Auditada | Estado | Resumen de Evaluación |
| --- | --- | --- |
| **1. Creación de Equipos** | **ATENCIÓN** | Funciona correctamente online. Validaciones `UNIQUE` en Postgres sobre `interno` y `qr_codigo`. Carece de creación offline. |
| **2. Edición de Equipos** | **ATENCIÓN** | UI protege `interno` y `qr_codigo`, pero la política RLS de `UPDATE` en Supabase no restringe columnas a nivel de backend. |
| **3. Baja / Eliminación** | **CRÍTICO** | Eliminación física (`DELETE`) con `ON DELETE CASCADE` borra irrevocablemente todo el historial de inspecciones y fallas. |
| **4. Seguridad y RLS** | **OK** | RLS habilitado y respaldado por la función `is_supervisor_or_maint()`. Los operadores no pueden realizar acciones administrativas. |
| **5. Supabase Storage** | **ATENCIÓN** | Las imágenes en `fallas-fotos` no se borran al eliminar fallas o equipos, acumulando archivos huérfanos. |
| **6. Offline y IndexedDB** | **ATENCIÓN** | Inspecciones offline manejan correctamente errores fatales (`EQUIPO_NO_ENCONTRADO`). La caché de equipos en IndexedDB requiere invalidación al editar/borrar. |
| **7. Concurrencia** | **RIESGO** | Sin control optimista (`version` / `updated_at`). En la edición simultánea prevalece la última escritura (*last write wins*). |
| **8. Experiencia de Usuario (UX)** | **ATENCIÓN** | La confirmación de eliminación no indica la cantidad de inspecciones y fallas históricas que se perderán. |

---

## 2. CREACIÓN DE AUTOELEVADORES

- **Flujo Auditado:** `Dashboard (/dashboard)` → `Tab Flota` → `Modal Registrar Autoelevador` → `handleCreateEquipoSubmit()` → `createEquipo()` → `Supabase REST`.
- **Validaciones Frontend:** `formInterno` es requerido en la interfaz. `formQR` se autogenera con formato `AE-` + interno a 2 dígitos (`AE-01`) si el usuario no especifica uno.
- **Validaciones Backend / DB:** Constraints `UNIQUE` sobre `interno` y `qr_codigo`. Check Constraint `estado IN ('operativo', 'observado', 'fuera_de_servicio')`.
- **Manejo de Duplicados:** Ante conflicto de unicidad (Error Postgres `23505`), `createEquipo` en [lib/api/tpm.ts](file:///c:/Users/herna/Desktop/PROYECTO%2020/lib/api/tpm.ts#L579) captura el error y la UI emite una alerta `toast.error`.
- **Respuesta ante Fallos de Red:** La API falla y devuelve mensaje de error; no se borra la información escrita en el formulario. No existe cola offline para la creación de equipos.
- **Prevención de Doble Envío:** Deshabilitación táctil del botón vía estado `submittingForm`.

---

## 3. EDICIÓN DE AUTOELEVADORES

- **Campos Modificables en UI:** `marca`, `modelo`, `combustible`, `estado`, `horometro_actual`, `horometro_proximo_mantenimiento`.
- **Campos Protegidos en UI:**
  - `id`: Clave primaria inmutable.
  - `interno`: Omitido deliberadamente en la modal de edición para preservar la rotulación de planta.
  - `qr_codigo`: Omitido deliberadamente en la modal de edición para evitar romper las placas QR físicas impresas.
- **Vulnerabilidad de Columna en RLS (Backend):**
  - **Hallazgo:** La política RLS `equipos_admin_update` (`USING (is_supervisor_or_maint())`) no limita qué columnas pueden ser actualizadas.
  - **Consecuencia:** Una petición REST directa enviada a Supabase por un cliente HTTP autenticado como supervisor podría modificar `qr_codigo` o `interno`, sobrepasando las restricciones visuales del frontend.
- **Validaciones de Horómetro:** La UI y `updateEquipo` no impiden ingresar un `horometro_actual` menor al histórico previo. Sin embargo, al registrar nuevas inspecciones, la RPC `registrar_inspeccion_completa` exige que el nuevo horómetro no sea inferior al registrado.

---

## 4. BAJA / ELIMINACIÓN (ANÁLISIS DE IMPACTO Y RIESGOS)

- **Ejecución Actual:** `handleDeleteEquipo()` → `deleteEquipo(id)` → `supabase.from('equipos').delete().eq('id', id)`.
- **Sentencia SQL Ejecutada:** `DELETE FROM public.equipos WHERE id = '...'`.
- **Efecto en Cadena por `ON DELETE CASCADE`:**
  1. La fila del autoelevador es borrada de `public.equipos`.
  2. Todas las inspecciones asociadas en `public.inspecciones` son eliminadas por la restricción `FK equipo_id ON DELETE CASCADE`.
  3. Todas las respuestas asociadas en `public.respuestas_item` son eliminadas por la restricción `FK inspeccion_id ON DELETE CASCADE`.
  4. Todas las fallas asociadas en `public.fallas` son eliminadas por las restricciones `FK equipo_id` y `FK respuesta_id ON DELETE CASCADE`.
  5. Las fotografías subidas al bucket `fallas-fotos` de Supabase Storage **permanecen almacenadas como archivos huérfanos**, consumiendo cuota sin vinculación a ningún registro.
  6. El historial de mantenimiento acumulado se borra por completo (se calcula dinámicamente sobre el historial de inspecciones).

---

## 5. SEGURIDAD Y POLÍTICAS RLS

- **Protección de Acciones Administrativas:**
  - `equipos_admin_insert`, `equipos_admin_update`, `equipos_admin_delete` exigen la evaluación de `public.is_supervisor_or_maint()`.
  - Si un usuario con rol `operador` o un cliente `anon` intenta invocar `INSERT`, `UPDATE` o `DELETE` sobre la tabla `equipos`, PostgreSQL rechaza la transacción con error RLS `42501`.
- **Protección contra Escalada de Roles:**
  - La política `perfiles_update_own` exige que en cualquier `UPDATE` sobre `perfiles`, la columna `rol` sea exactamente igual a la existente (`rol = (SELECT p.rol FROM public.perfiles p WHERE p.id = auth.uid())`).
  - La función RPC `actualizar_mi_perfil` solo permite modificar `nombre` y `legajo`.

---

## 6. ARQUITECTURA OFFLINE Y CACHÉ

- **Tratamiento de Inspecciones Offline:** Almacenadas en la tienda `inspecciones_queue` de IndexedDB.
- **Escenario de Equipo Eliminado en Servidor:**
  - Si un operador completa una inspección offline y el equipo es borrado en Supabase antes de la reconexión:
  - Al sincronizar, la RPC `registrar_inspeccion_completa` busca el equipo y detecta que no existe, lanzando la excepción `EQUIPO_NO_ENCONTRADO`.
  - El gestor `OfflineIndicator.tsx` clasifica la falla como error fatal (`isFatal: true`) y borra la inspección de la cola local de IndexedDB (`fatal++`), previniendo bloqueos en la aplicación.
- **Inconsistencia de Caché de Planta:** El almacén `equipos_cache` en IndexedDB solo se refresca mediante `fetchEquipos()` cuando el dispositivo consulta online. Si se elimina un equipo en el servidor, este puede continuar visible temporalmente en un dispositivo offline hasta su próxima sincronización.

---

## 7. MATRIZ DE ESCENARIOS DE CONCURRENCIA

| Caso | Descripción | Comportamiento Actual | Evaluación de Riesgo |
| --- | --- | --- | --- |
| **A** | 2 Supervisores editan el mismo equipo a la vez. | Prevalece la última escritura (*Last Write Wins*). No hay locking optimista. | **MEDIO**. Posible sobreescritura ciega de atributos. |
| **B** | Supervisor elimina equipo mientras operador inspecciona online. | Al enviar, la RPC `registrar_inspeccion_completa` lanza `EQUIPO_NO_ENCONTRADO` y aborta la transacción. | **CONTROLADO**. La base de datos no se corrompe. |
| **C** | Operador inspecciona offline y supervisor elimina equipo online. | Al reconectar, la RPC rechaza y el sincronizador descarta la inspección de la cola local (`isFatal: true`). | **CONTROLADO**. No bloquea la cola de sincronización. |
| **D** | 2 Supervisores crean el mismo `interno` simultáneamente. | El primero inserta con éxito; el segundo es rechazado por `unique_violation` (Error 23505). | **CONTROLADO**. Garantizado por Postgres. |
| **E** | 2 Supervisores crean el mismo `qr_codigo` simultáneamente. | El primero inserta con éxito; el segundo es rechazado por `unique_violation` (Error 23505). | **CONTROLADO**. Garantizado por Postgres. |
| **F** | Supervisor altera horómetro mientras operador inspecciona. | Si el horómetro en DB supera al ingresado, la RPC rechaza por `HOROMETRO_INVALIDO`. | **CONTROLADO**. Regla de horómetro no decreciente. |

---

## 8. INTEGRIDAD CON SUPABASE & STORAGE

- **Tabla `public.equipos`:** Coincidencia exacta entre el código TypeScript (`lib/types/tpm.ts`), las migraciones SQL y los atributos de base de datos.
- **Bucket `fallas-fotos`:** Presenta almacenamiento persistente sin proceso de recolección de basura (*garbage collection*). Al eliminar filas en `fallas`, los archivos binarios de imágenes permanecen en Storage.

---

## 9. MATRIZ GENERAL DE HALLAZGOS

| ID | Área | Hallazgo | Severidad | Evidencia | ¿Requiere cambio? |
| -- | ---- | -------- | --------- | --------- | ----------------- |
| **H-01** | Baja / Eliminación | Eliminación física (`DELETE`) con `ON DELETE CASCADE` borra irrevocablemente todo el historial de inspecciones y fallas. | **CRÍTICO** | `20260903000000_tpm_schema.sql` (L50, L73) y `tpm.ts` (L636) | Sí (Implementar Soft Delete) |
| **H-02** | Storage | Fotografías de fallas en `fallas-fotos` quedan huérfanas en Supabase Storage al borrar equipos o fallas. | **ALTO** | `20260911_harden_rls_and_storage.sql` (Sin triggers de limpieza en Storage) | Sí (Script o Trigger de limpieza) |
| **H-03** | Edición / RLS | RLS `equipos_admin_update` no limita columnas. Una llamada REST directa puede modificar `qr_codigo` o `interno`. | **MEDIO** | `20260909_apply_rls_and_storage.sql` (L85) | Sí (Endurecer RLS o usar RPC) |
| **H-04** | Edición / Horómetro | Se permite editar manualmente `horometro_actual` a un valor menor que inspecciones pasadas sin validación previa. | **MEDIO** | `app/dashboard/page.tsx` (L1130) | Sí (Validación en UI/API) |
| **H-05** | Offline / Caché | `equipos_cache` en IndexedDB no se actualiza de inmediato al editar o eliminar un equipo en `tpm.ts`. | **BAJO** | `lib/offline/plant-cache.ts` (Refresco exclusivo en `fetchEquipos()`) | Sí (Invalidar en acciones de escritura) |
| **H-06** | Concurrencia | Sin control optimista (`version`/`updated_at`). Sobreescritura ciega si dos supervisores editan en paralelo. | **BAJO** | `lib/api/tpm.ts` (`updateEquipo`) | Deseable (Agregar timestamp/lock) |

---

## 10. CLASIFICACIÓN DE RECOMENDACIONES

### NO TOCAR AHORA
- Estructura de la cola de inspecciones offline (`inspecciones_queue`).
- Generación y lectura de credenciales QR de operadores.
- Lectura pública de flota de autoelevadores (`equipos_public_select`).

### CORREGIR ANTES DE PRODUCCIÓN
1. **Reemplazar el `DELETE` físico por Soft Delete (`activo = false` o `deleted_at`):** Elimina el riesgo crítico de pérdida irreparable de registros de auditoría e inspecciones de planta.
2. **Restringir la modificación de columnas críticas en backend/RLS:** Evitar que llamadas REST directas puedan alterar `qr_codigo` o `interno`.
3. **Mecanismo de limpieza para fotos en Storage:** Evitar la acumulación de archivos huérfanos en `fallas-fotos`.

### MEJORAS FUTURAS
- Incluir en la modal de baja un resumen explícito de la cantidad de inspecciones y fallas archivadas del equipo.
- Implementar control de concurrencia optimista (`updated_at`) para notificar si otro usuario modificó el equipo simultáneamente.

---

## 11. PROPUESTA PARA EL SIGUIENTE PASO

El paso prioritario que se debe definir y abordar a continuación es la **Elección e Implementación del Modelo de Baja Lógica (Soft Delete)** para los autoelevadores.

### Razón Técnica:
1. Es el único punto **CRÍTICO** actual que provoca pérdida irrecuperable de datos históricos e industriales.
2. La definición de la alternativa seleccionada (ej: `activo boolean default true` o `deleted_at timestamptz`) determinará cómo ajustar las políticas RLS de lectura, las restricciones `UNIQUE` parciales en PostgreSQL para `interno`/`qr_codigo`, y los filtros de la flota en el Dashboard y fichas técnicas.

---

## 12. VERIFICACIÓN TÉCNICA FINAL Y GARANTÍAS READ-ONLY

### Resultados de Comprobaciones Ejecutadas:
- `npm run check`: **EXITOSO (Code 0)** (`tsc --noEmit` finalizado sin errores).
- `git diff --check`: **EXITOSO (Code 0)** (Sin problemas de formato ni espacios).
- `git status`: **LIMPIO (Clean)** (con la incorporación del documento de auditoría `.md`).

### Declaración de Garantías:
- **Archivos de código modificados:** Ninguno (0).
- **Archivos de código creados:** Ninguno (0) (Únicamente el documento de informe `.md`).
- **Cambios en Supabase:** Ninguno (0).
- **Migraciones ejecutadas:** Ninguna (0).
- **Commits realizados:** Ninguno (0).
- **Pushes realizados:** Ninguno (0).
