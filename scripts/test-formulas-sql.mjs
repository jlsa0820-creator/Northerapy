// Banco de pruebas: replica las 3 tablas de Northerapy en PGlite (Postgres real WASM),
// ejecuta el script de fórmulas escalables y valida los comportamientos clave.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();

function log(titulo, ok, detalle = "") {
  console.log(`${ok ? "✅" : "❌"} ${titulo}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// ── 1. Esquema igual al del usuario (tipos según las capturas) ──────────────
await db.exec(`
create table pacientes (
  paciente_id bigint primary key,
  nombre_completo text,
  grupo_edad text,
  edad_valor numeric,
  edad_unidad text,
  sexo text,
  status text,
  primera_sesion date,
  sesiones_programadas int4,
  sesiones_totales int4
);
create table asistencias (
  id bigint primary key,
  paciente_id bigint references pacientes(paciente_id),
  ultima_asistencia date,
  ses_programadas int4,
  ses_totales int,
  pct_adherencia numeric,
  dias_sin_asistir int4,
  frec_semanal numeric,
  status text
);
create table ingresos (
  id bigint primary key,
  paciente_id bigint references pacientes(paciente_id),
  fecha date,
  zonas int4,
  terapia_estado text,
  terapia_monto numeric,
  diclofenaco_estado text,
  diclofenaco_monto numeric,
  ortopedico_estado text,
  ortopedico_monto numeric,
  total numeric
);
`);

const hoy = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n) => { const d = new Date(hoy); d.setDate(d.getDate() - n); return iso(d); };

// ── 2. Datos de prueba al estilo de las capturas ────────────────────────────
// P1: sin ingresos, sin asistencias (recién creado)
// P2: última asistencia hace 3 días laborales → debe quedar "En pausa"
// P3: "Ejemplo": 51 sesiones históricas (legacy) pero solo 7 filas en ingresos → el 51 NO debe bajar
// P4: última asistencia hoy → "Activo"; con sesiones programadas 10 y 10 hechas → "Completó tratamiento"
// P5: 65 años → grupo "Adultos mayores"
await db.exec(`
insert into pacientes values
 (1,'Paciente Nuevo', null, 30, 'años','Masculino','Abandonó', null, null, 0),
 (2,'Ana Reciente','Adultos: 30 a 59', 40, 'años','Femenino','Abandonó', ${`'${diasAtras(5)}'`}, null, 4),
 (3,'Paciente Ejemplo','Adultos: 30 a 59', 57, 'años','Masculino','Abandonó', '${diasAtras(90)}', null, 51),
 (4,'Bella Completo','Joven: 18 a 29', 25, 'años','Femenino','Abandonó', '${diasAtras(60)}', 10, 10),
 (5,'Carlos Mayor','Adultos: 30 a 59', 65, 'años','Masculino','Abandonó', '${diasAtras(100)}', null, 3)
`);
await db.exec(`
insert into asistencias values
 (1, 1, null, null, 0, 0.0, 148, 0.0, 'Abandonó'),
 (2, 2, '${diasAtras(5)}', null, 4, 0.0, 129, 0.1, 'Abandonó'),
 (3, 3, '${diasAtras(45)}', null, 51, 0.0, 55, 1.6, 'Abandonó'),
 (4, 4, '${diasAtras(2)}', null, 10, 0.0, 59, 0.3, 'Abandonó'),
 (5, 5, '${diasAtras(40)}', null, 3, 0.0, 87, 0.7, 'Abandonó')
`);
// Ingresos de "Ejemplo" (P3): 7 sesiones históricas + compra de paquete
await db.exec(`
insert into ingresos values
 (1, 3, '${diasAtras(45)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (2, 3, '${diasAtras(44)}', 1, 'Yape', 30, 'No aplica', null, 'No aplica', null, 30),
 (3, 3, '${diasAtras(43)}', 2, 'Efectivo', 60, 'Efectivo', 6, 'No aplica', null, 999),  -- total mal a propósito
 (4, 3, '${diasAtras(42)}', 1, 'debe', 30, 'No aplica', null, 'No aplica', null, 30),
 (5, 3, '${diasAtras(41)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (6, 3, '${diasAtras(40)}', 1, 'cubierta', 0, 'No aplica', null, 'No aplica', null, 0),
 (7, 3, '${diasAtras(39)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (8, 3, '${diasAtras(45)}', 0, 'Efectivo', 150, 'No aplica', null, 'No aplica', null, 150)  -- compra de paquete (zonas=0)
`);

// ── 3. Ejecutar el script de fórmulas escalables ────────────────────────────
const sql = readFileSync("/home/z/my-project/download/formulas_escalables_northerapy.sql", "utf8");
try {
  await db.exec(sql);
  console.log("✅ Script SQL ejecutado completo sin errores\n");
} catch (e) {
  console.log("❌ El script SQL falló:", e.message);
  process.exit(1);
}

// ── 4. Validaciones ─────────────────────────────────────────────────────────
const q = async (sqlq) => (await db.query(sqlq)).rows;

// 4a. total de ingresos recalculado (la fila 3 tenía 999 mal)
let r = await q(`select total from ingresos where id = 3`);
log("ingresos.total recalculado por fórmula", r[0].total == 66, `total=${r[0].total} (esperado 66)`);

// 4b. días sin asistir frescos y laborables
r = await q(`select dias_sin_asistir, nor_dias_laborales(ultima_asistencia) as calc from asistencias where paciente_id = 2`);
log("dias_sin_asistir recalculado (P2, 5 días naturales ≈ 3-4 laborales)", r[0].dias_sin_asistir === r[0].calc && r[0].dias_sin_asistir >= 3, `dias=${r[0].dias_sin_asistir}`);

// 4c. status por fórmula
r = await q(`select paciente_id, status from asistencias order by paciente_id`);
const esperados = { 1: "Sin asistencias", 2: "En pausa", 3: "Abandonó", 4: "Completó tratamiento", 5: "Abandonó" };
for (const fila of r) {
  log(`status asistencias P${fila.paciente_id} = ${esperados[fila.paciente_id]}`, fila.status === esperados[fila.paciente_id], `obtuvo "${fila.status}"`);
}

// 4d. el histórico de Ejemplo (51) NO baja
r = await q(`select ses_totales from asistencias where paciente_id = 3`);
log("histórico de sesiones conservado (P3: 51 ≥ 7 filas de ingresos)", Number(r[0].ses_totales) === 51, `ses_totales=${r[0].ses_totales}`);

// 4e. grupo_edad derivado (P5 = 65 años)
r = await q(`select grupo_edad from pacientes where paciente_id = 5`);
log("grupo_edad derivado de la edad (P5, 65 años)", r[0].grupo_edad === "Adultos mayores: 60 a más", `obtuvo "${r[0].grupo_edad}"`);

// 4f. pct_adherencia con programadas
r = await q(`select pct_adherencia from asistencias where paciente_id = 4`);
log("pct_adherencia con programadas (P4: 10/10 = 100)", Number(r[0].pct_adherencia) === 100, `pct=${r[0].pct_adherencia}`);

// 4g. fila de asistencias creada para paciente con ingresos pero sin fila
await db.exec(`insert into ingresos values (9, 2, '${diasAtras(1)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30)`);
r = await q(`select count(*)::int as n from asistencias where paciente_id = 2`);
log("sincronización tras nuevo ingreso (P2 actualizado, sigue 1 fila)", r[0].n === 1, `filas=${r[0].n}`);
r = await q(`select ultima_asistencia from asistencias where paciente_id = 2`);
const ultimaStr = new Date(r[0].ultima_asistencia).toISOString().slice(0, 10);
log("ultima_asistencia avanzó al nuevo ingreso (P2)", ultimaStr === diasAtras(1), `ultima=${ultimaStr}`);
r = await q(`select status from asistencias where paciente_id = 2`);
log("status se movió a Activo con la visita de ayer (P2)", r[0].status === "Activo", `status="${r[0].status}"`);

// 4h. inserción DIRECTA en el editor (sin pasar por la app): el piso protege el histórico
await db.exec(`insert into ingresos values (10, 3, '${diasAtras(0)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30)`);
r = await q(`select ses_totales from asistencias where paciente_id = 3`);
log("inserción directa: piso no inventa sesiones (P3 sigue 51)", Number(r[0].ses_totales) === 51, `ses_totales=${r[0].ses_totales}`);

// 4h-bis. flujo de la APP: el trigger sincroniza y la app incrementa (51 → 52)
await db.exec(`update asistencias set ses_totales = 52 where paciente_id = 3`);  // lo que escribe la app
r = await q(`select sesiones_totales, status from pacientes where paciente_id = 3`);
log("la BD sincroniza pacientes.sesiones_totales (P3 = 52)", Number(r[0].sesiones_totales) === 52, `valor=${r[0].sesiones_totales}`);
log("pacientes.status con visita de hoy (P3 = Activo)", r[0].status === "Activo", `status="${r[0].status}"`);
r = await q(`select ses_totales from asistencias where paciente_id = 3`);
log("flujo app: contador queda en 52", Number(r[0].ses_totales) === 52, `ses_totales=${r[0].ses_totales}`);

// 4i. borrar el ingreso nuevo: el histórico de la app (52) se conserva en pacientes
await db.exec(`delete from ingresos where id = 10`);
r = await q(`select ses_totales from asistencias where paciente_id = 3`);
log("borrar ingreso no baja el histórico (P3 sigue 52)", Number(r[0].ses_totales) === 52, `ses_totales=${r[0].ses_totales}`);

// 4j. edición directa de un monto recalcula el total
await db.exec(`update ingresos set terapia_monto = 50 where id = 1`);
r = await q(`select total from ingresos where id = 1`);
log("editar monto recalcula total (30→50)", Number(r[0].total) === 50, `total=${r[0].total}`);

// 4k. insert "como la app" (con id y total ya calculados) no rompe
await db.exec(`insert into ingresos values (11, 4, '${diasAtras(0)}', 2, 'Yape', 60, 'Efectivo', 12, 'No aplica', null, 72)`);
r = await q(`select total from ingresos where id = 11`);
log("insert estilo-app (id+total incluidos) funciona y fórmula corrige", Number(r[0].total) === 72, `total=${r[0].total}`);

// 4l. frec_semanal de P2 (1 sesión en 28 días = 0.3)
r = await q(`select frec_semanal from asistencias where paciente_id = 2`);
log("frec_semanal por fórmula (P2 ≈ 0.3)", Number(r[0].frec_semanal) === 0.3, `frec=${r[0].frec_semanal}`);

// 4m. idempotencia: ejecutar el script otra vez no falla
try {
  await db.exec(sql);
  log("script idempotente (segunda ejecución OK)", true);
} catch (e) {
  log("script idempotente (segunda ejecución OK)", false, e.message);
}

// 4n. chequeos finales del propio script (todas las "filas_mal" en 0)
r = await q(`
select count(*)::int as mal from ingresos
where total is distinct from (coalesce(terapia_monto,0)+coalesce(diclofenaco_monto,0)+coalesce(ortopedico_monto,0))`);
log("chequeo script: 0 ingresos descuadrados", r[0].mal === 0, `mal=${r[0].mal}`);
r = await q(`
select count(*)::int as mal from pacientes p join asistencias s on s.paciente_id = p.paciente_id
where p.status is distinct from s.status`);
log("chequeo script: estados pacientes = asistencias", r[0].mal === 0, `mal=${r[0].mal}`);

console.log("\n═══ RESULTADO FINAL ═══");
console.log(process.exitCode ? "❌ HAY FALLOS — revisar arriba" : "✅ TODAS LAS VALIDACIONES PASARON");
