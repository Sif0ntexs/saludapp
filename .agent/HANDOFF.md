# Handoff — SaludApp

> ARCHIVO GENERADO. Si eres un modelo de IA que acaba de entrar:
> lee esto, corre `python3 .agent/agent_mem.py status` y NO edites
> nada en otra carpeta. La ruta canónica es la de abajo.

- Ruta canónica: `/data/data/com.termux/files/home/saludapp`
- Stack: `android-gradle` · app id: `com.zyvo.saludapp`
- Versión en código: code **2** · name **1.1.0** (`app/build.gradle`)
- Git: `84bb5f8` en `main` · ⚠️ CAMBIOS SIN COMMIT
- Dueño actual: **glm-5.3-flash-free (zyvo)** desde 2026-10-26T21:36:04-04:00 · tarea: culminar pendientes: bump v1.1.0, build-info en CI, línea de build en Ajustes, APK v1.1.0

## Objetivo
App Android offline: citas médicas, historial clínico, diagnóstico/indicaciones y farmacia personal. v2 multi-rol (paciente/médico/enfermería) + timeline + wearables.

## AHORA (por aquí vamos)
culminar pendientes: bump v1.1.0, build-info en CI, línea de build en Ajustes, APK v1.1.0

## Hecho (con evidencia)
- [x] skill agent-sync instalada: libreta .agent/ + verificador de APK + 37 tests en verde — `python3 ~/.config/zyvo/skills/agent-sync/agent-sync/tests/selftest.py` → exit 0 · commit `84bb5f8` · 2026-10-26 06:55
- [x] libreta multi-modelo operativa en el proyecto — commit `84bb5f8` · 2026-10-26 06:55
- [x] bump 1.1.0(2) + stamp/inyección BUILD_INFO en CI + línea de build en Ajustes (esquema v4.1) — `node --check app.js → OK · curl :8484 assets 200/200` → exit 1 · commit `84bb5f8` · 2026-10-26 21:39
- [x] bump 1.1.0(2) + stamp + inyección BUILD_INFO en CI + línea de build en Ajustes (esquema v4.1) — `node --check app/src/main/assets/app.js && curl -s -o /dev/null http://127.0.0.1:8484/app/src/main/assets/app.js` → exit 0 · commit `84bb5f8` · 2026-10-26 21:39

## Siguiente (en orden, no inventar otros)
1. bump a 1.1.0 (versionCode 2): la v1.0 ya incluye el rediseño pero el número no lo dice
2. añadir 'agent-mem stamp' al workflow antes de gradle assembleDebug y mostrar v+commit en Ajustes
3. reconstruir APK y registrarla con: agent-mem artifact <archivo>.apk
4. instalar en el celular y verificar en pantalla la línea de build
5. instalar APK v1.1.0 y confirmar línea de build en pantalla

## Decisiones ya tomadas (no re-litigar)
- ruta canónica = ~/saludapp; la copia en storage/shared/ZYVO/session-20261023-194853 queda como archivo histórico, NO se edita (2026-10-26)
- todo APK entregado debe llevar build-info.json y versionCode subido (2026-10-26)

## Artefactos
- (ningún APK registrado)

## Avisos del verificador
- **WARN** `DIRTY_TREE` — 4 archivo(s) sin commit: github/workflows/build.yml, app/build.gradle, app/src/main/assets/app.js, .gitignore
- **WARN** `NO_ARTIFACT` — proyecto de app sin APK registrado: no hay prueba de build.

<!-- NOTAS-LIBRES -->
(zona libre: notas humanas, el script no la borra)













