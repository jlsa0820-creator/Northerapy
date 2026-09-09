-- ═══════════════════════════════════════════════════════════════════════════
-- NORTHERAPY CRM — MEJORAS MÍNIMAS AL ESQUEMA (sin rediseño, sin tocar la app)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- FILOSOFÍA: el esquema de 3 tablas es correcto y NO hay que rediseñarlo.
-- Este script aplica 6 mejoras quirúrgicas que endurecen la base de datos
-- con CERO cambios de código en la plataforma (verificada):
--
--   1. Índices sobre las llaves foráneas y la fecha (escalabilidad).
--   2. ON DELETE CASCADE en las FK (borrar un paciente desde Supabase ya no
--      deja filas huérfanas; la app ya hacía la cascada manual y sigue igual).
--   3. Llaves primarias como IDENTITY (se acaban las IDs "max+1" manuales;
--      la app ya soporta ambos modos, inserta igual).
--   4. Integridad 1:1: un paciente no puede tener 2 filas de asistencias.
--   5. Normalizar los estados de pago a minúsculas + vocabulario controlado
--      (CORRIGE un problema real: la app compara en minúsculas, así que filas
--      con "Efectivo"/"Debe" capitalizados del Excel quedaban FUERA del
--      dashboard de ingresos y del módulo "Quién debe").
--   6. Columna `tipo` en ingresos ('sesion' | 'compra_paquete' |
--      'venta_producto'): hace EXPLÍCITA la regla "pago ≠ asistencia".
--      Hoy esa regla vive implícita en la convención zonas/monto; con `tipo`
--      queda documentada en los datos y se puede corregir a mano si un día
--      la convención no cuadra. Un trigger la rellena solo cuando falta.
--
-- REQUISITO: haber ejecutado antes formulas_escalables_northerapy.sql.
-- El script es IDEMPOTENTE: puedes re-ejecutarlo sin romper nada.
-- No borra datos, no toca RLS, no cambia ninguna fórmula de negocio.
--
-- CÓMO EJECUTARLO
--   1. Supabase → SQL Editor → New query.
--   2. Pega TODO este archivo y pulsa Run.
--   3. Revisa la PARTE 8 (verificación final): todo debe estar en verde.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Guardián: asegura que la capa de fórmulas existe ───────────────────────
do $$
begin
  if to_regprocedure('nor_dias_laborales(date)') is null then
    raise exception 'Falta ejecutar primero formulas_escalables_northerapy.sql.';
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 0 · DIAGNÓSTICO PREVIO (informativo, no cambia nada)
-- ───────────────────────────────────────────────────────────────────────────
-- Valores distintos de estado tal como están HOY (fíjate si hay mayúsculas):
select 'estados antes de normalizar' as diagnostico, e.estado, count(*) as filas
from (
  select terapia_estado as estado from ingresos
  union all select diclofenaco_estado from ingresos
  union all select ortopedico_estado from ingresos
) e
where e.estado is not null
group by e.estado
order by 3 desc;

-- Pacientes con más de una fila de asistencias (debería ser 0):
select 'pacientes con asistencias duplicadas' as diagnostico, count(*) as total
from (
  select paciente_id from asistencias
  group by paciente_id having count(*) > 1
) d;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 · ÍNDICES (escalabilidad: las FK no traen índice por defecto)
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists idx_asistencias_paciente  on asistencias (paciente_id);
create index if not exists idx_ingresos_paciente     on ingresos (paciente_id);
create index if not exists idx_ingresos_fecha         on ingresos (fecha);
create index if not exists idx_ingresos_paciente_fecha on ingresos (paciente_id, fecha);


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 · FK CON ON DELETE CASCADE (sin filas huérfanas nunca más)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_name    text;
  v_cascade boolean;
begin
  -- asistencias → pacientes
  select rc.conname, (rc.confdeltype = 'c') into v_name, v_cascade
    from pg_constraint rc
    join pg_class cl on cl.oid = rc.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname = 'public' and cl.relname = 'asistencias' and rc.contype = 'f';
  if v_name is not null and v_cascade then
    null;  -- ya tiene cascade: no hacer nada
  else
    if v_name is not null then
      execute format('alter table asistencias drop constraint %I', v_name);
    end if;
    alter table asistencias add constraint asistencias_paciente_fk
      foreign key (paciente_id) references pacientes (paciente_id)
      on delete cascade;
  end if;

  -- ingresos → pacientes
  select rc.conname, (rc.confdeltype = 'c') into v_name, v_cascade
    from pg_constraint rc
    join pg_class cl on cl.oid = rc.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname = 'public' and cl.relname = 'ingresos' and rc.contype = 'f';
  if v_name is not null and v_cascade then
    null;
  else
    if v_name is not null then
      execute format('alter table ingresos drop constraint %I', v_name);
    end if;
    alter table ingresos add constraint ingresos_paciente_fk
      foreign key (paciente_id) references pacientes (paciente_id)
      on delete cascade;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 · LLAVES PRIMARIAS → IDENTITY (adiós al "max+1" manual)
-- ───────────────────────────────────────────────────────────────────────────
-- BY DEFAULT (no ALWAYS): la app sigue pudiendo insertar con id explícito
-- (su ruta actual) y a la vez el editor de Supabase obtiene ids automáticos.
do $$
declare
  v_max bigint;
begin
  -- pacientes
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'pacientes'::regclass
                    and a.attname = 'paciente_id' and a.attidentity <> '') then
    alter table pacientes alter column paciente_id add generated by default as identity;
  end if;
  select coalesce(max(paciente_id), 0) + 1 into v_max from pacientes;
  execute format('alter table pacientes alter column paciente_id restart with %s', v_max);

  -- asistencias
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'asistencias'::regclass
                    and a.attname = 'id' and a.attidentity <> '') then
    alter table asistencias alter column id add generated by default as identity;
  end if;
  select coalesce(max(id), 0) + 1 into v_max from asistencias;
  execute format('alter table asistencias alter column id restart with %s', v_max);

  -- ingresos
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'ingresos'::regclass
                    and a.attname = 'id' and a.attidentity <> '') then
    alter table ingresos alter column id add generated by default as identity;
  end if;
  select coalesce(max(id), 0) + 1 into v_max from ingresos;
  execute format('alter table ingresos alter column id restart with %s', v_max);
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 · INTEGRIDAD 1:1 DE ASISTENCIAS (un resumen por paciente)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_dup integer;
begin
  select count(*) into v_dup
    from (select paciente_id from asistencias
          group by paciente_id having count(*) > 1) d;
  if v_dup = 0 then
    create unique index if not exists asistencias_paciente_uidx
      on asistencias (paciente_id);
  else
    raise notice 'OJO: hay % pacientes con más de una fila en asistencias. No creo el índice único hasta que fusiones las filas duplicadas.', v_dup;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 5 · NORMALIZAR ESTADOS DE PAGO + VOCABULARIO CONTROLADO
-- ───────────────────────────────────────────────────────────────────────────
-- La app compara en minúsculas ('efectivo', 'debe'...). Las filas migradas
-- del Excel con "Efectivo" / "Debe" / "No aplica" / "Cubierta" no las estaba
-- contando el dashboard de ingresos ni "Quién debe". Se pasan a minúsculas
-- con guion bajo y se fija el vocabulario con un CHECK.
update ingresos set
  terapia_estado = case when terapia_estado is null then null
    else nullif(replace(lower(btrim(terapia_estado)), ' ', '_'), '') end,
  diclofenaco_estado = case when diclofenaco_estado is null then null
    else nullif(replace(lower(btrim(diclofenaco_estado)), ' ', '_'), '') end,
  ortopedico_estado = case when ortopedico_estado is null then null
    else nullif(replace(lower(btrim(ortopedico_estado)), ' ', '_'), '') end;

do $$
declare
  v_raros text;
begin
  select string_agg(distinct e.estado, ', ') into v_raros
    from (
      select terapia_estado as estado from ingresos
      union select diclofenaco_estado from ingresos
      union select ortopedico_estado from ingresos
    ) e
   where e.estado is not null
     and e.estado not in ('efectivo','yape','tarjeta','debe','no_aplica','cubierta');
  if v_raros is null then
    alter table ingresos drop constraint if exists ingresos_estados_chk;
    alter table ingresos add constraint ingresos_estados_chk check (
      (terapia_estado    is null or terapia_estado    in ('efectivo','yape','tarjeta','debe','no_aplica','cubierta')) and
      (diclofenaco_estado is null or diclofenaco_estado in ('efectivo','yape','tarjeta','debe','no_aplica','cubierta')) and
      (ortopedico_estado  is null or ortopedico_estado  in ('efectivo','yape','tarjeta','debe','no_aplica','cubierta'))
    );
  else
    raise notice 'No pude crear el CHECK de estados: hay valores fuera del vocabulario (%). Normalízalos y re-ejecuta este script.', v_raros;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 6 · COLUMNA `tipo` EN INGRESOS (la regla "pago ≠ asistencia", explícita)
-- ───────────────────────────────────────────────────────────────────────────
--   'sesion'          → hubo asistencia ese día (zonas > 0)
--   'compra_paquete'  → compra del paquete de 5 sesiones (S/150, sin zonas)
--   'venta_producto'  → venta de diclofenaco/ortopédico sin sesión
-- La convención actual se preserva como valor por defecto (trigger), pero ya
-- puedes corregir a mano una fila si la convención no refleja la realidad.

alter table ingresos add column if not exists tipo text;

-- Clasificación del histórico (misma lógica que usa la app):
update ingresos set tipo = case
    when zonas > 0 then 'sesion'
    when coalesce(terapia_monto, 0) >= 100 then 'compra_paquete'
    else 'venta_producto'
  end
 where tipo is null;

alter table ingresos drop constraint if exists ingresos_tipo_chk;
alter table ingresos add constraint ingresos_tipo_chk
  check (tipo is null or tipo in ('sesion','compra_paquete','venta_producto'));

-- Relleno automático cuando falte (compatible con la app, que no envía `tipo`)
create or replace function nor_ingresos_tipo()
returns trigger
language plpgsql
as $$
begin
  if NEW.tipo is null then
    NEW.tipo := case
      when coalesce(NEW.zonas, 0) > 0 then 'sesion'
      when coalesce(NEW.terapia_monto, 0) >= 100 then 'compra_paquete'
      else 'venta_producto'
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ingresos_tipo on ingresos;
create trigger trg_ingresos_tipo
  before insert or update on ingresos
  for each row execute function nor_ingresos_tipo();

-- 6b) Las fórmulas ahora cuentan asistencias por `tipo` (resultados idénticos
--     con los datos actuales: la clasificación es equivalente a zonas > 0).

create or replace function nor_asistencias_formula()
returns trigger
language plpgsql
as $$
declare
  p_ses integer;
  p_prog integer;
  p_prim date;
  sesiones integer;
  programadas integer;
  base date;
begin
  NEW.pct_adherencia := case
    when coalesce(NEW.ses_programadas, 0) > 0 then
      least(100, round(100.0 * coalesce(NEW.ses_totales, 0) / NEW.ses_programadas))
    else 0
  end;

  NEW.dias_sin_asistir := nor_dias_laborales(NEW.ultima_asistencia);

  NEW.frec_semanal := round(
    (select count(*)
     from ingresos i
     where i.paciente_id = NEW.paciente_id
       and i.tipo = 'sesion'
       and i.fecha >= current_date - 28) / 4.0, 1);

  select p.sesiones_totales, p.sesiones_programadas, p.primera_sesion
    into p_ses, p_prog, p_prim
    from pacientes p
    where p.paciente_id = NEW.paciente_id;

  sesiones   := greatest(coalesce(NEW.ses_totales, 0), coalesce(p_ses, 0));
  programadas := coalesce(NEW.ses_programadas, p_prog);
  base := greatest(
    NEW.ultima_asistencia,
    (select max(i.fecha) from ingresos i where i.paciente_id = NEW.paciente_id));
  base := coalesce(base, p_prim);

  NEW.status := nor_estado(base, sesiones, programadas);
  return NEW;
end;
$$;

create or replace function nor_sincroniza_paciente(pid bigint)
returns void
language plpgsql
as $$
begin
  begin
    update asistencias s set
      ultima_asistencia = greatest(
        s.ultima_asistencia,
        (select max(i.fecha) from ingresos i
          where i.paciente_id = pid and i.tipo = 'sesion')),
      ses_totales = greatest(
        coalesce(s.ses_totales, 0),
        (select count(*) from ingresos i
          where i.paciente_id = pid and i.tipo = 'sesion'))
    where s.paciente_id = pid;

    if not found and exists (select 1 from ingresos i where i.paciente_id = pid) then
      begin
        insert into asistencias (id, paciente_id, ses_programadas, ses_totales, ultima_asistencia)
        values (
          (select coalesce(max(x.id), 0) + 1 from asistencias x),
          pid,
          (select p.sesiones_programadas from pacientes p where p.paciente_id = pid),
          (select count(*) from ingresos i where i.paciente_id = pid and i.tipo = 'sesion'),
          (select max(i.fecha) from ingresos i where i.paciente_id = pid and i.tipo = 'sesion')
        );
      exception when others then
        begin
          insert into asistencias (paciente_id, ses_programadas, ses_totales, ultima_asistencia)
          values (
            pid,
            (select p.sesiones_programadas from pacientes p where p.paciente_id = pid),
            (select count(*) from ingresos i where i.paciente_id = pid and i.tipo = 'sesion'),
            (select max(i.fecha) from ingresos i where i.paciente_id = pid and i.tipo = 'sesion')
          );
        exception when others then
          raise warning 'Northerapy: no se pudo crear la fila de asistencias del paciente % (%)', pid, sqlerrm;
        end;
      end;
    end if;
  exception when others then
    raise warning 'Northerapy: fallo sincronizando asistencias del paciente % (%)', pid, sqlerrm;
  end;

  begin
    update pacientes p set
      sesiones_totales = greatest(
        coalesce(p.sesiones_totales, 0),
        coalesce((select s.ses_totales from asistencias s where s.paciente_id = pid), 0))
    where p.paciente_id = pid;
  exception when others then
    raise warning 'Northerapy: fallo sincronizando pacientes % (%)', pid, sqlerrm;
  end;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 7 · VISTAS EN VIVO ACTUALIZADAS (predicado tipo-aware)
-- ───────────────────────────────────────────────────────────────────────────
-- Si aún no las tenías, se crean aquí; si ya las tenías, se actualizan.

drop view if exists asistencias_v cascade;
create view asistencias_v
with (security_invoker = true)
as
select
  a.id,
  a.paciente_id,
  p.nombre_completo,
  a.ultima_asistencia,
  a.ses_programadas,
  a.ses_totales,
  case
    when coalesce(a.ses_programadas, 0) > 0
      then least(100, round(100.0 * coalesce(a.ses_totales, 0) / a.ses_programadas))
    else 0
  end as pct_adherencia,
  nor_dias_laborales(a.ultima_asistencia) as dias_sin_asistir,
  round(
    (select count(*) from ingresos i
      where i.paciente_id = a.paciente_id
        and i.tipo = 'sesion'
        and i.fecha >= current_date - 28) / 4.0,
    1) as frec_semanal,
  nor_estado(
    coalesce(
      greatest(
        a.ultima_asistencia,
        (select max(i.fecha) from ingresos i where i.paciente_id = a.paciente_id)),
      p.primera_sesion),
    greatest(coalesce(a.ses_totales, 0), coalesce(p.sesiones_totales, 0)),
    coalesce(a.ses_programadas, p.sesiones_programadas)
  ) as status
from asistencias a
left join pacientes p on p.paciente_id = a.paciente_id;

drop view if exists pacientes_v cascade;
create view pacientes_v
with (security_invoker = true)
as
select
  p.paciente_id,
  p.nombre_completo,
  p.sexo,
  p.edad_valor,
  p.edad_unidad,
  coalesce(nor_grupo_edad(p.edad_valor, p.edad_unidad), p.grupo_edad) as grupo_edad,
  p.celular_principal,
  p.primera_sesion,
  p.sesiones_programadas,
  greatest(coalesce(p.sesiones_totales, 0), coalesce(a.ses_totales, 0)) as sesiones_totales,
  a.ultima_asistencia,
  case
    when coalesce(coalesce(p.sesiones_programadas, a.ses_programadas), 0) > 0
      then least(100, round(
        100.0 * greatest(coalesce(p.sesiones_totales, 0), coalesce(a.ses_totales, 0))
        / coalesce(p.sesiones_programadas, a.ses_programadas)))
    else 0
  end as pct_adherencia,
  nor_dias_laborales(
    coalesce(
      greatest(
        a.ultima_asistencia,
        (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id)),
      p.primera_sesion)) as dias_sin_asistir,
  round(
    (select count(*) from ingresos i
      where i.paciente_id = p.paciente_id
        and i.tipo = 'sesion'
        and i.fecha >= current_date - 28) / 4.0,
    1) as frec_semanal,
  nor_estado(
    coalesce(
      greatest(
        a.ultima_asistencia,
        (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id)),
      p.primera_sesion),
    greatest(coalesce(p.sesiones_totales, 0), coalesce(a.ses_totales, 0)),
    coalesce(p.sesiones_programadas, a.ses_programadas)
  ) as status
from pacientes p
left join asistencias a on a.paciente_id = p.paciente_id;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 8 · REFRESCO FINAL + VERIFICACIÓN
-- ───────────────────────────────────────────────────────────────────────────
select nor_refrescar_diario() as refresco_final_ok;

-- 8.1 Estructura: índices esperados (deben aparecer los idx_*, el único y las PK)
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('asistencias', 'ingresos', 'pacientes')
 order by tablename, indexname;

-- 8.2 FKs con cascade (confdeltype = 'c')
select conrelid::regclass as tabla, conname, confdeltype as borra_en_cascada
  from pg_constraint
 where contype = 'f'
   and conrelid in ('asistencias'::regclass, 'ingresos'::regclass);

-- 8.3 PKs como identity (attidentity = 'd' = by default)
select a.attrelid::regclass as tabla, a.attname as pk, a.attidentity as identity
  from pg_attribute a
 where a.attrelid in ('pacientes'::regclass, 'asistencias'::regclass, 'ingresos'::regclass)
   and a.attname in ('paciente_id', 'id') and a.attidentity <> '';

-- 8.4 Distribución de `tipo` (sesiones ≈ asistencias reales)
select tipo, count(*) as filas from ingresos group by tipo order by 2 desc;

-- 8.5 Estados tras normalizar (todo en minúsculas, sin variantes)
select 'estados tras normalizar' as verificacion, e.estado, count(*) as filas
from (
  select terapia_estado as estado from ingresos
  union all select diclofenaco_estado from ingresos
  union all select ortopedico_estado from ingresos
) e
where e.estado is not null
group by e.estado
order by 3 desc;

-- 8.6 Datos al día (esperado: 0 en las tres primeras; la última es informativa:
--     solo sube de 0 si corregiste a mano algún tipo al margen de la convención)
select
  (select count(*) from asistencias
    where dias_sin_asistir is distinct from nor_dias_laborales(ultima_asistencia)) as dias_viejos,
  (select count(*) from ingresos
    where total is distinct from coalesce(terapia_monto, 0) + coalesce(diclofenaco_monto, 0)
      + coalesce(ortopedico_monto, 0)) as totales_descuadrados,
  (select count(*) from ingresos
    where tipo is null or tipo not in ('sesion','compra_paquete','venta_producto')) as tipos_mal,
  (select count(*) from ingresos i
    where (i.tipo = 'sesion' and i.zonas <= 0)
     or (i.tipo = 'venta_producto' and i.zonas > 0)) as overrides_manuales;
