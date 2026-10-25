# SaludApp — Documentación de Ingeniería de Software

Sistema de gestión de consultas médicas (citas, historial clínico,
diagnóstico e indicaciones, y farmacia). Proyecto worked-example del skill
`software-docs`.

## Índice de documentos

| # | Documento | Contenido |
|---|-----------|-----------|
| 1 | [01-analisis-requerimientos.md](01-analisis-requerimientos.md) | Especificación de Requerimientos de Software (ERS): alcance, actores, RF/RNF, restricciones, criterios de aceptación |
| 2 | [02-casos-uso-y-uml.md](02-casos-uso-y-uml.md) | Modelo UML: casos de uso, secuencia, actividad, estados y clases (Mermaid + PlantUML) — §2.7 extensión v2 (CU-12…16, multi-rol) · §2.8 v2.1 (CU-17…19, vestibles) |
| 3 | [03-base-de-datos.md](03-base-de-datos.md) | Modelo E-R, modelo relacional (DDL SQLite), normalización 1FN→2FN→3FN-BCNF, diccionario, índices — §3.6 esquema v4 (usuario, vínculos, auditoría) · §3.7 v4.1 (dispositivo, medicion) |

## Decisiones técnicas clave

- **Plataforma:** Android nativo (WebView UI + HTML/CSS/JS), SPAs ligera.
- **Persistencia:** local en el dispositivo (SQLite-like vía `localStorage`
  en WebView) — sin servidor, el E-R/relacional define el esquema lógico que
  la app instancia.
- **Alcance:** paciente-autoatendido (agenda sus citas, registra/consulta su
  historial y su farmacia personal). El modelo soporta médicos y farmacia
  como actores secundarios para extensión posterior.
- **v2 (25-10-2026):** app multi-rol (`paciente`, `medico`, `enfermeria`)
  con perfiles propios; el perfil del paciente es una hoja clínica
  sustentada en un **timeline** cronológico, consultable en modo lectura
  por el personal vinculado, con consentimiento, auditoría y revocación.
  Definido ERS en doc 01 (§2, §3, §4-A, R6/R7), diseño UML en doc 02 §2.7
  y modelo de datos v4 en doc 03 §3.6. DDL v3+v4 verificado ejecutándolo
  en sqlite3 (tablas, vista `evento_timeline` y restricciones sin errores).
- **v2.1 (25-10-2026):** dispositivos vestibles conectados al perfil
  (reloj/anillo/banda/glucómetro…) con mediciones automáticas en tiempo
  real — 100 % offline: canales Health Connect (puente nativo), BLE
  (puente nativo) o ingreso manual; WebView solo no puede hablar
  Bluetooth. RF-27…31 + R8 (medición informativa, NUNCA diagnóstico
  automático); mediciones entran al timeline (`evento_timeline` v2.1) y
  a tendencias 7/30 días. ERS §4-B, UML §2.8, BD §3.7 — DDL v4.1 y
  upsert-dedup verificados en sqlite3.

## Trazabilidad

Cada requerimiento funcional tiene: caso de uso (doc 02) → entidad/tabla
asociada (doc 03) → pantalla de la app. Ver la tabla de trazabilidad al
final del doc 01.
