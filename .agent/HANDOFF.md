# Handoff — SaludApp

> ARCHIVO GENERADO. Si eres un modelo de IA que acaba de entrar:
> lee esto, corre `python3 .agent/agent_mem.py status` y NO edites
> nada en otra carpeta. La ruta canónica es la de abajo.

- Ruta canónica: `/data/data/com.termux/files/home/saludapp`
- Stack: `android-gradle` · app id: `com.zyvo.saludapp`
- Versión en código: code **3** · name **1.2.0** (`app/build.gradle`)
- Git: `61af435` en `main`
- Dueño actual: **glm-5.3-flash-free (zyvo)** desde 2026-10-26T21:36:04-04:00 · tarea: culminar pendientes: bump v1.1.0, build-info en CI, línea de build en Ajustes, APK v1.1.0

## Objetivo
App Android offline: citas médicas, historial clínico, diagnóstico/indicaciones y farmacia personal. v2 multi-rol (paciente/médico/enfermería) + timeline + wearables.

## AHORA (por aquí vamos)
instalar el APK v1.2.0(3) en el celular y probar el recorrido v2/v2.1

## Hecho (con evidencia)
- [x] skill agent-sync instalada: libreta .agent/ + verificador de APK + 37 tests en verde — `python3 ~/.config/zyvo/skills/agent-sync/agent-sync/tests/selftest.py` → exit 0 · commit `84bb5f8` · 2026-10-26 06:55
- [x] libreta multi-modelo operativa en el proyecto — commit `84bb5f8` · 2026-10-26 06:55
- [x] bump 1.1.0(2) + stamp + inyección BUILD_INFO en CI + línea de build en Ajustes (esquema v4.1) — `node --check app/src/main/assets/app.js && curl -s -o /dev/null http://127.0.0.1:8484/app/src/main/assets/app.js` → exit 0 · commit `84bb5f8` · 2026-10-26 21:39
- [x] APK v1.1.0(2) publicado (release apk-5) y registrado en la libreta; build-info.json verificado dentro del APK — `python3 .agent/agent_mem.py verify` → exit 0 · commit `7dab0f9` · 2026-10-28 06:06
- [x] v2 multi-rol + timeline + auditoria de accesos y v2.1 dispositivos/mediciones implementados en app.js (esquema v4.1); version 1.2.0 (code 3) — `node tools/smoke-test.js` → exit 0 · commit `7dab0f9` · 2026-10-28 06:26

## Siguiente (en orden, no inventar otros)
1. probar en el celular: usuario enfermeria -> abrir perfil (auditoria) -> revocar (acceso cortado)
2. probar mediciones: registrar pulso, ver tendencia y dedupe con dispositivo
3. decidir puente nativo para Health Connect / BLE (opcional, siguiente version)

## Decisiones ya tomadas (no re-litigar)
- ruta canónica = ~/saludapp; la copia en storage/shared/ZYVO/session-20261023-194853 queda como archivo histórico, NO se edita (2026-10-26)
- todo APK entregado debe llevar build-info.json y versionCode subido (2026-10-26)

## Artefactos
- `saludapp-v1.2.0-3.apk` · v1.2.0 (code 3) · commit `61af435` · sha `2814023abe` · 2026-10-28T06:36

## Avisos del verificador
- limpio

<!-- NOTAS-LIBRES -->
(zona libre: notas humanas, el script no la borra)

























