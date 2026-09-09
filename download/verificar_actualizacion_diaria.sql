-- ═══════════════════════════════════════════════════════════════════════════
-- NORTHERAPY CRM — ACTUALIZACIÓN DIARIA: VERIFICARLA, COMPLETARLA Y VERLA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RESPUESTA A: "¿va a actualizarse diariamente? no veo la fórmula en la
-- columna dias_sin_asistir"
--
-- POR QUÉ NO VES UNA FÓRMULA "DENTRO" DE LA COLUMNA
--   En Postgres/Supabase las fórmulas NO viven pegadas a las celdas (como en
--   Excel o Google Sheets). Existe algo parecido ("columna generada"), pero
--   Postgres SOLO permite columnas generadas con fórmulas inmutables, y
--   current_date está prohibido porque cambia con el tiempo. "Días sin
--   asistir" depende de HOY, así que nunca podría ser una columna generada.
--   Por eso la fórmula vive en piezas separadas (todas ya instaladas o las
--   instala este script):
--
--     · nor_dias_laborales()     → LA fórmula          (Database → Functions)
--     · trg_asistencias_formula  → la aplica al escribir (Database → Triggers)
--     · tarea pg_cron diaria     → refresca TODAS las filas cada día a las
--                                  09:00 UTC = 04:00 hora de Perú
--     · asistencias_v / pacientes_v → vistas "en vivo" donde la fórmula SÍ es
--       la definición de la columna y el valor se calcula AL MOMENTO de mirar
--       la vista: nunca se pasan de moda, ni siquiera hace falta el cron.
--
-- QUÉ HACE ESTE SCRIPT (idempotente: puedes re-ejecutarlo cuando quieras)
--   PARTE A  Informe de diagnóstico: qué hay instalado ahora mismo
--   PARTE B  Asegura el trabajo diario (activa pg_cron y (re)programa la tarea)
--   PARTE C  Crea las vistas "en vivo" asistencias_v y pacientes_v
--   PARTE D  Prueba el refresco AHORA MISMO y muestra la fórmula por dentro
--   PARTE E  Informe final: cada fila debe decir OK
--
-- CÓMO EJECUTARLO
--   1. Supabase → SQL Editor → New query.
--   2. Pega TODO este archivo y pulsa Run.
--   3. Mira el ÚLTIMO resultado (PARTE E): cada fila debería decir OK.
--      Si algo dice FALTA o NO DISPONIBLE, su columna "detalle" te dice
--      exactamente cómo arreglarlo (1 minuto) y luego re-ejecuta este archivo.
--
--   Requisito: haber ejecutado antes formulas_escalables_northerapy.sql
--   (si falta, este script se detiene con un mensaje claro en vez de fallar).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Guardián: asegura que las fórmulas base existen ─────────────────────────
do $$
begin
  if to_regprocedure('nor_dias_laborales(date)') is null
     or to_regprocedure('nor_refrescar_diario()') is null then
    raise exception 'Falta ejecutar primero formulas_escalables_northerapy.sql (no encuentro las funciones nor_*). Ejecútalo completo y luego vuelve a correr este archivo.';
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE A · FUNCIÓN DEL INFORME + DIAGNÓSTICO INICIAL
-- ───────────────────────────────────────────────────────────────────────────
-- Una sola tabla con el estado de TODOS los mecanismos de actualización.
-- Reutilizable cuando quieras:  select * from nor_reporte_actualizacion();

create or replace function nor_reporte_actualizacion()
returns table (seccion text, componente text, estado text, detalle text)
language plpgsql
stable
as $$
declare
  v_bool   boolean;
  v_active boolean;
  v_sched  text;
  v_status text;
  v_msg    text;
  v_ts     timestamptz;
  v_int    integer;
begin
  -- ── 1. Fórmulas instaladas ──────────────────────────────────────────────
  return query select '1. Fórmulas', 'nor_dias_laborales(date)',
    case when to_regprocedure('nor_dias_laborales(date)') is null then 'FALTA' else 'OK' end,
    'días LABORALES desde ultima_asistencia hasta HOY (la fórmula)';
  return query select '1. Fórmulas', 'nor_estado(date,integer,integer)',
    case when to_regprocedure('nor_estado(date,integer,integer)') is null then 'FALTA' else 'OK' end,
    'Activo / En pausa / Abandonó / Completó tratamiento / Sin asistencias';
  return query select '1. Fórmulas', 'nor_refrescar_diario()',
    case when to_regprocedure('nor_refrescar_diario()') is null then 'FALTA' else 'OK' end,
    'recalcula TODAS las filas de golpe (es lo que ejecuta la tarea diaria)';

  -- ── 2. Triggers instalados (la fórmula se aplica sola al escribir) ──────
  v_bool := exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ingresos'
      and t.tgname = 'trg_ingresos_formula' and not t.tgisinternal);
  return query select '2. Triggers', 'trg_ingresos_formula',
    case when v_bool then 'OK' else 'FALTA' end,
    'ingresos.total = terapia + diclofenaco + ortopédico en cada escritura';

  v_bool := exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'asistencias'
      and t.tgname = 'trg_asistencias_formula' and not t.tgisinternal);
  return query select '2. Triggers', 'trg_asistencias_formula',
    case when v_bool then 'OK' else 'FALTA' end,
    'dias_sin_asistir / adherencia / frecuencia / estado recalculados al escribir';

  v_bool := exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'pacientes'
      and t.tgname = 'trg_pacientes_formula' and not t.tgisinternal);
  return query select '2. Triggers', 'trg_pacientes_formula',
    case when v_bool then 'OK' else 'FALTA' end,
    'grupo_edad y status recalculados al escribir';

  v_bool := exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ingresos'
      and t.tgname = 'trg_ingresos_sincroniza' and not t.tgisinternal);
  return query select '2. Triggers', 'trg_ingresos_sincroniza',
    case when v_bool then 'OK' else 'FALTA' end,
    'cada ingreso actualiza automáticamente última asistencia y contadores';

  v_bool := exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'asistencias'
      and t.tgname = 'trg_asistencias_sincroniza' and not t.tgisinternal);
  return query select '2. Triggers', 'trg_asistencias_sincroniza',
    case when v_bool then 'OK' else 'FALTA' end,
    'mantiene coherentes las sesiones_totales del paciente';

  -- ── 3. Actualización diaria (pg_cron) ───────────────────────────────────
  v_bool := exists (select 1 from pg_extension where extname = 'pg_cron');
  return query select '3. Diario', 'extensión pg_cron',
    case when v_bool then 'OK' else 'NO DISPONIBLE' end,
    case when v_bool then 'motor de tareas programadas de Postgres'
         else 'actívalo: Dashboard → Database → Extensions → buscar "pg_cron" → Enable; luego re-ejecuta este script' end;

  if v_bool then
    begin
      select j.active, j.schedule into v_active, v_sched
        from cron.job j
       where j.jobname = 'northerapy_refresco_diario';
      if found then
        return query select '3. Diario', 'tarea northerapy_refresco_diario',
          case when v_active then 'OK' else 'PAUSADA' end,
          'cada día a las ' || coalesce(v_sched, '0 9 * * *') || ' (09:00 UTC = 04:00 Perú) ejecuta select nor_refrescar_diario()';
      else
        return query select '3. Diario', 'tarea northerapy_refresco_diario', 'FALTA',
          'ejecuta la PARTE B de este script (o re-ejecuta el archivo completo)';
      end if;
    exception when others then
      return query select '3. Diario', 'tarea northerapy_refresco_diario', 'ERROR',
        'no se pudo consultar cron.job: ' || sqlerrm;
    end;

    begin
      select r.status, r.return_message, r.start_time into v_status, v_msg, v_ts
        from cron.job_run_details r
        join cron.job j on j.jobid = r.jobid
       where j.jobname = 'northerapy_refresco_diario'
       order by r.start_time desc
       limit 1;
      if found then
        return query select '3. Diario', 'última ejecución de la tarea',
          case when v_status = 'succeeded' then 'OK'
               when v_status = 'failed' then 'FALLÓ'
               else coalesce(upper(v_status), '?') end,
          coalesce(to_char(v_ts, 'YYYY-MM-DD HH24:MI') || ' UTC — ' || coalesce(nullif(v_msg, ''), v_status), '');
      else
        return query select '3. Diario', 'última ejecución de la tarea', 'PENDIENTE',
          'aún no ha corrido: la primera ejecución es a las 04:00 hora de Perú';
      end if;
    exception when others then
      return query select '3. Diario', 'última ejecución de la tarea', 'SIN DATOS', sqlerrm;
    end;
  else
    return query select '3. Diario', 'tarea northerapy_refresco_diario', 'NO DISPONIBLE',
      'requiere pg_cron (mira la fila "extensión pg_cron" de arriba)';
    return query select '3. Diario', 'última ejecución de la tarea', 'NO DISPONIBLE',
      'requiere pg_cron (mira la fila "extensión pg_cron" de arriba)';
  end if;

  -- ── 4. Vistas en vivo ───────────────────────────────────────────────────
  return query select '4. Vistas en vivo', 'asistencias_v',
    case when to_regclass('public.asistencias_v') is null then 'FALTA' else 'OK' end,
    'días/adherencia/frecuencia/estado calculados AL MOMENTO de consultarla (nunca envejecen)';
  return query select '4. Vistas en vivo', 'pacientes_v',
    case when to_regclass('public.pacientes_v') is null then 'FALTA' else 'OK' end,
    'ídem + nombre y celular del paciente (Tabla Editor → sección vistas)';

  -- ── 5. ¿Los datos están al día de HOY? ─────────────────────────────────
  select count(*) into v_int from asistencias
   where dias_sin_asistir is distinct from nor_dias_laborales(ultima_asistencia);
  return query select '5. Datos', 'dias_sin_asistir al día de HOY',
    case when v_int = 0 then 'OK' else 'ATENCIÓN: ' || v_int::text end,
    case when v_int = 0 then 'todas las filas coinciden con la fórmula evaluada con la fecha de hoy'
         else 'hay filas viejas → ejecuta: select nor_refrescar_diario();' end;

  select count(*) into v_int from pacientes p
   left join asistencias a on a.paciente_id = p.paciente_id
   where p.status is distinct from nor_estado(
     coalesce(greatest(a.ultima_asistencia,
       (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id)),
       p.primera_sesion),
     greatest(coalesce(p.sesiones_totales, 0), coalesce(a.ses_totales, 0)),
     coalesce(p.sesiones_programadas, a.ses_programadas));
  return query select '5. Datos', 'status de pacientes al día',
    case when v_int = 0 then 'OK' else 'ATENCIÓN: ' || v_int::text end,
    case when v_int = 0 then 'todos los estados coinciden con la fórmula evaluada hoy'
         else 'hay estados viejos → ejecuta: select nor_refrescar_diario();' end;

  select count(*) into v_int from ingresos
   where total is distinct from (
     coalesce(terapia_monto, 0) + coalesce(diclofenaco_monto, 0) + coalesce(ortopedico_monto, 0));
  return query select '5. Datos', 'totales de ingresos cuadrados',
    case when v_int = 0 then 'OK' else 'ATENCIÓN: ' || v_int::text end,
    case when v_int = 0 then 'todos los total = terapia + diclofenaco + ortopédico'
         else 'hay totales descuadrados (no debería pasar: el trigger los corrige)' end;
end;
$$;

-- Diagnóstico ANTES de los cambios (guárdalo mentalmente para comparar con la PARTE E)
select * from nor_reporte_actualizacion();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE B · ASEGURAR EL TRABAJO DIARIO (pg_cron)
-- ───────────────────────────────────────────────────────────────────────────
-- La tarea "northerapy_refresco_diario" re-evalúa dias_sin_asistir, status y
-- frec_semanal de TODAS las filas cada día a las 09:00 UTC (04:00 en Perú),
-- aunque nadie haya escrito nada. Sin ella, la tabla solo se refresca cuando
-- alguien registra algo (triggers) — la app, en cambio, siempre calcula en
-- vivo, así que nunca muestra valores viejos.

do $$
declare
  v_ok boolean := false;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    v_ok := true;
  else
    begin
      create extension if not exists pg_cron;
      v_ok := true;
    exception when others then
      raise notice 'pg_cron no se pudo activar desde SQL: %', sqlerrm;
      raise notice 'ACTÍVALO A MANO (1 minuto):';
      raise notice '   Dashboard → Database → Extensions → buscar "pg_cron" → Enable';
      raise notice '   Después vuelve a ejecutar este archivo completo (es seguro).';
    end;
  end if;

  if v_ok then
    begin
      perform cron.unschedule('northerapy_refresco_diario');
    exception when others then
      null;  -- la tarea aún no existía
    end;
    begin
      perform cron.schedule('northerapy_refresco_diario', '0 9 * * *',
        'select nor_refrescar_diario()');
      raise notice 'LISTO: tarea diaria programada a las 09:00 UTC = 04:00 hora de Perú.';
    exception when others then
      raise notice 'No se pudo programar la tarea diaria: %', sqlerrm;
    end;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE C · VISTAS "EN VIVO" (aquí SÍ ves la fórmula, y nunca envejecen)
-- ───────────────────────────────────────────────────────────────────────────
-- Ábrelas en el Table Editor (aparecen como vistas, junto a las tablas).
-- Sus columnas calculadas se evalúan CON LA FECHA DE HOY cada vez que las
-- miras: mañana verás 158 donde hoy ves 157, sin que nadie toque nada.
-- ⚠ Son solo para MIRAR: para editar usa las tablas normales (asistencias,
-- pacientes) o la app del CRM — los triggers las mantienen cuadradas.

-- C.1) asistencias_v: el resumen de cada paciente, siempre fresco
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
        and i.zonas > 0
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

-- C.2) pacientes_v: cada paciente con sus métricas siempre frescas
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
        and i.zonas > 0
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
-- PARTE D · PROBAR EL MECANISMO AHORA MISMO
-- ───────────────────────────────────────────────────────────────────────────

-- D.1) Refresco manual (exactamente lo que la tarea hará cada día a las 04:00)
select nor_refrescar_diario() as refresco_manual_ok;

-- D.2) Guardado vs en vivo: tras el refresco deben salir IGUAL en todas
select
  a.id,
  a.paciente_id,
  p.nombre_completo,
  a.ultima_asistencia,
  a.dias_sin_asistir as valor_guardado,
  nor_dias_laborales(a.ultima_asistencia) as valor_en_vivo,
  case when a.dias_sin_asistir is not distinct from nor_dias_laborales(a.ultima_asistencia)
       then 'IGUAL (al día)'
       else 'DISTINTO (falta refrescar)' end as diagnostico
from asistencias a
left join pacientes p on p.paciente_id = a.paciente_id
order by a.dias_sin_asistir desc nulls last
limit 10;

-- D.3) LA fórmula, por dentro (texto completo de la función)
select pg_get_functiondef('nor_dias_laborales(date)'::regprocedure) as la_formula_de_dias_sin_asistir;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE E · INFORME FINAL (cada fila debería decir OK)
-- ───────────────────────────────────────────────────────────────────────────
select * from nor_reporte_actualizacion();
