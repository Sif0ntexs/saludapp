# SaludApp — AGENTS.md

App Android **offline** (sin permiso INTERNET) para citas médicas, historial
clínico, farmacia personal, timeline del paciente, multi-rol y dispositivos
vestibles. WebView + un solo `app.js`; sin frameworks, sin backend.

## Ruta canónica
`/data/data/com.termux/files/home/saludapp` (única carpeta de trabajo).
La copia en `storage/shared/ZYVO/...` es archivo histórico — NO se edita.

## Estructura
- `app/src/main/assets/app.js` — todo: capa DB (esquema **v4.1**), vistas y lógica.
- `app/src/main/assets/index.html` — shell + sistema de diseño (OKLCH/WCAG, modo noche).
- `app/src/main/java/com/zyvo/saludapp/MainActivity.java` — WebView (42 líneas).
- `docs/` — ERS 2.0, UML v2, modelo de datos v4.1 (fuente de verdad del diseño).
- `.agent/` — libreta entre modelos (`python3 .agent/agent_mem.py status`).
- `tools/smoke-test.js` — pruebas de la capa DB y de todas las vistas.

## Comandos
```bash
node --check app/src/main/assets/app.js   # sintaxis
node tools/smoke-test.js                  # 8 pruebas (DB v4.1, timeline, vínculos, mediciones)
gradle assembleDebug --no-daemon          # APK local
python3 .agent/agent_mem.py status        # dónde quedó el trabajo
```
CI: `.github/workflows/build.yml` — inyecta `build-info.json` en el APK y lo
publica como release al hacer push a `main`.

## Arquitectura de datos (v4.1)
Tablas: `usuario` (rol paciente/medico/enfermeria), `vinculo_personal`
(consentimiento; revocar conserva la fila), `acceso_auditoria`,
`dispositivo`, `medicion`, `especialidad`, `medico`, `cita`, `consulta`,
`medicamento`, `toma`. El timeline es **derivado** (`eventosTimeline()`),
no una tabla. Clave en localStorage: `saludapp_v41`; migra desde `saludapp_v3`
automáticamente al abrir.

## Reglas que no se negocian
- Datos solo en el dispositivo (RNF-04): jamás agregar permiso INTERNET.
- Paciente escribe; staff (médico/enfermería) **solo lee** y solo con vínculo Activo.
- Cada apertura de perfil por staff deja fila de auditoría (`lectura_perfil`).
- Medición = valor informativo, nunca diagnóstico (R8). Rango de referencia editable.
- Deduplicación de mediciones: (dispositivo, tipo, fecha_hora) → sobrescribe.

## Estado (28-10-2026)
v1.2.0 (code 3): v2 multi-rol + timeline + auditoría y v2.1 dispositivos/
mediciones implementados en código; captura por **entrada manual** (canal
Health Connect / BLE requiere puente nativo — `window.SaludAppNative.getMediciones`).
