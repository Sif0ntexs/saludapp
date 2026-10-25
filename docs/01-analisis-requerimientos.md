# 1. Análisis y Especificación de Requerimientos de Software (ERS)

**Proyecto:** SaludApp — Sistema de gestión de citas médicas, historial
clínico, diagnóstico/indicaciones y farmacia.
**Versión:** 2.0 · **Fecha:** 25-10-2026 · **Estado:** v1 aprobado por el
cliente; §A (v2, Roles/Perfiles/Timeline) definido 25-10-2026 y TRASLADADO
a diseño en docs 02 §2.7 y 03 §3.6 (DDL ejecutado y verificado en sqlite3).
**Norma de referencia:** IEEE 830 (adaptado) + estándar de casos de uso UML.

---

## 1. Propósito

Definir de forma inequívoca qué debe hacer SaludApp, para quién, y bajo qué
restricciones, para que el diseño (doc 02), la base de datos (doc 03) y el
código se verifiquen contra este documento.

## 2. Alcance

**DENTRO del alcance (v1):**
1. Gestión de **citas médicas**: agendar, confirmar, cancelar, re-agendar,
   filtrar por estado (próximas / pasadas / canceladas).
2. Gestión del **historial médico**: registro de consultas con fecha,
   médico, especialidad, motivo, **diagnóstico** e **indicaciones médicas**
   (tratamiento), adjuntar observaciones (p. ej., signos vitales textuales).
3. **Farmacia personal**: catálogo de medicamentos, stock, reminder de dosis
   derivada de las indicaciones, registro de tomas.
4. Directorios de **médicos y especialidades** reutilizables entre cita e
   historial.
5. Persistencia **local en el dispositivo** (funciona sin internet).
6. Interfaz en español, modo claro y modo oscuro.

**FUERA del alcance (v1):**
- Prescripciones firmadas electrónicamente, interoperabilidad HL7/FHIR.
- Sincronización en la nube (en v2 los usuarios multi-rol viven en el
  dispositivo; la sincronización entre dispositivos sigue fuera).
- Pagos, facturación, seguros médicos.
- Notificaciones push del sistema (v2) — en v1 los recordatorios viven en
  la pantalla Farmacia/Historial.

### Alcance añadido en v2 (25-10-2026)
7. **App multi-rol con sesiones**: cada usuario (paciente, médico/
   especialista, enfermería) ingresa a SU perfil dentro de la app, en el
   mismo dispositivo.
8. **Perfil del paciente como hoja clínica**: sustentado por un
   **timeline** cronológico que consolida citas, consultas, diagnósticos,
   indicaciones, medicación y tomas en una sola línea de tiempo.
9. **Acceso controlado al perfil del paciente** por enfermería y médicos/
   especialistas, en modo solo lectura, con consentimiento del paciente,
   registro de auditoría de accesos y revocación inmediata.
10. **Dispositivos vestibles conectados al perfil** (v2.1): el paciente
    vincula relojes inteligentes y otros wearables para capturar mediciones
    de sus valores de salud (frecuencia cardíaca, SpO2, pasos, sueño,
    glucosa, presión, temperatura, peso) en tiempo real, 100 % offline.
11. **Mediciones como parte del perfil**: lista por tipo con tendencia,
    alerta informativa de valores fuera del rango de referencia y
    entrada al timeline del paciente (vías §4-B).

## 3. Actores y descripciones

| Actor | Tipo | Descripción | Responsabilidades |
|---|---|---|---|
| **Paciente** | Principal | v1: único usuario, auto-gestiona citas y historial. v2: cuenta con rol `paciente`; dueño de su perfil-hoja clínica y de los permisos sobre él. | Agenda/cancela citas, registra consultas y diagnósticos, mantiene su farmacia, otorga/revoca acceso a su perfil |
| **Médico / Especialista** | Principal (usuario desde v2) | v1: dato administrado por el paciente (nombre, especialidad, consultorio). v2: cuenta con rol `medico` y perfil profesional (matrícula/cédula). Consulta en modo lectura el perfil del paciente autorizado. | Atender citas, registrar diagnóstico e indicaciones en la consulta, consultar timelines de pacientes autorizados |
| **Enfermería** | Principal (usuario desde v2) | Personal de salud con rol `enfermeria`. Consulta en modo lectura el perfil/timeline del paciente autorizado, con alcance igual al del médico a estos efectos (§4-A). | Seguimiento de indicaciones, consulta de perfil/timeline del paciente autorizado |
| **Farmacia / Medicamento** | Entidad administrada | Catálogo e inventario personal de medicamentos del paciente. | — |
| **Sistema** | Automático | Validaciones, estados de cita, cálculo de stock, recordatorios de toma y, en v2, control de consentimientos y auditoría de accesos; en v2.1 sincroniza mediciones de wearables. | Aplica reglas de negocio R1–R8 |

## 4. Requerimientos funcionales

Formato: ID · descripción · prioridad (Alta/Media/Baja) · criterio de verificación.

### Módulo Citas
- **RF-01 (Alta):** El sistema debe permitir registrar una cita con: médico,
  especialidad, fecha-hora futura, consultorio y estado inicial `Programada`.
  *Verif.:* la cita aparece en "Próximas" ordenada por fecha ascendente.
- **RF-02 (Alta):** El sistema debe impedir agendar dos citas con el mismo
  médico que se traslapen en fecha-hora (mismo día, misma franja).
  *Verif.:* intento de cita duplicada muestra error y no se guarda.
- **RF-03 (Alta):** El paciente puede cambiar el estado de una cita entre
  `Programada → Confirmada` y marcar `Cancelada` (se conserva con ese
  estado, no se borra). *Verif.:* la cancelada pasa al filtro "Pasadas/otras"
  con la etiqueta correspondiente.
- **RF-04 (Media):** El paciente puede **re-agendar**: cambiar fecha-hora de
  una cita `Programada` o `Confirmada`. *Verif.:* nueva fecha visible y el
  traslape de RF-02 se re-chequea.
- **RF-05 (Media):** Al "atender" una cita se crea automáticamente la
  **consulta** asociada en el historial con médico/especialidad/fecha
  copiados de la cita. *Verif.:* la consulta aparece en Historial con la
  cita enlazada.

### Módulo Historial / Diagnóstico
- **RF-06 (Alta):** Registrar consulta con: paciente implícito, médico,
  especialidad, fecha, motivo, **diagnóstico**, **indicaciones** (texto de
  tratamiento) y observaciones. Motivo y diagnóstico son obligatorios.
  *Verif.:* guardar sin diagnóstico muestra validación.
- **RF-07 (Alta):** Listar el historial en orden cronológico inverso y
  permitir ver el detalle completo (diagnóstico + indicaciones).
  *Verif.:* el detalle muestra todos los campos tal como se guardaron.
- **RF-08 (Media):** Filtrar historial por especialidad o por texto
  (motivo/diagnóstico/indicaciones). *Verif.:* filtran simultáneamente con
  los chips activos.
- **RF-09 (Media):** Desde una indicación, el paciente puede **agregar el
  medicamento prescrito a su farmacia** con un toque (precarga nombre y
  frecuencia). *Verif.:* el medicamento aparece en Farmacia.

### Módulo Farmacia
- **RF-10 (Alta):** Mantener catálogo de medicamentos: nombre, presentación,
  dosis/frecuencia, cantidad en stock, fecha de fin de tratamiento.
  *Verif.:* CRUD completo funciona (crear, editar, tomar/eliminar).
- **RF-11 (Alta):** Registrar la **toma** de una dosis; el stock baja en 1
  y se registra fecha-hora. *Verif.:* stock refleja -1 y la toma aparece en
  el conteo de adherencia del día.
- **RF-12 (Media):** Alertar cuando el stock de un medicamento activo queda
  en 0 o por debajo de 2 dosis. *Verif.:* el ítem se marca con chip "Stock bajo".
- **RF-13 (Baja):** Marcar medicamento como **suspendido** cuando termina
  el tratamiento (no se borra). *Verif.:* pasa a la sección "Suspendidos".

### Módulo Directorios
- **RF-14 (Alta):** CRUD de médicos (nombre, especialidad, consultorio,
  teléfono opcional). *Verif.:* alta desde formulario de cita con nombre
  nuevo crea el registro y queda seleccionado.
- **RF-15 (Baja):** CRUD de especialidades (nombre). Semilla inicial
  cargada (Medicina General, Cardiología, Pediatría, Odontología,
  Dermatología, Ginecología).

### Requerimientos transversales
- **RF-16 (Alta):** Panel **Inicio** con: próxima cita destacada (médico,
  fecha, estado), contadores (citas próximas, consultas del historial,
  medicamentos activos) y accesos directos.
- **RF-17 (Media):** Estados vacíos explicativos en TODAS las listas con
  acción sugerida ("No hay citas — toca + para agendar la primera").
- **RF-18 (Alta):** Exportar/respaldar todos los datos como JSON
  descargable (respaldo manual). *Verif.:* el archivo contiene las 5
  tablas principales.

### Requerimientos funcionales v2 — Roles, perfiles y timeline (§4-A)

Añadidos el 25-10-2026. Se sustentan en: `usuario` nuevo (con rol),
`perfil_paciente` derivado y `evento_timeline` (entidades detail en doc 03
— pendiente de diseñar). El resto de la app v1 no cambia.

- **RF-19 (Alta):** El sistema debe mantener **usuarios con rol**
  (`paciente`, `medico`, `enfermeria`) y sesión activa por usuario; las
  direcciones (menú, acciones) se adaptan al rol.
  *Verif.:* iniciar sesión como enfermería muestra un Inicio distinto al
  del paciente, sin acceso de escritura a Citas/Farmacia.
- **RF-20 (Alta):** Cada usuario tiene un **perfil propio**: datos
  personales (nombre, contacto) y, para `medico`/`enfermeria`, atributos
  profesionales (matrícula/cédula, especialidad para el médico).
  *Verif.:* el perfil se edita desde "Mi perfil" y los cambios persisten.
- **RF-21 (Alta):** El perfil del paciente se **sustenta en un timeline**:
  vista única cronológica (más reciente arriba) que consolida todos los
  eventos del paciente — cita (creación, cambio de estado, cancelación),
  consulta (motivo, diagnóstico, indicaciones), medicamento (alta,
  suspendido), toma (dosis) — cada uno con fecha-hora y tipo.
  *Verif.:* tras atender una cita y registrar una toma, ambos eventos
  aparecen hoy mismo en el timeline con su tipo y orden correcto.
- **RF-22 (Media):** El timeline se puede **filtrar por tipo de evento**
  (citas / consultas / diagnósticos / medicación / tomas) y por rango de
  fechas. *Verif.:* activar el filtro "consultas" oculta los demás eventos.
- **RF-23 (Alta):** El paciente **vincula** un personal de salud
  (médico o enfermería) a su perfil mediante consentimiento explícito;
  a partir de ese vínculo, ese profesional puede consultar su perfil y
  timeline en **modo solo lectura**.
  *Verif.:* un médico no vinculado no ve ningún paciente; tras vincular,
  ve el timeline y no existen botones de edición.
- **RF-24 (Alta):** Cada acceso de lectura al perfil del paciente queda
  registrado en **auditoría** (quién, cuándo) y el paciente puede ver
  esa lista. *Verif.:* tras que enfermería consulte el perfil, la lista
  de accesos del paciente muestra la entrada correspondiente.
- **RF-25 (Alta):** El paciente puede **revocar** el consentimiento de un
  profesional en cualquier momento; el acceso termina de inmediato (el
  vínculo y el permiso quedan inactivos, el registro de auditoría se
  conserva).
  *Verif.:* tras revocar, el profesional vuelve a ver "sin acceso"
  y ya no aparece entre los vinculados activos.
- **RF-26 (Media):** Soporte de **múltiples perfiles de paciente en el
  mismo dispositivo** (p. ej., el personal de salud consulta más de un
  paciente vinculado; un cuidador puede cambiar de sesión). La sesión
  activa solo ve los datos del paciente correspondiente.
  *Verif.:* cambiar de usuario cambia por completo los datos visibles;
  ningún dato de un paciente aparece bajo la sesión de otro.

### Requerimientos funcionales v2.1 — Dispositivos vestibles y mediciones (§4-B)

Añadidos el 25-10-2026 (fuente 03 §3.7: `dispositivo`, `medicion`).
Canal de captura (elegir al implementar, el modelo de datos es el mismo):
**(a)** API nativa Android **Health Connect** vía puente JS (agrega datos
de la propia app del reloj), **(b)** BLE directo vía puente nativo
(WebView no puede hablar Bluetooth por sí solo), **(c)** ingreso manual.
Todas las vías mantenienen 100 % offline y sin permiso INTERNET (RNF-04).

- **RF-27 (Media):** El paciente puede **vincular y desvincular
  dispositivos** a su perfil: nombre, tipo (reloj/anillo/banda/
  glucómetro/tensiómetro/báscula) y estado (Activo/Desconectado).
  *Verif.:* el dispositivo aparece en "Mis dispositivos" con su estado y
  la desvinculación elimina solo el vínculo, NO el historial de
  mediciones ya registradas (R7).
- **RF-28 (Alta):** Capturar **mediciones** con fecha-hora, tipo (frecuencia
  cardíaca, SpO2, pasos, sueño, glucosa, presión sistólica/diastólica,
  temperatura, peso, calorías), valor, unidad y fuente (dispositivo o
  manual). Deduplicación: la misma fecha-hora+tipo+dispositivo no se
  registra dos veces. *Verif.:* dos sincronizaciones seguidas no crean
  duplicados; una medición manual aparece al instante.
- **RF-29 (Media):** Vista de **Mediciones** por tipo: última lectura
  destacada, gráfica de tendencia (7/30 días) y lista cronológica;
  valores fuera del rango de referencia marcados (R8).
  *Verif.:* el gráfico muestra los días con datos y "fuera de rango"
  se ve marcado sin interpretación diagnóstica.
- **RF-30 (Alta):** Las mediciones son **eventos del timeline** del
  paciente (extienden RF-21) y, por tanto, visibles en lectura para el
  personal vinculado (R6-1) con su auditoría existente. Los niveles de
  glucosa no se muestran crudos al staff sin un indicador de fuente.
  *Verif.:* el timeline del staff muestra la medición con su tipo;
  el acceso queda en auditoría (RF-24).
- **RF-31 (Media):** Sistema: la sincronización de mediciones ocurre
  **al abrir la app** (y en background leve si el canal elegido lo
  permite), siempre offline; si el wearable no ofrece nuevo dato, no se
  registra nada. *Verif.:* modo avión + reloj cerca (o entrada manual)
  registra mediciones sin ninguna conexión de red.

## 5. Requerimientos no funcionales

| ID | Categoría | Requerimiento | Métrica de verificación |
|---|---|---|---|
| RNF-01 | Usabilidad | Operaciones clave (agendar cita, registrar consulta, registrar toma) en ≤ 3 toques desde Inicio | Prueba de recorrido de task |
| RNF-02 | Rendimiento | Arranque de app y render de listas con ≥ 500 registros < 1 s en gama media | Medición con logs |
| RNF-03 | Disponibilidad | Funciona 100 % offline tras instalación | Modo avión: flujo completo operativo |
| RNF-04 | Seguridad | Datos solo en el dispositivo; sin permisos de red; sin envío de datos | Revisión de manifest (no INTERNET) |
| RNF-05 | Privacidad | El respaldo JSON (RF-18) es expedido por acción explícita del usuario | Flujo de respaldo |
| RNF-06 | Accesibilidad | Contraste de texto ≥ 4.5:1, targets táctiles ≥ 48dp | Auditoría de estilo |
| RNF-07 | Portabilidad | Android 8.0+ (minSdk 26) | APK instalado en Android 8 y 13 |
| RNF-08 | Mantenibilidad | Modelo de datos v3 normalizado 3FN; UI desacoplada de datos (capa `DB` única) | Revisión de código |
| RNF-09 | Internacionalización | Textos externalizados (strings) para traducir sin tocar lógica | No hay texto "hardcodeado" en lógica |
| RNF-10 | Fiabilidad | Validación en cada formulario; nunca se pierde un registro por error de tipo | Suite de pruebas funcionales manuales |

## 6. Restricciones

1. Compilación del APK en GitHub Actions (el teléfono no ejecuta Gradle).
2. Java 17 + AGP 8.5.x + compileSdk 34.
3. Persistencia mediante la capa `localStorage` con esquema controlado por
   constantes de la capa `DB` (esquema lógico v3 del doc 03).
4. Un único idioma activo (español) en v1.
5. Proyecto público en GitHub (builds gratuitos ilimitados).

## 7. Reglas de negocio

- **R1 Estado de cita:** `Programada → Confirmada → Atendida` (transición
  a Atendida solo vía RF-05) o `→ Cancelada` (terminal). Ver doc 02 §Estados.
- **R2 Integridad cita-consulta:** toda consulta puede provenir de una cita
  o ser retrospectiva; si viene de cita, el vínculo es 1 a 1 y única.
- **R3 Stock:** la cantidad de un medicamento no puede ser negativa; una
  toma sobre stock 0 se rechaza con aviso (salvo que el usuario confirme).
- **R4 Medicamento activo:** es activo si tiene fecha de fin futura o
  ninguna, y no está suspendido.
- **R5 Fechas:** no se permiten citas ni consultas con fecha máxima en el
  pasado (recordatorio histórico permitido con aviso).

**Reglas v2 (25-10-2026):**
- **R6 Presunción de acceso:** la lectura del perfil/timeline de un
  paciente por parte de `medico`/`enfermeria` exige vínculo con
  consentimiento ACTIVO del paciente (R6-1); la escritura de diagnóstico
  e indicaciones es exclusiva del rol `medico` (R6-2), y del
  `paciente` para sus propios datos de farmacia/citas (R6-3).
- **R7 Timeline inmutable en lo retrospectivo:** un evento registrado
  figura en el timeline tal como ocurrió; una corrección añade el estado
  nuevo (p. ej., cita cancelada) sin destruir el evento previo — el
  timeline conserva la secuencia completa, nunca borra retroactivamente.

**Reglas v2.1 (25-10-2026):**
- **R8 Mediciones informativas, no diagnóstico:** una medición fuera del
  rango de referencia del tipo se MARCA visualmente como informativa
  ("fuera de rango") y genera sugestión de consulta, pero la app nunca
  genera un diagnóstico ni una urgencia automática desde mediciones —
  criterios de referencia siempre configurables/editables por el paciente
  o por su médico en una consulta real.

## 8. Criterios de aceptación (resumen de aceptación del milestone v1)

- Los 18 RF verificados según su criterio individual.
- Checklist de UI/UX del diseño (contraste, targets, estados, modo oscuro).
- Instalable desde APK firmado de debug en Android 8+.
- Los 3 diagramas de secuencia coinciden con el comportamiento real de la app.

**v2 (25-10-2026, pendiente de milestone):** verificados RF-19…RF-26 según
su criterio individual, incluyendo el recorrido del profesional
(enfermería consulte el timeline sin poder editar) y el de
consentimiento (vincular ver y revocar).

## 9. Trazabilidad RF → Caso de uso → Entidad → Pantalla

| RF | Caso de uso (doc 02) | Entidad principal (doc 03) | Pantalla |
|---|---|---|---|
| RF-01..05 | CU-01 Agendar cita, CU-02 Gestionar estado, CU-03 Atender cita | `cita`, `medico` | Inicio, Citas |
| RF-06..08 | CU-04 Registrar consulta, CU-05 Consultar historial | `consulta`, `medico`, `especialidad` | Historial, Detalle |
| RF-09 | CU-06 Derivar indicación a farmacia | `medicamento` | Detalle → Farmacia |
| RF-10..13 | CU-07 Gestionar farmacia, CU-08 Registrar toma | `medicamento`, `toma` | Farmacia |
| RF-14, RF-15 | CU-09 Gestionar directorios | `medico`, `especialidad` | Citas (form) |
| RF-16 | CU-10 Ver panel de inicio | Todas (agregados) | Inicio |
| RF-17 | (transversal) | — | Todas las listas |
| RF-18 | CU-11 Respaldar datos | Todas | Ajustes |
| RF-19, RF-20 | CU-12 Iniciar sesión / gestionar perfil (v2) | `usuario` | Sesión, Mi perfil |
| RF-21, RF-22 | CU-13 Ver timeline del paciente (v2) | `evento_timeline` (deriva de `cita`, `consulta`, `medicamento`, `toma`, `medicion` v2.1) | Perfil paciente: Timeline |
| RF-23 | CU-14 Vincular paciente / consultar perfil (v2) | `vinculo_personal` (paciente↔usuario staff) | Perfil paciente, Agenda del staff |
| RF-24, RF-25 | CU-15 Auditar y revocar accesos (v2) | `acceso_auditoria`, `vinculo_personal` | Perfil paciente: Accesos |
| RF-26 | CU-16 Cambiar de sesión/usuario (v2) | `usuario` | Ajustes |
| RF-27 | CU-17 Gestionar dispositivos (v2.1) | `dispositivo` | Perfil: Mis dispositivos |
| RF-28, RF-31 | CU-18 Capturar/sincronizar mediciones (v2.1) | `medicion`, `dispositivo` | Mediciones |
| RF-29 | CU-19 Consultar mediciones y tendencias (v2.1) | `medicion` | Mediciones |
| RF-30 | (extiende CU-13 — mismo timeline; v2.1) | `evento_timeline` (+`medicion`) | Timeline |

> **Nota v2 (25-10-2026):** los CU-12…CU-16 están definidos en doc 02 §2.7
> (casos de uso, S4/S5/S6, clases) y las entidades v2 (`usuario`,
> `vinculo_personal`, `acceso_auditoria`, vista `evento_timeline`) en
> doc 03 §3.6. **v2.1:** CU-17…19 y secuencias S7/S8 en doc 02 §2.8;
> entidades `dispositivo`/`medicion` y sus DDL en doc 03 §3.7. La
> trazabilidad no tiene huecos (RF-01…RF-31: caso de uso + entidad +
> pantalla).
