-- ═══════════════════════════════════════════════════════════════════════════
-- NORTHERAPY CRM — FÓRMULAS ESCALABLES EN LA BASE DE DATOS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE ESTE SCRIPT
--   Convierte en fórmulas (calculadas automáticamente por la base de datos)
--   las columnas que antes quedaban congeladas con números estáticos:
--
--   ingresos.total            → terapia_monto + diclofenaco_monto + ortopedico_monto
--   asistencias.pct_adherencia→ ses_totales / ses_programadas (0 si no hay programadas)
--   asistencias.dias_sin_asistir → días LABORALES (lun–vie) desde ultima_asistencia hasta hoy
--   asistencias.frec_semanal  → sesiones de los últimos 28 días ÷ 4
--   asistencias.status        → fórmula de estado (misma que la app)
--   pacientes.status          → fórmula de estado (misma que la app)
--   pacientes.grupo_edad      → derivada de edad_valor + edad_unidad
--   pacientes.sesiones_totales y asistencias.ses_totales / ultima_asistencia
--     → se sincronizan automáticamente cada vez que cambia un ingreso
--
--   La app del CRM usa exactamente las mismas fórmulas, así que ambos
--   sistemas siempre coinciden. El script es IDEMPOTENTE: puedes ejecutarlo
--   varias veces sin romper nada.
--
-- CÓMO EJECUTARLO
--   1. Entra a tu panel de Supabase → SQL Editor → New query.
--   2. Copia y pega TODO este archivo y pulsa Run.
--   3. Listo: la sección final muestra chequeos de verificación.
--
-- SEGURIDAD
--   · No borra ni modifica datos de pacientes, sesiones o pagos: solo
--     recalcula columnas derivadas y añade triggers.
--   · No toca las políticas RLS: siguen exactamente igual.
--   · Los contadores históricos NUNCA bajan: si un paciente tiene más
--     sesiones registradas en asistencias que filas en ingresos (datos
--     importados de tu Excel), se conserva el número mayor (GREATEST).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 · FUNCIONES (las fórmulas, en un solo lugar editable)
-- ───────────────────────────────────────────────────────────────────────────

-- Días laborales (lun–vie) transcurridos desde una fecha (exclusiva) hasta hoy.
-- Si la fecha es NULL → NULL. Si la fecha es hoy o futura → 0.
create or replace function nor_dias_laborales(d date)
returns integer
language sql
stable
as $$
  select case
    when d is null then null
    else (
      select count(*)::int
      from generate_series(d + 1, current_date, interval '1 day') g
      where extract(isodow from g) < 6
    )
  end;
$$;

-- Grupo de edad derivado del valor numérico y la unidad.
-- ⚠️ Si alguna etiqueta no coincide con las que usas, edítala aquí
--    (y también en la app, en src/lib/types.ts → grupoEdadDeValor).
create or replace function nor_grupo_edad(edad numeric, unidad text)
returns text
language sql
immutable
as $$
  select case
    when edad is null then null
    when coalesce(unidad, 'años') = 'meses' then 'Bebés: 0 a 2'
    when edad < 3   then 'Bebés: 0 a 2'
    when edad < 12  then 'Niños: 3 a 11'
    when edad < 18  then 'Adolescente: 12 a 17'
    when edad < 30  then 'Joven: 18 a 29'
    when edad < 60  then 'Adultos: 30 a 59'
    else 'Adultos mayores: 60 a más'
  end;
$$;

-- Estado del paciente (misma fórmula que la app, "única fuente de verdad"):
--   · Completó tratamiento → programadas > 0 y sesiones >= programadas
--   · Sin asistencias     → sin fecha base y sin sesiones
--   · Activo              → hasta 2 días laborales sin asistir
--   · En pausa            → hasta 10 días laborales sin asistir
--   · Abandonó            → más de 10 días laborales sin asistir
create or replace function nor_estado(base date, sesiones integer, programadas integer)
returns text
language plpgsql
stable
as $$
declare
  dias integer;
begin
  if coalesce(programadas, 0) > 0 and coalesce(sesiones, 0) >= programadas then
    return 'Completó tratamiento';
  end if;
  if base is null then
    if coalesce(sesiones, 0) = 0 then
      return 'Sin asistencias';
    end if;
    return 'Activo';  -- tiene sesiones pero sin fecha registrada
  end if;
  dias := nor_dias_laborales(base);
  if dias <= 2 then return 'Activo'; end if;
  if dias <= 10 then return 'En pausa'; end if;
  return 'Abandonó';
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 · TRIGGERS (las fórmulas se aplican solas en cada escritura)
-- ───────────────────────────────────────────────────────────────────────────

-- 2a) ingresos: total siempre recalculado (antes de insertar/actualizar)
create or replace function nor_ingresos_formula()
returns trigger
language plpgsql
as $$
begin
  NEW.total := coalesce(NEW.terapia_monto, 0)
             + coalesce(NEW.diclofenaco_monto, 0)
             + coalesce(NEW.ortopedico_monto, 0);
  return NEW;
end;
$$;

drop trigger if exists trg_ingresos_formula on ingresos;
create trigger trg_ingresos_formula
  before insert or update on ingresos
  for each row execute function nor_ingresos_formula();


-- 2b) asistencias: adherencia, días, frecuencia y estado recalculados
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
  -- Adherencia (%)
  NEW.pct_adherencia := case
    when coalesce(NEW.ses_programadas, 0) > 0 then
      least(100, round(100.0 * coalesce(NEW.ses_totales, 0) / NEW.ses_programadas))
    else 0
  end;

  -- Días sin asistir (laborables, desde la última asistencia)
  NEW.dias_sin_asistir := nor_dias_laborales(NEW.ultima_asistencia);

  -- Frecuencia semanal (sesiones de los últimos 28 días ÷ 4)
  NEW.frec_semanal := round(
    (select count(*)
     from ingresos i
     where i.paciente_id = NEW.paciente_id
       and i.zonas > 0
       and i.fecha >= current_date - 28) / 4.0, 1);

  -- Estado
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

drop trigger if exists trg_asistencias_formula on asistencias;
create trigger trg_asistencias_formula
  before insert or update on asistencias
  for each row execute function nor_asistencias_formula();


-- 2c) pacientes: grupo de edad y estado recalculados
create or replace function nor_pacientes_formula()
returns trigger
language plpgsql
as $$
declare
  a_ses integer;
  a_prog integer;
  a_ult date;
  sesiones integer;
  programadas integer;
  base date;
begin
  -- Grupo de edad: si hay edad numérica se deriva; si no, se respeta el valor manual
  NEW.grupo_edad := coalesce(nor_grupo_edad(NEW.edad_valor, NEW.edad_unidad), NEW.grupo_edad);

  -- Estado
  select s.ses_totales, s.ses_programadas, s.ultima_asistencia
    into a_ses, a_prog, a_ult
    from asistencias s
    where s.paciente_id = NEW.paciente_id;

  sesiones   := greatest(coalesce(NEW.sesiones_totales, 0), coalesce(a_ses, 0));
  programadas := coalesce(NEW.sesiones_programadas, a_prog);
  base := greatest(
    a_ult,
    (select max(i.fecha) from ingresos i where i.paciente_id = NEW.paciente_id));
  base := coalesce(base, NEW.primera_sesion);

  NEW.status := nor_estado(base, sesiones, programadas);
  return NEW;
end;
$$;

drop trigger if exists trg_pacientes_formula on pacientes;
create trigger trg_pacientes_formula
  before insert or update on pacientes
  for each row execute function nor_pacientes_formula();


-- 2d) ingresos → sincroniza automáticamente el resumen del paciente
--     (última asistencia, contadores de sesiones) en asistencias y pacientes.
--     Así, aunque edites o borres filas directamente aquí en Supabase,
--     los resúmenes nunca quedan desactualizados.
create or replace function nor_sincroniza_paciente(pid bigint)
returns void
language plpgsql
as $$
begin
  begin
    update asistencias s set
      ultima_asistencia = greatest(
        s.ultima_asistencia,
        (select max(i.fecha) from ingresos i where i.paciente_id = pid and i.zonas > 0)),
      ses_totales = greatest(
        coalesce(s.ses_totales, 0),
        (select count(*) from ingresos i where i.paciente_id = pid and i.zonas > 0))
    where s.paciente_id = pid;

    if not found and exists (select 1 from ingresos i where i.paciente_id = pid) then
      -- El paciente tiene ingresos pero aún no fila de resumen: crearla
      begin
        insert into asistencias (id, paciente_id, ses_programadas, ses_totales, ultima_asistencia)
        values (
          (select coalesce(max(x.id), 0) + 1 from asistencias x),
          pid,
          (select p.sesiones_programadas from pacientes p where p.paciente_id = pid),
          (select count(*) from ingresos i where i.paciente_id = pid and i.zonas > 0),
          (select max(i.fecha) from ingresos i where i.paciente_id = pid and i.zonas > 0)
        );
      exception when others then
        begin
          -- La PK se autogenera: reintentar sin id
          insert into asistencias (paciente_id, ses_programadas, ses_totales, ultima_asistencia)
          values (
            pid,
            (select p.sesiones_programadas from pacientes p where p.paciente_id = pid),
            (select count(*) from ingresos i where i.paciente_id = pid and i.zonas > 0),
            (select max(i.fecha) from ingresos i where i.paciente_id = pid and i.zonas > 0)
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

create or replace function nor_ingresos_sincroniza()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    perform nor_sincroniza_paciente(OLD.paciente_id);
  elsif TG_OP = 'UPDATE' and OLD.paciente_id is distinct from NEW.paciente_id then
    perform nor_sincroniza_paciente(OLD.paciente_id);
    perform nor_sincroniza_paciente(NEW.paciente_id);
  else
    perform nor_sincroniza_paciente(NEW.paciente_id);
  end if;
  return null;  -- en triggers AFTER el valor de retorno se ignora
end;
$$;

drop trigger if exists trg_ingresos_sincroniza on ingresos;
create trigger trg_ingresos_sincroniza
  after insert or update or delete on ingresos
  for each row execute function nor_ingresos_sincroniza();


-- 2e) asistencias → sincroniza el contador de sesiones del paciente
--     (para que también se propague si editas asistencias directamente aquí)
create or replace function nor_asistencias_sincroniza()
returns trigger
language plpgsql
as $$
begin
  begin
    update pacientes p set
      sesiones_totales = greatest(
        coalesce(p.sesiones_totales, 0),
        coalesce(NEW.ses_totales, 0))
    where p.paciente_id = NEW.paciente_id;
  exception when others then
    raise warning 'Northerapy: fallo sincronizando pacientes desde asistencias % (%)', NEW.paciente_id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_asistencias_sincroniza on asistencias;
create trigger trg_asistencias_sincroniza
  after insert or update on asistencias
  for each row execute function nor_asistencias_sincroniza();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 · RECONCILIACIÓN (recalcula TODAS las filas existentes)
-- ───────────────────────────────────────────────────────────────────────────

-- 3a) Copiar sesiones programadas del paciente cuando falten en asistencias
update asistencias s set
  ses_programadas = coalesce(
    s.ses_programadas,
    (select p.sesiones_programadas from pacientes p where p.paciente_id = s.paciente_id));

-- 3b) Última asistencia y contadores: piso = lo que diga ingresos
--     (GREATEST: nunca baja el histórico importado de tu Excel)
update asistencias s set
  ultima_asistencia = greatest(
    s.ultima_asistencia,
    (select max(i.fecha) from ingresos i where i.paciente_id = s.paciente_id and i.zonas > 0)),
  ses_totales = greatest(
    coalesce(s.ses_totales, 0),
    (select count(*) from ingresos i where i.paciente_id = s.paciente_id and i.zonas > 0));

-- 3c) Contador de sesiones del paciente al día
update pacientes p set
  sesiones_totales = greatest(
    coalesce(p.sesiones_totales, 0),
    coalesce((select s.ses_totales from asistencias s where s.paciente_id = p.paciente_id), 0));

-- 3d) Crear filas de asistencias para pacientes que tienen sesiones en
--     ingresos pero todavía no fila de resumen
do $$
begin
  begin
    insert into asistencias (id, paciente_id, ses_programadas, ses_totales, ultima_asistencia)
    select
      (select coalesce(max(x.id), 0) from asistencias x) + row_number() over (),
      p.paciente_id,
      p.sesiones_programadas,
      (select count(*) from ingresos i where i.paciente_id = p.paciente_id and i.zonas > 0),
      (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id and i.zonas > 0)
    from pacientes p
    where not exists (select 1 from asistencias s where s.paciente_id = p.paciente_id)
      and exists (select 1 from ingresos i where i.paciente_id = p.paciente_id and i.zonas > 0);
  exception when others then
    begin
      insert into asistencias (paciente_id, ses_programadas, ses_totales, ultima_asistencia)
      select
        p.paciente_id,
        p.sesiones_programadas,
        (select count(*) from ingresos i where i.paciente_id = p.paciente_id and i.zonas > 0),
        (select max(i.fecha) from ingresos i where i.paciente_id = p.paciente_id and i.zonas > 0)
      from pacientes p
      where not exists (select 1 from asistencias s where s.paciente_id = p.paciente_id)
        and exists (select 1 from ingresos i where i.paciente_id = p.paciente_id and i.zonas > 0);
    exception when others then
      raise notice 'No se pudieron crear filas nuevas de asistencias: %', sqlerrm;
    end;
  end;
end $$;

-- 3e) Disparar el recálculo de fórmulas sobre todas las filas existentes
--     (los triggers de la Parte 2 hacen el trabajo)
update ingresos set total = total;
update asistencias set pct_adherencia = pct_adherencia;
update pacientes set status = status;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 · REFRESCO DIARIO OPCIONAL (pg_cron)
-- ───────────────────────────────────────────────────────────────────────────
-- dias_sin_asistir, frec_semanal y status dependen de la FECHA de hoy:
-- se recalculan solos cada vez que se escribe algo, pero si nadie escribe
-- nada durante varios días, la tabla se queda "vieja". Esta tarea diaria
-- la refresca a las 09:00 UTC (04:00 en Perú).
-- La app del CRM siempre muestra los valores calculados en vivo, así que
-- esto es solo para que la tabla en Supabase también se vea al día.

create or replace function nor_refrescar_diario()
returns void
language plpgsql
as $$
begin
  update asistencias set dias_sin_asistir = dias_sin_asistir;  -- triggers recalculan
  update pacientes set status = status;                        -- triggers recalculan
end;
$$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron no disponible (%) — omito el programador diario. La app sigue calculando todo en vivo.', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('northerapy_refresco_diario');
  exception when others then
    null;  -- no existía la tarea
  end;
  perform cron.schedule('northerapy_refresco_diario', '0 9 * * *', 'select nor_refrescar_diario()');
  raise notice 'Refresco diario programado a las 09:00 UTC (04:00 hora de Perú).';
exception when others then
  raise notice 'No se pudo programar el refresco diario: %', sqlerrm;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 5 · CHEQUEOS DE VERIFICACIÓN (resultados esperados: 0 filas mal)
-- ───────────────────────────────────────────────────────────────────────────

-- Totales de ingresos descuadrados (esperado: 0)
select
  'ingresos con total descuadrado' as chequeo,
  count(*) as filas_mal
from ingresos
where total is distinct from (
  coalesce(terapia_monto, 0) + coalesce(diclofenaco_monto, 0) + coalesce(ortopedico_monto, 0));

-- Adherencia descuadrada (esperado: 0)
select
  'asistencias con adherencia descuadrada' as chequeo,
  count(*) as filas_mal
from asistencias
where pct_adherencia is distinct from (
  case when coalesce(ses_programadas, 0) > 0
    then least(100, round(100.0 * coalesce(ses_totales, 0) / ses_programadas))
    else 0 end);

-- Días sin asistir frescos (esperado: 0 justo después de ejecutar el script)
select
  'asistencias con días desactualizados' as chequeo,
  count(*) as filas_mal
from asistencias
where dias_sin_asistir is distinct from nor_dias_laborales(ultima_asistencia);

-- Estados coherentes entre pacientes y asistencias
select
  'pacientes con estado distinto al de asistencias' as chequeo,
  count(*) as filas_mal
from pacientes p
join asistencias s on s.paciente_id = p.paciente_id
where p.status is distinct from s.status;

-- Distribución de estados (informativo)
select status, count(*) as pacientes from pacientes group by status order by 2 desc;
