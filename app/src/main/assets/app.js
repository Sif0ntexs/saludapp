/* SaludApp — capa DB (esquema v4.1 de docs/03) + vistas v2/v2.1.
   Persistencia: localStorage. Sin red (RNF-04).
   v4   — usuarios con rol, vínculos de consentimiento, auditoría y timeline (RF-19…RF-26)
   v4.1 — dispositivos vestibles y mediciones (RF-27…RF-31) */
'use strict';

/* Ficha de build: placeholder; el CI reemplaza esta línea por el JSON real
   (agent_mem.py stamp) para que el APK diga qué código contiene. */
const BUILD_INFO=null;

/* ============ CONSTANTES DE DOMINIO ============ */
const ROLES = ['paciente', 'medico', 'enfermeria'];
const ACCIONES_AUDIT = ['lectura_perfil', 'vinculo_creado', 'consentimiento_revocado'];

/* Catálogo de tipos de medición (R8: referencia editable por lectura).
   ref:[min,max] — null cuando el tipo no tiene rango clínico de referencia. */
const TIPOS_MED = {
  fc:            { label: 'Frecuencia cardíaca', unidad: 'lpm',    ref: [60, 100],  dec: 0 },
  spo2:          { label: 'SpO2',                unidad: '%',      ref: [95, 100],  dec: 0 },
  pasos:         { label: 'Pasos',               unidad: 'pasos',  ref: [null, null], dec: 0 },
  sueno:         { label: 'Sueño',               unidad: 'h',      ref: [7, 9],     dec: 1 },
  glucosa:       { label: 'Glucosa',             unidad: 'mg/dL',  ref: [70, 140],  dec: 0 },
  p_sistolica:   { label: 'Presión sistólica',   unidad: 'mmHg',   ref: [90, 120],  dec: 0 },
  p_diastolica:  { label: 'Presión diastólica',  unidad: 'mmHg',   ref: [60, 80],   dec: 0 },
  temperatura:   { label: 'Temperatura',         unidad: '°C',     ref: [36, 37.5], dec: 1 },
  peso:          { label: 'Peso',                unidad: 'kg',     ref: [null, null], dec: 1 },
  calorias:      { label: 'Calorías',            unidad: 'kcal',   ref: [null, null], dec: 0 },
};
const TIPOS_DISP = ['reloj', 'anillo', 'banda', 'glucometro', 'tensiofonometro', 'bascula', 'manual'];
const CANALES = ['manual', 'health_connect', 'ble'];

const ahoraISO = () => new Date().toISOString();

/* ============ CAPA DB (v4.1) ============ */
const DB = {
  KEY: 'saludapp_v41',
  LEGACY: 'saludapp_v3',
  SCHEMA: '4.1',
  data: null,

  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { raw = null; }
    if (raw && raw.schema === this.SCHEMA) {
      this.data = raw;
    } else {
      this.data = this.migrar() || this.plantilla();
    }
    this.normalizar();
    if (!this.data.usuario.length) this.data.usuario.push(this.usuarioBase('Mi salud'));
    if (!this.data.especialidad.length) this.data.especialidad = this.especialidadesBase();
    if (!this.data.sesion || !this.usuario(this.data.sesion.usuario_id)) {
      this.data.sesion = { usuario_id: this.data.usuario[0].id };
    }
    this.save();
  },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  newId() { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); },

  usuarioBase(nombre, rol) {
    return {
      id: this.newId(), nombre: nombre || 'Mi salud', rol: rol || 'paciente',
      contacto: '', credencial: '', medico_id: null, creado_en: ahoraISO(),
    };
  },
  especialidadesBase() {
    return ['Medicina General', 'Cardiología', 'Pediatría', 'Odontología', 'Dermatología', 'Ginecología']
      .map(n => ({ id: this.newId(), nombre: n }));
  },
  plantilla() {
    return {
      schema: this.SCHEMA, sesion: {}, sesionPaciente: null,
      usuario: [], vinculo_personal: [], acceso_auditoria: [],
      dispositivo: [], medicion: [],
      especialidad: [], medico: [], cita: [], consulta: [], medicamento: [], toma: [],
    };
  },

  /* Migración v3 → v4.1 conservando los datos reales del usuario */
  migrar() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(this.LEGACY)); } catch (e) { old = null; }
    if (!old || !Array.isArray(old.cita)) return null;
    const base = this.plantilla();
    const pac = this.usuarioBase((old.perfil && old.perfil.nombre) || 'Mi salud', 'paciente');
    base.usuario = [pac];
    base.especialidad = old.especialidad || [];
    base.medico = old.medico || [];
    const owner = rec => Object.assign({}, rec, { paciente_id: pac.id });
    base.cita = (old.cita || []).map(owner);
    base.consulta = (old.consulta || []).map(owner);
    base.medicamento = (old.medicamento || []).map(m =>
      Object.assign({}, m, { paciente_id: pac.id, creado_en: m.creado_en || m.fecha_fin || ahoraISO() }));
    base.toma = old.toma || [];
    base.sesion = { usuario_id: pac.id };
    return base;
  },

  /* Deja el JSON en forma canónica (por si un respaldo viejo trae campos faltantes) */
  normalizar() {
    const p = this.plantilla();
    Object.keys(p).forEach(k => { if (this.data[k] === undefined) this.data[k] = p[k]; });
    ['usuario', 'vinculo_personal', 'acceso_auditoria', 'dispositivo', 'medicion',
      'especialidad', 'medico', 'cita', 'consulta', 'medicamento', 'toma']
      .forEach(k => { if (!Array.isArray(this.data[k])) this.data[k] = []; });
    const pac = this.data.usuario.find(u => u.rol === 'paciente');
    if (pac) {
      ['cita', 'consulta', 'medicamento'].forEach(t =>
        this.data[t].forEach(r => { if (!r.paciente_id) r.paciente_id = pac.id; }));
      this.data.medicamento.forEach(m => { if (!m.creado_en) m.creado_en = m.fecha_fin || ahoraISO(); });
    }
    this.data.usuario.forEach(u => {
      if (ROLES.indexOf(u.rol) < 0) u.rol = 'paciente';
      if (u.medico_id === undefined) u.medico_id = null;
      if (!u.creado_en) u.creado_en = ahoraISO();
    });
    this.data.dispositivo.forEach(d => { if (!d.estado) d.estado = 'Activo'; });
  },

  by(tbl, key) { return (this.data[tbl] || []).find(r => r.id === key) || null; },
  q(tbl, fn) { return (this.data[tbl] || []).filter(fn); },
  add(tbl, r) { this.data[tbl].push(r); this.save(); return r; },
  upd(tbl, id, patch) {
    const r = this.by(tbl, id); if (r) Object.assign(r, patch); this.save(); return r;
  },
  del(tbl, id) { this.data[tbl] = this.data[tbl].filter(r => r.id !== id); this.save(); },

  usuario(id) { return this.by('usuario', id); },
  yo() { return this.usuario(this.data.sesion && this.data.sesion.usuario_id); },
  rol() { const y = this.yo(); return y ? y.rol : 'paciente'; },
  esPaciente() { return this.rol() === 'paciente'; },
  puedeEscribir() { return this.esPaciente(); },

  /* Paciente cuyos datos se están viendo (propio o el elegido por el staff) */
  pacienteActual() {
    if (this.esPaciente()) { const y = this.yo(); return y ? y.id : null; }
    const id = this.data.sesionPaciente;
    return id && this.vinculoActivo(id, this.yo() && this.yo().id) ? id : null;
  },

  vinculoActivo(pacienteId, staffId) {
    return this.q('vinculo_personal', v =>
      v.paciente_id === pacienteId && v.staff_id === staffId && v.estado === 'Activo')[0] || null;
  },
  pacientesDeStaff(staffId) {
    return this.q('vinculo_personal', v => v.staff_id === staffId && v.estado === 'Activo')
      .map(v => this.usuario(v.paciente_id)).filter(Boolean);
  },
  /* R6: el paciente ve lo suyo; el staff solo con vínculo Activo (solo lectura) */
  puedeLeer(pacienteId) {
    const yo = this.yo();
    if (!yo) return false;
    if (yo.rol === 'paciente') return yo.id === pacienteId;
    return !!this.vinculoActivo(pacienteId, yo.id);
  },

  auditar(accion, vinculoId) {
    if (ACCIONES_AUDIT.indexOf(accion) < 0 || !vinculoId) return null;
    return this.add('acceso_auditoria', {
      id: this.newId(), fecha_hora: ahoraISO(), accion, vinculo_id: vinculoId,
    });
  },

  especNombre(id) { const e = this.by('especialidad', id); return e ? e.nombre : ''; },
  medicoNombre(id) { const m = this.by('medico', id); return m ? m.nombre : '—'; },
  medicoEspec(id) { const m = this.by('medico', id); return m ? this.especNombre(m.especialidad_id) : ''; },
};

/* RF-02: traslape de citas con el mismo médico en la franja */
function hayTraslape(medicoId, fechaHora, excluirId) {
  const t = new Date(fechaHora).getTime();
  if (isNaN(t)) return false;
  return DB.data.cita.some(c =>
    c.medico_id === medicoId && c.id !== excluirId && c.estado !== 'Cancelada' &&
    Math.abs(new Date(c.fecha_hora).getTime() - t) < 30 * 60 * 1000
  );
}

/* R4: medicamento activo */
function medActivo(m) { return !m.suspendido; }
function medStockBajo(m) { return medActivo(m) && m.stock <= 2; }

/* ============ HELPERS UI ============ */
const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtF = iso => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }); };
const fmtFH = iso => { const d = new Date(iso); return isNaN(d) ? '—' : fmtF(iso) + ' · ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); };
const fmtVal = (v, dec) => Number(v).toFixed(dec || 0);
function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días 🌞' : h < 19 ? 'Buenas tardes ☀️' : 'Buenas noches 🌙';
}
const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v20H6z"/><path d="M9 7h6M9 11h6"/></svg>',
  rx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16v4H4zM9 10v10M15 10v10"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 100 8 4 4 0 000-8zM4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px"><path d="M15 19l-7-7 7-7"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 2h12v20H6z"/><path d="M9 7h6M9 11h6"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h4l3-8 4 16 3-8h6"/></svg>',
  watch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6V2h6v4M9 18v4h6v-4M19 10h2v4h-2"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M17 11a3 3 0 100-6M18 21c0-2.6-1-5-2.6-6.6"/></svg>',
};
function emptyState(titulo, texto, btnTxt, btnFn) {
  return '<div class="empty">' + ICON.empty +
    '<div class="t1">' + esc(titulo) + '</div><div class="meta">' + esc(texto) + '</div>' +
    (btnTxt ? '<button class="btn ghost" style="width:auto;margin:14px auto 0;padding:0 20px;height:44px" onclick="' + btnFn + '">' + esc(btnTxt) + '</button>' : '') +
    '</div>';
}
const rolLabel = r => r === 'medico' ? 'Médico' : r === 'enfermeria' ? 'Enfermería' : 'Paciente';

/* ============ NAVEGACIÓN ============ */
let view = 'inicio';
let viewParam = null;
const TABS_PAC = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'citas', label: 'Citas', icon: 'cal' },
  { id: 'historial', label: 'Historial', icon: 'hist' },
  { id: 'farmacia', label: 'Farmacia', icon: 'rx' },
  { id: 'seguimiento', label: 'Seguir', icon: 'pulse' },
];
const TABS_STAFF = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'pacientes', label: 'Pacientes', icon: 'people' },
  { id: 'ajustes', label: 'Ajustes', icon: 'user' },
];
function tabs() { return DB.esPaciente() ? TABS_PAC : TABS_STAFF; }
function go(v, param) {
  view = v; viewParam = param || null; ventanaCerrada(); window.scrollTo(0, 0); render();
}
function ventanaCerrada() { document.querySelectorAll('.sheet,.sheet-bg').forEach(e => e.remove()); }
function navBar() {
  $nav.style.display = 'flex';
  $nav.innerHTML = tabs().map(t =>
    '<div class="' + (view === t.id ? 'on' : '') + '" onclick="go(\'' + t.id + '\')">' + ICON[t.icon] + t.label + '</div>'
  ).join('');
}
function render() {
  navBar();
  const mapa = {
    inicio: vInicio, citas: vCitas, historial: vHistorial, farmacia: vFarmacia,
    seguimiento: vSeguimiento, mediciones: vMediciones, dispositivos: vDispositivos,
    vinculos: vVinculos, accesos: vAccesos, pacientes: vPacientes, paciente: vPaciente,
    usuarios: vUsuarios, 'form-usuario': vFormUsuario, perfil: vPerfil,
    'form-cita': vFormCita, 'det-cita': vDetCita,
    'form-consulta': vFormConsulta, 'det-consulta': vDetConsulta,
    'form-med': vFormMed, 'form-modalidad': vFormMedicion, 'form-dispositivo': vFormDispositivo,
    ajustes: vAjustes,
  };
  const fn = mapa[view] || vInicio;
  $app.innerHTML = fn(viewParam);
}

/* ============ INICIO ============ */
function proximaCita(pacId) {
  const now = Date.now();
  return DB.q('cita', c => c.paciente_id === pacId && c.estado !== 'Cancelada' && c.estado !== 'Atendida' &&
      new Date(c.fecha_hora).getTime() >= now - 3600e3)
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))[0] || null;
}
function vInicio() {
  const yo = DB.yo();
  if (!DB.esPaciente()) return vInicioStaff();
  const pid = yo.id;
  const pc = proximaCita(pid);
  const nCitas = DB.q('cita', c => c.paciente_id === pid && ['Programada', 'Confirmada'].includes(c.estado)).length;
  const nCons = DB.q('consulta', c => c.paciente_id === pid).length;
  const nMed = DB.q('medicamento', m => m.paciente_id === pid && medActivo(m)).length;
  const ult = ultimaMedicion(pid, 'fc') || ultimaMedicion(pid, 'spo2');
  let estadoCita;
  if (pc) {
    estadoCita = '<div class="card hl" onclick="go(\'det-cita\',\'' + pc.id + '\')">' +
      '<div class="overline-lb" style="color:var(--acc-ink)">Próxima cita</div>' +
      '<div class="t1" style="margin-top:4px">' + esc(DB.medicoNombre(pc.medico_id)) + ' — ' + esc(DB.medicoEspec(pc.medico_id)) + '</div>' +
      '<div class="t2">' + esc(fmtFH(pc.fecha_hora)) + (pc.consultorio ? ' · ' + esc(pc.consultorio) : '') + '</div>' +
      '<div style="margin-top:8px"><span class="pill ok">' + esc(pc.estado) + '</span></div></div>';
  } else {
    estadoCita = '<div class="card"><div class="overline-lb">Próxima cita</div><div class="t2" style="margin-top:4px">Sin citas programadas</div></div>';
  }
  const tarjetaUlt = ult
    ? '<div class="card row" onclick="go(\'mediciones\')"><div class="ic">' + ICON.pulse + '</div>' +
      '<div class="grow"><div class="t1">' + esc(TIPOS_MED[ult.tipo].label) + ' ' + fmtVal(ult.valor, TIPOS_MED[ult.tipo].dec) + ' ' + esc(ult.unidad) + '</div>' +
      '<div class="t2">Última medición · ' + esc(fmtFH(ult.fecha_hora)) + '</div></div>' +
      (fueraDeRango(ult) ? '<span class="pill warn">fuera de rango</span>' : '') + '</div>'
    : '';
  return '<div style="padding:20px 16px 0"><div class="t2">' + esc(saludo()) + '</div>' +
    '<div class="t1" style="font-size:24px">' + esc(yo.nombre) + '</div>' +
    '<div class="t2">Sesión de paciente</div></div>' +
    estadoCita + tarjetaUlt +
    '<div class="statrow">' +
    '<div class="card"><div class="overline-lb">Citas</div><div class="big">' + nCitas + '</div><div class="meta">próximas</div></div>' +
    '<div class="card"><div class="overline-lb">Historial</div><div class="big">' + nCons + '</div><div class="meta">consultas</div></div>' +
    '<div class="card"><div class="overline-lb">Medicinas</div><div class="big">' + nMed + '</div><div class="meta">activas</div></div>' +
    '</div>' +
    '<h2 class="overline">Acciones rápidas</h2>' +
    '<div class="card row" onclick="go(\'form-cita\')"><div class="ic">' + ICON.cal + '</div><div class="grow"><div class="t1">Agendar cita</div><div class="t2">Nueva consulta médica</div></div></div>' +
    '<div class="card row" onclick="go(\'form-consulta\',\'nueva\')"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Registrar consulta</div><div class="t2">Diagnóstico e indicaciones</div></div></div>' +
    '<div class="card row" onclick="go(\'form-modalidad\')"><div class="ic">' + ICON.pulse + '</div><div class="grow"><div class="t1">Registrar medición</div><div class="t2">Pulso, presión, peso, glucosa…</div></div></div>' +
    '<h2 class="overline">Mi perfil</h2>' +
    '<div class="card row" onclick="go(\'seguimiento\')"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Mi timeline</div><div class="t2">Todos mis eventos de salud en orden</div></div></div>' +
    '<div class="card row" onclick="go(\'dispositivos\')"><div class="ic">' + ICON.watch + '</div><div class="grow"><div class="t1">Mis dispositivos</div><div class="t2">Reloj, banda, glucómetro, báscula</div></div></div>' +
    '<div class="card row" onclick="go(\'vinculos\')"><div class="ic">' + ICON.link + '</div><div class="grow"><div class="t1">Profesionales vinculados</div><div class="t2">Quién puede leer mi perfil</div></div></div>' +
    '<div class="card row" onclick="go(\'accesos\')"><div class="ic">' + ICON.shield + '</div><div class="grow"><div class="t1">Accesos a mi perfil</div><div class="t2">Auditoría de lecturas</div></div></div>' +
    '<div class="card row" onclick="go(\'ajustes\')"><div class="ic">' + ICON.user + '</div><div class="grow"><div class="t1">Ajustes y respaldo</div><div class="t2">Perfil, usuarios, exportar JSON</div></div></div>';
}
function vInicioStaff() {
  const yo = DB.yo();
  const pacientes = DB.pacientesDeStaff(yo.id);
  const misVinculos = DB.data.vinculo_personal.filter(v => v.staff_id === yo.id).map(v => v.id);
  const lecturas = DB.q('acceso_auditoria', a => a.accion === 'lectura_perfil' && misVinculos.indexOf(a.vinculo_id) >= 0).length;
  return '<div style="padding:20px 16px 0"><div class="t2">' + esc(saludo()) + '</div>' +
    '<div class="t1" style="font-size:24px">' + esc(yo.nombre) + '</div>' +
    '<div class="t2">' + rolLabel(yo.rol) + ' · sesión de solo lectura</div></div>' +
    '<div class="statrow">' +
    '<div class="card"><div class="overline-lb">Pacientes</div><div class="big">' + pacientes.length + '</div><div class="meta">con consentimiento</div></div>' +
    '<div class="card"><div class="overline-lb">Lecturas</div><div class="big">' + lecturas + '</div><div class="meta">auditadas</div></div>' +
    '</div>' +
    '<h2 class="overline">Mis pacientes</h2>' +
    (pacientes.length
      ? pacientes.map(p => '<div class="card row" onclick="abrirPaciente(\'' + p.id + '\')"><div class="ic">' + ICON.user + '</div>' +
          '<div class="grow"><div class="t1">' + esc(p.nombre) + '</div><div class="t2">Solo lectura · timeline y mediciones</div></div></div>').join('')
      : '<div class="card"><div class="t2">Ningún paciente te ha vinculado todavía. El consentimiento lo otorga el paciente desde su sesión.</div></div>') +
    '<h2 class="overline">Cuenta</h2>' +
    '<div class="card row" onclick="go(\'perfil\')"><div class="ic">' + ICON.user + '</div><div class="grow"><div class="t1">Mi perfil profesional</div><div class="t2">' + esc(yo.credencial ? 'Matrícula ' + yo.credencial : 'Sin matrícula registrada') + '</div></div></div>' +
    '<div class="card row" onclick="go(\'usuarios\')"><div class="ic">' + ICON.people + '</div><div class="grow"><div class="t1">Cambiar de usuario</div><div class="t2">Otra sesión en este dispositivo</div></div></div>';
}

/* ============ CITAS ============ */
let filtroCita = 'proximas';
function citasFiltradas() {
  const pid = DB.pacienteActual();
  const now = Date.now();
  return DB.q('cita', c => c.paciente_id === pid)
    .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))
    .filter(c => filtroCita === 'todas'
      ? true
      : filtroCita === 'proximas' ? (['Programada', 'Confirmada'].includes(c.estado) && new Date(c.fecha_hora).getTime() >= now - 3600e3)
      : (c.estado === 'Cancelada' || c.estado === 'Atendida' || new Date(c.fecha_hora).getTime() < now - 3600e3));
}
function vCitas() {
  if (!DB.puedeEscribir()) return emptyState('Vista solo para el paciente', 'Tu rol no registra citas.', 'Volver', 'go(\'inicio\')');
  const lista = citasFiltradas();
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Citas</div><div class="t2">' + lista.length + ' en esta vista</div></div>' +
    '<div class="chiprow">' + [['proximas', 'Próximas'], ['pasadas', 'Pasadas / otras'], ['todas', 'Todas']]
      .map(([k, l]) => '<span class="chip ' + (filtroCita === k ? 'on' : '') + '" onclick="filtroCita=\'' + k + '\';render()">' + l + '</span>').join('') +
    '</div>' +
    (lista.length ? lista.map(c =>
      '<div class="card row" onclick="go(\'det-cita\',\'' + c.id + '\')">' +
      '<div class="ic">' + ICON.user + '</div>' +
      '<div class="grow"><div class="t1">' + esc(DB.medicoNombre(c.medico_id)) + '</div>' +
      '<div class="t2">' + esc(DB.medicoEspec(c.medico_id)) + ' · ' + esc(fmtFH(c.fecha_hora)) + '</div></div>' +
      pillEstado(c.estado) + '</div>').join('')
      : emptyState('Sin citas aquí', 'Toca + para agendar tu primera consulta médica.', 'Agendar cita', 'go(\'form-cita\')')) +
    '<button class="fab" onclick="go(\'form-cita\')">+</button>';
}
function pillEstado(e) {
  const cls = e === 'Programada' || e === 'Confirmada' ? 'ok' : e === 'Cancelada' ? 'warn' : 'gray';
  return '<span class="pill ' + cls + '">' + esc(e) + '</span>';
}

/* ============ FORM CITA (RF-01, RF-14) ============ */
function vFormCita() {
  const medOptions = DB.data.medico.map(m =>
    '<option value="' + m.id + '">' + esc(m.nombre + ' — ' + DB.especNombre(m.especialidad_id)) + '</option>').join('');
  const espOptions = DB.data.especialidad.map(e => '<option value="' + e.id + '">' + esc(e.nombre) + '</option>').join('');
  return '<div class="backrow"><button onclick="go(\'citas\')">' + ICON.back + 'Citas</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Nueva cita</h2>' +
    '<div class="card"><div class="overline-lb">Médico</div>' +
    '<select class="f" id="f-med">' + medOptions + '</select>' +
    '<select class="f" id="f-esp">' + espOptions + '</select>' +
    '<input class="f" id="f-mednuevo" placeholder="…o escriba un médico nuevo (se guarda en el directorio)">' +
    '<div class="overline-lb" style="margin-top:8px">Fecha y hora</div>' +
    '<input class="f" type="datetime-local" id="f-fecha">' +
    '<input class="f" id="f-sitio" placeholder="Consultorio (opcional)">' +
    '<div class="err" id="f-err" style="display:none"></div>' +
    '</div>' +
    '<button class="cta" onclick="guardarCita()">Confirmar cita</button>';
}
function guardarCita(medicoIdFijo) {
  if (!DB.puedeEscribir()) return;
  const nombre = document.getElementById('f-mednuevo');
  const sel = document.getElementById('f-med');
  let medicoId = medicoIdFijo;
  if (!medicoId && nombre.value.trim()) {
    const m = DB.add('medico', { id: DB.newId(), nombre: nombre.value.trim(), especialidad_id: sel.value });
    medicoId = m.id;
  } else if (!medicoId && sel.value) medicoId = sel.value;
  if (!medicoId) { mostrarErr('Elige o escribe un médico.'); return; }
  const fechaHora = document.getElementById('f-fecha').value;
  if (!fechaHora) { mostrarErr('La fecha y hora son obligatorias.'); return; }
  if (hayTraslape(medicoId, fechaHora)) { mostrarErr('Ya hay una cita con ese médico a esa hora.'); return; }
  const c = DB.add('cita', {
    id: DB.newId(), paciente_id: DB.pacienteActual(), fecha_hora: new Date(fechaHora).toISOString(),
    estado: 'Programada', consultorio: document.getElementById('f-sitio').value.trim(), medico_id: medicoId,
  });
  go('det-cita', c.id);
}
function mostrarErr(m) { const e = document.getElementById('f-err'); e.style.display = ''; e.textContent = m; }

/* ============ DETALLE CITA (RF-03, RF-04, RF-05, R1) ============ */
function vDetCita(id) {
  const c = DB.by('cita', id);
  if (!c) return emptyState('Cita no encontrada', '', 'Volver', 'go(\'citas\')');
  const m = DB.by('medico', c.medico_id);
  const con = DB.q('consulta', x => x.cita_id === c.id)[0];
  const viva = ['Programada', 'Confirmada'].includes(c.estado);
  const fechaLocal = new Date(new Date(c.fecha_hora).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return '<div class="backrow"><button onclick="go(\'citas\')">' + ICON.back + 'Citas</button></div>' +
    '<div class="detail-head card hl" style="margin:8px 16px 0;border-radius:16px">' +
    '<div class="overline-lb" style="color:var(--acc-ink)">' + esc(c.estado) + '</div>' +
    '<div class="t1" style="font-size:20px;margin-top:4px">' + esc(DB.medicoNombre(c.medico_id)) + '</div>' +
    '<div class="t2">' + esc(m ? DB.especNombre(m.especialidad_id) : '') + '</div>' +
    '<div class="t2" style="margin-top:6px">' + esc(fmtFH(c.fecha_hora)) + (c.consultorio ? ' · ' + esc(c.consultorio) : '') + '</div></div>' +
    (viva ? '<h2 class="overline">Cambiar fecha / hora (re-agendar, RF-04)</h2>' +
      '<div class="card"><input class="f" type="datetime-local" id="dt-re" value="' + fechaLocal + '">' +
      '<button class="btn ghost" onclick="reAgendar(\'' + c.id + '\')">Guardar nueva fecha</button></div>' +
      '<h2 class="overline">Acciones</h2>' +
      (c.estado === 'Programada' ? '<div class="card row" onclick="cambiarEstado(\'' + c.id + '\',\'Confirmada\')"><div class="ic">' + ICON.check + '</div><div class="grow"><div class="t1">Confirmar cita</div><div class="t2">Ya la acordaste por teléfono</div></div></div>' : '') +
      '<div class="card row" onclick="atenderCita(\'' + c.id + '\')"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Marcar atendida</div><div class="t2">Crea la consulta en el historial</div></div></div>' +
      '<div class="card row" onclick="cambiarEstado(\'' + c.id + '\',\'Cancelada\')"><div class="ic">' + ICON.cal + '</div><div class="grow"><div class="t1">Cancelar cita</div><div class="t2">Quedará como historial "Cancelada"</div></div></div>'
      : '<h2 class="overline">Resultado</h2>' +
      (con ? '<div class="card row" onclick="go(\'det-consulta\',\'' + con.id + '\')"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Consulta registrada</div><div class="t2">' + esc(con.diagnostico ? con.diagnostico.slice(0, 40) : '') + '</div></div></div>'
        : '<div class="card"><div class="t2">Esta cita quedó sin consulta asociada.</div></div>'));
}
function cambiarEstado(id, est) {
  if (!DB.puedeEscribir()) return;
  if (est === 'Cancelada' && !confirm('¿Cancelar esta cita?')) return;
  DB.upd('cita', id, { estado: est }); render();
}
function reAgendar(id) {
  if (!DB.puedeEscribir()) return;
  const v = document.getElementById('dt-re').value;
  if (!v) { alert('Elige fecha y hora'); return; }
  const iso = new Date(v).toISOString();
  if (hayTraslape(DB.by('cita', id).medico_id, iso, id)) { alert('Ya hay una cita con ese médico a esa hora'); return; }
  DB.upd('cita', id, { fecha_hora: iso }); render();
}
function atenderCita(id) {
  if (!DB.puedeEscribir()) return;
  DB.upd('cita', id, { estado: 'Atendida' });
  go('form-consulta', 'cita:' + id);
}

/* ============ HISTORIAL (RF-06, RF-07, RF-08) ============ */
let filtroHistEsp = '';
let busqHist = '';
function vHistorial() {
  if (!DB.puedeEscribir()) return emptyState('Vista solo para el paciente', 'Tu rol no registra consultas.', 'Volver', 'go(\'inicio\')');
  const lista = histConsultaFiltradas();
  const espChips = '<div class="chiprow"><span class="chip ' + (filtroHistEsp === '' ? 'on' : '') + '" onclick="filtroHistEsp=\'\';render()">Todas</span>' +
    DB.data.especialidad.map(e => '<span class="chip ' + (filtroHistEsp === e.id ? 'on' : '') + '" onclick="filtroHistEsp=\'' + e.id + '\';render()">' + esc(e.nombre) + '</span>').join('') + '</div>';
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Historial médico</div><div class="t2" id="hist-count">' + DB.data.consulta.length + ' consultas</div></div>' +
    '<div class="card" style="margin-top:var(--gap)"><input class="f" id="q" style="margin:0" placeholder="Buscar: motivo, diagnóstico, indicación…" value="' + esc(busqHist) + '" oninput="busqHist=this.value;renderListado()"></div>' +
    espChips +
    '<div id="hist-list">' + histListado(lista) + '</div>' +
    '<button class="fab" onclick="go(\'form-consulta\',\'nueva\')">+</button>';
}
function histConsultaFiltradas() {
  const pid = DB.pacienteActual();
  return DB.q('consulta', c => c.paciente_id === pid)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .filter(c => (!filtroHistEsp || (DB.by('medico', c.medico_id) || {}).especialidad_id === filtroHistEsp))
    .filter(c => {
      if (!busqHist) return true;
      const q = busqHist.toLowerCase();
      return [c.motivo, c.diagnostico, c.indicaciones, c.observaciones].some(x => (x || '').toLowerCase().includes(q));
    });
}
function histListado(lista) {
  return lista.length
    ? lista.map(c =>
      '<div class="card row" onclick="go(\'det-consulta\',\'' + c.id + '\')">' +
      '<div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">' + esc(DB.medicoNombre(c.medico_id)) + '</div>' +
      '<div class="t2">' + esc(fmtF(c.fecha)) + ' · ' + esc(c.diagnostico || c.motivo).slice(0, 44) + '</div></div></div>').join('')
    : emptyState('Sin consultas en esta vista', 'Registra una consulta o quita los filtros.', 'Registrar consulta', 'go(\'form-consulta\',\'nueva\')');
}
function renderListado() {
  const el = document.getElementById('hist-list');
  if (!el) return;
  el.innerHTML = histListado(histConsultaFiltradas());
  const n = document.getElementById('hist-count');
  if (n) n.textContent = histConsultaFiltradas().length + ' consultas';
}

/* ============ FORM/DET CONSULTA (RF-06, RF-09) ============ */
function campoOpcionesDeCita(p) {
  if (p && p.startsWith('cita:')) {
    const ci = DB.by('cita', p.slice(5));
    if (ci) return { medico_id: ci.medico_id, fecha: new Date(ci.fecha_hora).toISOString().slice(0, 10) };
  }
  return {};
}
function vFormConsulta(p) {
  const pre = p && p.startsWith('cita:') ? campoOpcionesDeCita(p) : {};
  const medOptions = DB.data.medico.map(m => '<option value="' + m.id + '" ' + (pre.medico_id === m.id ? 'selected' : '') + '>' + esc(m.nombre + ' — ' + DB.especNombre(m.especialidad_id)) + '</option>').join('');
  const hoy = new Date().toISOString().slice(0, 10);
  return '<div class="backrow"><button onclick="go(\'historial\')">' + ICON.back + 'Historial</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Nueva consulta</h2>' +
    '<div class="card">' +
    '<div class="overline-lb">Médico atendió</div><select class="f" id="c-med">' + (medOptions || '<option value="">— crea médicos desde Citas —</option>') + '</select>' +
    '<div class="overline-lb">Fecha</div><input class="f" type="date" id="c-fecha" value="' + (pre.fecha || hoy) + '">' +
    '<div class="overline-lb">Motivo</div><input class="f" id="c-motivo" placeholder="p. ej. dolor lumbar, control anual">' +
    '<div class="overline-lb">Diagnóstico (obligatorio)</div><input class="f" id="c-dx" placeholder="diagnóstico del médico">' +
    '<div class="overline-lb">Indicaciones / tratamiento</div><textarea class="f" id="c-ind" rows="3" placeholder="medicamentos, reposo, dietas…"></textarea>' +
    '<div class="overline-lb">Observaciones</div><textarea class="f" id="c-obs" rows="2" placeholder="tension, peso, notas…"></textarea>' +
    '</div><div class="err" id="f-err" style="display:none"></div>' +
    '<button class="cta" onclick="guardarConsulta(' + (p && p.startsWith('cita:') ? ('\'' + p.slice(5) + '\'') : 'null') + ')">Guardar consulta</button>';
}
function guardarConsulta(citaId) {
  if (!DB.puedeEscribir()) return;
  const dx = document.getElementById('c-dx').value.trim();
  const motivo = document.getElementById('c-motivo').value.trim();
  const err = document.getElementById('f-err');
  err.style.display = 'none';
  if (!dx || !motivo) { err.style.display = ''; err.textContent = 'Motivo y diagnóstico son obligatorios.'; return; }
  const c = DB.add('consulta', {
    id: DB.newId(), paciente_id: DB.pacienteActual(),
    fecha: document.getElementById('c-fecha').value,
    motivo, diagnostico: dx,
    indicaciones: document.getElementById('c-ind').value.trim(),
    observaciones: document.getElementById('c-obs').value.trim(),
    medico_id: document.getElementById('c-med').value,
    cita_id: citaId,
  });
  if (citaId) DB.upd('cita', citaId, { estado: 'Atendida' });
  go('det-consulta', c.id);
}
function vDetConsulta(id) {
  const c = DB.by('consulta', id);
  if (!c) return emptyState('Consulta no encontrada', '', 'Volver', 'go(\'historial\')');
  const medsDerivados = DB.q('medicamento', m => m.consulta_id === id);
  const citaAsoc = c.cita_id ? DB.by('cita', c.cita_id) : null;
  return '<div class="backrow"><button onclick="go(\'historial\')">' + ICON.back + 'Historial</button></div>' +
    '<div class="card hl" style="margin:8px 16px 0">' +
    '<div class="t2">' + esc(fmtF(c.fecha)) + ' · ' + esc(DB.medicoNombre(c.medico_id)) + (citaAsoc ? ' · por cita — ' : '') + (citaAsoc ? pillEstado(citaAsoc.estado) : '') + '</div>' +
    '<div class="overline-lb" style="color:var(--acc-ink);margin-top:10px">Diagnóstico</div>' +
    '<div class="t1">' + esc(c.diagnostico) + '</div>' +
    (c.indicaciones ? '<div class="overline-lb" style="color:var(--acc-ink);margin-top:10px">Indicaciones</div><div>' + esc(c.indicaciones) + '</div>' : '') +
    (c.observaciones ? '<div class="overline-lb" style="margin-top:10px">Observaciones</div><div class="t2">' + esc(c.observaciones) + '</div>' : '') + '</div>' +
    '<h2 class="overline">Medicinas derivadas de esta consulta</h2>' +
    (medsDerivados.length ? medsDerivados.map(m =>
      '<div class="card row"><div class="ic">' + ICON.rx + '</div><div class="grow"><div class="t1">' + esc(m.nombre) + '</div><div class="t2">' + esc(m.dosis || '') + ' · stock ' + m.stock + '</div></div></div>').join('')
      : '<div class="card"><div class="t2">Ninguna todavía.</div></div>') +
    '<div class="card row" onclick="derivarMed(\'' + id + '\')"><div class="ic">' + ICON.plus + '</div><div class="grow"><div class="t1">Agregar medicamento a mi farmacia (RF-09)</div><div class="t2">Crea el recordatorio de toma</div></div></div>';
}
function derivarMed(consultaId) {
  if (!DB.puedeEscribir()) return;
  const nombre = prompt('Nombre del medicamento prescrito (RF-09):');
  if (!nombre || !nombre.trim()) return;
  const dosis = prompt('Dosis / frecuencia (p. ej. "1 tableta cada 12h"):', '') || '';
  DB.add('medicamento', {
    id: DB.newId(), paciente_id: DB.pacienteActual(), nombre: nombre.trim(), presentacion: '',
    dosis, frecuencia_horas: null, stock: 0, suspendido: 0, fecha_fin: '',
    consulta_id: consultaId, creado_en: ahoraISO(),
  });
  go('farmacia');
}

/* ============ FARMACIA (RF-10…13) ============ */
function vFarmacia() {
  if (!DB.puedeEscribir()) return emptyState('Vista solo para el paciente', 'Tu rol no gestiona la farmacia.', 'Volver', 'go(\'inicio\')');
  const pid = DB.pacienteActual();
  const meds = DB.q('medicamento', m => m.paciente_id === pid);
  const activos = meds.filter(medActivo);
  const suspendidos = meds.filter(m => !medActivo(m));
  const fmtMed = m =>
    '<div class="card row" onclick="go(\'form-med\',\'' + m.id + '\')"><div class="ic">' + ICON.rx + '</div>' +
    '<div class="grow"><div class="t1">' + esc(m.nombre) + (medStockBajo(m) ? ' <span class="pill warn">Stock bajo</span>' : '') + '</div>' +
    '<div class="t2">' + esc(m.dosis || 'Sin dosis definida') + ' · stock ' + m.stock + '</div></div>' +
    '<button class="btn" style="width:auto;margin:0;padding:0 16px;height:40px;font-size:13px" onclick="event.stopPropagation();tomar(\'' + m.id + '\')">Tomar</button></div>';
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Mi farmacia</div><div class="t2">' + activos.length + ' medicinas activas</div></div>' +
    '<h2 class="overline">Activas</h2>' +
    (activos.length ? activos.map(fmtMed).join('') : emptyState('Sin medicina activa', 'Agrega una o deriva una desde una consulta.', 'Agregar medicina', 'go(\'form-med\')')) +
    (suspendidos.length ? '<h2 class="overline">Suspendidas</h2>' + suspendidos.map(fmtMed).join('') : '') +
    '<button class="fab" onclick="go(\'form-med\')">+</button>';
}
function vFormMed(id) {
  if (!DB.puedeEscribir()) return emptyState('Solo lectura', '', 'Volver', 'go(\'inicio\')');
  const m = id ? DB.by('medicamento', id) : null;
  const tomas = m ? DB.q('toma', t => t.medicamento_id === id).slice(-5).reverse() : [];
  return '<div class="backrow"><button onclick="go(\'farmacia\')">' + ICON.back + 'Farmacia</button></div>' +
    '<h2 class="overline" style="margin-top:4px">' + (m ? 'Editar medicina' : 'Nueva medicina') + '</h2>' +
    '<div class="card">' +
    '<input class="f" id="m-nombre" placeholder="Nombre" value="' + (m ? esc(m.nombre) : '') + '">' +
    '<input class="f" id="m-present" placeholder="Presentación (tableta 50 mg…)" value="' + (m ? esc(m.presentacion || '') : '') + '">' +
    '<input class="f" id="m-dosis" placeholder="Dosis (1 tableta cada 12 h…)" value="' + (m ? esc(m.dosis || '') : '') + '">' +
    '<input class="f" type="number" id="m-stock" placeholder="Stock (cantidad disponible)" value="' + (m ? m.stock : '') + '">' +
    '<input class="f" type="date" id="m-fin" placeholder="Fin de tratamiento (opcional)" value="' + (m ? esc(m.fecha_fin || '') : '') + '">' +
    '<div class="err" id="f-err" style="display:none"></div>' +
    '</div>' +
    (m ? '<h2 class="overline">Tomas recientes</h2>' + (tomas.length
      ? tomas.map(t => '<div class="card row"><div class="ic">' + ICON.check + '</div><div class="grow"><div class="t1">' + esc(fmtFH(t.fecha_hora)) + '</div><div class="t2">' + (t.confirmada_manual ? 'marcada manual (sin stock)' : 'dosis tomada') + '</div></div></div>').join('')
      : '<div class="card"><div class="t2">Sin tomas registradas aún.</div></div>')
      + '<button class="btn ghost" style="margin-top:16px" onclick="suspenderMed(\'' + id + '\')">' + (m.suspendido ? 'Reactivar medicamento' : 'Marcar como suspendida (fin de tratamiento)') + '</button>'
      : '') +
    '<button class="cta" onclick="guardarMed(' + (m ? ('\'' + m.id + '\'') : 'null') + ')">Guardar medicina</button>';
}
function guardarMed(id) {
  if (!DB.puedeEscribir()) return;
  const err = document.getElementById('f-err');
  err.style.display = 'none';
  const nombre = document.getElementById('m-nombre').value.trim();
  if (!nombre) { err.style.display = ''; err.textContent = 'El nombre es obligatorio.'; return; }
  const stock = Math.max(0, parseInt(document.getElementById('m-stock').value, 10) || 0);
  if (id) DB.upd('medicamento', id, {
    nombre, presentacion: document.getElementById('m-present').value.trim(),
    dosis: document.getElementById('m-dosis').value.trim(), stock,
    fecha_fin: document.getElementById('m-fin').value,
  });
  else DB.add('medicamento', {
    id: DB.newId(), paciente_id: DB.pacienteActual(), nombre,
    presentacion: document.getElementById('m-present').value.trim(),
    dosis: document.getElementById('m-dosis').value.trim(), frecuencia_horas: null, stock,
    suspendido: 0, fecha_fin: document.getElementById('m-fin').value, consulta_id: null, creado_en: ahoraISO(),
  });
  go('farmacia');
}
function suspenderMed(id) {
  if (!DB.puedeEscribir()) return;
  const m = DB.by('medicamento', id);
  DB.upd('medicamento', id, { suspendido: m.suspendido ? 0 : 1 });
  render();
}
/* RF-11, R3: tomar una dosis */
function tomar(id) {
  if (!DB.puedeEscribir()) return;
  const m = DB.by('medicamento', id);
  if (!m) return;
  if (m.stock <= 0) {
    if (!confirm('Sin existencias (stock 0). ¿Registrar la toma como manual?')) return;
    DB.add('toma', { id: DB.newId(), fecha_hora: ahoraISO(), confirmada_manual: 1, medicamento_id: id });
  } else {
    DB.upd('medicamento', id, { stock: m.stock - 1 });
    DB.add('toma', { id: DB.newId(), fecha_hora: ahoraISO(), confirmada_manual: 0, medicamento_id: id });
  }
  render();
}

/* ============ SEGUIMIENTO: TIMELINE (RF-21, RF-22, RF-30) ============ */
let segTab = 'timeline';
let tlTipo = 'todo';
let tlDias = 0;   // 0 = todo
function vSeguimiento() {
  const pid = DB.pacienteActual();
  if (!pid) return emptyState('Sin acceso', 'No hay un paciente seleccionado.', 'Volver', 'go(\'inicio\')');
  const sub = '<div class="chiprow">' +
    [['timeline', 'Timeline'], ['mediciones', 'Mediciones'], ['dispositivos', 'Dispositivos']]
      .map(([k, l]) => '<span class="chip ' + (segTab === k ? 'on' : '') + '" onclick="segTab=\'' + k + '\';go(\'seguimiento\')">' + l + '</span>').join('') + '</div>';
  if (segTab === 'mediciones') return sub + vMediciones();
  if (segTab === 'dispositivos') return sub + vDispositivos();
  return sub + vTimeline(pid);
}
function eventosTimeline(pid) {
  const ev = [];
  DB.q('cita', c => c.paciente_id === pid).forEach(c => ev.push({
    id: c.id, tipo: 'cita', fecha: c.fecha_hora,
    titulo: 'Cita — ' + DB.medicoNombre(c.medico_id), detalle: c.estado, ref: c,
  }));
  DB.q('consulta', c => c.paciente_id === pid).forEach(c => ev.push({
    id: c.id, tipo: 'consulta', fecha: c.fecha,
    titulo: 'Consulta — ' + DB.medicoNombre(c.medico_id), detalle: c.diagnostico, ref: c,
  }));
  DB.q('medicamento', m => m.paciente_id === pid).forEach(m => ev.push({
    id: m.id, tipo: 'medicamento', fecha: m.creado_en || m.fecha_fin,
    titulo: 'Medicamento — ' + m.nombre, detalle: m.suspendido ? 'Suspendido' : 'Recetado', ref: m,
  }));
  DB.data.toma.forEach(t => {
    const m = DB.by('medicamento', t.medicamento_id);
    if (!m || m.paciente_id !== pid) return;
    ev.push({
      id: t.id, tipo: 'toma', fecha: t.fecha_hora,
      titulo: 'Toma — ' + m.nombre, detalle: t.confirmada_manual ? 'registrada a mano' : 'dosis tomada', ref: t,
    });
  });
  DB.q('medicion', s => s.paciente_id === pid).forEach(s => {
    const meta = TIPOS_MED[s.tipo] || { label: s.tipo, dec: 0 };
    const src = s.dispositivo_id ? (DB.by('dispositivo', s.dispositivo_id) || {}).nombre || 'dispositivo' : 'manual';
    ev.push({
      id: s.id, tipo: 'medicion', fecha: s.fecha_hora,
      titulo: meta.label + ': ' + fmtVal(s.valor, meta.dec) + ' ' + s.unidad,
      detalle: 'fuente: ' + src, ref: s,
    });
  });
  return ev.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}
const TIPO_ICON = { cita: 'cal', consulta: 'hist', medicamento: 'rx', toma: 'check', medicion: 'pulse' };
function vTimeline(pid) {
  const desde = tlDias ? Date.now() - tlDias * 864e5 : 0;
  const todos = eventosTimeline(pid);
  const lista = todos.filter(e =>
    (tlTipo === 'todo' || e.tipo === tlTipo) &&
    (!desde || new Date(e.fecha).getTime() >= desde));
  const chips = '<div class="chiprow">' +
    [['todo', 'Todo'], ['cita', 'Citas'], ['consulta', 'Consultas'], ['medicamento', 'Medicación'], ['toma', 'Tomas'], ['medicion', 'Mediciones']]
      .map(([k, l]) => '<span class="chip ' + (tlTipo === k ? 'on' : '') + '" onclick="tlTipo=\'' + k + '\';render()">' + l + '</span>').join('') +
    '</div>' +
    '<div class="chiprow" style="padding-top:0">' +
    [[7, '7 días'], [30, '30 días'], [0, 'Todo']]
      .map(([k, l]) => '<span class="chip ' + (tlDias === k ? 'on' : '') + '" onclick="tlDias=' + k + ';render()">' + l + '</span>').join('') +
    '</div>';
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Timeline</div>' +
    '<div class="t2">' + lista.length + ' eventos · más reciente primero</div></div>' + chips +
    (lista.length
      ? '<div class="tl">' + lista.map(e => {
        const alerta = e.tipo === 'medicion' && fueraDeRango(e.ref);
        const abrir = e.tipo === 'cita' ? 'go(\'det-cita\',\'' + e.id + '\')'
          : e.tipo === 'consulta' ? 'go(\'det-consulta\',\'' + e.id + '\')' : '';
        return '<div class="tl-item" ' + (abrir ? 'onclick="' + abrir + '"' : '') + '>' +
          '<div class="ic">' + ICON[TIPO_ICON[e.tipo]] + '</div>' +
          '<div class="grow"><div class="tl-t">' + esc(e.titulo) + (alerta ? ' <span class="pill warn">fuera de rango</span>' : '') + '</div>' +
          '<div class="t2">' + esc(fmtFH(e.fecha)) + ' · ' + esc(e.detalle || '') + '</div></div>' +
          '<span class="pill gray">' + esc(e.tipo) + '</span></div>';
      }).join('') + '</div>'
      : emptyState('Sin eventos en este filtro', 'Cambia el tipo o el rango de fechas.', 'Ver todo', 'tlTipo=\'todo\';tlDias=0;render()'));
}

/* ============ MEDICIONES (RF-28, RF-29, R8) ============ */
function refDe(tipo) {
  const t = TIPOS_MED[tipo] || {};
  return { min: t.ref ? t.ref[0] : null, max: t.ref ? t.ref[1] : null };
}
function fueraDeRango(m) {
  if (!m) return false;
  const min = m.referencia_min, max = m.referencia_max;
  if (min == null && max == null) return false;
  return (min != null && Number(m.valor) < Number(min)) || (max != null && Number(m.valor) > Number(max));
}
function medicionesDe(pid, tipo, dias) {
  const desde = dias ? Date.now() - dias * 864e5 : 0;
  return DB.q('medicion', m => m.paciente_id === pid && m.tipo === tipo &&
      (!desde || new Date(m.fecha_hora).getTime() >= desde))
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
}
function ultimaMedicion(pid, tipo) {
  const l = medicionesDe(pid, tipo, 0);
  return l[l.length - 1] || null;
}
function chartHtml(lista, tipo) {
  if (lista.length < 2) return '<div class="meta">Se necesitan al menos 2 lecturas para ver la tendencia.</div>';
  const meta = TIPOS_MED[tipo];
  const vals = lista.map(m => Number(m.valor));
  let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15; min -= pad; max += pad;
  const W = 300, H = 90;
  const t0 = new Date(lista[0].fecha_hora).getTime();
  const t1 = new Date(lista[lista.length - 1].fecha_hora).getTime() || t0 + 1;
  const pts = lista.map(m => {
    const t = new Date(m.fecha_hora).getTime();
    const x = t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * (W - 10) + 5;
    const y = H - 8 - ((Number(m.valor) - min) / (max - min)) * (H - 18);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tendencia de ' + esc(meta.label) + '">' +
    '<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' +
    pts.map(p => p[0] + ',' + p[1]).join(' ') + '"/>' +
    pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="var(--accent)"/>').join('') +
    '</svg>' +
    '<div class="chart-lb"><span>' + esc(fmtF(lista[0].fecha_hora)) + '</span><span>' + esc(fmtF(lista[lista.length - 1].fecha_hora)) + '</span></div>';
}
let medTipo = 'fc';
let medDias = 30;
function vMediciones() {
  const pid = DB.pacienteActual();
  if (!pid) return emptyState('Sin acceso', 'Elige un paciente.', 'Volver', 'go(\'inicio\')');
  const chips = '<div class="chiprow">' + Object.keys(TIPOS_MED).map(t =>
    '<span class="chip ' + (medTipo === t ? 'on' : '') + '" onclick="medTipo=\'' + t + '\';render()">' +
    esc(TIPOS_MED[t].label) + '</span>').join('') + '</div>' +
    '<div class="chiprow" style="padding-top:0">' + [[7, '7 días'], [30, '30 días'], [0, 'Todo']]
      .map(([k, l]) => '<span class="chip ' + (medDias === k ? 'on' : '') + '" onclick="medDias=' + k + ';render()">' + l + '</span>').join('') + '</div>';
  const meta = TIPOS_MED[medTipo];
  const lista = medicionesDe(pid, medTipo, medDias);
  const ult = lista[lista.length - 1];
  const ref = refDe(medTipo);
  const rangoTxt = ref.min == null && ref.max == null ? 'sin rango de referencia'
    : 'referencia ' + (ref.min == null ? '≤' : ref.min + '–') + (ref.max == null ? '' : ref.max) + ' ' + meta.unidad;
  const tarjeta = ult
    ? '<div class="card hl"><div class="overline-lb" style="color:var(--acc-ink)">Última lectura</div>' +
      '<div class="t1" style="font-size:30px;margin-top:2px">' + fmtVal(ult.valor, meta.dec) + ' <span style="font-size:15px;font-weight:600">' + esc(ult.unidad) + '</span>' +
      (fueraDeRango(ult) ? ' <span class="pill warn">fuera de rango</span>' : '') + '</div>' +
      '<div class="t2">' + esc(fmtFH(ult.fecha_hora)) + ' · ' + esc(ult.dispositivo_id ? ((DB.by('dispositivo', ult.dispositivo_id) || {}).nombre || 'dispositivo') : 'manual') + '</div>' +
      '<div class="meta" style="margin-top:4px">' + esc(rangoTxt) + ' · valor informativo, no es diagnóstico (R8)</div></div>'
    : '<div class="card"><div class="t2">Sin lecturas de ' + esc(meta.label.toLowerCase()) + ' en este rango.</div></div>';
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Mediciones</div>' +
    '<div class="t2">' + lista.length + ' lecturas · ' + esc(meta.label) + '</div></div>' + chips + tarjeta +
    '<h2 class="overline">Tendencia</h2>' +
    '<div class="card">' + chartHtml(lista, medTipo) + '</div>' +
    '<h2 class="overline">Historial</h2>' +
    (lista.length ? '<div class="tl">' + lista.slice().reverse().map(m =>
      '<div class="tl-item"><div class="ic">' + ICON.pulse + '</div><div class="grow">' +
      '<div class="tl-t">' + fmtVal(m.valor, meta.dec) + ' ' + esc(m.unidad) + (fueraDeRango(m) ? ' <span class="pill warn">fuera de rango</span>' : '') + '</div>' +
      '<div class="t2">' + esc(fmtFH(m.fecha_hora)) + ' · ' + esc(m.dispositivo_id ? ((DB.by('dispositivo', m.dispositivo_id) || {}).nombre || 'dispositivo') : 'manual') + '</div></div></div>').join('') + '</div>'
      : '') +
    (DB.esPaciente() ? '<button class="fab" onclick="go(\'form-modalidad\')">+</button>' : '');
}
/* RF-28: alta manual de una medición */
function vFormMedicion() {
  if (!DB.esPaciente()) return emptyState('Solo lectura', 'Tu rol no registra mediciones.', 'Volver', 'go(\'inicio\')');
  const pid = DB.pacienteActual();
  const disp = DB.q('dispositivo', d => d.paciente_id === pid && d.estado === 'Activo');
  const dispOpts = '<option value="">Manual (sin dispositivo)</option>' +
    disp.map(d => '<option value="' + d.id + '">' + esc(d.nombre) + ' — ' + esc(d.canal.replace('_', ' ')) + '</option>').join('');
  const ref = refDe(medTipo);
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return '<div class="backrow"><button onclick="go(\'seguimiento\')">' + ICON.back + 'Seguimiento</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Registrar medición</h2>' +
    '<div class="card">' +
    '<div class="overline-lb">Tipo</div><select class="f" id="s-tipo" onchange="cambiarTipoMedicion()">' +
    Object.keys(TIPOS_MED).map(t => '<option value="' + t + '" ' + (medTipo === t ? 'selected' : '') + '>' + esc(TIPOS_MED[t].label) + ' (' + esc(TIPOS_MED[t].unidad) + ')</option>').join('') +
    '</select>' +
    '<div class="overline-lb">Valor (<span id="s-unidad">' + esc(TIPOS_MED[medTipo].unidad) + '</span>)</div>' +
    '<input class="f" type="number" step="any" id="s-valor" placeholder="' + esc(TIPOS_MED[medTipo].label) + '">' +
    '<div class="overline-lb">Fecha y hora</div><input class="f" type="datetime-local" id="s-fecha" value="' + local + '">' +
    '<div class="overline-lb">Fuente</div><select class="f" id="s-disp">' + dispOpts + '</select>' +
    '<div class="overline-lb">Rango de referencia (opcional, R8)</div>' +
    '<div style="display:flex;gap:8px"><input class="f" type="number" step="any" id="s-refmin" placeholder="mín" value="' + (ref.min == null ? '' : ref.min) + '">' +
    '<input class="f" type="number" step="any" id="s-refmax" placeholder="máx" value="' + (ref.max == null ? '' : ref.max) + '"></div>' +
    '<div class="err" id="f-err" style="display:none"></div></div>' +
    '<button class="cta" onclick="guardarMedicion()">Guardar medición</button>';
}
/* Cambia unidad y referencias sin re-renderizar: no se pierde lo ya escrito */
function cambiarTipoMedicion() {
  const sel = document.getElementById('s-tipo');
  if (!sel) return;
  medTipo = sel.value;
  const meta = TIPOS_MED[medTipo] || TIPOS_MED.fc;
  const ref = refDe(medTipo);
  const u = document.getElementById('s-unidad'); if (u) u.textContent = meta.unidad;
  const v = document.getElementById('s-valor'); if (v) v.placeholder = meta.label;
  const rmin = document.getElementById('s-refmin'); if (rmin) rmin.value = ref.min == null ? '' : ref.min;
  const rmax = document.getElementById('s-refmax'); if (rmax) rmax.value = ref.max == null ? '' : ref.max;
}
function guardarMedicion() {
  if (!DB.esPaciente()) return;
  const err = document.getElementById('f-err');
  err.style.display = 'none';
  const tipo = document.getElementById('s-tipo').value;
  const valor = parseFloat(document.getElementById('s-valor').value);
  const fecha = document.getElementById('s-fecha').value;
  if (!TIPOS_MED[tipo]) { err.style.display = ''; err.textContent = 'Tipo inválido.'; return; }
  if (isNaN(valor) || valor <= 0) { err.style.display = ''; err.textContent = 'El valor debe ser un número mayor que 0.'; return; }
  if (!fecha) { err.style.display = ''; err.textContent = 'La fecha y hora son obligatorias.'; return; }
  const iso = new Date(fecha).toISOString();
  const dispId = document.getElementById('s-disp').value || null;
  const refMin = document.getElementById('s-refmin').value === '' ? null : parseFloat(document.getElementById('s-refmin').value);
  const refMax = document.getElementById('s-refmax').value === '' ? null : parseFloat(document.getElementById('s-refmax').value);
  const pid = DB.pacienteActual();
  /* RF-28: el mismo dispositivo no registra dos veces la misma lectura (sobrescribe) */
  if (dispId) {
    const dup = DB.q('medicion', m => m.dispositivo_id === dispId && m.tipo === tipo && m.fecha_hora === iso)[0];
    if (dup) {
      DB.upd('medicion', dup.id, { valor, unidad: TIPOS_MED[tipo].unidad, referencia_min: refMin, referencia_max: refMax });
      go('seguimiento'); return;
    }
  }
  DB.add('medicion', {
    id: DB.newId(), paciente_id: pid, dispositivo_id: dispId, tipo, valor,
    unidad: TIPOS_MED[tipo].unidad, fecha_hora: iso,
    referencia_min: refMin, referencia_max: refMax,
  });
  go('seguimiento');
}

/* ============ DISPOSITIVOS (RF-27, RF-31) ============ */
function vDispositivos() {
  if (!DB.esPaciente()) return emptyState('Solo lectura', 'Los dispositivos pertenecen al paciente.', 'Volver', 'go(\'inicio\')');
  const pid = DB.pacienteActual();
  const ds = DB.q('dispositivo', d => d.paciente_id === pid)
    .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'Activo' ? -1 : 1));
  const nMed = DB.q('medicion', m => m.paciente_id === pid).length;
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Mis dispositivos</div>' +
    '<div class="t2">' + ds.filter(d => d.estado === 'Activo').length + ' activos · ' + nMed + ' mediciones guardadas</div></div>' +
    '<div class="card row" onclick="sincronizarMediciones()"><div class="ic">' + ICON.watch + '</div>' +
    '<div class="grow"><div class="t1">Sincronizar ahora (RF-31)</div><div class="t2">Busca lecturas nuevas del canal activo · sin internet</div></div></div>' +
    (ds.length ? ds.map(d =>
      '<div class="card row"><div class="ic">' + ICON.watch + '</div><div class="grow">' +
      '<div class="t1">' + esc(d.nombre) + ' <span class="pill ' + (d.estado === 'Activo' ? 'ok' : 'gray') + '">' + esc(d.estado) + '</span></div>' +
      '<div class="t2">' + esc(d.tipo) + ' · ' + esc(d.canal.replace('_', ' ')) + ' · desde ' + esc(fmtF(d.vinculado_en)) + '</div></div>' +
      (d.estado === 'Activo' ? '<button class="btn ghost" style="width:auto;margin:0;padding:0 14px;height:38px;font-size:12px" onclick="retirarDispositivo(\'' + d.id + '\')">Retirar</button>' : '') +
      '</div>').join('')
      : emptyState('Sin dispositivos', 'Vincula un reloj, banda, glucómetro o báscula. Las lecturas también se pueden escribir a mano.', 'Agregar dispositivo', 'go(\'form-dispositivo\')')) +
    '<button class="fab" onclick="go(\'form-dispositivo\')">+</button>';
}
function vFormDispositivo() {
  if (!DB.esPaciente()) return emptyState('Solo lectura', '', 'Volver', 'go(\'inicio\')');
  return '<div class="backrow"><button onclick="go(\'dispositivos\')">' + ICON.back + 'Dispositivos</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Vincular dispositivo</h2>' +
    '<div class="card">' +
    '<input class="f" id="d-nombre" placeholder="Nombre (p. ej. Mi banda)">' +
    '<div class="overline-lb">Tipo</div><select class="f" id="d-tipo">' +
    TIPOS_DISP.map(t => '<option value="' + t + '">' + esc(t) + '</option>').join('') + '</select>' +
    '<div class="overline-lb">Canal de captura</div><select class="f" id="d-canal">' +
    [['manual', 'Manual (escribo los valores)'], ['health_connect', 'Health Connect (requiere puente nativo)'], ['ble', 'Bluetooth BLE (requiere puente nativo)']]
      .map(([k, l]) => '<option value="' + k + '">' + esc(l) + '</option>').join('') + '</select>' +
    '<div class="meta" style="margin-top:6px">El modelo de datos es el mismo para los tres canales; esta versión captura por entrada manual.</div>' +
    '<div class="err" id="f-err" style="display:none"></div></div>' +
    '<button class="cta" onclick="guardarDispositivo()">Vincular</button>';
}
function guardarDispositivo() {
  if (!DB.esPaciente()) return;
  const nombre = document.getElementById('d-nombre').value.trim();
  if (!nombre) { const e = document.getElementById('f-err'); e.style.display = ''; e.textContent = 'Ponle un nombre al dispositivo.'; return; }
  DB.add('dispositivo', {
    id: DB.newId(), paciente_id: DB.pacienteActual(), nombre,
    tipo: document.getElementById('d-tipo').value, canal: document.getElementById('d-canal').value,
    estado: 'Activo', vinculado_en: ahoraISO(),
  });
  go('dispositivos');
}
/* R7: retirar conserva las mediciones ya registradas */
function retirarDispositivo(id) {
  if (!DB.esPaciente()) return;
  if (!confirm('¿Retirar este dispositivo? Las mediciones ya guardadas se conservan.')) return;
  DB.upd('dispositivo', id, { estado: 'Retirado' });
  render();
}
/* RF-31: al abrir la app se busca lo nuevo del canal elegido.
   Sin puente nativo (o sin dato nuevo) no se registra nada. */
function sincronizarMediciones(silencioso) {
  const pid = DB.pacienteActual();
  const disp = DB.q('dispositivo', d => d.paciente_id === pid && d.estado === 'Activo');
  let nuevas = 0;
  const puente = (typeof window !== 'undefined') && window.SaludAppNative && typeof window.SaludAppNative.getMediciones === 'function';
  if (puente) {
    disp.filter(d => d.canal !== 'manual').forEach(d => {
      let lote = [];
      try { lote = window.SaludAppNative.getMediciones(d.canal, d.nombre) || []; } catch (e) { lote = []; }
      lote.forEach(x => {
        if (!TIPOS_MED[x.tipo] || !x.fecha_hora) return;
        const dup = DB.q('medicion', m => m.dispositivo_id === d.id && m.tipo === x.tipo && m.fecha_hora === x.fecha_hora)[0];
        if (dup) { DB.upd('medicion', dup.id, { valor: x.valor }); return; }
        DB.add('medicion', {
          id: DB.newId(), paciente_id: pid, dispositivo_id: d.id, tipo: x.tipo,
          valor: x.valor, unidad: TIPOS_MED[x.tipo].unidad, fecha_hora: x.fecha_hora,
          referencia_min: refDe(x.tipo).min, referencia_max: refDe(x.tipo).max,
        });
        nuevas++;
      });
    });
  }
  if (!silencioso) {
    alert(nuevas ? nuevas + ' lectura(s) nuevas' :
      (puente ? 'Sin lecturas nuevas del dispositivo.' : 'No hay puente nativo en esta versión: usa el ingreso manual (funciona sin internet).'));
  } else if (nuevas) render();
}

/* ============ VÍNCULOS Y AUDITORÍA (RF-23, RF-24, RF-25) ============ */
function vVinculos() {
  if (!DB.esPaciente()) return emptyState('Solo el paciente consiente', 'Los vínculos los crea y revoca el paciente.', 'Volver', 'go(\'inicio\')');
  const pid = DB.pacienteActual();
  const activos = DB.q('vinculo_personal', v => v.paciente_id === pid && v.estado === 'Activo');
  const staff = DB.q('usuario', u => u.rol !== 'paciente');
  const disponibles = staff.filter(s => !activos.some(v => v.staff_id === s.id));
  const opciones = disponibles.map(s => '<option value="' + s.id + '">' + esc(s.nombre + ' — ' + rolLabel(s.rol)) + '</option>').join('');
  return '<div class="backrow"><button onclick="go(\'inicio\')">' + ICON.back + 'Inicio</button></div>' +
    '<div style="padding:8px 16px 0"><div class="t1" style="font-size:22px">Profesionales vinculados</div>' +
    '<div class="t2">Solo quien tenga vínculo activo puede leer tu perfil, y sin editar nada.</div></div>' +
    '<h2 class="overline">Activos</h2>' +
    (activos.length ? activos.map(v => {
      const s = DB.usuario(v.staff_id) || { nombre: '—', rol: 'medico' };
      return '<div class="card row"><div class="ic">' + ICON.user + '</div><div class="grow">' +
        '<div class="t1">' + esc(s.nombre) + '</div><div class="t2">' + esc(rolLabel(s.rol)) + ' · desde ' + esc(fmtF(v.creado_en)) + '</div></div>' +
        '<button class="btn ghost" style="width:auto;margin:0;padding:0 14px;height:38px;font-size:12px" onclick="revocarVinculo(\'' + v.id + '\')">Revocar</button></div>';
    }).join('')
      : '<div class="card"><div class="t2">Nadie puede leer tu perfil todavía.</div></div>') +
    '<h2 class="overline">Dar consentimiento</h2>' +
    (opciones
      ? '<div class="card"><select class="f" id="v-staff">' + opciones + '</select>' +
        '<div class="meta">El profesional debe tener una cuenta creada en este dispositivo (Ajustes → Usuarios).</div>' +
        '<button class="btn ghost" onclick="vincularProfesional()">Vincular y permitir lectura</button></div>'
      : '<div class="card"><div class="t2">No hay cuentas de médico o enfermería disponibles.' +
        '</div><button class="btn ghost" onclick="go(\'form-usuario\',\'medico\')">Crear cuenta de profesional</button></div>') +
    '<h2 class="overline">Historial</h2>' +
    DB.q('vinculo_personal', v => v.paciente_id === pid && v.estado === 'Revocado').map(v => {
      const s = DB.usuario(v.staff_id) || { nombre: '—', rol: 'medico' };
      return '<div class="card row"><div class="ic">' + ICON.link + '</div><div class="grow">' +
        '<div class="t1">' + esc(s.nombre) + ' <span class="pill gray">Revocado</span></div>' +
        '<div class="t2">' + esc(fmtF(v.creado_en)) + ' → ' + esc(fmtF(v.revocado_en)) + '</div></div></div>';
    }).join('');
}
function vincularProfesional() {
  if (!DB.esPaciente()) return;
  const sel = document.getElementById('v-staff');
  if (!sel || !sel.value) return;
  const pid = DB.pacienteActual();
  const existente = DB.vinculoActivo(pid, sel.value);
  if (existente) { alert('Ya existe un vínculo activo con ese profesional.'); return; }
  const v = DB.add('vinculo_personal', {
    id: DB.newId(), paciente_id: pid, staff_id: sel.value,
    estado: 'Activo', creado_en: ahoraISO(), revocado_en: null,
  });
  DB.auditar('vinculo_creado', v.id);
  render();
}
function revocarVinculo(id) {
  if (!DB.esPaciente()) return;
  if (!confirm('¿Revocar el acceso? El historial de auditoría se conserva.')) return;
  DB.upd('vinculo_personal', id, { estado: 'Revocado', revocado_en: ahoraISO() });
  DB.auditar('consentimiento_revocado', id);
  render();
}
function vAccesos() {
  const pid = DB.pacienteActual();
  if (!pid) return emptyState('Sin acceso', '', 'Volver', 'go(\'inicio\')');
  const filas = DB.data.acceso_auditoria
    .map(a => ({ a, v: DB.by('vinculo_personal', a.vinculo_id) }))
    .filter(x => x.v && x.v.paciente_id === pid)
    .sort((x, y) => new Date(y.a.fecha_hora) - new Date(x.a.fecha_hora));
  const etiqueta = { lectura_perfil: 'Leyó tu perfil', vinculo_creado: 'Consentimiento otorgado', consentimiento_revocado: 'Consentimiento revocado' };
  return '<div class="backrow"><button onclick="go(\'inicio\')">' + ICON.back + 'Inicio</button></div>' +
    '<div style="padding:8px 16px 0"><div class="t1" style="font-size:22px">Accesos a mi perfil</div>' +
    '<div class="t2">' + filas.length + ' movimientos registrados</div></div>' +
    (filas.length ? filas.map(({ a, v }) => {
      const s = DB.usuario(v.staff_id) || { nombre: '—', rol: 'medico' };
      return '<div class="card row"><div class="ic">' + ICON.shield + '</div><div class="grow">' +
        '<div class="t1">' + esc(etiqueta[a.accion] || a.accion) + '</div>' +
        '<div class="t2">' + esc(s.nombre) + ' · ' + esc(fmtFH(a.fecha_hora)) + '</div></div></div>';
    }).join('')
      : emptyState('Sin accesos todavía', 'Cuando un profesional vinculado abra tu perfil, aparecerá aquí.', 'Volver', 'go(\'inicio\')'));
}

/* ============ USUARIOS Y PERFIL (RF-19, RF-20, RF-26) ============ */
function vUsuarios() {
  const yo = DB.yo();
  const lista = DB.data.usuario.slice().sort((a, b) => (a.rol === 'paciente' ? -1 : 1) - (b.rol === 'paciente' ? -1 : 1));
  return '<div class="backrow"><button onclick="go(\'inicio\')">' + ICON.back + 'Inicio</button></div>' +
    '<div style="padding:8px 16px 0"><div class="t1" style="font-size:22px">Usuarios</div>' +
    '<div class="t2">Sesión activa: ' + esc(yo.nombre) + ' · ' + esc(rolLabel(yo.rol)) + '</div></div>' +
    lista.map(u =>
      '<div class="card row"><div class="ic">' + ICON.user + '</div><div class="grow">' +
      '<div class="t1">' + esc(u.nombre) + (u.id === yo.id ? ' <span class="pill ok">activo</span>' : '') + '</div>' +
      '<div class="t2">' + esc(rolLabel(u.rol)) + (u.credencial ? ' · matrícula ' + esc(u.credencial) : '') + '</div></div>' +
      (u.id === yo.id ? '' : '<button class="btn ghost" style="width:auto;margin:0;padding:0 14px;height:38px;font-size:12px" onclick="cambiarSesion(\'' + u.id + '\')">Entrar</button>') +
      '</div>').join('') +
    '<button class="btn ghost" style="margin-top:16px" onclick="go(\'form-usuario\')">Crear usuario</button>' +
    '<div class="meta" style="margin:12px 16px">Los datos se guardan en el dispositivo y cada sesión ve solo lo suyo (RNF-04).</div>';
}
function cambiarSesion(id) {
  DB.data.sesion = { usuario_id: id };
  DB.data.sesionPaciente = null;
  filtroCita = 'proximas'; filtroHistEsp = ''; busqHist = '';
  tlTipo = 'todo'; tlDias = 0; segTab = 'timeline';
  DB.save();
  go('inicio');
}
function vFormUsuario(rolPre) {
  const rol = rolPre && ROLES.indexOf(rolPre) >= 0 ? rolPre : 'medico';
  const medOpts = DB.data.medico.length
    ? '<option value="">— sin vincular al directorio —</option>' +
      DB.data.medico.map(m => '<option value="' + m.id + '">' + esc(m.nombre + ' — ' + DB.especNombre(m.especialidad_id)) + '</option>').join('')
    : '<option value="">— directorio vacío —</option>';
  return '<div class="backrow"><button onclick="go(\'usuarios\')">' + ICON.back + 'Usuarios</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Nuevo usuario</h2>' +
    '<div class="card">' +
    '<input class="f" id="u-nombre" placeholder="Nombre completo">' +
    '<div class="overline-lb">Rol</div><select class="f" id="u-rol">' +
    ROLES.map(r => '<option value="' + r + '" ' + (rol === r ? 'selected' : '') + '>' + esc(rolLabel(r)) + '</option>').join('') + '</select>' +
    '<input class="f" id="u-contacto" placeholder="Contacto (teléfono o correo, opcional)">' +
    '<input class="f" id="u-credencial" placeholder="Matrícula / cédula (médico o enfermería)">' +
    '<div class="overline-lb">Directorio de médicos (opcional)</div><select class="f" id="u-medico">' + medOpts + '</select>' +
    '<div class="err" id="f-err" style="display:none"></div></div>' +
    '<button class="cta" onclick="guardarUsuario()">Crear usuario</button>';
}
function guardarUsuario() {
  const nombre = document.getElementById('u-nombre').value.trim();
  const err = document.getElementById('f-err');
  err.style.display = 'none';
  if (!nombre) { err.style.display = ''; err.textContent = 'El nombre es obligatorio.'; return; }
  const rol = document.getElementById('u-rol').value;
  const medicoId = document.getElementById('u-medico').value || null;
  if (medicoId && DB.data.usuario.some(u => u.medico_id === medicoId)) {
    err.style.display = ''; err.textContent = 'Ese registro del directorio ya tiene cuenta.'; return;
  }
  DB.add('usuario', {
    id: DB.newId(), nombre, rol,
    contacto: document.getElementById('u-contacto').value.trim(),
    credencial: document.getElementById('u-credencial').value.trim(),
    medico_id: rol === 'medico' ? medicoId : null,
    creado_en: ahoraISO(),
  });
  go('usuarios');
}
function vPerfil() {
  const yo = DB.yo();
  const esMed = yo.rol === 'medico';
  return '<div class="backrow"><button onclick="go(\'inicio\')">' + ICON.back + 'Inicio</button></div>' +
    '<div style="padding:8px 16px 0"><div class="t1" style="font-size:22px">Mi perfil</div>' +
    '<div class="t2">' + esc(rolLabel(yo.rol)) + ' · creado ' + esc(fmtF(yo.creado_en)) + '</div></div>' +
    '<div class="card">' +
    '<div class="overline-lb">Nombre</div><input class="f" id="p-nombre" value="' + esc(yo.nombre) + '">' +
    '<div class="overline-lb">Contacto</div><input class="f" id="p-contacto" value="' + esc(yo.contacto || '') + '">' +
    (yo.rol !== 'paciente'
      ? '<div class="overline-lb">Matrícula / cédula</div><input class="f" id="p-credencial" value="' + esc(yo.credencial || '') + '">'
      : '') +
    (esMed && yo.medico_id
      ? '<div class="overline-lb">Directorio</div><div class="t2" style="margin:4px 0 8px">' + esc(DB.medicoNombre(yo.medico_id)) + ' — ' + esc(DB.medicoEspec(yo.medico_id)) + '</div>'
      : '') +
    '</div>' +
    '<button class="cta" onclick="guardarPerfil()">Guardar cambios</button>';
}
function guardarPerfil() {
  const yo = DB.yo();
  const nombre = document.getElementById('p-nombre').value.trim();
  if (!nombre) { alert('El nombre no puede quedar vacío.'); return; }
  const patch = { nombre, contacto: document.getElementById('p-contacto').value.trim() };
  const cred = document.getElementById('p-credencial');
  if (cred) patch.credencial = cred.value.trim();
  DB.upd('usuario', yo.id, patch);
  go('inicio');
}

/* ============ STAFF: PACIENTES (RF-23, RF-24, RF-30) ============ */
function vPacientes() {
  if (DB.esPaciente()) return emptyState('Solo profesionales', '', 'Volver', 'go(\'inicio\')');
  const lista = DB.pacientesDeStaff(DB.yo().id);
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Mis pacientes</div>' +
    '<div class="t2">' + lista.length + ' con consentimiento activo · solo lectura</div></div>' +
    (lista.length ? lista.map(p =>
      '<div class="card row" onclick="abrirPaciente(\'' + p.id + '\')"><div class="ic">' + ICON.user + '</div>' +
      '<div class="grow"><div class="t1">' + esc(p.nombre) + '</div><div class="t2">' + esc(p.contacto || 'Sin contacto') + '</div></div></div>').join('')
      : emptyState('Ningún paciente vinculado', 'El paciente otorga el consentimiento desde su sesión.', 'Volver', 'go(\'inicio\')'));
}
/* Abrir perfil ajeno: verifica el vínculo, deja auditoría y entra en solo lectura */
function abrirPaciente(pid) {
  const yo = DB.yo();
  const v = DB.vinculoActivo(pid, yo.id);
  if (!v) { alert('Sin acceso: el paciente no te ha vinculado.'); return; }
  DB.auditar('lectura_perfil', v.id);
  DB.data.sesionPaciente = pid;
  DB.save();
  go('paciente', pid);
}
function vPaciente(pid) {
  const p = DB.usuario(pid);
  if (!p || !DB.puedeLeer(pid)) return emptyState('Sin acceso', 'No tienes un vínculo activo con este paciente.', 'Volver', 'go(\'pacientes\')');
  const evs = eventosTimeline(pid).slice(0, 40);
  const ult = Object.keys(TIPOS_MED).map(t => ({ t, m: ultimaMedicion(pid, t) })).filter(x => x.m);
  return '<div class="backrow"><button onclick="go(\'pacientes\')">' + ICON.back + 'Pacientes</button></div>' +
    '<div class="detail-head card hl" style="margin:8px 16px 0;border-radius:16px">' +
    '<div class="overline-lb" style="color:var(--acc-ink)">Solo lectura</div>' +
    '<div class="t1" style="font-size:20px;margin-top:4px">' + esc(p.nombre) + '</div>' +
    '<div class="t2">' + esc(p.contacto || 'Sin contacto') + '</div></div>' +
    '<h2 class="overline">Últimas mediciones</h2>' +
    (ult.length ? ult.map(({ t, m }) =>
      '<div class="card row"><div class="ic">' + ICON.pulse + '</div><div class="grow">' +
      '<div class="t1">' + esc(TIPOS_MED[t].label) + ' ' + fmtVal(m.valor, TIPOS_MED[t].dec) + ' ' + esc(m.unidad) + '</div>' +
      '<div class="t2">' + esc(fmtFH(m.fecha_hora)) + (t === 'glucosa' ? ' · fuente: ' + esc(m.dispositivo_id ? 'dispositivo' : 'manual') : '') + '</div></div>' +
      (fueraDeRango(m) ? '<span class="pill warn">fuera de rango</span>' : '') + '</div>').join('')
      : '<div class="card"><div class="t2">Sin mediciones registradas.</div></div>') +
    '<h2 class="overline">Timeline (últimos eventos)</h2>' +
    (evs.length ? '<div class="tl">' + evs.map(e =>
      '<div class="tl-item"><div class="ic">' + ICON[TIPO_ICON[e.tipo]] + '</div><div class="grow">' +
      '<div class="tl-t">' + esc(e.titulo) + '</div><div class="t2">' + esc(fmtFH(e.fecha)) + ' · ' + esc(e.detalle || '') + '</div></div></div>').join('') + '</div>'
      : '<div class="card"><div class="t2">Sin eventos.</div></div>');
}

/* Ficha visible del build en pantalla: prueba de qué experiencia/code estás probando */
function buildInfoHtml() {
  const base = 'funciona 100% sin internet. Documentación técnica: requisitos, UML y base de datos en docs/ del proyecto.';
  if (BUILD_INFO) {
    return 'SaludApp v' + BUILD_INFO.versionName + ' · build ' + BUILD_INFO.commitShort +
      ' · ' + String(BUILD_INFO.builtAt).slice(0, 16).replace('T', ' ') +
      ' · esquema de datos v4.1 · ' + base;
  }
  return 'SaludApp v1.2.0 · esquema de datos v4.1 · ' + base;
}

/* ============ AJUSTES / RESPALDO (RF-18) ============ */
function vAjustes() {
  const yo = DB.yo();
  return '<div class="backrow"><button onclick="go(\'inicio\')">' + ICON.back + 'Inicio</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Cuenta</h2>' +
    '<div class="card row" onclick="go(\'perfil\')"><div class="ic">' + ICON.user + '</div><div class="grow">' +
    '<div class="t1">Mi perfil</div><div class="t2">' + esc(yo.nombre) + ' · ' + esc(rolLabel(yo.rol)) + '</div></div></div>' +
    '<div class="card row" onclick="go(\'usuarios\')"><div class="ic">' + ICON.people + '</div><div class="grow">' +
    '<div class="t1">Usuarios y sesiones</div><div class="t2">' + DB.data.usuario.length + ' cuentas en este dispositivo</div></div></div>' +
    (DB.esPaciente()
      ? '<div class="card row" onclick="go(\'vinculos\')"><div class="ic">' + ICON.link + '</div><div class="grow"><div class="t1">Profesionales vinculados</div><div class="t2">Consentimiento de lectura</div></div></div>' +
        '<div class="card row" onclick="go(\'accesos\')"><div class="ic">' + ICON.shield + '</div><div class="grow"><div class="t1">Accesos a mi perfil</div><div class="t2">Auditoría de lecturas</div></div></div>'
      : '') +
    '<h2 class="overline">Respaldo y datos</h2>' +
    '<div class="card row" onclick="respaldar()"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Descargar respaldo JSON</div><div class="t2">Citas, historial, farmacia, timeline y mediciones</div></div></div>' +
    '<div class="card"><div class="overline-lb">Acerca</div><div class="t2" style="margin-top:4px">' + buildInfoHtml() + '</div></div>';
}
function respaldar() {
  const blob = new Blob([JSON.stringify(DB.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'saludapp-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}

/* ============ ARRANQUE ============ */
DB.load();
render();
/* RF-31: sincronización al abrir la app (silenciosa si no hay puente nativo) */
if (typeof window !== 'undefined' && window.SaludAppNative) sincronizarMediciones(true);
