#!/usr/bin/env node
/* Smoke test de la capa DB v4.1 y las vistas v2/v2.1 de SaludApp.
   Corre sin navegador: stub mínimo de DOM + localStorage.
   Uso: node tools/smoke-test.js */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app/src/main/assets/app.js'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

function nuevoContexto(store) {
  const local = Object.assign({}, store || {});
  const els = {};
  const el = id => {
    if (!els[id]) els[id] = { id, style: {}, innerHTML: '', textContent: '', value: '', click() {} };
    return els[id];
  };
  const ctx = {
    localStorage: {
      getItem: k => (k in local ? local[k] : null),
      setItem: (k, v) => { local[k] = String(v); },
      removeItem: k => { delete local[k]; },
    },
    document: {
      getElementById: el,
      querySelectorAll: () => [],
      createElement: () => el('tmp'),
    },
    window: { scrollTo() {} },
    Blob: function () {},
    URL: { createObjectURL: () => 'blob:stub' },
    alert() {}, confirm: () => true, prompt: () => null,
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, Number, String,
    Object, Array, Error, RegExp, Boolean,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'app.js' });
  return { ctx, local, els };
}

console.log('\nSaludApp — smoke test v4.1\n');

/* ---------- 1. arranque limpio ---------- */
test('arranque limpio: esquema 4.1 y un paciente por defecto', () => {
  const { ctx, local } = nuevoContexto();
  assert.strictEqual(vm.runInContext('DB.SCHEMA', ctx), '4.1');
  assert.strictEqual(vm.runInContext('DB.data.usuario.length', ctx), 1);
  assert.strictEqual(vm.runInContext('DB.data.usuario[0].rol', ctx), 'paciente');
  assert.strictEqual(vm.runInContext('DB.rol()', ctx), 'paciente');
  assert.ok(local['saludapp_v41'], 'debe persistir en localStorage');
});

/* ---------- 2. migración v3 → v4.1 ---------- */
test('migración v3→v4.1 conserva los datos y asigna paciente_id', () => {
  const v3 = {
    schema: 3, perfil: { nombre: 'Ana' },
    especialidad: [{ id: 'e1', nombre: 'Medicina General' }],
    medico: [{ id: 'm1', nombre: 'Dr. Solís', especialidad_id: 'e1' }],
    cita: [{ id: 'c1', medico_id: 'm1', fecha_hora: '2026-10-20T10:00:00.000Z', estado: 'Atendida', consultorio: '' }],
    consulta: [{ id: 'q1', medico_id: 'm1', fecha: '2026-10-20', motivo: 'control', diagnostico: 'sano', indicaciones: '', observaciones: '', cita_id: 'c1' }],
    medicamento: [{ id: 'x1', nombre: 'Vitamina D', dosis: '1/día', stock: 5, suspendido: 0, fecha_fin: '', consulta_id: 'q1' }],
    toma: [{ id: 't1', medicamento_id: 'x1', fecha_hora: '2026-10-21T08:00:00.000Z', confirmada_manual: 0 }],
  };
  const { ctx } = nuevoContexto({ saludapp_v3: JSON.stringify(v3) });
  assert.strictEqual(vm.runInContext('DB.SCHEMA', ctx), '4.1');
  assert.strictEqual(vm.runInContext('DB.data.usuario[0].nombre', ctx), 'Ana');
  assert.strictEqual(vm.runInContext('DB.data.cita.length', ctx), 1);
  assert.strictEqual(vm.runInContext('DB.data.consulta.length', ctx), 1);
  assert.strictEqual(vm.runInContext('DB.data.cita[0].paciente_id', ctx), vm.runInContext('DB.data.usuario[0].id', ctx));
  assert.ok(vm.runInContext('DB.data.medicamento[0].creado_en', ctx), 'creado_en para el timeline');
  assert.strictEqual(vm.runInContext('DB.data.toma.length', ctx), 1);
});

/* ---------- 3. timeline ---------- */
test('timeline consolida cita, consulta, medicamento, toma y medición', () => {
  const { ctx } = nuevoContexto();
  vm.runInContext(`
    const pid = DB.pacienteActual();
    DB.add('medico', { id: 'm1', nombre: 'Dr. Solís', especialidad_id: DB.data.especialidad[0].id });
    DB.add('cita', { id: 'c1', paciente_id: pid, medico_id: 'm1', fecha_hora: '2026-10-20T10:00:00.000Z', estado: 'Programada', consultorio: '' });
    DB.add('consulta', { id: 'q1', paciente_id: pid, medico_id: 'm1', fecha: '2026-10-20', motivo: 'control', diagnostico: 'sano', indicaciones: '', observaciones: '', cita_id: 'c1' });
    DB.add('medicamento', { id: 'x1', paciente_id: pid, nombre: 'Vitamina D', dosis: '', stock: 5, suspendido: 0, fecha_fin: '', consulta_id: 'q1', creado_en: '2026-10-20T11:00:00.000Z' });
    DB.add('toma', { id: 't1', medicamento_id: 'x1', fecha_hora: '2026-10-21T08:00:00.000Z', confirmada_manual: 0 });
    DB.add('medicion', { id: 's1', paciente_id: pid, dispositivo_id: null, tipo: 'fc', valor: 72, unidad: 'lpm', fecha_hora: '2026-10-22T09:00:00.000Z', referencia_min: 60, referencia_max: 100 });
    globalThis.__tipos = eventosTimeline(pid).map(e => e.tipo).sort().join(',');
    globalThis.__orden = eventosTimeline(pid)[0].tipo;
  `, ctx);
  assert.strictEqual(vm.runInContext('__tipos', ctx), 'cita,consulta,medicamento,medicion,toma');
  assert.strictEqual(vm.runInContext('__orden', ctx), 'medicion', 'más reciente primero');
});

/* ---------- 4. vínculo, lectura y auditoría ---------- */
test('vínculo activo permite lectura y deja auditoría; revocar la corta', () => {
  const { ctx } = nuevoContexto();
  vm.runInContext(`
    const pac = DB.data.usuario[0];
    const staff = DB.add('usuario', { id: 'u-staff', nombre: 'Dra. Prueba', rol: 'enfermeria', contacto: '', credencial: 'E-1', medico_id: null, creado_en: ahoraISO() });
    const v = DB.add('vinculo_personal', { id: 'v1', paciente_id: pac.id, staff_id: staff.id, estado: 'Activo', creado_en: ahoraISO(), revocado_en: null });
    DB.data.sesion = { usuario_id: staff.id };
    DB.data.sesionPaciente = pac.id;
    globalThis.__antes = DB.puedeLeer(pac.id);
    abrirPaciente(pac.id);
    globalThis.__audit = DB.data.acceso_auditoria.filter(a => a.accion === 'lectura_perfil').length;
    globalThis.__pw = DB.puedeEscribir();
    DB.data.sesion = { usuario_id: pac.id };
    revocarVinculo('v1');
    DB.data.sesion = { usuario_id: staff.id };
    globalThis.__despues = DB.puedeLeer(pac.id);
    globalThis.__fila = !!DB.by('vinculo_personal', 'v1');
    globalThis.__rev = DB.by('vinculo_personal', 'v1').estado;
    globalThis.__auditRev = DB.data.acceso_auditoria.some(a => a.accion === 'consentimiento_revocado');
  `, ctx);
  assert.strictEqual(vm.runInContext('__antes', ctx), true);
  assert.strictEqual(vm.runInContext('__audit', ctx), 1, 'una lectura = una fila de auditoría');
  assert.strictEqual(vm.runInContext('__pw', ctx), false, 'staff nunca escribe');
  assert.strictEqual(vm.runInContext('__despues', ctx), false, 'revocar corta el acceso');
  assert.strictEqual(vm.runInContext('__fila', ctx), true, 'R7: la fila se conserva');
  assert.strictEqual(vm.runInContext('__rev', ctx), 'Revocado');
  assert.strictEqual(vm.runInContext('__auditRev', ctx), true);
});

/* ---------- 5. mediciones: rango y deduplicación ---------- */
test('medición fuera de rango marcada y sin diagnóstico', () => {
  const { ctx } = nuevoContexto();
  vm.runInContext(`
    const pid = DB.pacienteActual();
    DB.add('medicion', { id: 's1', paciente_id: pid, dispositivo_id: null, tipo: 'spo2', valor: 91, unidad: '%', fecha_hora: '2026-10-22T09:00:00.000Z', referencia_min: 95, referencia_max: 100 });
    globalThis.__fuera = fueraDeRango(DB.by('medicion', 's1'));
    globalThis.__ok = fueraDeRango({ valor: 97, referencia_min: 95, referencia_max: 100 });
  `, ctx);
  assert.strictEqual(vm.runInContext('__fuera', ctx), true);
  assert.strictEqual(vm.runInContext('__ok', ctx), false);
  const html = vm.runInContext('medTipo="spo2"; vMediciones()', ctx);
  assert.ok(html.indexOf('fuera de rango') >= 0);
  assert.ok(html.indexOf('no es diagnóstico') >= 0, 'R8: sin interpretación diagnóstica');
});

test('RF-28: mismo dispositivo + tipo + fecha no duplica (sobrescribe)', () => {
  const { ctx, els } = nuevoContexto();
  ['s-tipo', 's-valor', 's-fecha', 's-disp', 's-refmin', 's-refmax'].forEach(id => {
    els[id] = { id, style: {}, innerHTML: '', textContent: '', value: '', click() {} };
  });
  vm.runInContext(`
    const pid = DB.pacienteActual();
    DB.add('dispositivo', { id: 'd1', paciente_id: pid, nombre: 'Mi banda', tipo: 'banda', canal: 'manual', estado: 'Activo', vinculado_en: ahoraISO() });
  `, ctx);
  function alta(valor, fecha) {
    els['s-tipo'].value = 'fc';
    els['s-valor'].value = String(valor);
    els['s-fecha'].value = fecha;
    els['s-disp'].value = 'd1';
    els['s-refmin'].value = '60';
    els['s-refmax'].value = '100';
    vm.runInContext('guardarMedicion()', ctx);
  }
  alta(70, '2026-10-22T09:00');
  alta(80, '2026-10-22T09:00');
  assert.strictEqual(vm.runInContext('DB.data.medicion.length', ctx), 1, 'no debe duplicar');
  assert.strictEqual(vm.runInContext('DB.data.medicion[0].valor', ctx), 80, 'sobrescribe la lectura');
  alta(75, '2026-10-22T10:00');
  assert.strictEqual(vm.runInContext('DB.data.medicion.length', ctx), 2);
});

/* ---------- 6. todas las vistas renderizan ---------- */
test('todas las vistas renderizan sin excepción', () => {
  const { ctx } = nuevoContexto();
  vm.runInContext(`
    const pid = DB.pacienteActual();
    DB.add('medico', { id: 'm1', nombre: 'Dr. Solís', especialidad_id: DB.data.especialidad[0].id });
    DB.add('cita', { id: 'c1', paciente_id: pid, medico_id: 'm1', fecha_hora: '2026-10-20T10:00:00.000Z', estado: 'Programada', consultorio: '' });
    DB.add('consulta', { id: 'q1', paciente_id: pid, medico_id: 'm1', fecha: '2026-10-20', motivo: 'control', diagnostico: 'sano', indicaciones: '', observaciones: '', cita_id: 'c1' });
    DB.add('medicamento', { id: 'x1', paciente_id: pid, nombre: 'Vitamina D', dosis: '', stock: 5, suspendido: 0, fecha_fin: '', consulta_id: 'q1', creado_en: ahoraISO() });
    DB.add('dispositivo', { id: 'd1', paciente_id: pid, nombre: 'Mi banda', tipo: 'banda', canal: 'manual', estado: 'Activo', vinculado_en: ahoraISO() });
    DB.add('medicion', { id: 's1', paciente_id: pid, dispositivo_id: 'd1', tipo: 'fc', valor: 72, unidad: 'lpm', fecha_hora: ahoraISO(), referencia_min: 60, referencia_max: 100 });
    globalThis.__vistas = 0;
    const lista = [ ['inicio'], ['citas'], ['historial'], ['farmacia'], ['seguimiento'], ['mediciones'], ['dispositivos'], ['vinculos'], ['accesos'], ['usuarios'], ['form-usuario'], ['perfil'], ['form-cita'], ['det-cita','c1'], ['form-consulta','nueva'], ['det-consulta','q1'], ['form-med','x1'], ['form-modalidad'], ['form-dispositivo'], ['ajustes'] ];
    lista.forEach(([v,p]) => { view=v; viewParam=p||null; render(); globalThis.__vistas++; });
    /* staff */
    const staff = DB.add('usuario', { id: 'u-st', nombre: 'Dra. Prueba', rol: 'medico', contacto: '', credencial: '', medico_id: null, creado_en: ahoraISO() });
    DB.add('vinculo_personal', { id: 'v1', paciente_id: pid, staff_id: staff.id, estado: 'Activo', creado_en: ahoraISO(), revocado_en: null });
    DB.data.sesion = { usuario_id: staff.id };
    DB.data.sesionPaciente = pid;
    ['inicio','pacientes','perfil','usuarios','ajustes'].forEach(v => { view=v; viewParam=null; render(); globalThis.__vistas++; });
    view='paciente'; viewParam=pid; render(); globalThis.__vistas++;
  `, ctx);
  assert.strictEqual(vm.runInContext('__vistas', ctx), 26);
});

/* ---------- 7. respaldo ---------- */
test('el respaldo JSON incluye las tablas v4.1', () => {
  const { ctx } = nuevoContexto();
  const json = JSON.parse(vm.runInContext('JSON.stringify(DB.data)', ctx));
  ['schema', 'usuario', 'vinculo_personal', 'acceso_auditoria', 'dispositivo', 'medicion',
    'cita', 'consulta', 'medicamento', 'toma'].forEach(k => assert.ok(k in json, 'falta ' + k));
  assert.strictEqual(json.schema, '4.1');
});

console.log('\n  ' + pass + ' pasaron · ' + fail + ' fallaron\n');
process.exit(fail ? 1 : 0);
