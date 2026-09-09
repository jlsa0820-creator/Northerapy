// Banco de pruebas del script "verificar_actualizacion_diaria.sql":
// replica las 3 tablas en PGlite (Postgres real WASM), ejecuta PRIMERO el
// script de fórmulas (prerrequisito) y luego el nuevo script, y valida:
//   1. ejecuta completo sin errores (con pg_cron ausente → degradación elegante)
//   2. informe sin componentes FALTANTES; pg_cron reportado como NO DISPONIBLE
//   3. vistas en vivo creadas con security_invoker=true
//   4. vista = tabla tras el refresco (días, adherencia, frec, estado)
//   5. casos deterministas: P1 Sin asistencias, P3 Abandonó+51 sesiones,
//      P4 Completó tratamiento con adherencia 100, P5 grupo Adultos mayores
//   6. idempotencia: re-ejecutar el script no falla
//   7. escritura estilo app (nueva visita) → tabla y vista siguen coincidiendo
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();

function log(titulo, ok, detalle = "") {
  console.log(`${ok ? "✅" : "❌"} ${titulo}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// ── 1. Esquema igual al del usuario ─────────────────────────────────────────
await db.exec(`
create table pacientes (
  paciente_id bigint primary key,
  nombre_completo text,
  grupo_edad text,
  edad_valor numeric,
  edad_unidad text,
  sexo text,
  celular_principal text,
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

// ── 2. Datos de prueba ──────────────────────────────────────────────────────
await db.exec(`
insert into pacientes values
 (1,'Paciente Nuevo', null, 30, 'años','Masculino', null, 'Abandonó', null, null, 0),
 (2,'Ana Reciente','Adultos: 30 a 59', 40, 'años','Femenino','987654321','Abandonó', ${`'${diasAtras(5)}'`}, null, 4),
 (3,'Aladino Gordillo','Adultos: 30 a 59', 57, 'años','Masculino','912345678','Abandonó', '${diasAtras(90)}', null, 51),
 (4,'Bella Completo','Joven: 18 a 29', 25, 'años','Femenino','998877665','Abandonó', '${diasAtras(60)}', 10, 10),
 (5,'Carlos Mayor','Adultos: 30 a 59', 65, 'años','Masculino','955443322','Abandonó', '${diasAtras(100)}', null, 3)
`);
await db.exec(`
insert into asistencias values
 (1, 1, null, null, 0, 0.0, 148, 0.0, 'Abandonó'),
 (2, 2, '${diasAtras(5)}', null, 4, 0.0, 129, 0.1, 'Abandonó'),
 (3, 3, '${diasAtras(45)}', null, 51, 0.0, 55, 1.6, 'Abandonó'),
 (4, 4, '${diasAtras(2)}', null, 10, 0.0, 59, 0.3, 'Abandonó'),
 (5, 5, '${diasAtras(40)}', null, 3, 0.0, 87, 0.7, 'Abandonó')
`);
await db.exec(`
insert into ingresos values
 (1, 3, '${diasAtras(45)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (2, 3, '${diasAtras(44)}', 1, 'Yape', 30, 'No aplica', null, 'No aplica', null, 30),
 (3, 3, '${diasAtras(43)}', 2, 'Efectivo', 60, 'Efectivo', 6, 'No aplica', null, 999),
 (4, 3, '${diasAtras(42)}', 1, 'debe', 30, 'No aplica', null, 'No aplica', null, 30),
 (5, 3, '${diasAtras(41)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (6, 3, '${diasAtras(40)}', 1, 'cubierta', 0, 'No aplica', null, 'No aplica', null, 0),
 (7, 3, '${diasAtras(39)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (8, 3, '${diasAtras(45)}', 0, 'Efectivo', 150, 'No aplica', null, 'No aplica', null, 150)
`);

// ── 3. Prerrequisito: script de fórmulas escalables ─────────────────────────
try {
  await db.exec(readFileSync("/home/z/my-project/download/formulas_escalables_northerapy.sql", "utf8"));
  log("prerrequisito: formulas_escalables_northerapy.sql OK", true);
} catch (e) {
  log("prerrequisito falló", false, e.message);
  process.exit(1);
}

// ── 4. Script nuevo ─────────────────────────────────────────────────────────
const sqlNuevo = readFileSync("/home/z/my-project/download/verificar_actualizacion_diaria.sql", "utf8");
try {
  await db.exec(sqlNuevo);
  log("verificar_actualizacion_diaria.sql ejecuta completo (sin pg_cron, degradación elegante)", true);
} catch (e) {
  log("verificar_actualizacion_diaria.sql falló", false, e.message);
  process.exit(1);
}

const q = async (sql) => (await db.query(sql)).rows;

// ── 5. Informe: sin componentes faltantes ───────────────────────────────────
const informe = await q("select seccion, componente, estado from nor_reporte_actualizacion()");
const faltantes = informe.filter((r) => r.estado.startsWith("FALTA") || r.estado.startsWith("ERROR"));
log("informe sin componentes FALTA/ERROR", faltantes.length === 0,
  faltantes.map((r) => `${r.componente}=${r.estado}`).join(", "));
const cronFilas = informe.filter((r) => /pg_cron|northerapy|última ejecución/i.test(r.componente));
log("pg_cron ausente se reporta como NO DISPONIBLE (sin romper nada)",
  cronFilas.length >= 3 && cronFilas.every((r) => r.estado === "NO DISPONIBLE"),
  cronFilas.map((r) => `${r.componente}:${r.estado}`).join(" | "));
const datosFilas = informe.filter((r) => r.seccion === "5. Datos");
log("informe: los 3 chequeos de datos en OK",
  datosFilas.length === 3 && datosFilas.every((r) => r.estado === "OK"));

// ── 6. Vistas creadas con security_invoker ─────────────────────────────────
const relopt = await q("select reloptions::text as o from pg_class where relname in ('asistencias_v','pacientes_v')");
log("vistas asistencias_v y pacientes_v creadas (2)",
  relopt.length === 2);
log("vistas con security_invoker=true (RLS respetado vía API)",
  relopt.every((r) => (r.o || "").includes("security_invoker=true")),
  relopt.map((r) => r.o).join(" ; "));

// ── 7. Vista = tabla tras el refresco ───────────────────────────────────────
const dif = await q(`
  select count(*)::int as n from asistencias a
   join asistencias_v v on v.id = a.id
  where v.dias_sin_asistir is distinct from a.dias_sin_asistir
     or v.pct_adherencia is distinct from a.pct_adherencia
     or v.frec_semanal is distinct from a.frec_semanal
     or v.status is distinct from a.status`);
log("asistencias_v coincide con la tabla en días/adherencia/frec/estado", dif[0].n === 0);

// ── 8. Casos deterministas ──────────────────────────────────────────────────
const vistas = await q("select * from asistencias_v order by id");
const pac = await q("select * from pacientes_v order by paciente_id");
log("P1 (sin actividad): 'Sin asistencias' y días NULL",
  vistas[0].status === "Sin asistencias" && vistas[0].dias_sin_asistir === null,
  `${vistas[0].status}/${vistas[0].dias_sin_asistir}`);
log("P2 (hace 5 días): Activo o En pausa (nunca Abandonó)",
  ["Activo", "En pausa"].includes(vistas[1].status), vistas[1].status);
log("P3 (legacy 51 sesiones): 'Abandonó' y NO bajan las sesiones",
  vistas[2].status === "Abandonó" && pac[2].sesiones_totales === 51,
  `${vistas[2].status}/${pac[2].sesiones_totales}`);
log("P4 (10/10 programadas): 'Completó tratamiento' con adherencia 100",
  vistas[3].status === "Completó tratamiento" && Number(vistas[3].pct_adherencia) === 100,
  `${vistas[3].status}/${vistas[3].pct_adherencia}`);
log("P5 (65 años): grupo derivado 'Adultos mayores: 60 a más'",
  pac[4].grupo_edad === "Adultos mayores: 60 a más", pac[4].grupo_edad);
log("pacientes_v trae nombre y celular (columnas útiles)",
  pac.every((r) => typeof r.nombre_completo === "string"));

// ── 9. Idempotencia: re-ejecutar el script nuevo ────────────────────────────
try {
  await db.exec(sqlNuevo);
  log("re-ejecutar el script completo no falla (idempotente)", true);
} catch (e) {
  log("re-ejecución falló", false, e.message);
}

// ── 10. Escritura estilo app: nueva visita hoy → vista sigue coincidiendo ──
await db.exec(`
insert into ingresos (id, paciente_id, fecha, zonas, terapia_estado, terapia_monto, total)
values (9, 2, current_date, 1, 'Efectivo', 30, 30)`);
const p2 = await q(`
  select a.dias_sin_asistir as guardado, v.dias_sin_asistir as vivo, v.status as estado
    from asistencias a join asistencias_v v on v.id = a.id
   where a.paciente_id = 2`);
log("nueva visita hoy → días 0 guardado y en vivo, estado Activo",
  p2[0].guardado === 0 && p2[0].vivo === 0 && p2[0].estado === "Activo",
  `${p2[0].guardado}/${p2[0].vivo}/${p2[0].estado}`);
const dif2 = await q(`
  select count(*)::int as n from asistencias a
   join asistencias_v v on v.id = a.id
  where v.dias_sin_asistir is distinct from a.dias_sin_asistir
     or v.status is distinct from a.status`);
log("tras la escritura, vista y tabla siguen cuadradas", dif2[0].n === 0);

// ── 11. La fórmula es consultable (pg_get_functiondef) ──────────────────────
const def = await q("select pg_get_functiondef('nor_dias_laborales(date)'::regprocedure) as d");
log("pg_get_functiondef devuelve el texto de la fórmula",
  def.length === 1 && def[0].d.includes("generate_series"));

console.log("\nResultado:", process.exitCode ? "HAY FALLOS" : "TODO OK");
