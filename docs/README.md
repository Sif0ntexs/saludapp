# SaludApp — Documentación de Ingeniería de Software

Sistema de gestión de consultas médicas (citas, historial clínico,
diagnóstico e indicaciones, y farmacia). Proyecto worked-example del skill
`software-docs`.

## Índice de documentos

| # | Documento | Contenido |
|---|-----------|-----------|
| 1 | [01-analisis-requerimientos.md](01-analisis-requerimientos.md) | Especificación de Requerimientos de Software (ERS): alcance, actores, RF/RNF, restricciones, criterios de aceptación |
| 2 | [02-casos-uso-y-uml.md](02-casos-uso-y-uml.md) | Modelo UML: casos de uso, secuencia, actividad, estados y clases (Mermaid + PlantUML) |
| 3 | [03-base-de-datos.md](03-base-de-datos.md) | Modelo E-R, modelo relacional (DDL SQLite), normalización 1FN→2FN→3FN, diccionario de datos, índices |

## Decisiones técnicas clave

- **Plataforma:** Android nativo (WebView UI + HTML/CSS/JS), SPAs ligera.
- **Persistencia:** local en el dispositivo (SQLite-like vía `localStorage`
  en WebView) — sin servidor, el E-R/relacional define el esquema lógico que
  la app instancia.
- **Alcance:** paciente-autoatendido (agenda sus citas, registra/consulta su
  historial y su farmacia personal). El modelo soporta médicos y farmacia
  como actores secundarios para extensión posterior.

## Trazabilidad

Cada requerimiento funcional tiene: caso de uso (doc 02) → entidad/tabla
asociada (doc 03) → pantalla de la app. Ver la tabla de trazabilidad al
final del doc 01.
