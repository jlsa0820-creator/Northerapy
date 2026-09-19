-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAR PACIENTE EN SUPABASE — Northerapy CRM
-- Solo lectura (SELECT): no modifica nada.
-- Uso: pégalo en Supabase Dashboard → SQL Editor → Run.
-- Cambia el nombre buscado en la línea «v_busca» si es distinto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) ¿Existe el paciente? (esperado: 1 fila) ────────────────────────────
select paciente_id, nombre_completo, diagnostico, primera_sesion,
       sesiones_totales, sesiones_programadas, status
from pacientes
where nombre_completo ilike '%paciente ejemplo%';

-- ─── 2) Sus ingresos: visitas y compras ─────────────────────────────────────
-- Esperado para «visita + compra de paquete»: 2 filas
--   · Compra del paquete: zonas = 0, terapia_monto = 150, tipo = compra_paquete
--   · Visita del día:     zonas = 1 (o 2), tipo = sesion,
--       terapia_monto = 0 si la sesión quedó cubierta por el paquete,
--       terapia_monto = 35 (suelta) si se le cobró aparte
select i.id, i.fecha, i.tipo, i.zonas,
       i.terapia_estado, i.terapia_monto,
       i.diclofenaco_estado, i.diclofenaco_monto,
       i.ortopedico_estado, i.ortopedico_monto,
       i.total
from ingresos i
where i.paciente_id in (
  select paciente_id from pacientes
  where nombre_completo ilike '%paciente ejemplo%'
)
order by i.fecha desc, i.id desc;

-- ─── 3) Su resumen de asistencia (esperado: 1 fila) ─────────────────────────
-- ultima_asistencia = hoy, ses_totales = 1, dias_sin_asistir = 0, status = Activo
-- (la fila la crea automáticamente el trigger nor_sincroniza_paciente)
select a.id, a.paciente_id, p.nombre_completo,
       a.ultima_asistencia, a.ses_totales, a.ses_programadas,
       a.pct_adherencia, a.dias_sin_asistir, a.frec_semanal, a.status
from asistencias a
join pacientes p on p.paciente_id = a.paciente_id
where p.nombre_completo ilike '%paciente ejemplo%';

-- ─── 4) Lectura rápida: paquete y deuda ─────────────────────────────────────
-- paciente_existe   → 1 si el alta llegó a la BD
-- filas_ingresos    → 2 si se guardó visita + compra del paquete
-- paquete_comprado  → fecha de la compra (S/150)
-- sesiones_cubiertas→ sesiones con S/0 desde la compra (1 si la del día quedó cubierta)
-- sesiones_restantes→ 5 − cubiertas (esperado: 4)
-- deuda_total       → suma de líneas en estado «debe» (esperado: 0 si pagó todo)
with pac as (
  select paciente_id from pacientes
  where nombre_completo ilike '%paciente ejemplo%'
),
mis_ingresos as (
  select * from ingresos
  where paciente_id in (select paciente_id from pac)
),
compra as (
  select min(fecha) as fecha_compra
  from mis_ingresos
  where coalesce(tipo, '') = 'compra_paquete'
     or (zonas = 0 and coalesce(terapia_monto, 0) >= 100)
),
cubiertas as (
  select count(*) as n
  from mis_ingresos i
  join compra c on i.fecha >= c.fecha_compra
  where i.zonas > 0 and coalesce(i.terapia_monto, 0) = 0
)
select
  (select count(*) from pac)                                    as paciente_existe,
  (select count(*) from mis_ingresos)                           as filas_ingresos,
  (select fecha_compra from compra)                             as paquete_comprado,
  (select n from cubiertas)                                     as sesiones_cubiertas,
  5 - (select coalesce(n, 0) from cubiertas)                    as sesiones_restantes,
  (select coalesce(sum(
      case when terapia_estado     = 'debe' then coalesce(terapia_monto, 0)     else 0 end +
      case when diclofenaco_estado = 'debe' then coalesce(diclofenaco_monto, 0) else 0 end +
      case when ortopedico_estado  = 'debe' then coalesce(ortopedico_monto, 0)  else 0 end
    ), 0)
   from mis_ingresos)                                           as deuda_total;
