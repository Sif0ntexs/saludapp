/* SaludApp — capa DB (esquema v3 de docs/03) + vistas.
   Persistencia: localStorage. Sin red (RNF-04). */
'use strict';

/* Ficha de build: placeholder; el CI reemplaza esta línea por el JSON real
   (agent_mem.py stamp) para que el APK diga qué código contiene. */
const BUILD_INFO=null;

/* ============ CAPA DB ============ */
const DB = {
  KEY: 'saludapp_v3',
  SCHEMA: 3,
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { this.data = null; }
    if (!this.data || this.data.schema !== this.SCHEMA) this.seed();
  },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  seed() {
    const u = () =>
      'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    this.data = {
      schema: this.SCHEMA,
      perfil: { nombre: 'Mi salud' },
      especialidad: [
        { id: u(), nombre: 'Medicina General' },
        { id: u(), nombre: 'Cardiología' },
        { id: u(), nombre: 'Pediatría' },
        { id: u(), nombre: 'Odontología' },
        { id: u(), nombre: 'Dermatología' },
        { id: u(), nombre: 'Ginecología' },
      ],
      medico: [],
      cita: [],
      consulta: [],
      medicamento: [],
      toma: [],
    };
    this.save();
  },
  id() { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); },
  by(tbl, key) { return this.data[tbl].find(r => r.id === key) || null; },
  add(tbl, r) { this.data[tbl].push(r); this.save(); return r; },
  upd(tbl, id, patch) {
    const r = this.by(tbl, id); if (r) Object.assign(r, patch); this.save(); return r;
  },
  del(tbl, id) {
    this.data[tbl] = this.data[tbl].filter(r => r.id !== id); this.save();
  },
  especNombre(id) {
    const e = this.by('especialidad', id); return e ? e.nombre : '';
  },
  medicoNombre(id) { const m = this.by('medico', id); return m ? m.nombre : '—'; },
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
};
function emptyState(titulo, texto, btnTxt, btnFn) {
  return '<div class="empty">' + ICON.empty +
    '<div class="t1">' + esc(titulo) + '</div><div class="meta">' + esc(texto) + '</div>' +
    (btnTxt ? '<button class="btn ghost" style="width:auto;margin:14px auto 0;padding:0 20px;height:44px" onclick="' + btnFn + '">' + esc(btnTxt) + '</button>' : '') +
    '</div>';
}

/* ============ NAVEGACIÓN ============ */
let view = 'inicio';
const TABS = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'citas', label: 'Citas', icon: 'cal' },
  { id: 'historial', label: 'Historial', icon: 'hist' },
  { id: 'farmacia', label: 'Farmacia', icon: 'rx' },
];
function go(v, param) { view = v; viewParam = param || null; ventanaCerrada(); window.scrollTo(0, 0); render(); }
function ventanaCerrada() {
  document.querySelectorAll('.sheet,.sheet-bg').forEach(e => e.remove());
}
function navBar() {
  $nav.style.display = 'flex';
  $nav.innerHTML = TABS.map(t =>
    '<div class="' + (view === t.id ? 'on' : '') + '" onclick="go(\'' + t.id + '\')">' + ICON[t.icon] + t.label + '</div>'
  ).join('');
}
function render() {
  if (['form-cita', 'det-cita', 'form-consulta', 'det-consulta', 'form-med'].includes(view)) navBar();
  else navBar();
  $app.innerHTML = ({
    inicio: vInicio, citas: vCitas, historial: vHistorial, farmacia: vFarmacia,
    'form-cita': vFormCita, 'det-cita': vDetCita,
    'form-consulta': vFormConsulta, 'det-consulta': vDetConsulta,
    'form-med': vFormMed, 'ajustes': vAjustes,
  })[view](viewParam);
}

/* ============ VISTA: INICIO (RF-16) ============ */
let viewParam = null;
function proximaCita() {
  const now = Date.now();
  return DB.data.cita
    .filter(c => c.estado !== 'Cancelada' && c.estado !== 'Atendida' && new Date(c.fecha_hora).getTime() >= now - 3600e3)
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))[0] || null;
}
function vInicio() {
  const pc = proximaCita();
  const nCitas = DB.data.cita.filter(c => c.estado === 'Programada' || c.estado === 'Confirmada').length;
  const nCons = DB.data.consulta.length;
  const nMed = DB.data.medicamento.filter(medActivo).length;
  let estadoCita = '';
  if (pc) {
    estadoCita = '<div class="card hl" onclick="go(\'det-cita\',\'' + pc.id + '\')">' +
      '<div class="overline-lb" style="color:var(--acc-ink)">Próxima cita</div>' +
      '<div class="t1" style="margin-top:4px">' + esc(DB.medicoNombre(pc.medico_id)) + ' — ' + esc(DB.especNombre(DB.by('medico', pc.medico_id)?.especialidad_id)) + '</div>' +
      '<div class="t2">' + esc(fmtFH(pc.fecha_hora)) + (pc.consultorio ? ' · ' + esc(pc.consultorio) : '') + '</div>' +
      '<div style="margin-top:8px"><span class="pill ok">' + esc(pc.estado) + '</span></div></div>';
  } else {
    estadoCita = '<div class="card"><div class="overline-lb">Próxima cita</div><div class="t2" style="margin-top:4px">Sin citas programadas</div></div>';
  }
  return '<div style="padding:20px 16px 0"><div class="t2">' + saludo() + '</div><div class="t1" style="font-size:24px">SaludApp</div></div>' +
    estadoCita +
    '<div class="statrow">' +
    '<div class="card"><div class="overline-lb">Citas</div><div class="big">' + nCitas + '</div><div class="meta">próximas</div></div>' +
    '<div class="card"><div class="overline-lb">Historial</div><div class="big">' + nCons + '</div><div class="meta">consultas</div></div>' +
    '<div class="card"><div class="overline-lb">Medicinas</div><div class="big">' + nMed + '</div><div class="meta">activas</div></div>' +
    '</div>' +
    '<h2 class="overline">Acciones rápidas</h2>' +
    '<div class="card row" onclick="go(\'form-cita\')"><div class="ic">' + ICON.cal + '</div><div class="grow"><div class="t1">Agendar cita</div><div class="t2">Nueva consulta médica</div></div>' + ICON.plus.replace('<svg', '<svg style="width:20px;color:var(--text-2)"') + '</div>' +
    '<div class="card row" onclick="go(\'form-consulta\',\'nueva\')"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Registrar consulta</div><div class="t2">Diagnóstico e indicaciones</div></div>' + ICON.plus.replace('<svg', '<svg style="width:20px;color:var(--text-2)"') + '</div>' +
    '<div class="card row" onclick="go(\'ajustes\')"><div class="ic">' + ICON.user + '</div><div class="grow"><div class="t1">Respaldo y perfil</div><div class="t2">Exportar mis datos (JSON)</div></div></div>';
}

/* ============ VISTA: CITAS ============ */
let filtroCita = 'proximas';
function citasFiltradas() {
  const now = Date.now();
  return DB.data.cita.slice().sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))
    .filter(c => filtroCita === 'todas'
      ? true
      : filtroCita === 'proximas' ? (['Programada', 'Confirmada'].includes(c.estado) && new Date(c.fecha_hora).getTime() >= now - 3600e3)
      : (c.estado === 'Cancelada' || c.estado === 'Atendida' || new Date(c.fecha_hora).getTime() < now - 3600e3));
}
function vCitas() {
  const lista = citasFiltradas();
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Citas</div><div class="t2">' + lista.length + ' en esta vista</div></div>' +
    '<div class="chiprow">' + [['proximas', 'Próximas'], ['pasadas', 'Pasadas / otras'], ['todas', 'Todas']]
      .map(([k, l]) => '<span class="chip ' + (filtroCita === k ? 'on' : '') + '" onclick="filtroCita=\'' + k + '\';render()">' + l + '</span>').join('') +
    '</div>' +
    (lista.length ? lista.map(c => {
      const m = DB.by('medico', c.medico_id);
      return '<div class="card row" onclick="go(\'det-cita\',\'' + c.id + '\')">' +
        '<div class="ic">' + ICON.user + '</div>' +
        '<div class="grow"><div class="t1">' + esc(DB.medicoNombre(c.medico_id)) + '</div>' +
        '<div class="t2">' + esc(m ? DB.especNombre(m.especialidad_id) : '') + ' · ' + esc(fmtFH(c.fecha_hora)) + '</div></div>' +
        pillEstado(c.estado) + '</div>';
    }).join('')
      : emptyState('Sin citas aquí', 'Toca + para agendar tu primera consulta médica.', 'Agendar cita', 'go(\'form-cita\')'));
}
function pillEstado(e) {
  const cls = e === 'Programada' ? 'ok' : e === 'Confirmada' ? 'ok' : e === 'Cancelada' ? 'warn' : 'gray';
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
    '<select class="f" id="f-esp" onchange="render()">' + espOptions + '</select>' +
    '<input class="f" id="f-mednuevo" placeholder="…o escriba un médico nuevo (se guarda en el directorio)">' +
    '<div class="overline-lb" style="margin-top:8px">Fecha y hora</div>' +
    '<input class="f" type="datetime-local" id="f-fecha">' +
    '<input class="f" id="f-sitio" placeholder="Consultorio (opcional)">' +
    '<div class="err" id="f-err" style="display:none"></div>' +
    '</div>' +
    '<button class="cta" onclick="guardarCita()">Confirmar cita</button>';
}
function guardarCita(medicoIdFijo) {
  const nombre = document.getElementById('f-mednuevo');
  const sel = document.getElementById('f-med');
  let medicoId = medicoIdFijo;
  if (!medicoId && nombre.value.trim()) {
    const m = DB.add('medico', { id: DB.id(), nombre: nombre.value.trim(), especialidad_id: sel.value });
    medicoId = m.id;
  } else if (!medicoId && sel.value) medicoId = sel.value;
  if (!medicoId) { mostrarErr('Elige o escribe un médico.'); return; }
  const fechaHora = document.getElementById('f-fecha').value;
  if (!fechaHora) { mostrarErr('La fecha y hora son obligatorias.'); return; }
  if (hayTraslape(medicoId, fechaHora)) { mostrarErr('Ya hay una cita con ese médico a esa hora.'); return; }
  const c = DB.add('cita', { id: DB.id(), fecha_hora: new Date(fechaHora).toISOString(), estado: 'Programada', consultorio: document.getElementById('f-sitio').value.trim(), medico_id: medicoId });
  go('det-cita', c.id);
}
function mostrarErr(m) { const e = document.getElementById('f-err'); e.style.display = ''; e.textContent = m; }

/* ============ DETALLE CITA (RF-03, RF-04, RF-05, R1) ============ */
function vDetCita(id) {
  const c = DB.by('cita', id);
  if (!c) return emptyState('Cita no encontrada', '', 'Volver', 'go(\'citas\')');
  const m = DB.by('medico', c.medico_id);
  const con = DB.data.consulta.find(x => x.cita_id === c.id);
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
  if (est === 'Cancelada' && !confirm('¿Cancelar esta cita?')) return;
  DB.upd('cita', id, { estado: est }); render();
}
function reAgendar(id) {
  const v = document.getElementById('dt-re').value;
  if (!v) { alert('Elige fecha y hora'); return; }
  const iso = new Date(v).toISOString();
  if (hayTraslape(DB.by('cita', id).medico_id, iso, id)) { alert('Ya hay una cita con ese médico a esa hora'); return; }
  DB.upd('cita', id, { fecha_hora: iso }); render();
}
function atenderCita(id) {
  DB.upd('cita', id, { estado: 'Atendida' });
  go('form-consulta', 'cita:' + id);
}

/* ============ VISTA: HISTORIAL (RF-06, RF-07, RF-08) ============ */
let filtroHistEsp = '';
let busqHist = '';
function vHistorial() {
  const lista = histConsultaFiltradas();
  const espChips = '<div class="chiprow"><span class="chip ' + (filtroHistEsp === '' ? 'on' : '') + '" onclick="filtroHistEsp=\'\';render()">Todas</span>' +
    DB.data.especialidad.map(e => '<span class="chip ' + (filtroHistEsp === e.id ? 'on' : '') + '" onclick="filtroHistEsp=\'' + e.id + '\';render()">' + esc(e.nombre) + '</span>').join('') + '</div>';
  return '<div style="padding:20px 16px 0"><div class="t1" style="font-size:22px">Historial médico</div><div class="t2" id="hist-count">' + DB.data.consulta.length + ' consultas</div></div>' +
    '<div class="card" style="margin-top:var(--gap)"><input class="f" id="q" style="margin:0" placeholder="Buscar: motivo, diagnóstico, indicación…" value="' + esc(busqHist) + '" oninput="busqHist=this.value;renderListado()">' + '</div>' +
    espChips +
    '<div id="hist-list">' + histListado(lista) + '</div>' +
    '<button class="fab" onclick="go(\'form-consulta\',\'nueva\')">+</button>';
}
function histConsultaFiltradas() {
  return DB.data.consulta.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .filter(c => (!filtroHistEsp || DB.by('medico', c.medico_id)?.especialidad_id === filtroHistEsp))
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
/* búsqueda en vivo (RF-08): refresca el listado sin perder el foco del cuadro */
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
    '</div>' + '<div class="err" id="f-err" style="display:none"></div>' +
    '<button class="cta" onclick="guardarConsulta(' + (p && p.startsWith('cita:') ? ('\'' + p.slice(5) + '\'') : 'null') + ')">Guardar consulta</button>';
}
function guardarConsulta(citaId) {
  const dx = document.getElementById('c-dx').value.trim();
  const motivo = document.getElementById('c-motivo').value.trim();
  const err = document.getElementById('f-err');
  err.style.display = 'none';
  if (!dx || !motivo) { err.style.display = ''; err.textContent = 'Motivo y diagnóstico son obligatorios.'; return; }
  const c = DB.add('consulta', {
    id: DB.id(), fecha: document.getElementById('c-fecha').value,
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
  const medsDerivados = DB.data.medicamento.filter(m => m.consulta_id === id);
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
  const nombre = prompt('Nombre del medicamento prescrito (RF-09):');
  if (!nombre || !nombre.trim()) return;
  const dosis = prompt('Dosis / frecuencia (p. ej. "1 tableta cada 12h"):', '') || '';
  DB.add('medicamento', { id: DB.id(), nombre: nombre.trim(), presentacion: '', dosis, frecuencia_horas: null, stock: 0, suspendido: 0, fecha_fin: '', consulta_id: consultaId });
  go('farmacia');
}

/* ============ VISTA: FARMACIA (RF-10…13) ============ */
function vFarmacia() {
  const activos = DB.data.medicamento.filter(medActivo);
  const suspendidos = DB.data.medicamento.filter(m => !medActivo(m));
  const adherenciaHoy = n => DB.data.toma.filter(t => t.medicamento_id === n.id && t.fecha_hora.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
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

/* ============ FORM MED (RF-10) ============ */
function vFormMed(id) {
  const m = id ? DB.by('medicamento', id) : null;
  const tomas = m ? DB.data.toma.filter(t => t.medicamento_id === id).slice(-5).reverse() : [];
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
  else DB.add('medicamento', { id: DB.id(), nombre, presentacion: document.getElementById('m-present').value.trim(), dosis: document.getElementById('m-dosis').value.trim(), frecuencia_horas: null, stock, suspendido: 0, fecha_fin: document.getElementById('m-fin').value, consulta_id: null });
  go('farmacia');
}
function suspenderMed(id) {
  const m = DB.by('medicamento', id);
  DB.upd('medicamento', id, { suspendido: m.suspendido ? 0 : 1 });
  render();
}
/* RF-11, R3: tomar una dosis */
function tomar(id) {
  const m = DB.by('medicamento', id);
  if (!m) return;
  if (m.stock <= 0) {
    if (!confirm('Sin existencias (stock 0). ¿Registrar la toma como manual?')) return;
    DB.add('toma', { id: DB.id(), fecha_hora: new Date().toISOString(), confirmada_manual: 1, medicamento_id: id });
  } else {
    DB.upd('medicamento', id, { stock: m.stock - 1 });
    DB.add('toma', { id: DB.id(), fecha_hora: new Date().toISOString(), confirmada_manual: 0, medicamento_id: id });
  }
  render();
}

/* Ficha visible del build en pantalla: prueba de qué experiencia/code estás probando */
function buildInfoHtml() {
  const base = 'funciona 100% sin internet. Documentación técnica: requisitos, UML y base de datos en docs/ del proyecto.';
  if (BUILD_INFO) {
    return 'SaludApp v' + BUILD_INFO.versionName + ' · build ' + BUILD_INFO.commitShort +
      ' · ' + String(BUILD_INFO.builtAt).slice(0, 16).replace('T', ' ') +
      ' · esquema de datos v4.1 · ' + base;
  }
  return 'SaludApp v1.1.0 · esquema de datos v4.1 · ' + base;
}

/* ============ AJUSTES / RESPALDO (RF-18) ============ */
function vAjustes() {
  return '<div class="backrow"><button onclick="go(\'inicio\')">' + ICON.back + 'Inicio</button></div>' +
    '<h2 class="overline" style="margin-top:4px">Respaldo y datos</h2>' +
    '<div class="card row" onclick="respaldar()"><div class="ic">' + ICON.hist + '</div><div class="grow"><div class="t1">Descargar respaldo JSON</div><div class="t2">Citas, historial, farmacia y config</div></div></div>' +
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
