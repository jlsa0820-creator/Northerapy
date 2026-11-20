-- ═══════════════════════════════════════════════════════════════════════════
-- NORTHERAPY CRM — COBRO DE PAQUETE MANUAL POR PACIENTE (sí/no)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO: los paquetes se ofrecen SOLO a pacientes con fractura. Hasta ahora
-- esa decisión vivía en la cabeza del equipo; este script la hace explícita
-- con UNA columna booleana en pacientes:
--
--   cobra_paquete  boolean not null default false
--     true  = hay que cobrarle paquete (aparece «Sí» en la app)
--     false = no se le cobra paquete (aparece «No» en la app)
--
-- DÓNDE SE VE EN LA APP (ya implementado):
--   · Formulario de nuevo paciente → «¿Hay que cobrarle paquete?» Sí / No.
--   · Ficha del paciente (Mis pacientes → tocar la fila) → sección Clínico:
--     recuadro resaltado «Hay que cobrarle paquete» / «No se le cobra paquete».
--   · Tabla de «Mis pacientes» → columna «Paquete» con Sí / No.
--   · Export Excel de pacientes → columna «Paquete (cobrar)».
--   · El campo también se edita en el diálogo «Editar paciente».
--
-- ES ADITIVO E IDEMPOTENTE: puedes re-ejecutarlo sin romper nada.
-- No borra datos, no toca RLS, no cambia ninguna fórmula de negocio.
-- Los 115 pacientes existentes quedan en «No» por defecto; márcalos con «Sí»
-- desde la app (Editar paciente) según vayas revisando sus fracturas.
--
-- NOTA DE COMPATIBILIDAD: si ejecutas la app SIN haber corrido este script,
-- crear/editar pacientes sigue funcionando (la app reintenta sin el campo),
-- pero la columna «Paquete» mostrará «No» para todos.
--
-- CÓMO EJECUTARLO
--   1. Supabase → SQL Editor → New query.
--   2. Pega TODO este archivo y pulsa Run.
--   3. Revisa la PARTE 2 (verificación): debe listar pacientes con su Sí/No.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PARTE 1 · Columna nueva (idempotente) ────────────────────────────────────

alter table pacientes
  add column if not exists cobra_paquete boolean not null default false;

comment on column pacientes.cobra_paquete is
  '¿Hay que cobrarle paquete? Sí/No manual (los paquetes son solo para pacientes con fractura).';

-- ── PARTE 2 · Verificación ───────────────────────────────────────────────────

-- 2a. La columna existe y quedó con default false:
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'pacientes'
  and column_name = 'cobra_paquete';

-- 2b. Muestra de pacientes con su nuevo Sí/No (todos parten en No):
select paciente_id,
       nombre_completo,
       case when cobra_paquete then 'Sí' else 'No' end as paquete
from pacientes
order by paciente_id
limit 20;

-- 2c. Resumen total (esperado al ejecutar por primera vez: 0 con Sí):
select count(*) filter (where cobra_paquete)  as con_paquete_si,
       count(*) filter (where not cobra_paquete) as con_paquete_no,
       count(*)                                  as total_pacientes
from pacientes;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN. Marca a cada paciente con fractura desde la app: Mis pacientes →
-- lápiz (Editar) → «¿Hay que cobrarle paquete?» → Sí → Guardar cambios.
-- ═══════════════════════════════════════════════════════════════════════════
