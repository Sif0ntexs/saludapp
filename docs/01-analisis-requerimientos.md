# 1. Análisis y Especificación de Requerimientos de Software (ERS)

**Proyecto:** SaludApp — Sistema de gestión de citas médicas, historial
clínico, diagnóstico/indicaciones y farmacia.
**Versión:** 1.0 · **Fecha:** 23-10-2026 · **Estado:** Aprobado por el cliente
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
- Sincronización multi-dispositivo o multi-usuario en la nube.
- Pagos, facturación, seguros médicos.
- Notificaciones push del sistema (v2) — en v1 los recordatorios viven en
  la pantalla Farmacia/Historial.

## 3. Actores y descripciones

| Actor | Tipo | Descripción | Responsabilidades |
|---|---|---|---|
| **Paciente** | Principal | Único usuario que opera la app en su teléfono. Auto-gestiona sus citas y su historial. | Agenda/cancela citas, registra consultas y diagnósticos, mantiene su farmacia |
| **Médico** | Secundario (dato, no usuario) | Profesional al que se asocia una cita o consulta. En v1 es un registro administrado por el paciente. | — (se registra nombre, especialidad, consultorio) |
| **Farmacia / Medicamento** | Entidad administrada | Catálogo e inventario personal de medicamentos del paciente. | — |
| **Sistema** | Automático | Validaciones, estados de cita, cálculo de stock y recordatorios de toma. | Aplica reglas de negocio R1–R5 |

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
  teléfonto opcional). *Verif.:* alta desde formulario de cita con nombre
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

## 5. Requerimientos no funcionales

| ID | Categoría | Requerimiento | Métrica de verificación |
|---|---|---|---|
| RNF-01 | Usabilidad | Operaciones clave (agendar cita, registrar consulta, registrar toma) en ≤ 3 toques desde Inicio | Prueba de recorrido de task |
| RNF-02 | Rendimiento | Arranque de app y render de listas con ≥ 500 registros < 1 s en gama media | Medición con logs |
| RNF-03 | Disponibilidad | Funciona 100 % offline tras instalación | Modo avión: flujo completo operativo |
| RNF-04 | Seguridad | Datos solo en el dispositivo; sin permisos de red; sin envío de datos | Revisión de manifest (no INTERNET) |
| RNF-05 | Privacidad | El respaldo JSON (RF-18) es expedido por acción explícita del usuario | Flujo de respaldo |
| RNF-06 | Accesibilidad | Contrast texto ≥ 4.5:1, targets táctiles ≥ 48dp | Auditoría de estilo |
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

## 8. Criterios de aceptación (resumen de aceptación del milestone v1)

- Los 18 RF verificados según su criterio individual.
- Checklist de UI/UX del diseño (contraste, targets, estados, modo oscuro).
- Instalable desde APK firmado de debug en Android 8+.
- Los 3 diagramas de secuencia coinciden con el comportamiento real de la app.

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
