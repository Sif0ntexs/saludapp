#!/usr/bin/env python3
"""
agent_mem.py — libreta compartida entre modelos de IA para UN proyecto.

El problema que resuelve: cuando cambias de modelo (o de sesión, o se acaba
el contexto), el modelo nuevo arranca en cero, en otra carpeta, y "termina"
el trabajo sobre una copia vieja del código. Resultado: la misma app de la
primera versión con otro nombre de archivo.

Esta herramienta vive DENTRO del proyecto (`.agent/`) y es la única fuente
de verdad. Todo se escribe en disco en cada paso, así que un modelo que se
corta a mitad de tarea deja igual un estado utilizable.

Comandos:
  brief                      Qué hay en todos los proyectos registrados (desde cualquier carpeta)
  init                       Crea .agent/ + registra el proyecto (una vez por proyecto)
  status                     Briefing del proyecto actual + verificación rápida
  claim --model M --task T   "Este modelo toma el control con esta tarea"
  log --done "..."           Registra un paso HECHO (con evidencia opcional)
  next --add "..."           Añade/saca pasos de la cola
  decide "..."               Registra una decisión para que nadie la re-litigue
  bump [--minor|--major]     Sube versionCode/versionName en el código fuente
  stamp --out FILE           Genera build-info.json (commit+versión) para el APK
  artifact FILE              Registra un APK/AAB con hash, versión y commit de origen
  verify [--strict]          Puertas duras: APK viejo, versión sin subir, copia duplicada
  handoff --next "..."       Cierre de turno: qué hice, dónde quedé, qué sigue
  doctor                     Copias duplicadas, APKs sueltos, repo sucio
  sync-memory                Actualiza el bloque del registro en AGENTS.md
  resolve NAME               Encuentra la ruta canónica de un proyecto (y sus copias)

Todo es stdlib. Funciona en Termux.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

SCHEMA = 1
AGENT_DIR = ".agent"
STATE_FILE = "STATE.json"
HANDOFF_FILE = "HANDOFF.md"
SCRIPT_COPY = "agent_mem.py"
FREE_NOTES = "<!-- NOTAS-LIBRES -->"
MEM_START = "<!-- ZYVO-AGENT-SYNC:START -->"
MEM_END = "<!-- ZYVO-AGENT-SYNC:END -->"
REGISTRY = Path.home() / ".config" / "zyvo" / "agent-projects.json"
AGENTS_MD = Path.home() / ".config" / "zyvo" / "AGENTS.md"

SKIP_DIRS = {
    ".git", ".agent", "node_modules", "build", "dist", ".gradle", ".idea",
    "__pycache__", ".venv", "venv", "Pods", ".dart_tool", ".expo", "target",
    "vendor", ".next", "coverage",
}
MARKERS = ("build.gradle", "build.gradle.kts", "package.json", "pubspec.yaml",
           "settings.gradle", "settings.gradle.kts")


# ─────────────────────────── utilidades base ───────────────────────────

def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def short(sha, n=7):
    return (sha or "")[:n]


def run(cmd, cwd=None, shell=None, timeout=180):
    """Acepta str (shell) o lista (exec directo, sin shell)."""
    if isinstance(cmd, (list, tuple)):
        shell = False
    elif shell is None:
        shell = True
    try:
        p = subprocess.run(cmd, cwd=cwd, shell=shell, capture_output=True,
                           text=True, timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as e:                                    # noqa: BLE001
        return 127, f"{type(e).__name__}: {e}"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:                                          # noqa: BLE001
        return default if default is not None else {}


def write_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(path) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def git(root, *args):
    code, out = run(["git", *args], cwd=root)
    return out.strip() if code == 0 else ""


def git_info(root):
    if not (Path(root) / ".git").exists():
        return {"is_repo": False, "head": None, "short": None, "branch": None,
                "dirty": False, "dirty_files": [], "commit_date": None,
                "ahead": 0}
    head = git(root, "rev-parse", "HEAD")
    dirty_files = [l for l in git(root, "status", "--porcelain").splitlines()
                   if l.strip() and AGENT_DIR + "/" not in l
                   and not l.strip().endswith(AGENT_DIR)]
    return {
        "is_repo": True,
        "head": head or None,
        "short": short(head) or None,
        "branch": git(root, "rev-parse", "--abbrev-ref", "HEAD") or None,
        "dirty": bool(dirty_files),
        "dirty_files": dirty_files[:80],
        "commit_date": git(root, "log", "-1", "--format=%cI") or None,
    }


def newest_mtime(root, skip_agent=True):
    newest, newest_file = 0.0, ""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if skip_agent:
            dirnames[:] = [d for d in dirnames if d != AGENT_DIR]
        for name in filenames:
            p = os.path.join(dirpath, name)
            try:
                m = os.path.getmtime(p)
            except OSError:
                continue
            if m > newest:
                newest, newest_file = m, os.path.relpath(p, root)
    return newest, newest_file


def human_ts(ts):
    try:
        return datetime.fromtimestamp(ts).strftime("%d-%m %H:%M")
    except Exception:                                          # noqa: BLE001
        return "?"


# ─────────────────────────── detección de stack ───────────────────────────

RE_VC = re.compile(r"versionCode\s*=?\s*(\d+)")
RE_VN = re.compile(r"versionName\s*=?\s*[\"']([^\"']+)[\"']")
RE_AID = re.compile(r"applicationId\s*=?\s*[\"']([^\"']+)[\"']")

GRADLE_CANDIDATES = ("app/build.gradle", "app/build.gradle.kts",
                     "build.gradle", "build.gradle.kts")


def _gradle_file(root):
    for rel in GRADLE_CANDIDATES:
        p = Path(root) / rel
        if p.exists():
            return p
    return None


def detect(root):
    root = Path(root)
    info = {
        "stack": "generic",
        "app_id": None,
        "version": {"code": None, "name": None, "source": None},
        "verify_cmds": [],
        "build_cmd": None,
        "lang": "web" if (root / "index.html").exists() else None,
    }

    # Android nativo (Gradle)
    g = _gradle_file(root)
    if g and (root / "app").exists():
        txt = g.read_text(errors="ignore")
        vc, vn, aid = RE_VC.search(txt), RE_VN.search(txt), RE_AID.search(txt)
        info.update(stack="android-gradle", app_id=aid.group(1) if aid else None)
        info["version"] = {
            "code": int(vc.group(1)) if vc else None,
            "name": vn.group(1) if vn else None,
            "source": str(g.relative_to(root)),
        }
        info["build_cmd"] = "gradle assembleDebug"
        assets = root / "app/src/main/assets"
        if assets.exists():
            for js in sorted(assets.glob("*.js")):
                info["verify_cmds"].append(
                    f"node --check {js.relative_to(root)}" if js.name != "build-info.json" else "")
        info["verify_cmds"] = [c for c in info["verify_cmds"] if c]
        if not info["verify_cmds"]:
            info["verify_cmds"] = [f"gradle -q tasks" ] if shutil.which("gradle") else []
        return info

    # Expo / React Native
    pkg = root / "package.json"
    if pkg.exists():
        data = read_json(pkg)
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        is_expo = "expo" in deps or (root / "app.json").exists()
        app = read_json(root / "app.json")
        android = (app.get("expo") or {}).get("android") or {}
        aid = android.get("package") or data.get("name")
        code = android.get("versionCode")
        name = (app.get("expo") or {}).get("version") or data.get("version")
        info.update(stack="expo" if is_expo else "node", app_id=aid)
        info["version"] = {"code": code, "name": name,
                           "source": "app.json" if app else "package.json"}
        info["build_cmd"] = ("eas build -p android --profile preview"
                             if is_expo else "npm run build")
        if (root / "index.html").exists():
            info["verify_cmds"].append("node --check app.js"
                                       if (root / "app.js").exists() else "")
        info["verify_cmds"] = [c for c in info["verify_cmds"] if c]
        return info

    # Flutter
    pub = root / "pubspec.yaml"
    if pub.exists():
        txt = pub.read_text(errors="ignore")
        m = re.search(r"^version:\s*(\d+(?:\.\d+)*)(?:\+(\d+))?", txt, re.M)
        info.update(stack="flutter", app_id=None)
        info["version"] = {
            "code": int(m.group(2)) if (m and m.group(2)) else None,
            "name": m.group(1) if m else None,
            "source": "pubspec.yaml",
        }
        info["build_cmd"] = "flutter build apk --debug"
        return info

    # WebView suelta (html/js)
    if (root / "index.html").exists():
        info["verify_cmds"] = [f"node --check {p.name}"
                               for p in root.glob("*.js")][:4]
        info["build_cmd"] = "python3 -m http.server 8484"
        return info

    return info


# ─────────────────────────── estado ───────────────────────────

def state_path(root):
    return Path(root) / AGENT_DIR / STATE_FILE


def load_state(root):
    st = read_json(state_path(root), None)
    return st or None


def default_state(root):
    root = Path(root).resolve()
    d = detect(root)
    return {
        "schema": SCHEMA,
        "name": root.name,
        "root": str(root),
        "app_id": d["app_id"],
        "stack": d["stack"],
        "created": now_iso(),
        "updated": now_iso(),
        "goal": "—",
        "owner": None,
        "now": "Sin empezar",
        "version": d["version"],
        "done": [],
        "next": [],
        "decisions": [],
        "artifacts": [],
        "verify_cmds": d["verify_cmds"],
        "build_cmd": d["build_cmd"],
        "history": [],
    }


def save_state(root, st):
    st["updated"] = now_iso()
    st["version"] = detect(root)["version"]
    write_json(state_path(root), st)
    render_handoff(root, st)


def hist(st, event, detail="", model=None):
    st.setdefault("history", []).append({
        "at": now_iso(), "event": event,
        "model": model or (st.get("owner") or {}).get("model"),
        "detail": detail,
    })
    st["history"] = st["history"][-400:]


def owner(st):
    o = st.get("owner") or {}
    return f"{o.get('model', '?')}" if o else "—"


# ─────────────────────────── render HANDOFF.md ───────────────────────────

def render_handoff(root, st):
    g = git_info(root)
    p = Path(root) / AGENT_DIR / HANDOFF_FILE
    free = ""
    if p.exists():
        txt = p.read_text(errors="ignore")
        if FREE_NOTES in txt:
            free = txt.split(FREE_NOTES, 1)[1].lstrip("\n")
    ver = st.get("version") or {}
    o = st.get("owner") or {}
    L = []
    L.append(f"# Handoff — {st.get('name')}")
    L.append("")
    L.append("> ARCHIVO GENERADO. Si eres un modelo de IA que acaba de entrar:")
    L.append("> lee esto, corre `python3 .agent/agent_mem.py status` y NO edites")
    L.append("> nada en otra carpeta. La ruta canónica es la de abajo.")
    L.append("")
    L.append(f"- Ruta canónica: `{st.get('root')}`")
    L.append(f"- Stack: `{st.get('stack')}` · app id: `{st.get('app_id')}`")
    L.append(f"- Versión en código: code **{ver.get('code')}** · name **{ver.get('name')}**"
             f" (`{ver.get('source')}`)")
    L.append(f"- Git: `{g.get('short')}` en `{g.get('branch')}`"
             + (" · ⚠️ CAMBIOS SIN COMMIT" if g.get("dirty") else ""))
    L.append(f"- Dueño actual: **{o.get('model', '—')}**"
             + (f" desde {o.get('since')}" if o else "")
             + (f" · tarea: {o.get('task')}" if o.get("task") else ""))
    L.append("")
    L.append("## Objetivo")
    L.append(st.get("goal") or "—")
    L.append("")
    L.append("## AHORA (por aquí vamos)")
    L.append(st.get("now") or "—")
    L.append("")
    L.append("## Hecho (con evidencia)")
    if st.get("done"):
        for d in st["done"][-40:]:
            ev = d.get("evidence") or {}
            bits = []
            if ev.get("cmd"):
                bits.append(f"`{ev['cmd']}` → exit {ev.get('exit')}")
            if d.get("commit"):
                bits.append(f"commit `{short(d['commit'])}`")
            bits.append(d.get("at", "")[:16].replace("T", " "))
            L.append(f"- [x] {d.get('text')} — " + " · ".join(b for b in bits if b))
    else:
        L.append("- (nada registrado todavía)")
    L.append("")
    L.append("## Siguiente (en orden, no inventar otros)")
    if st.get("next"):
        for i, n in enumerate(st["next"], 1):
            L.append(f"{i}. {n}")
    else:
        L.append("1. (vacío — el dueño debe definir el siguiente paso)")
    L.append("")
    L.append("## Decisiones ya tomadas (no re-litigar)")
    if st.get("decisions"):
        for d in st["decisions"][-25:]:
            L.append(f"- {d.get('text')} ({d.get('at', '')[:10]})")
    else:
        L.append("- (ninguna)")
    L.append("")
    L.append("## Artefactos")
    if st.get("artifacts"):
        for a in st["artifacts"][-8:]:
            L.append(f"- `{Path(a.get('path', '')).name}` · v{a.get('versionName')} "
                     f"(code {a.get('versionCode')}) · commit `{short(a.get('built_from'))}` "
                     f"· sha `{short(a.get('sha256'), 10)}` · {a.get('registered', '')[:16]}")
    else:
        L.append("- (ningún APK registrado)")
    L.append("")
    L.append("## Avisos del verificador")
    issues = verify(root, st, quiet=True, deep=False)
    if issues:
        for lvl, code, msg in issues:
            L.append(f"- **{lvl}** `{code}` — {msg}")
    else:
        L.append("- limpio")
    L.append("")
    L.append(FREE_NOTES)
    L.append(free if free else "(zona libre: notas humanas, el script no la borra)")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(L) + "\n", encoding="utf-8")


# ─────────────────────────── verificación ───────────────────────────

def find_copies(app_id, canonical, name_hint=None):
    """Busca otras carpetas del MISMO proyecto (mismo app id o mismo nombre)."""
    if not app_id and not name_hint:
        return []
    roots = []
    for r in [Path.home(),
              Path(os.environ.get("ZYVO_SESSION_DIR", "") or "/nonexistent"),
              Path("/storage/emulated/0/ZYVO"),
              Path("/storage/emulated/0/DCIM/ZYVO"),
              Path.home() / "storage" / "shared" / "ZYVO"]:
        try:
            if r.exists():
                roots.append(r.resolve())
        except OSError:
            pass
    seen, out = set(), []
    canonical = str(Path(canonical).resolve())
    budget = 24000
    for base in roots:
        if str(base) in seen:
            continue
        seen.add(str(base))
        if str(base).startswith("/storage") and budget <= 0:
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            budget -= 1
            if budget <= 0:
                break
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            if dirpath.count(os.sep) - str(base).count(os.sep) > 3:
                dirnames[:] = []
                continue
            has_marker = any(m in filenames for m in MARKERS) or \
                (Path(dirpath) / "app" / "build.gradle").exists() or \
                (Path(dirpath) / "app" / "build.gradle.kts").exists()
            if not has_marker:
                continue
            real = str(Path(dirpath).resolve())
            if real == canonical or real in seen:
                continue
            seen.add(real)
            d = detect(dirpath)
            same = bool(app_id) and d["app_id"] == app_id
            same_name = bool(name_hint) and Path(dirpath).name == name_hint
            if same or (same_name and d["app_id"]):
                mt, mf = newest_mtime(dirpath)
                out.append({"root": real, "mtime": mt, "newest_file": mf,
                            "app_id": d["app_id"], "match": "app_id" if same else "name"})
    return sorted(out, key=lambda x: x["mtime"], reverse=True)


def verify(root, st=None, quiet=False, deep=True):
    """Devuelve lista de (nivel, código, mensaje). nivel: FAIL | WARN | INFO.

    deep=False evita el escaneo de copias (se usa al renderizar HANDOFF.md,
    que ocurre en cada escritura).
    """
    st = st or load_state(root)
    if not st:
        return [("WARN", "NO_STATE", "no existe .agent/ — corre `init` primero")]
    issues = []
    g = git_info(root)
    src = detect(root)
    sv = src["version"].get("code")

    if g.get("dirty"):
        issues.append(("WARN", "DIRTY_TREE",
                       f"{len(g['dirty_files'])} archivo(s) sin commit: "
                       + ", ".join(x[3:] for x in g["dirty_files"][:5])))

    arts = sorted(st.get("artifacts") or [], key=lambda a: a.get("registered", ""))

    # 1) contenido distinto con la misma versión = builds indistinguibles
    #    (solo la última transición: el historial viejo no es accionable)
    for prev, cur in zip(arts[-2:-1], arts[-1:]):
        pv, cv = prev.get("versionCode"), cur.get("versionCode")
        if pv is not None and cv is not None and cv <= pv and \
                prev.get("sha256") != cur.get("sha256"):
            issues.append(("FAIL", "VERSION_NOT_BUMPED",
                           f"APK nuevo (sha {short(cur.get('sha256'), 8)}) con versionCode "
                           f"{cv}, igual/menor que el anterior ({pv}) — el usuario no puede "
                           f"distinguir builds. Corre `bump` y reconstruye."))

    if arts:
        last = arts[-1]
        # 2) el APK no corresponde al código actual
        if g.get("head") and last.get("built_from") and \
                not last["built_from"].startswith(g["head"][:7]):
            issues.append(("FAIL", "ARTIFACT_STALE",
                           f"el APK registrado se construyó desde commit "
                           f"`{short(last.get('built_from'))}` pero HEAD es "
                           f"`{g.get('short')}` — reconstruye antes de entregarlo."))
        # 3) el código cambió después del APK
        mt, mf = newest_mtime(root)
        reg = last.get("registered_ts") or 0
        if reg and mt > reg + 2:
            issues.append(("FAIL", "SRC_NEWER_THAN_ARTIFACT",
                           f"`{mf}` cambió después del último APK registrado — "
                           f"ese APK no contiene el cambio."))
        # 4) el APK no dice de qué commit viene
        if not last.get("built_from"):
            issues.append(("WARN", "NO_BUILD_STAMP",
                           "el APK no lleva build-info.json: no se puede probar qué "
                           "código contiene. Añade `stamp` al CI."))
        # 5) versión del APK != versión del código
        lv = last.get("versionCode")
        if sv is not None and lv is not None and lv != sv:
            issues.append(("WARN", "APK_VERSION_MISMATCH",
                           f"APK dice versionCode {lv}, el código dice {sv}."))
    elif src["stack"] in ("android-gradle", "expo", "flutter"):
        issues.append(("WARN", "NO_ARTIFACT",
                       "proyecto de app sin APK registrado: no hay prueba de build."))

    # 6) copias duplicadas más nuevas
    for c in (find_copies(st.get("app_id"), root, st.get("name"))[:4] if deep else []):
        own_mt, _ = newest_mtime(root)
        if c["mtime"] > own_mt + 2:
            issues.append(("FAIL", "STALE_CANONICAL",
                           f"hay una copia MÁS NUEVA en `{c['root']}` "
                           f"({human_ts(c['mtime'])}, archivo `{c['newest_file']}`). "
                           f"Estás editando la carpeta vieja."))

    if not (st.get("owner") or {}).get("model"):
        issues.append(("WARN", "NO_OWNER", "nadie hizo `claim` — ¿quién está trabajando aquí?"))

    if not quiet and st.get("verify_cmds"):
        for cmd in st["verify_cmds"]:
            code, out = run(cmd, cwd=root)
            if code != 0:
                issues.append(("FAIL", "VERIFY_CMD",
                               f"`{cmd}` falló (exit {code}): {out.strip()[:300]}"))
    return issues


def print_issues(issues, prefix="  "):
    for lvl, code, msg in issues:
        mark = {"FAIL": "✗", "WARN": "!", "INFO": "·"}.get(lvl, "?")
        print(f"{prefix}{mark} [{code}] {msg}")


# ─────────────────────────── comandos ───────────────────────────

def find_root(explicit=None):
    if explicit:
        return Path(explicit).resolve()
    cur = Path.cwd().resolve()
    for p in [cur, *cur.parents]:
        if (p / AGENT_DIR / STATE_FILE).exists():
            return p
        if (p / ".git").exists() and p != Path.home():
            return p
    # ¿estamos en una carpeta de sesión vacía? -> usar registro
    reg = read_json(REGISTRY).get("projects") or []
    if reg:
        try:
            reg_sorted = sorted(reg, key=lambda x: x.get("updated", ""), reverse=True)
            print(f"(no hay proyecto aquí; el más reciente del registro es "
                  f"{reg_sorted[0]['name']})", file=sys.stderr)
        except Exception:                                      # noqa: BLE001
            pass
    return cur


def ensure_state(root, name=None):
    st = load_state(root)
    if st:
        return st
    st = default_state(root)
    if name:
        st["name"] = name
    root.mkdir(parents=True, exist_ok=True)
    (root / AGENT_DIR).mkdir(exist_ok=True)
    src = Path(__file__).resolve()
    dst = root / AGENT_DIR / SCRIPT_COPY
    if src != dst:
        try:
            shutil.copy2(src, dst)
            os.chmod(dst, 0o755)
        except Exception:                                      # noqa: BLE001
            pass
    save_state(root, st)
    register(root, st)
    return st


def register(root, st):
    reg = read_json(REGISTRY, {"schema": SCHEMA, "projects": []})
    if "projects" not in reg:
        reg["projects"] = []
    entry = {
        "name": st.get("name"), "root": str(Path(root).resolve()),
        "app_id": st.get("app_id"), "stack": st.get("stack"),
        "updated": now_iso(), "now": st.get("now"),
        "owner": owner(st), "goal": st.get("goal"),
    }
    reg["projects"] = [p for p in reg["projects"]
                       if Path(p.get("root", "")).resolve() != Path(entry["root"])]
    reg["projects"].append(entry)
    reg["projects"] = reg["projects"][-40:]
    write_json(REGISTRY, reg)


def cmd_init(args):
    root = Path(args.path or Path.cwd()).resolve()
    if not root.exists():
        sys.exit(f"no existe: {root}")
    st = ensure_state(root, args.name)
    src = detect(root)
    st["app_id"] = st.get("app_id") or src["app_id"]
    st["stack"] = src["stack"]
    st["goal"] = args.goal or st.get("goal") or "—"
    st["build_cmd"] = st.get("build_cmd") or src["build_cmd"]
    st["verify_cmds"] = args.verify.split(";") if args.verify else src["verify_cmds"]
    hist(st, "init", f"detectado {src['stack']}")
    save_state(root, st)
    register(root, st)
    print(f"✓ {st['name']} registrado en {root}")
    print(f"  stack: {st['stack']} · app id: {st['app_id']} · versión: "
          f"{st['version']['name']} ({st['version']['code']})")
    print(f"  verificadores: {st['verify_cmds'] or '(ninguno)'}")
    print("  siguiente: `claim --model <modelo> --task \"...\"`")


def cmd_claim(args):
    root = find_root(args.path)
    st = ensure_state(root)
    prev = st.get("owner")
    st["owner"] = {"model": args.model, "session": os.environ.get("ZYVO_SESSION_DIR"),
                   "task": args.task, "since": now_iso()}
    if args.task:
        st["now"] = args.task
    if prev and prev.get("model") and prev["model"] != args.model:
        hist(st, "takeover", f"{prev['model']} → {args.model}")
    hist(st, "claim", args.task or "", args.model)
    save_state(root, st)
    register(root, st)
    print(f"✓ control tomado por {args.model}")
    print(f"  AHORA: {st['now']}")
    print(f"  ruta canónica: {st['root']}")


def _ev(cmd, root):
    if not cmd:
        return None
    code, out = run(cmd, cwd=root)
    return {"cmd": cmd, "exit": code, "digest": hashlib.sha256(out.encode()).hexdigest()[:16],
            "tail": out.strip()[-400:]}


def cmd_log(args):
    root = find_root(args.path)
    st = ensure_state(root)
    g = git_info(root)
    ev = _ev(args.evidence, root)
    item = {"at": now_iso(), "text": args.done, "evidence": ev,
            "commit": g.get("head"), "model": (st.get("owner") or {}).get("model")}
    st.setdefault("done", []).append(item)
    if args.now:
        st["now"] = args.now
    if args.next:
        st.setdefault("next", []).insert(0, args.next)
    hist(st, "log", args.done)
    save_state(root, st)
    print(f"✓ registrado: {args.done}")
    if ev:
        print(f"  evidencia `{ev['cmd']}` → exit {ev['exit']}")
        if ev["exit"] != 0:
            print("  ✗ la evidencia FALLÓ: no lo cuentes como hecho.")
    if args.next:
        print(f"  próximo: {args.next}")


def cmd_next(args):
    root = find_root(args.path)
    st = ensure_state(root)
    if args.clear:
        st["next"] = []
    if args.done_index:
        idx = sorted([i - 1 for i in args.done_index if 0 < i <= len(st["next"])],
                     reverse=True)
        for i in idx:
            st["next"].pop(i)
    if args.add:
        st["next"].extend(args.add)
    hist(st, "next", "; ".join(args.add or []))
    save_state(root, st)
    print("cola de siguientes:")
    for i, n in enumerate(st["next"], 1):
        print(f"  {i}. {n}")
    if not st["next"]:
        print("  (vacía)")


def cmd_decide(args):
    root = find_root(args.path)
    st = ensure_state(root)
    st.setdefault("decisions", []).append({"at": now_iso(), "text": args.text,
                                           "model": (st.get("owner") or {}).get("model")})
    hist(st, "decide", args.text)
    save_state(root, st)
    print(f"✓ decisión guardada: {args.text}")


def bump_source(root, kind="patch"):
    """Sube versionCode (+1) y versionName (patch) en el archivo fuente real."""
    d = detect(root)
    if d["stack"] == "android-gradle":
        p = Path(root) / d["version"]["source"]
        txt = p.read_text(errors="ignore")
        m = RE_VC.search(txt)
        if not m:
            return False, "no encontré versionCode"
        old_code = int(m.group(1))
        new_code = old_code + 1
        txt = txt[:m.start(1)] + str(new_code) + txt[m.end(1):]
        vm = RE_VN.search(txt)
        old_name = vm.group(1) if vm else "1.0"
        parts = [int(x) for x in re.findall(r"\d+", old_name)] or [old_code]
        while len(parts) < 3:
            parts.append(0)
        if kind == "major":
            parts = [parts[0] + 1, 0, 0]
        elif kind == "minor":
            parts = [parts[0], parts[1] + 1, 0]
        else:
            parts[2] += 1
        new_name = ".".join(str(x) for x in parts[:3])
        if vm:
            txt = txt[:vm.start(1)] + new_name + txt[vm.end(1):]
        p.write_text(txt, encoding="utf-8")
        return True, f"{old_name} ({old_code}) → {new_name} ({new_code}) en {d['version']['source']}"

    if d["stack"] == "expo":
        app_p = Path(root) / "app.json"
        if app_p.exists():
            data = read_json(app_p)
            expo = data.setdefault("expo", {})
            andr = expo.setdefault("android", {})
            old_code = andr.get("versionCode") or 1
            andr["versionCode"] = old_code + 1
            old_name = expo.get("version") or "1.0.0"
            parts = [int(x) for x in re.findall(r"\d+", old_name)] or [1, 0, 0]
            while len(parts) < 3:
                parts.append(0)
            parts[2] += 1
            expo["version"] = ".".join(str(x) for x in parts[:3])
            write_json(app_p, data)
            return True, (f"{old_name} ({old_code}) → {expo['version']} "
                          f"({andr['versionCode']}) en app.json")
        return False, "no encontré app.json"

    if d["stack"] == "flutter":
        p = Path(root) / "pubspec.yaml"
        txt = p.read_text(errors="ignore")
        m = re.search(r"^version:\s*(\d+(?:\.\d+)*)(?:\+(\d+))?", txt, re.M)
        if not m:
            return False, "no encontré version: en pubspec.yaml"
        name, code = m.group(1), int(m.group(2) or 1)
        parts = [int(x) for x in name.split(".")]
        while len(parts) < 3:
            parts.append(0)
        parts[2] += 1
        new = f"{'.'.join(str(x) for x in parts)}+{code + 1}"
        txt = txt[:m.start()] + f"version: {new}" + txt[m.end():]
        p.write_text(txt, encoding="utf-8")
        return True, f"{m.group(0)} → version: {new}"

    return False, f"stack no soportado para bump automático: {d['stack']}"


def cmd_bump(args):
    root = find_root(args.path)
    st = ensure_state(root)
    ok, msg = bump_source(root, args.kind)
    if ok:
        st["version"] = detect(root)["version"]
        hist(st, "bump", msg)
        save_state(root, st)
        print(f"✓ {msg}")
        print("  ahora: reconstruye el APK y registra con "
              "`artifact <archivo.apk>`")
    else:
        sys.exit(f"✗ {msg}")


def cmd_stamp(args):
    root = find_root(args.path)
    st = ensure_state(root)
    g = git_info(root)
    v = detect(root)["version"]
    out = Path(args.out) if args.out else (Path(root) / "build-info.json")
    if not out.is_absolute():
        out = Path(root) / out
    data = {
        "app": st.get("name"),
        "versionCode": v.get("code"),
        "versionName": v.get("name"),
        "commit": g.get("head"),
        "commitShort": g.get("short"),
        "branch": g.get("branch"),
        "dirty": g.get("dirty"),
        "builtAt": now_iso(),
        "builtBy": os.environ.get("AGENT_MODEL", args.model or "?"),
    }
    write_json(out, data)
    print(f"✓ stamp → {out}")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    if args.ci:
        print("\nEn el workflow, ANTES de gradle assembleDebug:")
        print("  - run: python3 .agent/agent_mem.py stamp --out "
              "app/src/main/assets/build-info.json")


def cmd_artifact(args):
    root = find_root(args.path)
    st = ensure_state(root)
    p = Path(args.file)
    if not p.is_absolute():
        p = Path(root) / p
    if not p.exists():
        sys.exit(f"no existe: {p}")
    info = {"kind": p.suffix.lstrip(".").lower() or "bin", "path": str(p),
            "sha256": sha256_file(p), "size": p.stat().st_size,
            "registered": now_iso(), "registered_ts": datetime.now().timestamp(),
            "versionCode": None, "versionName": None, "built_from": None}
    stamp = None
    if p.suffix.lower() in (".apk", ".aab", ".zip"):
        try:
            with zipfile.ZipFile(p) as z:
                names = z.namelist()
                for cand in ("assets/build-info.json", "build-info.json",
                             "META-INF/build-info.json", "assets/www/build-info.json"):
                    if cand in names:
                        stamp = json.loads(z.read(cand).decode("utf-8", "replace"))
                        info["stamp_path"] = cand
                        break
        except Exception:                                      # noqa: BLE001
            pass
    if stamp:
        info["versionCode"] = stamp.get("versionCode")
        info["versionName"] = stamp.get("versionName")
        info["built_from"] = stamp.get("commit") or stamp.get("git_commit")
        info["stamp"] = {k: stamp.get(k) for k in
                         ("commitShort", "branch", "dirty", "builtAt", "builtBy")}
    prev = (st.get("artifacts") or [None])[-1]
    st.setdefault("artifacts", []).append(info)
    st["version"] = detect(root)["version"]
    hist(st, "artifact", p.name)
    save_state(root, st)
    print(f"✓ {p.name} registrado")
    print(f"  sha256: {info['sha256'][:16]}… · {info['size'] / 1024:.0f} KB")
    print(f"  versión dentro del APK: {info['versionName']} (code {info['versionCode']})")
    print(f"  construido desde: {short(info['built_from']) or 'DESCONOCIDO (sin build-info.json)'}")
    warns = []
    if prev and prev.get("sha256") != info["sha256"]:
        if (info["versionCode"] is not None and prev.get("versionCode") is not None
                and info["versionCode"] <= prev["versionCode"]):
            warns.append("MISMA VERSIÓN que el APK anterior con contenido distinto "
                         "→ el usuario verá 'el mismo APK'. Sube la versión (bump).")
    g = git_info(root)
    if info["built_from"] and g.get("head") and \
            not g["head"].startswith(short(info["built_from"], 7)):
        warns.append(f"el APK viene de `{short(info['built_from'])}` pero HEAD es "
                     f"`{g.get('short')}` → APK VIEJO.")
    if not info["built_from"] and p.suffix.lower() == ".apk":
        warns.append("sin build-info.json: nada prueba qué código contiene este APK.")
    if st["version"]["code"] is not None and info["versionCode"] is not None and \
            st["version"]["code"] != info["versionCode"]:
        warns.append(f"el APK dice code {info['versionCode']} y el código dice "
                     f"{st['version']['code']}.")
    if warns:
        print("\n⚠️  AVISOS:")
        for w in warns:
            print(f"  - {w}")
    else:
        print("  ✓ versión y commit coinciden con el código actual")


def cmd_verify(args):
    root = find_root(args.path)
    st = load_state(root)
    if not st:
        sys.exit("no hay .agent/STATE.json — corre `init`")
    print(f"verificando {st['name']} en {root}")
    issues = verify(root, st)
    if not issues:
        print("✓ limpio: versión, APK y código coinciden")
        return
    print_issues(issues)
    fails = [i for i in issues if i[0] == "FAIL"]
    if not fails:
        print("✓ sin bloqueos (solo avisos arriba)")
    if fails and args.strict:
        sys.exit(1)


def cmd_status(args):
    root = find_root(args.path)
    st = load_state(root)
    if not st:
        print(f"no hay libreta en {root}.")
        print("crea una:  python3 .agent/agent_mem.py init   (o copia el script)")
        print("o mira lo que ya existe:  agent-mem brief")
        return
    g = git_info(root)
    v = detect(root)["version"]
    o = st.get("owner") or {}
    print("━" * 64)
    print(f" {st.get('name')}  ·  {st.get('stack')}  ·  {st.get('app_id')}")
    print(f" ruta canónica: {st.get('root')}")
    print(f" git: {g.get('short')} en {g.get('branch')}"
          + ("   ⚠️ SIN COMMIT" if g.get("dirty") else "   ✓ limpio")
          + f"   · versión: {v.get('name')} (code {v.get('code')})")
    print(f" dueño: {o.get('model', '—')}"
          + (f" desde {o.get('since', '')[:16].replace('T', ' ')}" if o else ""))
    print(f" AHORA: {st.get('now')}")
    print("━" * 64)
    if st.get("done"):
        print("hecho (últimos 5):")
        for d in st["done"][-5:]:
            ev = (d.get("evidence") or {})
            tag = ""
            if ev:
                tag = f" [evidencia exit {ev.get('exit')}]" if ev.get("exit") == 0 \
                    else f" [EVIDENCIA FALLÓ exit {ev.get('exit')}]"
            print(f"  ✓ {d.get('text')}{tag}")
    if st.get("next"):
        print("siguiente:")
        for i, n in enumerate(st["next"], 1):
            print(f"  {i}. {n}")
    if st.get("artifacts"):
        a = st["artifacts"][-1]
        print(f"último APK: {Path(a['path']).name} · code {a.get('versionCode')} · "
              f"commit {short(a.get('built_from')) or '?'}")
    issues = verify(root, st)
    print("verificador:")
    if issues:
        print_issues(issues)
    else:
        print("  ✓ todo coherente")


def cmd_handoff(args):
    root = find_root(args.path)
    st = ensure_state(root)
    if args.summary:
        st.setdefault("done", []).append({
            "at": now_iso(), "text": args.summary,
            "evidence": None, "commit": git_info(root).get("head"),
            "model": (st.get("owner") or {}).get("model")})
    if args.next:
        st["next"] = args.next + [n for n in st.get("next", []) if n not in args.next]
    if args.now:
        st["now"] = args.now
    if args.owner:
        st["owner"] = {"model": args.owner, "task": None, "since": now_iso()}
    hist(st, "handoff", (args.summary or "")[:120])
    save_state(root, st)
    register(root, st)
    issues = verify(root, st)
    print(f"✓ handoff escrito en {AGENT_DIR}/{HANDOFF_FILE}")
    print(f"  AHORA: {st['now']}")
    print(f"  siguiente: {st['next'][0] if st.get('next') else '(sin definir)'}")
    fails = [i for i in issues if i[0] == "FAIL"]
    if fails:
        print("\n⚠️  el siguiente modelo debe arreglar esto ANTES de seguir:")
        print_issues(fails)
    if args.bump and not fails:
        print("\nal puente: corre `bump` antes de reconstruir si cambiaste la app.")


def cmd_brief(args):
    reg = read_json(REGISTRY).get("projects") or []
    if not reg:
        print("no hay proyectos registrados.")
        print("instala la libreta en uno:  agent-mem init")
        return
    print(f"proyectos con libreta compartida ({len(reg)}):")
    for p in sorted(reg, key=lambda x: x.get("updated", ""), reverse=True):
        root = Path(p.get("root", ""))
        alive = (root / AGENT_DIR / STATE_FILE).exists()
        st = read_json(root / AGENT_DIR / STATE_FILE, {}) if alive else {}
        g = git_info(root) if alive else {}
        v = (st.get("version") or {})
        fail = 0
        if alive:
            fail = len([i for i in verify(root, st, quiet=True) if i[0] == "FAIL"])
        print(f"\n  ▸ {p.get('name')}  {'✓' if alive else '✗ falta'}  "
              f"v{v.get('name')} (code {v.get('code')})  "
              f"git {g.get('short') or '—'}"
              + (f"  ⚠️ {fail} problema(s)" if fail else "  ✓"))
        print(f"    {root}")
        if st.get("now"):
            print(f"    AHORA: {st['now']}")
        if st.get("next"):
            print(f"    SIGUIENTE: {st['next'][0]}")
    print("\npara trabajar en uno:  cd <ruta> && agent-mem status")


def cmd_doctor(args):
    root = find_root(args.path)
    st = load_state(root)
    print(f"revisando {root}")
    d = detect(root)
    print(f"  stack detectado: {d['stack']} · app id: {d['app_id']} · "
          f"versión {d['version']['name']} ({d['version']['code']})")
    g = git_info(root)
    print(f"  git: {g.get('short')} en {g.get('branch')} · "
          f"{'SUCIO (' + str(len(g.get('dirty_files', []))) + ')' if g.get('dirty') else 'limpio'}")
    if g.get("dirty_files"):
        for f in g["dirty_files"][:10]:
            print(f"    {f}")

    copies = find_copies(d["app_id"], root, st.get("name") if st else root.name)
    print(f"\n  copias del mismo proyecto: {len(copies)}")
    own_mt, _ = newest_mtime(root) if root.exists() else (0, "")
    print(f"    CANÓNICA  {root}  modificada {human_ts(own_mt)}")
    for c in copies[:8]:
        flag = "  ← MÁS NUEVA (estás en la vieja)" if c["mtime"] > own_mt + 2 else ""
        print(f"    copia     {c['root']}  {human_ts(c['mtime'])}"
              f"  ({c['newest_file']}){flag}")

    apks = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
        for n in filenames:
            if n.lower().endswith((".apk", ".aab", ".ipa")):
                apks.append(os.path.join(dirpath, n))
    print(f"\n  APK/AAB dentro del proyecto: {len(apks)}")
    reg = {a["sha256"] for a in (st or {}).get("artifacts", [])}
    for a in apks[:10]:
        try:
            s = sha256_file(a)
            print(f"    {os.path.relpath(a, root)}  "
                  f"{'registrado' if s in reg else 'SIN REGISTRAR'}")
        except OSError:
            pass
    if st:
        issues = verify(root, st)
        print("\n  verificador:")
        print_issues(issues, "    ") if issues else print("    ✓ limpio")


def cmd_resolve(args):
    reg = read_json(REGISTRY).get("projects") or []
    hit = [p for p in reg if args.name.lower() in (p.get("name") or "").lower()
           or args.name.lower() in (p.get("root") or "").lower()]
    if not hit:
        print(f"no hay proyecto registrado que coincida con '{args.name}'")
        print("registrados: " + ", ".join(p.get("name", "?") for p in reg) if reg else "")
        return
    best = hit[0]
    print(f"canónica: {best['root']}")
    copies = find_copies(best.get("app_id"), best["root"], best.get("name"))
    if copies:
        print("copias (NO trabajar en ellas):")
        for c in copies:
            print(f"  - {c['root']}")
    print(f"\ncd {best['root']} && agent-mem status")


def cmd_sync_memory(args):
    reg = read_json(REGISTRY).get("projects") or []
    lines = [MEM_START,
             "## 🧠 Proyectos con libreta multi-modelo (agent-sync)",
             "",
             "Desde cualquier carpeta: `agent-mem brief` (lista todos y dónde quedaron).",
             "Antes de trabajar en uno: `cd` a su ruta canónica + `agent-mem status`.",
             "Si la carpeta actual NO es la canónica, CAMBIAR a ella antes de editar.",
             ""]
    for p in sorted(reg, key=lambda x: x.get("updated", ""), reverse=True)[:10]:
        root = Path(p.get("root", ""))
        st = read_json(root / AGENT_DIR / STATE_FILE, {})
        v = st.get("version") or {}
        lines.append(f"- **{p.get('name')}** — `{p.get('root')}` · "
                     f"v{v.get('name')} (code {v.get('code')}) · "
                     f"dueño: {owner(st)}")
        if st.get("now"):
            lines.append(f"  AHORA: {st['now']}")
        if st.get("next"):
            lines.append(f"  SIGUIENTE: {st['next'][0]}")
    lines.append("")
    lines.append("Protocolo completo: skill `agent-sync`.")
    lines.append(MEM_END)
    block = "\n".join(lines)
    if not AGENTS_MD.exists():
        AGENTS_MD.parent.mkdir(parents=True, exist_ok=True)
        AGENTS_MD.write_text(block + "\n", encoding="utf-8")
        print(f"✓ AGENTS.md creado con el bloque ({len(reg)} proyectos)")
        return
    txt = AGENTS_MD.read_text(errors="ignore")
    if MEM_START in txt and MEM_END in txt:
        pre = txt.split(MEM_START)[0]
        post = txt.split(MEM_END, 1)[1]
        new = pre + block + post
    else:
        marker = "## Devices & Environment"
        new = txt.replace(marker, block + "\n\n" + marker, 1) if marker in txt \
            else txt.rstrip() + "\n\n" + block + "\n"
    if new != txt:
        AGENTS_MD.write_text(new, encoding="utf-8")
        print(f"✓ AGENTS.md actualizado ({len(reg)} proyectos en el bloque)")
    else:
        print("✓ AGENTS.md ya estaba al día")


# ─────────────────────────── CLI ───────────────────────────

def build_parser():
    ap = argparse.ArgumentParser(
        prog="agent-mem",
        description="Libreta compartida entre modelos de IA para un proyecto.")
    sub = ap.add_subparsers(dest="cmd")

    def add(name, fn, help_):
        p = sub.add_parser(name, help=help_)
        p.add_argument("--path", default=None, help="raíz del proyecto")
        p.set_defaults(func=fn)
        return p

    p = sub.add_parser("brief", help="qué hay en todos los proyectos")
    p.set_defaults(func=cmd_brief)

    p = add("init", cmd_init, "crear .agent/ y registrar el proyecto")
    p.add_argument("--name")
    p.add_argument("--goal")
    p.add_argument("--verify", help="comandos de verificación separados por ;")

    add("status", cmd_status, "briefing + verificación")
    p = add("claim", cmd_claim, "tomar el control")
    p.add_argument("--model", required=True)
    p.add_argument("--task")
    p = add("log", cmd_log, "registrar un paso hecho")
    p.add_argument("--done", required=True)
    p.add_argument("--evidence", help="comando cuya ejecución prueba el paso")
    p.add_argument("--now", help="actualizar el AHORA")
    p.add_argument("--next", help="encolar el siguiente paso")
    p = add("next", cmd_next, "gestionar la cola")
    p.add_argument("--add", action="append")
    p.add_argument("--done-index", type=int, action="append")
    p.add_argument("--clear", action="store_true")
    p = add("decide", cmd_decide, "guardar una decisión")
    p.add_argument("text")
    p = add("bump", cmd_bump, "subir versionCode/versionName")
    p.add_argument("--kind", choices=["patch", "minor", "major"], default="patch")
    p = add("stamp", cmd_stamp, "generar build-info.json")
    p.add_argument("--out")
    p.add_argument("--model")
    p.add_argument("--ci", action="store_true")
    p = add("artifact", cmd_artifact, "registrar un APK/AAB")
    p.add_argument("file")
    p = add("verify", cmd_verify, "puertas duras")
    p.add_argument("--strict", action="store_true")
    p = add("handoff", cmd_handoff, "cierre de turno")
    p.add_argument("--summary")
    p.add_argument("--next", action="append")
    p.add_argument("--now")
    p.add_argument("--owner")
    p.add_argument("--bump", action="store_true")
    add("doctor", cmd_doctor, "copias, APKs sueltos, repo sucio")
    p = sub.add_parser("resolve", help="encontrar la ruta canónica")
    p.add_argument("name")
    p.set_defaults(func=cmd_resolve)
    p = sub.add_parser("sync-memory", help="actualizar bloque en AGENTS.md")
    p.set_defaults(func=cmd_sync_memory)
    return ap


def main(argv=None):
    ap = build_parser()
    args = ap.parse_args(argv)
    if not getattr(args, "func", None):
        ap.print_help()
        print("\nempieza por:  agent-mem brief")
        return 0
    try:
        args.func(args)
    except KeyboardInterrupt:
        return 130
    except (OSError, ValueError, KeyError) as e:
        print(f"✗ {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
