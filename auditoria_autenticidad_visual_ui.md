# AUDITORÍA DE AUTENTICIDAD VISUAL Y DISEÑO DE INTERFAZ (UI/UX)
## PROYECTO: TPM AUTOELEVADORES — MANTENIMIENTO PREVENTIVO NIVEL 1

> **Documento:** Auditoría Técnica y Visual de Interfaz (Read-Only)  
> **Fecha:** 26 de Septiembre de 2026  
> **Ámbito:** Toda la aplicación (Vistas Públicas, Operador, Supervisor, Componentes UI, Layouts y Sistema de Diseño)  
> **Enfoque:** Diagnóstico crítico de la percepción de "UI asistida/generada por IA", patrones SaaS genéricos, sobrediseño cosmético y propuesta de dirección hacia un producto industrial real para entorno de planta.

---

# 1. RESUMEN EJECUTIVO

### Conclusión Principal: ¿La aplicación actualmente parece hecha por IA?

> **SÍ.** Si un diseñador senior de producto industrial o un lead UX viera la aplicación por primera vez, concluiría inmediatamente que fue construida ensamblando patrones genéricos de plantillas **"Dark SaaS / Next.js Vercel-style"** generadas por IA.

Aunque la aplicación posee un nivel técnico y funcional muy sólido (soporte offline IndexedDB, manejo de sesiones, compresión de fotos, PWA, idempotencia), su capa visual sufre de los síntomas clásicos del código de interfaz generado por modelos de lenguaje:

1. **Repetición indiscriminada del mismo contenedor:** El patrón `bg-[#111724] border border-slate-800 rounded-2xl p-4 shadow-xl` se aplica a la landing, la ficha de equipo, la consola de supervisor, la pantalla de login, los modales y el tutorial de uso. Todo vive dentro del mismo bloque redondeado en fondo oscuro.
2. **Saturación de halos y resplandores (`glows` y `shadow-amber-500/20`):** Prácticamente cada botón principal y tarjeta posee sombras luminosas y bordes translúcidos (`bg-amber-500/15 border border-amber-500/30`), buscando un efecto "futurista/startup" en lugar de un contraste utilitario de alta visibilidad para planta industrial.
3. **Triplicación y cuadruplicación visual de la información:** Un solo estado como *"Operativo"* se comunica a la vez mediante:
   - Un punto de color verde (`rounded-full bg-emerald-400`);
   - Un icono de check (`<CheckCircle2 />`);
   - El texto en mayúsculas (`OPERATIVO`);
   - Un contenedor tipo píldora (`bg-emerald-950/60 border border-emerald-500/40 text-emerald-300`).
4. **Copywriting con modismos corporativos de SaaS:** Frases como *"Terminal de Acceso Seguro"*, *"Escáner QR Secundario"*, *"Guía de Inicio Rápido"*, *"Consola Supervisor de Mantenimiento"*, en lugar de un lenguaje directo, limpio y de herramientas de taller/planta (*"Equipos"*, *"Turnos"*, *"Registrar Service"*, *"Falla Crítica"*).
5. **Tipografía predeterminada de ecosistemas Next.js (`Geist Sans` / `Geist Mono`):** Aplicada sobre una jerarquía visual rígida con contrastes extremos de tamaño (`text-[10px]` vs `text-3xl font-black`), sintiéndose más cercana a un dashboard de métricas de infraestructura en la nube que a una herramienta rugerizada de inspección de autoelevadores.

**Diagnóstico General:** TPM Autoelevadores no requiere "hacerse más bonita" ni agregar más animaciones. Requiere un **desmantelamiento del adorno cosmético SaaS** para adoptar una estética **industrial real, sobria, de alta visibilidad, limpia y orientada a la eficiencia operativa**.

---

# 2. TOP 10 SEÑALES DE "AI UI SMELLS" (SÍNTOMAS DE INTERFAZ DE IA)

| # | Problema | Evidencia Concreta (Archivo, Línea, Clase) | Pantalla(s) Afectada(s) | Por qué genera apariencia genérica / AI | Dirección de Mejora |
|---|---|---|---|---|---|
| **1** | **Estructura idéntica de Tarjetas Anidadas** (*Cards-inside-Cards*) | [`app/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L216), [`app/dashboard/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/dashboard/page.tsx#L360), `bg-[#111724]` + `border border-slate-800` + `rounded-2xl` | Todas las pantallas (`/`, `/dashboard`, `/equipo`, `/perfil`) | Todas las secciones se resuelven de la misma forma: un gran bloque redondeado oscuro con bloques más pequeños idénticos dentro. Elimina la jerarquía de plano. | Reemplazar contenedores redundantes por espacio negativo, divisiones finas monocromáticas (`divide-y border-slate-800`) y grillas continuas tipo blueprint industrial. |
| **2** | **Redundancia Visual Triplicada en Badges** | [`components/StatusBadge.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/components/StatusBadge.tsx#L30-L58), [`components/GravedadBadge.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/components/GravedadBadge.tsx#L18-L47) | `/`, `/equipo/[qr_codigo]`, `/dashboard`, `/inspeccion/[id]` | Muestra 4 señales redundantes simultáneas: punto verde/rojo + icono Lucide + texto mayúscula + píldora translúcida. | Reducir a un único indicador limpio de estado: texto directo con código de color industrial sólido o un indicador tipográfico de alto contraste sin adornos. |
| **3** | **Saturación de Halos Luminosos (`Glows`) y Sombras Decorativas** | [`app/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L322), [`app/login/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/login/page.tsx#L175), `shadow-lg shadow-amber-500/20`, `bg-amber-500/15 border-amber-500/30` | `/`, `/login`, `/equipo/[qr_codigo]`, `/inspeccion/[id]`, `/dashboard` | Los halos de luz flotantes son el sello distintivo de las plantillas AI / Dribbble que buscan aparentar "tecnología avanzada" sin función práctica. | Eliminar todos los `shadow-amber-500/*` y fondos con opacidad translúcida. Usar botones táctiles planos con bordes contrastantes y estados `:active` de respuesta mecánica. |
| **4** | **Abuso Incondicional de Iconografía (`Lucide-react`)** | [`app/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L30-L44), [`components/Header.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/components/Header.tsx#L6) (30+ iconos importados) | Toda la aplicación | Cada etiqueta, botón, opción y título incluye un icono a la izquierda. Genera ruido visual y distrae la lectura rápida de los datos técnicos. | Eliminar iconos en etiquetas descriptivas donde el texto es autosuficiente. Reservar iconos únicamente para acciones táctiles primarias o alertas críticas. |
| **5** | **Radio de Bordes Excesivo y Uniforme (`rounded-2xl` / `rounded-xl`)** | `globals.css` (Línea 30: `--radius: 0.75rem`), clases `rounded-2xl` repetidas en 120+ elementos | Toda la aplicación | Radios de 16px/24px transmiten estética de app móvil de consumo o juguete digital, totalmente opuesta a la firmeza y rigidez de maquinaria pesada. | Adoptar un sistema de radios utilitarios reducidos (`rounded-sm`, `rounded-md` o 0px/4px en contenedores principales), proyectando precisión mecánica. |
| **6** | **Copywriting Estilo SaaS/Startup** | Frases: *"Terminal de Acceso Seguro"*, *"Consola Supervisor"*, *"Guía de Inicio Rápido"* | `/login`, `/dashboard`, `/` | Texto que suena a software de marketing en la nube escrito por una LLM, en vez de terminología operativa de taller o planta. | Simplificar copywriting a términos directos y profesionales: *"Identificación"*, *"Supervisor"*, *"Checklist Diarios"*, *"Defectos Activos"*. |
| **7** | **Tipografía Predeterminada `Geist` + Dark SaaS Palette** | [`app/layout.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/layout.tsx#L8-L16), [`app/globals.css`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/globals.css#L10-L31) | Toda la aplicación | `Geist` sobre fondo `#0b0f17` con acento amber es la combinación por defecto del stack Vercel/Next.js 15 en 2024-2026. | Introducir tipografía de alta legibilidad técnica (ej. sans-serif industrial o mono tabular como `JetBrains Mono` / `IBM Plex Mono` para datos de horómetro y serie). |
| **8** | **Cajas de Datos con Micro-Badges Decorativos** | [`app/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L219), [`app/equipo/[qr_codigo]/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/equipo/%5Bqr_codigo%5D/page.tsx#L247) | `/`, `/equipo/[qr_codigo]` | Encabezados de sección con etiquetas pequeñas en mayúscula tipo `TPM Nivel 1 • Operación` en cajas con borde traslúcido. | Reemplazar micro-badges por títulos limpios en caja alta con la tipografía principal o un identificador en código directo. |
| **9** | **Simetría Rígida e Identidad Visual Genérica (Color Amber Tailwind)** | `bg-amber-500` / `text-amber-400` usado directo de paleta Tailwind sin calibración de marca | Toda la aplicación | La app depende del color predeterminado `amber` de Tailwind. Si se cambia el logo, la app podría pertenecer a cualquier startup. | Calibrar un color de seguridad/marca propio (ej. Amarillo Industrial Caterpillar/DIN 1451 `#FFCC00` o Naranja de Seguridad `#FF5500`) sobre superficies con verdadero contraste. |
| **10** | **Tarjetas de Selección Rápida Estilo "Team Member Grid"** | [`app/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L377-L445) | `/` (Home) | Tarjetas de operadores con iniciales en cuadrados redondeados que parecen un widget de "Conocé al equipo" de una landing page. | Diseñar la selección de operador como un selector directo táctil estilo panel de fichado de planta o tabla de turnos. |

---

# 3. AUDITORÍA DETALLADA POR PANTALLA

## Tabla Resumen de Diagnóstico por Vista

| Pantalla | Problema Principal | Evidencia | Impacto Visual | Dirección de Mejora |
| --- | --- | --- | --- | --- |
| **`/` (Home)** | Sobrecarga de contenedores, tarjetas redundantes de operadores y hero decorado | `bg-[#111724] border border-slate-800 rounded-2xl` en 5 bloques seguidos; micro-counters en badges | La vista principal se siente como una landing page SaaS cargada de widgets sin jerarquía clara para el operador. | Transformar en un panel táctil directo: botón gigante de escáner QR, barra de búsqueda prominente y lista compacta de equipos. |
| **`/login` (Login)** | Tarjeta flotante con estética de plantilla de autenticación con badges decorativos | Badge "Terminal de Acceso Seguro" con punto verde resplandeciente (`bg-amber-500/10 border-amber-500/30`) | Se percibe como un login genérico de dashboard administrativo de plantilla. | Rediseñar como una terminal de fichado limpia, sólida, con inputs de alto contraste y números legibles para legajo. |
| **`/equipo/[qr_codigo]` (Ficha)** | Múltiples banners de advertencia apilados con estética idéntica; bitácora de inspecciones sobrecargada | Banners `bg-rose-950/40 border-rose-500/40`, `bg-amber-950/30 border-amber-500/30`, acordeón con múltiple anidamiento | Se genera ruido visual; los mensajes de parada de seguridad no destacan con la urgencia física requerida. | Unificar alertas en un bloque de estado mecánico superior. Rediseñar la bitácora histórica como una tabla o lista de eventos clara. |
| **`/inspeccion/[id]` (Checklist)** | Botones OK/FALLA voluminosos con resplandores; barra inferior flotante con backdrop-blur excesivo | Botones OK con `border-emerald-400 shadow-emerald-950`, barra `bg-[#0e1420]/95 backdrop-blur-md` | El proceso de verificación (que debe ser rápido en planta) se entorpece con decoraciones de interfaz. | Convertir los botones en interruptores táctiles sobrios de alta visibilidad, con respuesta de presión inmediata sin glows. |
| **`/dashboard` (Supervisor)** | Grilla de KPIs idénticos con fondos traslúcidos; pestañas con etiquetas voluminosas | 6 tarjetas KPI idénticas (`bg-[#111724]`); tabla con acordeones y tarjetas sueltas | Parece un dashboard SaaS administrativo genérico en lugar de una consola técnica de mantenimiento de planta. | Consolidar los KPIs en una barra de telemetría superior densa y estructurada; mostrar la flota en una tabla de control directo. |
| **`/perfil` (Mi Perfil)** | Tarjeta centralizada con estética de ajuste de cuenta SaaS; badges repetidos | Badges "Identificación de Planta", "Rol: supervisor", "Solo lectura" con icono de candado | Se percibe como la página de "Settings" de un servicio web. | Rediseñar como una credencial técnica de operador legible y profesional con código QR listo para escaneo/fichado. |
| **`/manifest` (PWA)** | Configuración genérica en `app/manifest.ts` | `theme_color: '#0b0f17'`, `background_color: '#0b0f17'`, iconos estándar | Correcto a nivel técnico, pero sin aprovechar la identidad visual propia del producto en dispositivos móviles. | Mantener configuración técnica, ajustando colores y nombre a la identidad sobria de la marca. |

---

## Análisis Individual de Pantallas

### A. VISTA PÚBLICA / OPERADOR: Home (`/`)
* **Archivo:** [`app/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx)
* **1. Elementos Auténticos:**
  - Los contadores de telemetría de flota (*Flota, Operativos, Parados*) con fuente monocromática tabular son un acierto funcional para lectura rápida.
  - La presencia del botón primario de cámara escáner con target táctil amplio (`min-h-[48px]`).
* **2. Elementos Genéricos / AI-like:**
  - El banner superior ([`app/page.tsx#L216`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L216)) con el badge `TPM Nivel 1 • Operación y Mantenimiento` con borde brillante `border-amber-500/30` y fondo `bg-[#111724]`.
  - La sección de *Operadores de Planta — Accesos Rápidos* ([`app/page.tsx#L352`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L352)), dispuesta en una grilla de tarjetas con avatares de iniciales que parecen componentes importados de Tailwind UI.
* **3. Elementos Sobrecargados:**
  - La tarjeta de autoelevadores en la lista ([`app/page.tsx#L472`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/page.tsx#L472)) combina: icono de interno + QR string + título + modelo + StatusBadge + MantenimientoBadge + franja de horómetro/combustible + botón "Ver QR" + botón "Iniciar Checklist". Contiene demasiados micro-elementos compitiendo por atención.
* **4. Oportunidades de Simplificación:**
  - Reducir el contenido de la tarjeta de equipo: la franja de telemetría interna se puede integrar de forma limpia en la cabecera del ítem sin crear una "sub-tarjeta" dentro de la tarjeta.
* **5. Necesidad de Personalidad Propia:**
  - Reemplazar el fondo plano `#0b0f17` y los contenedores `rounded-2xl` por un esquema de estructura modular con líneas de separación nítidas y encabezados tipo ficha técnica de máquina.

---

### B. VISTA PÚBLICA: Login (`/login`)
* **Archivo:** [`app/login/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/login/page.tsx)
* **1. Elementos Auténticos:**
  - El formulario es directo, requiere usuario/legajo y clave sin fricción innecesaria.
* **2. Elementos Genéricos / AI-like:**
  - El contenedor principal de login ([`app/login/page.tsx#L105`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/login/page.tsx#L105)) con `shadow-2xl shadow-black/60` y la insignia central con icono `ShieldCheck` metida en una caja cuadrada con borde brillante `bg-amber-500/10 border-amber-500/30`.
  - La etiqueta `Terminal de Acceso Seguro` con un punto brillante de color ámbar.
* **3. Elementos Sobrecargados:**
  - El microcopy inferior *"La sesión permanecerá activa durante la jornada de trabajo"* en tipografía mono gris sobre borde tenue, típico de pie de página de plantilla SaaS.
* **4. Oportunidades de Simplificación:**
  - Eliminar el escudo superior y las insignias decorativas. Enfocar la pantalla exclusivamente en dos campos limpios y legibles de identificación.
* **5. Necesidad de Personalidad Propia:**
  - El login debe sentirse como la pantalla de entrada de un terminal industrial de fichado (como un controlador de planta), no como un portal de inicio de sesión de un CRM.

---

### C. VISTA OPERADOR: Ficha de Equipo (`/equipo/[qr_codigo]`)
* **Archivo:** [`app/equipo/[qr_codigo]/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/equipo/%5Bqr_codigo%5D/page.tsx)
* **1. Elementos Auténticos:**
  - El bloque de lectura de horómetro actual y la comparación con la lectura anterior ([`app/equipo/[qr_codigo]/page.tsx#L422`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/equipo/%5Bqr_codigo%5D/page.tsx#L422)) aporta valor operativo real.
  - El modal de confirmación cuando hay un salto alto de horómetro (+100 hs) es una excelente regla de negocio.
* **2. Elementos Genéricos / AI-like:**
  - Los banners de advertencia apilados ([`app/equipo/[qr_codigo]/page.tsx#L282-L316`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/equipo/%5Bqr_codigo%5D/page.tsx#L282-L316)) utilizan combinaciones de `bg-[#color]-950/40 border border-[#color]-500/40` con iconos `ShieldAlert` y `Wrench` flotantes, imitando alertas de dashboards web.
* **3. Elementos Sobrecargados:**
  - En la bitácora de inspecciones ([`app/equipo/[qr_codigo]/page.tsx#L464`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/equipo/%5Bqr_codigo%5D/page.tsx#L464)), la expansión del acordeón despliega múltiples capas anidadas de cajas: fallas reportadas con foto + tabla dividida por secciones con bordes y badges para cada uno de los 19 ítems.
* **4. Oportunidades de Simplificación:**
  - La visualización del historial puede simplificarse mostrando primero los defectos encontrados y resumiendo los ítems conformes en una lista compacta sin necesidad de empaquetar cada ítem en su propio bloque `bg-slate-950/90`.
* **5. Necesidad de Personalidad Propia:**
  - La ficha del equipo debe lucir como la placa de especificaciones y registro de servicio pegada a la máquina, utilizando datos claros, números en tipografía mono tabular y una estructura visual rígida.

---

### D. VISTA OPERADOR: Checklist TPM (`/inspeccion/[id]`)
* **Archivo:** [`app/inspeccion/[id]/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/inspeccion/%5Bid%5D/page.tsx)
* **1. Elementos Auténticos:**
  - La división por pestañas horizontales de secciones (*Frenos, Motor, Chasis, Seguridad*) permite avanzar ordenadamente.
  - La barra de progreso superior que calcula el porcentaje de avance y cambia de color según el estado resultante en tiempo real.
* **2. Elementos Genéricos / AI-like:**
  - Los botones táctiles de respuesta booleana ([`app/inspeccion/[id]/page.tsx#L734-L752`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/inspeccion/%5Bid%5D/page.tsx#L734-L752)) utilizan sombras intensas (`shadow-emerald-950`, `hover:bg-rose-950/50`) y esquinas con `rounded-xl`.
  - La barra flotante inferior ([`app/inspeccion/[id]/page.tsx#L848`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/inspeccion/%5Bid%5D/page.tsx#L848)) con `bg-[#0e1420]/95 backdrop-blur-md` se siente como la barra de navegación de una app móvil de consumo.
* **3. Elementos Sobrecargados:**
  - En la vista de éxito final ([`app/inspeccion/[id]/page.tsx#L476`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/inspeccion/%5Bid%5D/page.tsx#L476)), la caja del icono central posee un resplandor gigante con `shadow-2xl shadow-emerald-950/40` o `animate-pulse`, acompañado de 3 tarjetas internas para mostrar el horómetro y los defectos.
* **4. Oportunidades de Simplificación:**
  - En lugar de modales de carga y confirmaciones flotantes, el checklist debe permitir tocar "OK" o "FALLA" de forma inmediata con una respuesta táctil/sonora limpia y sin efectos de desvanecimiento lentos.
* **5. Necesidad de Personalidad Propia:**
  - El checklist debe estar diseñado pensando en operarios trabajando con guantes de seguridad o pantallas industriales táctiles bajo luz solar o de galpón: botones de alto contraste, tipografía nítida y cero transparencias deslumbrantes.

---

### E. VISTA SUPERVISOR: Dashboard (`/dashboard`)
* **Archivo:** [`app/dashboard/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/dashboard/page.tsx)
* **1. Elementos Auténticos:**
  - El cálculo del estado de mantenimiento preventivo por horómetro (*al día, próximo, vencido*) y la posibilidad de registrar un service (+250hs) directamente desde la grilla.
* **2. Elementos Genéricos / AI-like:**
  - Las 6 tarjetas de indicadores KPI superiores ([`app/dashboard/page.tsx#L395-L461`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/dashboard/page.tsx#L395-L461)): grilla de cajas `bg-[#111724]` con sutiles colores traslúcidos (`bg-emerald-500/[0.03]`, `bg-[#111724] border border-amber-500/30`), cada una con su icono de Lucide en la esquina superior izquierda. Es el diseño de KPI por defecto de bibliotecas como Tremor o Shadcn.
* **3. Elementos Sobrecargados:**
  - En la pestaña de *Fallas*, cada ítem es una tarjeta grande que contiene múltiples botones pequeños para cambiar el estado de reparación (*Pendiente, En revisión, Reparando, Reparado, Cerrado*), ocupando mucho espacio vertical.
* **4. Oportunidades de Simplificación:**
  - Transformar el listado de fallas y la flota en una tabla de control directo con filas compactas, ordenable por urgencia y estado, permitiendo acciones rápidas en línea.
* **5. Necesidad de Personalidad Propia:**
  - El dashboard del supervisor no debe parecer una vista de métricas SaaS de analítica web, sino un centro de control técnico de mantenimiento de flota.

---

### F. VISTA SUPERVISOR: Perfil (`/perfil`)
* **Archivo:** [`app/perfil/page.tsx`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/perfil/page.tsx)
* **1. Elementos Auténticos:**
  - La generación dinámica de la credencial QR del operario (`TPM:OP:4029`) lista para ser escaneada en el acceso de planta.
* **2. Elementos Genéricos / AI-like:**
  - La disposición tipo "Ajustes de cuenta" en una tarjeta central con bordes suavizados, badges de "Rol: supervisor" y etiquetas con icono de candado de "Solo lectura".
* **3. Elementos Sobrecargados:**
  - El bloque inferior con la visualización del identificador interno UUID (`perfil.id`) con un botón "Copiar UID", que aporta poco valor al operador de planta.
* **4. Oportunidades de Simplificación:**
  - Enfocar la vista en dos bloques principales: la credencial digital de planta con el código QR gigante para escaneo rápido, y los datos personales editables (Nombre y Legajo).
* **5. Necesidad de Personalidad Propia:**
  - Formatear la credencial visual como un carnet de identificación técnico (con fotografía, código QR, legajo y rol), imitando los carnets físicos de planta.

---

### G. CONFIGURACIÓN PWA: Manifest (`/manifest`)
* **Archivo:** [`app/manifest.ts`](file:///c:/Users/herna/Desktop/PROYECTO%2020/app/manifest.ts)
* **1. Diagnóstico:**
  - Correctamente configurado a nivel técnico (`display: 'standalone'`, `theme_color: '#0b0f17'`).
  - Sin embargo, los colores del tema PWA apuntan al fondo genérico `#0b0f17` de Tailwind, perdiendo la oportunidad de definir una barra de estado con el color característico de la marca industrial.

---

# 4. ANÁLISIS DEL DESIGN SYSTEM ACTUAL

Below is the document of current design system variables and patterns found in the codebase:

```css
/* Estado Actual del Sistema de Diseño (Extraído de globals.css y Tailwind) */
:root {
  --background: 222 47% 7%;      /* #0b0f17 - Dark Slate Genérico */
  --card: 222 47% 11%;            /* #111724 - Card Surface */
  --primary: 38 92% 50%;          /* #f59e0b - Amber 500 Tailwind */
  --border: 217 33% 20%;           /* #1e293b - Slate Border */
  --radius: 0.75rem;              /* 12px - Rounded XL */
}
```

### Evaluación Técnica por Componente:

1. **Colores de Fondo y Superficie:**
   - *Actual:* Fondo `#0b0f17` con tarjetas `#111724` y contenedores internos `#0b0f17`.
   - *Veredicto:* **Genérico / AI-like.** Es el esquema "Dark Navy/Slate" universal de plantillas Tailwind SaaS. No transmite sensación de superficie técnica o papel/pantalla industrial.
   - *Dirección:* Conservar un tema oscuro pero virar hacia un fondo neutro de carbón/chasis (`#0a0d12` o `#121212`) con líneas de división nítidas (`#262626`) y superficies con contraste utilitario, evitando tonos azulados artificiales.

2. **Tipografía:**
   - *Actual:* `Geist Sans` para cuerpo y títulos; `Geist Mono` para números e identificadores.
   - *Veredicto:* **Muy Genérica.** `Geist` es la tipografía corporativa de Vercel y Next.js. Al combinarse con títulos en `font-black tracking-tight`, la app grita "sitio construido con Next.js/Vercel por una IA".
   - *Dirección:* Usar un sistema sans-serif neo-grotesco de tono industrial (como `Inter`, `Archivo`, o font del sistema) combinado con una tipografía monocromática técnica con números tabulares nítidos (`JetBrains Mono`, `IBM Plex Mono` o `Space Mono`) para horómetros, códigos QR e internos.

3. **Radios de Esquina (`border-radius`):**
   - *Actual:* `rounded-2xl` (16px) en contenedores; `rounded-xl` (12px) en botones y tarjetas; `rounded-lg` en badges.
   - *Veredicto:* **Demasiado suavizado / Orgánico.** Los radios grandes de 16-24px están asociados a aplicaciones móviles de consumo (iOS/Android), no a paneles de control industrial o maquinaria pesada.
   - *Dirección:* Reducir drásticamente los radios a escala técnica: 4px (`rounded-md`), 2px (`rounded-sm`) o 0px (esquinas rectas 90° estilo Swiss Industrial / Tactical Blueprint).

4. **Sombras y Glows (`box-shadow`):**
   - *Actual:* `shadow-xl shadow-amber-500/20`, `shadow-2xl shadow-emerald-950/40`, `drop-shadow`.
   - *Veredicto:* **Sobrediseño Cosmético.** Los resplandores luminosos de colores no agregan jerarquía de información y generan fatiga visual en pantallas con poco brillo o alta luz ambiental.
   - *Dirección:* Eliminar completamente los resplandores translúcidos. Utilizar bordes sólidos y cambios de elevación mediante contraste de superficie.

5. **Iconografía:**
   - *Actual:* `Lucide-react` utilizado en el 100% de las etiquetas, títulos, botones y filas de lista.
   - *Veredicto:* **Sobrecargado / Redundante.**
   - *Dirección:* Eliminar el 60% de los iconos decorativos. Mantener solo los iconos que representen acciones físicas inmediatas o estados de advertencia crítica.

---

# 5. ANÁLISIS DE ANCLAJE INDUSTRIAL REALISTA

### ¿La interfaz responde a las necesidades reales de una planta industrial?

Evaluación frente a los requisitos del entorno operativo:

1. **Operación con guantes / Dedos sucios:**
   - *Estado Actual:* Los botones de inicio y escáner son amplios (`min-h-[48px]`), pero los controles secundarios (como editar equipo, ver QR o cambiar de sección) tienen zonas de toque reducidas (`px-2.5 py-1.5`) y están muy pegados entre sí.
   - *Diagnóstico:* Riesgo de toques accidentales en pantallas táctiles de celulares o tablets rugerizadas.

2. **Visibilidad bajo iluminación extrema o reflejos de galpón:**
   - *Estado Actual:* Gran cantidad de textos en gris tenue (`text-slate-400`, `text-slate-500`) sobre fondos oscuros azulados (`bg-[#111724]`), combinados con textos de `10px` o `11px`.
   - *Diagnóstico:* Dificultad de lectura a distancia o bajo el sol en zonas de carga/descarga. El contraste WCAG AA no se cumple en el microcopy secundario.

3. **Velocidad de decisión e inspección:**
   - *Estado Actual:* La pantalla del checklist presenta muchas decoraciones visuales entre ítem e ítem (bordes de colores, badges de pendiente, animaciones suaves).
   - *Diagnóstico:* Un checklist de 19 ítems debe responder con la inmediatez de un tablero de control mecánico. La respuesta a cada clic debe ser instantánea y sin fricción gráfica.

4. **Autenticidad de Marca del Producto:**
   - *Estado Actual:* Si se cambia el logo "TPM ELEVADORES", la interfaz parece un template de gestión de flota de cualquier startup SaaS norteamericana.
   - *Diagnóstico:* Falta una identidad gráfica propia del sector metalmecánico/logístico argentino (placas metálicas, tipografía de imprenta industrial, códigos de interno gigantes tipo pintura de chasis).

---

# 6. RECOMENDACIONES Y DIRECCIÓN FUTURA (SIN IMPLEMENTAR AÚN)

Para cuando se habilite la etapa de rediseño e implementación, las recomendaciones se priorizan por su nivel de impacto en la autenticidad visual:

### P0 — Cambios de Alto Impacto para Eliminar la Apariencia "AI/SaaS" (Urgentes)
1. **Desmantelar la triplicación de estados en Badges:**
   - Eliminar la combinación `[Punto de color] + [Icono] + [Texto] + [Fondo traslúcido]`.
   - Reemplazar por etiquetas sobrias con contraste de texto directo (ej. `OPERATIVO` en verde sólido o `PARADO` en rojo de seguridad con fondo plano de alto contraste).
2. **Eliminar todos los efectos de Glow y Sombras Luminosas:**
   - Quitar todas las clases `shadow-amber-500/*`, `shadow-emerald-950/*`, y transparencias decorativas `bg-amber-500/15`.
   - Aplicar botones planos con bordes contrastantes y estados de presión física `btn-tactile` sobrios.
3. **Reducir la densidad de tarjetas anidadas (*Un-nesting*):**
   - Eliminar el esquema de contenedores dentro de contenedores (`bg-[#111724]` dentro de `bg-[#111724]`).
   - Pasar a maquetaciones basadas en grillas continuas, líneas de división finas monocromáticas y espacios negativos limpios.

### P1 — Construcción de Identidad Visual Industrial Única
1. **Reemplazar el sistema de bordes redondeados orgánicos (`rounded-2xl`):**
   - Definir un radio de curvatura industrial rígido (0px o máximo 4px/6px).
2. **Establecer una Jerarquía Tipográfica de Maquinaria:**
   - Adoptar tipografía monocromática tabular (`JetBrains Mono` / `IBM Plex Mono`) como elemento estructural para números de interno, horómetros y códigos QR.
   - Utilizar fuentes sans-serif de estilo neo-grotesco/Swiss Industrial para títulos en caja alta.
3. **Calibrar el Color de Seguridad Industrial:**
   - Reemplazar el `amber-500` predeterminado de Tailwind por un tono de marca industrial propio (ej. Amarillo de Seguridad Caterpillar / DIN 1451 `#FFCC00` o Naranja Industrial `#FF5500`) aplicado exclusivamente como color de atención y acción primarias.

### P2 — Refinamiento UX para Entorno de Planta
1. **Optimización de Targets Táctiles:**
   - Garantizar que todos los botones e interactivos tengan una altura mínima de `48px` y una separación de al menos `8px` entre sí para uso con guantes.
2. **Elevación del Contraste Tipográfico (WCAG AAA):**
   - Eliminar los tonos de texto `text-slate-500` y `text-slate-400` en información secundaria. Garantizar que todo texto técnico posea suficiente contraste visual para lectura con reflejos.
3. **Transformación de la Bitácora del Dashboard:**
   - Convertir la vista de flota y fallas del supervisor en un panel de control directo tipo tabla técnica de mantenimiento, reduciendo el desplazamiento vertical.

### P3 — Detalle e Integración del Producto
1. **Diseño de Credenciales Físicas de Operador:**
   - Formatear la vista del perfil y los carnets QR para impresión en formato de tarjeta plástica de identificación de planta.
2. **Optimización de Micro-interacciones:**
   - Ajustar las animaciones para que duren un máximo de 100ms, dando una sensación de respuesta física mecánica inmediata al presionar botones.

---

# 7. REVISIÓN DE SKILLS Y RECURSOS UTILIZADOS

En el desarrollo de esta auditoría visual se revisaron e inspeccionaron las siguientes habilidades del entorno `.agents/skills`:

- **`design-taste-frontend`**: Consultada para auditar vicios de diseño impulsados por LLMs (como gradients morados/azules por defecto, uso excesivo de Inter/Geist, grillas simétricas idénticas y falta de jerarquía de masa visual).
- **`redesign-existing-projects`**: Consultada para la secuencia de diagnóstico de interfaz sin romper la pila técnica existente (Tailwind + Next.js).
- **`industrial-brutalist-ui`**: Consultada como referencia de diseño utilitario de alta densidad, estética de manuales técnicos, gráficos de alta visibilidad, grillas sobrias y tipografía monocromática de telemetría.

### Skills Especializadas Recomendadas para la Futura Fase de Rediseño:
*Si en una etapa posterior se decide ejecutar los cambios visuales recomendados, sería conveniente disponer o activar:*
- **`industrial-brutalist-ui` / `tactile-ui-skill`**: Para guiar la construcción de paneles y controles táctiles sobrios de planta industrial sin caer en clichés SaaS.
- **`a11y-high-contrast-audit`**: Para auditar matemáticamente los niveles de contraste (WCAG AAA) bajo condiciones de luz solar directa en dispositivos móviles.

---

# 8. VERIFICACIÓN FINAL DE REGLAS READ-ONLY

Se confirma explícitamente el cumplimiento riguroso de las directivas impuestas para esta etapa:

- [x] **NO se modificó ningún archivo de código del proyecto** (`app/`, `components/`, `lib/`, `public/`, `package.json`, etc. permanecen intactos).
- [x] **NO se realizaron commits en el repositorio Git.**
- [x] **NO se ejecutó ninguna acción de `git push`.**
- [x] **NO se instalaron nuevas dependencias de npm ni paquetes.**
- [x] **NO se crearon nuevos componentes ni archivos de código.**
- [x] **Único entregable generado:** Este archivo de auditoría exclusivamente descriptivo `auditoria_autenticidad_visual_ui.md`.
