-- ═══════════════════════════════════════════════════════════════════════════
-- HISTORIAL MÉDICO — Cambios mínimos en la base de datos (Northerapy)
-- ═══════════════════════════════════════════════════════════════════════════
-- Objetivo: registrar la historia clínica del paciente por EPISODIOS de
-- atención, para poder ver, al abrir su ficha, sus antecedentes y qué otras
-- sesiones ha tenido (volvió por el mismo problema, volvió por otro, terminó
-- su tratamiento o lo abandonó).
--
-- Qué hace (resumen):
--   · Crea 1 tabla nueva:  episodios  (el historial de diagnósticos).
--   · Crea 1 vista nueva:  episodios_v (cada episodio con sus sesiones contadas).
--   · Backfill inicial (PARTE 4, opcional): 1 episodio por paciente existente
--     a partir de su diagnóstico actual, para que el historial no nazca vacío.
--
-- Qué NO toca (cero riesgo para lo ya creado):
--   · pacientes, asistencias e ingresos quedan exactamente igual: sus
--     columnas, triggers, vistas y datos NO se modifican.
--   · pacientes.diagnostico y pacientes.status siguen siendo el «estado
--     actual» del paciente; episodios guarda el «historial» alrededor de ellos.
--   · La app actual sigue funcionando igual, sin ningún cambio (todo es aditivo).
--
-- Propiedades: idempotente (puede re-ejecutarse sin duplicar nada) y no
-- requiere haber ejecutado ningún script previo.
-- Ejecutar en: Supabase Dashboard → SQL Editor → pegar todo → Run.

-- ── PARTE 0 · Situación actual (solo lectura) ───────────────────────────────
-- Hoy el diagnóstico vive en UNA sola columna (pacientes.diagnostico) que se
-- sobrescribe cuando el paciente vuelve con otro problema: el diagnóstico
-- anterior se pierde. No existe ninguna tabla que conserve la historia.
select count(*)                    as pacientes,
       count(diagnostico)          as con_diagnostico,
       count(distinct diagnostico) as diagnosticos_distintos
from pacientes;

select status, count(*) as pacientes_por_estado
from pacientes
group by status
order by pacientes_por_estado desc;

-- ── PARTE 1 · Tabla nueva: episodios (el historial médico) ──────────────────
-- Un episodio = un proceso de atención por un diagnóstico:
--   · 'activo'     → en tratamiento
--   · 'completado' → terminó su tratamiento (con fecha de cierre)
--   · 'abandonado' → cortó sin terminar (con fecha de última sesión)
-- Reglas de integridad protegidas por la propia BD:
--   · fecha_fin nunca menor que fecha_inicio
--   · un episodio cerrado siempre lleva fecha_fin
--   · (PARTE 3) un paciente no puede tener 2 episodios activos a la vez
create table if not exists episodios (
  id               bigint generated always as identity primary key,
  paciente_id      bigint not null references pacientes (paciente_id) on delete cascade,
  diagnostico      text not null,
  sistema_afectado text,
  fecha_inicio     date not null default current_date,
  fecha_fin        date,
  estado           text not null default 'activo'
                     check (estado in ('activo', 'completado', 'abandonado')),
  notas            text,
  created_at       timestamptz not null default now(),
  constraint episodios_rango_valido
    check (fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint episodios_cierre_con_fecha
    check (estado = 'activo' or fecha_fin is not null)
);

-- ── PARTE 2 · Seguridad (RLS): igual que el resto de tablas ─────────────────
-- Solo usuarios autenticados de la app pueden leer y escribir episodios.
alter table episodios enable row level security;

drop policy if exists "episodios_autenticados" on episodios;
create policy "episodios_autenticados" on episodios
  for all to authenticated
  using (true)
  with check (true);

-- ── PARTE 3 · Índices ────────────────────────────────────────────────────────
-- Consulta rápida del historial por paciente.
create index if not exists episodios_por_paciente
  on episodios (paciente_id, fecha_inicio desc);

-- Regla de negocio: un paciente no puede tener 2 episodios activos a la vez.
create unique index if not exists episodios_un_activo_por_paciente
  on episodios (paciente_id)
  where estado = 'activo';

-- ── PARTE 4 · Historial inicial para pacientes existentes (OPCIONAL) ────────
-- Crea 1 episodio por cada paciente que ya tiene diagnóstico, para que el
-- historial no nazca vacío:
--   · estado derivado de pacientes.status
--     ('Completó tratamiento' → completado, 'Abandonó' → abandonado, si no → activo)
--   · fecha_inicio = su primera sesión; fecha_fin = su última sesión registrada
-- Como hoy ningún paciente ha vuelto por un segundo problema, con esto cada
-- ficha queda con su episodio actual y la historia empezará a crecer sola
-- cuando alguien regrese. Si prefieres empezar el historial desde cero,
-- BORRA esta parte antes de ejecutar (no afecta a nada más).
-- Es idempotente: solo crea episodios de pacientes que aún no tienen ninguno.
insert into episodios (paciente_id, diagnostico, sistema_afectado, fecha_inicio, fecha_fin, estado)
select p.paciente_id,
       p.diagnostico,
       p.sistema_afectado,
       coalesce(p.primera_sesion,
                (select min(i.fecha) from ingresos i where i.paciente_id = p.paciente_id),
                current_date),
       case
         when p.status in ('Completó tratamiento', 'Abandonó') then
           coalesce((select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id),
                    p.primera_sesion, current_date)
         else null
       end,
       case p.status
         when 'Completó tratamiento' then 'completado'
         when 'Abandonó'            then 'abandonado'
         else 'activo'
       end
from pacientes p
where coalesce(p.diagnostico, '') <> ''
  and not exists (select 1 from episodios e where e.paciente_id = p.paciente_id);

-- ── PARTE 5 · Vista episodios_v: cada episodio con sus sesiones ─────────────
-- Las sesiones de cada episodio se atribuyen por rango de fechas sobre las
-- filas de ingresos que ya existen (tipo = 'sesion'): por eso NO hay que
-- tocar la tabla ingresos para saber cuántas sesiones tuvo cada episodio.
-- security_invoker = true → la vista respeta el RLS al consultarla vía API.
create or replace view episodios_v with (security_invoker = true) as
select e.id,
       e.paciente_id,
       p.nombre_completo,
       e.diagnostico,
       e.sistema_afectado,
       e.fecha_inicio,
       e.fecha_fin,
       e.estado,
       e.notas,
       count(i.id)  as sesiones,
       max(i.fecha) as ultima_sesion
from episodios e
join pacientes p on p.paciente_id = e.paciente_id
left join ingresos i
       on i.paciente_id = e.paciente_id
      and i.tipo = 'sesion'
      and i.fecha >= e.fecha_inicio
      and i.fecha <= coalesce(e.fecha_fin, 'infinity'::date)
group by e.id, p.paciente_id;

-- ── PARTE 6 · Verificación ───────────────────────────────────────────────────
-- 6.1 Episodios por estado (tras el backfill: 1 por paciente con diagnóstico).
select estado, count(*) as episodios
from episodios
group by estado
order by estado;

-- 6.2 Pacientes con más de un episodio (el caso «volvió después de un tiempo»).
--     Hoy debería devolver 0 filas; cuando un paciente regrese, aparecerá aquí.
select paciente_id, count(*) as episodios
from episodios
group by paciente_id
having count(*) > 1
order by episodios desc;

-- 6.3 Regla intacta: ningún paciente con 2 episodios activos (esperado: 0).
select count(*) as pacientes_con_dos_activos
from (select paciente_id
      from episodios
      where estado = 'activo'
      group by paciente_id
      having count(*) > 1) duplicados;

-- 6.4 El historial médico que verá la ficha del paciente:
--     cambia NOMBRE por el paciente que quieras revisar.
select e.nombre_completo, e.diagnostico, e.estado,
       e.fecha_inicio, e.fecha_fin, e.sesiones, e.ultima_sesion
from episodios_v e
where e.nombre_completo ilike '%NOMBRE%'
order by e.fecha_inicio;
