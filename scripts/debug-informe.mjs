// Debug: ¿cuál de los chequeos de la sección "5. Datos" no sale OK?
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
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
await db.exec(`
insert into pacientes values
 (1,'Paciente Nuevo', null, 30, 'años','Masculino', null, 'Abandonó', null, null, 0),
 (2,'Ana Reciente','Adultos: 30 a 59', 40, 'años','Femenino','987654321','Abandonó', '${diasAtras(5)}', null, 4),
 (3,'Aladino Gordillo','Adultos: 30 a 59', 57, 'años','Masculino','912345678','Abandonó', '${diasAtras(90)}', null, 51),
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
 (4, 3, '${diasAtras(42)}', 1, 'debe', 30, 'No aplica', null, 'No aplica', null, 30),
 (5, 3, '${diasAtras(41)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (6, 3, '${diasAtras(40)}', 1, 'cubierta', 0, 'No aplica', null, 'No aplica', null, 0),
 (7, 3, '${diasAtras(39)}', 1, 'Efectivo', 30, 'No aplica', null, 'No aplica', null, 30),
 (8, 3, '${diasAtras(45)}', 0, 'Efectivo', 150, 'No aplica', null, 'No aplica', null, 150)`);

await db.exec(readFileSync("/home/z/my-project/download/formulas_escalables_northerapy.sql", "utf8"));
await db.exec(readFileSync("/home/z/my-project/download/verificar_actualizacion_diaria.sql", "utf8"));

const rows = (await db.query("select * from nor_reporte_actualizacion()")).rows;
for (const r of rows) console.log(`${r.seccion} | ${r.componente} | ${r.estado} | ${r.detalle}`);

// Detalle del fallo (si hay): compara pacientes.status vs fórmula
const det = (await db.query(`
  select p.paciente_id, p.nombre_completo, p.status as guardado,
         nor_estado(
           coalesce(greatest(a.ultima_asistencia,
             (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id)),
             p.primera_sesion),
           greatest(coalesce(p.sesiones_totales, 0), coalesce(a.ses_totales, 0)),
           coalesce(p.sesiones_programadas, a.ses_programadas)) as esperado
  from pacientes p left join asistencias a on a.paciente_id = p.paciente_id
  where p.status is distinct from nor_estado(
    coalesce(greatest(a.ultima_asistencia,
      (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id)),
      p.primera_sesion),
    greatest(coalesce(p.sesiones_totales, 0), coalesce(a.ses_totales, 0)),
    coalesce(p.sesiones_programadas, a.ses_programadas))`)).rows;
console.log("\nPacientes con estado distinto al esperado:", JSON.stringify(det, null, 2));
