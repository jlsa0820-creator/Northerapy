// Banco de pruebas del script "mejoras_minimas_northerapy.sql":
// replica las 3 tablas en PGlite (Postgres real WASM) con estados MIXED-CASE
// (como los migrados del Excel), ejecuta formulas → verificar → mejoras, y valida:
//   1. ejecuta completo sin errores y es idempotente (re-run OK)
//   2. estados normalizados a minúsculas (la deuda 'Debe' pasa a contarse)
//   3. columna tipo clasificada (sesion / compra_paquete / venta_producto)
//   4. PKs identity: insert sin id funciona; insert con id explícito (app) también
//   5. FK cascade: borrar paciente elimina sus ingresos y asistencias
//   6. índice único 1:1 en asistencias(paciente_id)
//   7. fórmulas tipo-aware: equivalencia con datos actuales + override manual
//   8. vistas en vivo coinciden con la tabla tras el refresco
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();

function log(titulo, ok, detalle = "") {
  console.log(`${ok ? "✅" : "❌"} ${titulo}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const q = async (sql) => (await db.query(sql)).rows;

// ── 1. Esquema igual al del usuario ─────────────────────────────────────────
await db.exec(`
create table pacientes (
  paciente_id bigint primary key, nombre_completo text, grupo_edad text,
  edad_valor numeric, edad_unidad text, sexo text, celular_principal text,
  status text, primera_sesion date, sesiones_programadas int4, sesiones_totales int4);
create table asistencias (
  id bigint primary key, paciente_id bigint references pacientes(paciente_id),
  ultima_asistencia date, ses_programadas int4, ses_totales int,
  pct_adherencia numeric, dias_sin_asistir int4, frec_semanal numeric, status text);
create table ingresos (
  id bigint primary key, paciente_id bigint references pacientes(paciente_id),
  fecha date, zonas int4, terapia_estado text, terapia_monto numeric,
  diclofenaco_estado text, diclofenaco_monto numeric,
  ortopedico_estado text, ortopedico_monto numeric, total numeric);
`);

const hoy = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return iso(d); };

// ── 2. Datos estilo Excel: estados con MAYÚSCULAS ───────────────────────────
await db.exec(`
insert into pacientes values
 (1,'Paciente Nuevo', null, 30, 'años','Masculino', null, 'Abandonó', null, null, 0),
 (2,'Ana Reciente','Adultos: 30 a 59', 40, 'años','Femenino','987654321','Abandonó', '${diasAtras(5)}', null, 4),
 (3,'Paciente Ejemplo','Adultos: 30 a 59', 57, 'años','Masculino','912345678','Abandonó', '${diasAtras(90)}', null, 51),
 (4,'Bella Completo','Joven: 18 a 29', 25, 'años','Femenino','998877665','Abandonó', '${diasAtras(60)}', 10, 10),
 (5,'Carlos Mayor','Adultos: 30 a 59', 65, 'años','Masculino','955443322','Abandonó', '${diasAtras(100)}', null, 3)`);
await db.exec(`
insert into asistencias values
 (1, 1, null, null, 0, 0.0, 148, 0.0, 'Abandonó'),
 (2, 2, '${diasAtras(5)}', null, 4, 0.0, 129, 0.1, 'Abandonó'),
 (3, 3, '${diasAtras(45)}', null, 51, 0.0, 55, 1.6, 'Abandonó'),
 (4, 4, '${diasAtras(2)}', null, 10, 0.0, 59, 0.3, 'Abandonó'),
 (5, 5, '${diasAtras(40)}', null, 3, 0.0, 87, 0.7, 'Abandonó')`);
await db.exec(`
insert into ingresos values
 (1, 3, '${diasAtras(45)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (2, 3, '${diasAtras(44)}', 1, 'Yape', 30, 'No aplica', null, 'No aplica', null, 30),
 (3, 3, '${diasAtras(43)}', 2, 'Efectivo', 60, 'Efectivo', 6, 'No aplica', null, 999),
 (4, 3, '${diasAtras(42)}', 1, 'Debe', 30, 'No aplica', null, 'No aplica', null, 30),
 (5, 3, '${diasAtras(41)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (6, 3, '${diasAtras(40)}', 1, 'Cubierta', 0, 'No aplica', null, 'No aplica', null, 0),
 (7, 3, '${diasAtras(39)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (8, 3, '${diasAtras(45)}', 0, 'Efectivo', 150, 'No aplica', null, 'No aplica', null, 150),
 (10, 5, '${diasAtras(3)}', 0, 'No aplica', null, 'Efectivo', 6, 'No aplica', null, 6)`);

// ── 3. Prerrequisitos y línea base ──────────────────────────────────────────
await db.exec(readFileSync("/home/z/my-project/download/formulas_escalables_northerapy.sql", "utf8"));
await db.exec(readFileSync("/home/z/my-project/download/verificar_actualizacion_diaria.sql", "utf8"));

// La deuda 'Debe' capitalizada NO se detecta antes de las mejoras (así compara la app)
const deudaAntes = await q(
  "select coalesce(sum(terapia_monto), 0)::float as deuda from ingresos where terapia_estado = 'debe'");
const baseAsis = await q("select id, ses_totales, ultima_asistencia::text as u, frec_semanal from asistencias order by id");

// ── 4. Script de mejoras ────────────────────────────────────────────────────
const sql = readFileSync("/home/z/my-project/download/mejoras_minimas_northerapy.sql", "utf8");
try {
  await db.exec(sql);
  log("mejoras_minimas_northerapy.sql ejecuta completo sin errores", true);
} catch (e) {
  log("mejoras_minimas_northerapy.sql falló", false, e.message);
  process.exit(1);
}

// ── 5. Estados normalizados ─────────────────────────────────────────────────
const estados = await q(`
  select distinct e.estado from (
    select terapia_estado as estado from ingresos
    union select diclofenaco_estado from ingresos
    union select ortopedico_estado from ingresos) e where e.estado is not null order by 1`);
const esperados = ["cubierta", "debe", "efectivo", "no_aplica", "yape"];
log("estados todos en minúsculas y mapeados (No aplica→no_aplica)",
  JSON.stringify(estados.map((r) => r.estado)) === JSON.stringify(esperados),
  estados.map((r) => r.estado).join(", "));
const deudaDespues = await q(
  "select coalesce(sum(terapia_monto), 0)::float as deuda from ingresos where terapia_estado = 'debe'");
log("la deuda con 'Debe' capitalizado ahora SÍ se detecta (30)",
  deudaAntes[0].deuda === 0 && deudaDespues[0].deuda === 30,
  `antes=${deudaAntes[0].deuda} después=${deudaDespues[0].deuda}`);
const chk = await q(`
  select count(*)::int as n from pg_constraint
   where conname in ('ingresos_estados_chk', 'ingresos_tipo_chk') and contype = 'c'`);
log("CHECKs de estados y tipo creados", chk[0].n === 2);

// ── 6. Columna tipo ─────────────────────────────────────────────────────────
const tipos = await q("select tipo, count(*)::int as n from ingresos group by tipo order by 1");
const mapaTipos = Object.fromEntries(tipos.map((r) => [r.tipo, r.n]));
log("tipo clasificado: 7 sesiones, 1 compra_paquete, 1 venta_producto",
  mapaTipos["sesion"] === 7 && mapaTipos["compra_paquete"] === 1 && mapaTipos["venta_producto"] === 1,
  JSON.stringify(mapaTipos));

// ── 7. Equivalencia de fórmulas (nada cambió con los datos actuales) ────────
const asisDespues = await q("select id, ses_totales, ultima_asistencia::text as u, frec_semanal from asistencias order by id");
const igual = JSON.stringify(baseAsis) === JSON.stringify(asisDespues);
log("sesiones/última/frecuencia idénticos tras la migración (equivalencia)", igual,
  igual ? "" : JSON.stringify(baseAsis) + " vs " + JSON.stringify(asisDespues));

// ── 8. Identity: insert sin id y con id explícito (ruta de la app) ──────────
const sinId = await q(`
  insert into ingresos (paciente_id, fecha, zonas, terapia_estado, terapia_monto, total)
  values (2, current_date, 1, 'no_aplica', 0, 0) returning id, tipo`);
log("insert SIN id → identity genera id 11 y el trigger pone tipo='sesion'",
  sinId[0].id === 11 && sinId[0].tipo === "sesion", JSON.stringify(sinId[0]));
const conId = await q(`
  insert into ingresos (id, paciente_id, fecha, zonas, terapia_estado, terapia_monto, total)
  values (12, 2, current_date, 1, 'no_aplica', 0, 0) returning id, tipo`);
log("insert CON id explícito (ruta actual de la app) sigue funcionando",
  conId[0].id === 12 && conId[0].tipo === "sesion");

// La frecuencia de P2 ahora es 2 sesiones / 4 = 0.5 (tabla y vista)
const p2a = await q(`
  select a.frec_semanal::float as tabla, v.frec_semanal::float as vista
    from asistencias a join asistencias_v v on v.id = a.id where a.paciente_id = 2`);
log("frecuencia tipo-aware: P2 = 0.5 en tabla y vista",
  p2a[0].tabla === 0.5 && p2a[0].vista === 0.5, JSON.stringify(p2a[0]));

// Override manual: la fila 11 no fue sesión en realidad → 2 sesiones pasan a 1 → 0.5 → 0.3
await db.exec("update ingresos set tipo = 'venta_producto' where id = 11");
const p2b = await q(`
  select a.frec_semanal::float as tabla, v.frec_semanal::float as vista
    from asistencias a join asistencias_v v on v.id = a.id where a.paciente_id = 2`);
log("override manual de tipo respetado: P2 pasa de 0.5 a 0.3",
  p2b[0].tabla === 0.3 && p2b[0].vista === 0.3, JSON.stringify(p2b[0]));
const over = await q(`
  select count(*)::int as n from ingresos i
   where (i.tipo = 'venta_producto' and i.zonas > 0)`);
log("chequeo de overrides lo detecta (informativo, esperado 1)", over[0].n === 1);

// ── 9. Índice único 1:1 ─────────────────────────────────────────────────────
const uidx = await q(`
  select count(*)::int as n from pg_indexes
   where schemaname = 'public' and indexname = 'asistencias_paciente_uidx'`);
log("índice único asistencias(paciente_id) creado", uidx[0].n === 1);
let duplicadoRechazado = false;
try {
  await q(`insert into asistencias (paciente_id, ses_totales) values (2, 1)`);
} catch (e) {
  duplicadoRechazado = true;  // esperado: viola el índice único 1:1
}
log("insertar 2a fila de asistencias del mismo paciente es rechazado", duplicadoRechazado);

// ── 10. FK cascade ──────────────────────────────────────────────────────────
const antes = await q("select count(*)::int as p from pacientes"),
  ingAntes = await q("select count(*)::int as i from ingresos");
await db.exec("delete from pacientes where paciente_id = 3");
const desp = await q(`
  select
    (select count(*) from pacientes)::int as pacientes,
    (select count(*) from ingresos where paciente_id = 3)::int as ingresos_p3,
    (select count(*) from asistencias where paciente_id = 3)::int as asis_p3,
    (select count(*) from ingresos)::int as ingresos_tot`);
log("borrar paciente 3 en cascada elimina sus 8 ingresos y su resumen",
  desp[0].pacientes === antes[0].p - 1 && desp[0].ingresos_p3 === 0 && desp[0].asis_p3 === 0
    && desp[0].ingresos_tot === ingAntes[0].i - 8, JSON.stringify(desp[0]));

// ── 11. Vistas y datos al día tras todo ─────────────────────────────────────
const dif = await q(`
  select count(*)::int as n from asistencias a join asistencias_v v on v.id = a.id
  where v.dias_sin_asistir is distinct from a.dias_sin_asistir
     or v.status is distinct from a.status`);
log("vistas en vivo siguen coincidiendo con la tabla", dif[0].n === 0);
const viejos = await q(`
  select count(*)::int as n from asistencias
   where dias_sin_asistir is distinct from nor_dias_laborales(ultima_asistencia)`);
log("chequeo final: 0 filas de días desactualizadas", viejos[0].n === 0);

// ── 12. Idempotencia ────────────────────────────────────────────────────────
try {
  await db.exec(sql);
  log("re-ejecutar el script completo no falla (idempotente)", true);
} catch (e) {
  log("re-ejecución falló", false, e.message);
}

console.log("\nResultado:", process.exitCode ? "HAY FALLOS" : "TODO OK");
