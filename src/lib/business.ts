import {
  EstadoPaciente,
  Episodio,
  Ingreso,
  METODOS_PAGO,
  PAQUETE_PRECIO,
  PAQUETE_SESIONES,
  Paciente,
  Asistencia,
} from "./types";

// ─── Formato ─────────────────────────────────────────────────────────────────

const fmtSoles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function soles(n: number | null | undefined): string {
  return fmtSoles.format(n ?? 0);
}

/** 'YYYY-MM-DD' → Date local (sin corrimiento de zona horaria) */
export function fechaLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isoDeFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function hoyISO(): string {
  return isoDeFecha(new Date());
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa' */
export function fmtFecha(iso: string | null | undefined): string {
  const d = fechaLocal(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function esFinDeSemana(iso: string): boolean {
  const d = fechaLocal(iso);
  if (!d) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function esFechaFutura(iso: string): boolean {
  return iso > hoyISO();
}

// ─── Días laborales y estado dinámico ────────────────────────────────────────

/** Días laborables (lun–vie) transcurridos desde la fecha (exclusiva) hasta hoy */
export function diasLaboralesSinAsistir(iso: string | null | undefined): number | null {
  const d = fechaLocal(iso);
  if (!d) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const desde = new Date(d);
  desde.setDate(desde.getDate() + 1);
  desde.setHours(0, 0, 0, 0);
  if (desde > hoy) return 0;
  let count = 0;
  const cursor = new Date(desde);
  while (cursor <= hoy) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export interface ContextoPaciente {
  paciente: Paciente;
  asistencia?: Asistencia | null;
  ingresos: Ingreso[]; // todas las filas de ingresos del paciente
}

/** Única fuente de verdad del estado del paciente (como en la documentación) */
export function calcularEstado(ctx: ContextoPaciente): EstadoPaciente {
  const { paciente, asistencia, ingresos } = ctx;
  const sesiones = Math.max(paciente.sesiones_totales ?? 0, asistencia?.ses_totales ?? 0);
  const programadas =
    paciente.sesiones_programadas ?? asistencia?.ses_programadas ?? null;

  if (programadas && programadas > 0 && sesiones >= programadas) {
    return "Completó tratamiento";
  }

  const ultimaExplicita = asistencia?.ultima_asistencia ?? null;
  const ultimaDeIngresos = ingresos.length
    ? ingresos.reduce((max, i) => (i.fecha > max ? i.fecha : max), ingresos[0].fecha)
    : null;
  let base = ultimaExplicita ?? ultimaDeIngresos ?? paciente.primera_sesion ?? null;
  if (ultimaDeIngresos && (!base || ultimaDeIngresos > base)) base = ultimaDeIngresos;

  if (!base && sesiones === 0) return "Sin asistencias";

  const dias = diasLaboralesSinAsistir(base) ?? 0;
  if (dias <= 2) return "Activo";
  if (dias <= 10) return "En pausa";
  return "Abandonó";
}

export function pctAdherencia(sesiones: number, programadas: number | null): number | null {
  if (!programadas || programadas <= 0) return null;
  return Math.min(100, Math.round((sesiones / programadas) * 100));
}

export type Semaf = "verde" | "ambar" | "rojo" | "gris";
export function semaforoAdherencia(pct: number | null | undefined): Semaf {
  if (pct == null) return "gris";
  if (pct >= 75) return "verde";
  if (pct >= 50) return "ambar";
  return "rojo";
}

/** Sesiones por semana (promedio de las últimas 4 semanas) */
export function frecSemanal(ingresos: Ingreso[]): number {
  const hoy = new Date();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() - 28);
  const limISO = isoDeFecha(limite);
  const sesiones = ingresos.filter((i) => i.zonas > 0 && i.fecha >= limISO).length;
  return Math.round((sesiones / 4) * 10) / 10;
}

// ─── Dinero: líneas, deuda, pagos ────────────────────────────────────────────

export function montoDeLinea(estado: string | null, monto: number | null): number {
  if (!estado || estado === "no_aplica") return 0;
  return monto ?? 0;
}

/** Deuda de un ingreso: suma de líneas con estado 'debe' */
export function deudaDeIngreso(i: Ingreso): number {
  return (
    montoDeLinea(i.terapia_estado === "debe" ? "debe" : null, i.terapia_monto) +
    montoDeLinea(i.diclofenaco_estado === "debe" ? "debe" : null, i.diclofenaco_monto) +
    montoDeLinea(i.ortopedico_estado === "debe" ? "debe" : null, i.ortopedico_monto)
  );
}

/** Dinero real cobrado en un ingreso (efectivo / yape / tarjeta) */
export function pagadoDeIngreso(i: Ingreso): number {
  const t = METODOS_PAGO.includes(i.terapia_estado as never) ? i.terapia_monto ?? 0 : 0;
  const d = METODOS_PAGO.includes(i.diclofenaco_estado as never) ? i.diclofenaco_monto ?? 0 : 0;
  const o = METODOS_PAGO.includes(i.ortopedico_estado as never) ? i.ortopedico_monto ?? 0 : 0;
  return t + d + o;
}

/** Total facturado de un ingreso (pagado + por cobrar) */
export function totalDeIngreso(i: Ingreso): number {
  return (i.terapia_monto ?? 0) + (i.diclofenaco_monto ?? 0) + (i.ortopedico_monto ?? 0);
}

/** Deuda total de un paciente (desde estados 'debe' de sus ingresos) */
export function deudaDePaciente(ingresos: Ingreso[]): number {
  return ingresos.reduce((acc, i) => acc + deudaDeIngreso(i), 0);
}

/** Desglose por método de pago de una lista de ingresos */
export function desglosePorMetodo(ingresos: Ingreso[]): Record<string, number> {
  const out: Record<string, number> = { efectivo: 0, yape: 0, tarjeta: 0 };
  for (const i of ingresos) {
    if (METODOS_PAGO.includes(i.terapia_estado as never) && i.terapia_monto)
      out[i.terapia_estado!] += i.terapia_monto;
    if (METODOS_PAGO.includes(i.diclofenaco_estado as never) && i.diclofenaco_monto)
      out[i.diclofenaco_estado!] += i.diclofenaco_monto;
    if (METODOS_PAGO.includes(i.ortopedico_estado as never) && i.ortopedico_monto)
      out[i.ortopedico_estado!] += i.ortopedico_monto;
  }
  return out;
}

// ─── Paquete de 5 sesiones ───────────────────────────────────────────────────

export interface PaqueteInfo {
  fechaCompra: string;
  usadas: number;
  restantes: number;
  activo: boolean;
}

/**
 * Deriva el estado del paquete: busca la última compra (fila con zonas=0 y
 * terapia_monto=150) y cuenta las sesiones cubiertas posteriores
 * (zonas>0 con terapia_monto=0).
 */
export function paqueteInfo(ingresos: Ingreso[]): PaqueteInfo | null {
  const compras = ingresos
    .filter((i) => i.zonas === 0 && (i.terapia_monto ?? 0) === PAQUETE_PRECIO)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));
  if (compras.length === 0) return null;
  const compra = compras[0];
  const usadas = ingresos.filter(
    (i) => i.id !== compra.id && i.zonas > 0 && (i.terapia_monto ?? 0) === 0 && i.fecha >= compra.fecha
  ).length;
  const restantes = Math.max(0, PAQUETE_SESIONES - usadas);
  return { fechaCompra: compra.fecha, usadas, restantes, activo: restantes > 0 };
}

// ─── Periodos del dashboard ──────────────────────────────────────────────────

export type PeriodoPreset = "mes" | "mes_anterior" | "3m" | "anio" | "todo";

export interface Rango {
  from: string | null; // ISO o null (= sin límite)
  to: string | null;
  label: string;
}

export function rangoDePreset(p: PeriodoPreset): Rango {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (p) {
    case "mes":
      return {
        from: isoDeFecha(new Date(y, m, 1)),
        to: isoDeFecha(new Date(y, m + 1, 0)),
        label: `Este mes (${hoy.toLocaleDateString("es-PE", { month: "long", year: "numeric" })})`,
      };
    case "mes_anterior":
      return {
        from: isoDeFecha(new Date(y, m - 1, 1)),
        to: isoDeFecha(new Date(y, m, 0)),
        label: `Mes anterior (${new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" })})`,
      };
    case "3m":
      return {
        from: isoDeFecha(new Date(y, m - 2, 1)),
        to: isoDeFecha(new Date(y, m + 1, 0)),
        label: "Últimos 3 meses",
      };
    case "anio":
      return {
        from: isoDeFecha(new Date(y, 0, 1)),
        to: isoDeFecha(new Date(y, 11, 31)),
        label: `Este año (${y})`,
      };
    case "todo":
    default:
      return { from: null, to: null, label: "Todo el histórico" };
  }
}

export function enRango(iso: string, r: Rango): boolean {
  if (r.from && iso < r.from) return false;
  if (r.to && iso > r.to) return false;
  return true;
}

// ─── Segmentación de comportamiento ──────────────────────────────────────────

export type Segmento =
  | "Núcleo fiel"
  | "Comprometido corto"
  | "Regular con potencial"
  | "Abandono tardío"
  | "Abandono temprano"
  | "Sin clasificar";

export const CRITERIO_SEGMENTO: Record<Segmento, string> = {
  "Comprometido corto": "≥ 2 sesiones/semana, activo, con menos de 8 sesiones",
  "Núcleo fiel": "≥ 2 sesiones/semana y activo con ≥ 8 sesiones o tratamiento completado",
  "Regular con potencial": "1.0–1.9 sesiones/semana, activo o en pausa",
  "Abandono tardío": "Abandonó con 4 o más sesiones",
  "Abandono temprano": "Abandonó con menos de 4 sesiones",
  "Sin clasificar": "No cumple ninguno de los criterios anteriores",
};

export function segmentoDe(ctx: ContextoPaciente): Segmento {
  const estado = calcularEstado(ctx);
  const sesiones = Math.max(ctx.paciente.sesiones_totales ?? 0, ctx.asistencia?.ses_totales ?? 0);
  const frec = frecSemanal(ctx.ingresos);
  if (frec >= 2 && estado === "Activo" && sesiones < 8) return "Comprometido corto";
  if (frec >= 2 && (estado === "Activo" || estado === "Completó tratamiento")) return "Núcleo fiel";
  if (frec >= 1 && frec < 2 && (estado === "Activo" || estado === "En pausa"))
    return "Regular con potencial";
  if (estado === "Abandonó" && sesiones >= 4) return "Abandono tardío";
  if (estado === "Abandonó" && sesiones < 4) return "Abandono temprano";
  return "Sin clasificar";
}

// ─── Utilidades varias ───────────────────────────────────────────────────────

export function edadLegible(p: Paciente): string {
  if (p.edad_valor != null) return `${p.edad_valor} ${p.edad_unidad ?? ""}`.trim();
  return p.grupo_edad ?? "—";
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function plural(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

// ─── Historial médico (episodios) ────────────────────────────────────────────

/**
 * ¿La fila de ingresos es una sesión de terapia?
 * Usa la columna `tipo` cuando existe (la rellena el trigger de la BD) y cae a
 * la convención de la app (zonas > 0) para filas antiguas sin tipo.
 */
export function esSesion(i: Ingreso): boolean {
  return i.tipo ? i.tipo === "sesion" : i.zonas > 0;
}

export interface ResumenEpisodio {
  sesiones: number;
  ultima: string | null;
}

/**
 * Sesiones de un episodio: las filas de tipo 'sesion' cuya fecha cae dentro de
 * la ventana [fecha_inicio, fecha_fin] (abierta si fecha_fin es null).
 * Misma fórmula que la vista episodios_v de la base de datos.
 */
export function sesionesDeEpisodio(
  ingresos: Ingreso[],
  pacienteId: number,
  episodio: Pick<Episodio, "fecha_inicio" | "fecha_fin">
): ResumenEpisodio {
  let sesiones = 0;
  let ultima: string | null = null;
  for (const i of ingresos) {
    if (i.paciente_id !== pacienteId || !esSesion(i)) continue;
    if (i.fecha < episodio.fecha_inicio) continue;
    if (episodio.fecha_fin && i.fecha > episodio.fecha_fin) continue;
    sesiones++;
    if (!ultima || i.fecha > ultima) ultima = i.fecha;
  }
  return { sesiones, ultima };
}

/** El episodio en tratamiento del paciente, si lo hay (solo puede haber uno). */
export function episodioActivoDe(episodios: Episodio[], pacienteId: number): Episodio | null {
  return episodios.find((e) => e.paciente_id === pacienteId && e.estado === "activo") ?? null;
}
