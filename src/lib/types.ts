// ─── Tipos de datos (esquema real de Supabase) ───────────────────────────────

export interface Paciente {
  paciente_id: number;
  nombre_completo: string;
  grupo_edad: string | null;
  edad_valor: number | null;
  edad_unidad: string | null; // 'años' | 'meses'
  sexo: string | null;
  celular_principal: string | null;
  celular_nota: string | null;
  celular_adicional: string | null;
  celular_revision: string | null;
  como_nos_conocio: string | null;
  referido_por: string | null;
  diagnostico: string | null;
  sistema_afectado: string | null;
  cobra_paquete: boolean | null; // ¿hay que cobrarle paquete? (sí/no manual, p. ej. fracturas)
  primera_sesion: string | null; // 'YYYY-MM-DD'
  sesiones_programadas: number | null;
  sesiones_totales: number;
  status: string | null;
}

export interface Asistencia {
  id: number;
  paciente_id: number;
  ultima_asistencia: string | null;
  ses_programadas: number | null;
  ses_totales: number;
  pct_adherencia: number | null; // 0-100
  dias_sin_asistir: number | null;
  frec_semanal: number | null;
  status: string | null;
}

// ─── Historial médico (episodios) ────────────────────────────────────────────

export type EpisodioEstado = "activo" | "completado" | "abandonado";

export interface Episodio {
  id: number;
  paciente_id: number;
  diagnostico: string;
  sistema_afectado: string | null;
  fecha_inicio: string; // 'YYYY-MM-DD'
  fecha_fin: string | null; // null = episodio abierto
  estado: EpisodioEstado;
  notas: string | null;
  created_at?: string | null;
}

export const ETIQUETA_EPISODIO: Record<EpisodioEstado, string> = {
  activo: "En tratamiento",
  completado: "Completado",
  abandonado: "Abandonado",
};

export type EstadoLinea =
  | "efectivo"
  | "yape"
  | "tarjeta"
  | "debe"
  | "no_aplica";

export interface Ingreso {
  id: number;
  paciente_id: number;
  fecha: string; // 'YYYY-MM-DD'
  zonas: number;
  terapia_estado: string | null;
  terapia_monto: number | null;
  diclofenaco_estado: string | null;
  diclofenaco_monto: number | null;
  ortopedico_estado: string | null;
  ortopedico_monto: number | null;
  total: number | null;
  tipo?: string | null; // 'sesion' | 'compra_paquete' | 'venta_producto' (relleno por la BD)
}

// ─── Constantes de negocio ───────────────────────────────────────────────────

export const TARIFAS = {
  cubierta: 0, // incluida en paquete
  paquete: 30, // sesión con paquete antiguo / paquete de 5
  suelta: 35, // sesión suelta
} as const;

export type TarifaMode = keyof typeof TARIFAS | "otro";

export const PRECIO_DICLOFENACO = 6;
export const PAQUETE_SESIONES = 5;
export const PAQUETE_PRECIO = 150;

export const METODOS_PAGO: EstadoLinea[] = ["efectivo", "yape", "tarjeta"];
export const ESTADOS_LINEA: EstadoLinea[] = [
  "efectivo",
  "yape",
  "tarjeta",
  "debe",
  "no_aplica",
];

export const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  tarjeta: "Tarjeta",
  debe: "Debe",
  no_aplica: "No aplica",
};

export const OPCIONES_CONOCIO = [
  "Posta",
  "Referidos",
  "Paciente antiguo",
  "Vio el letrero",
] as const;

export const GRUPOS_EDAD_SUGERIDOS = [
  "Bebés: 0 a 2",
  "Niños: 3 a 11",
  "Adolescente: 12 a 17",
  "Joven: 18 a 29",
  "Adultos: 30 a 59",
  "Adultos mayores: 60 a más",
];

/** Deriva el grupo de edad a partir del valor y la unidad (misma fórmula que la base de datos) */
export function grupoEdadDeValor(
  edadValor: number | null | undefined,
  unidad?: string | null
): string | null {
  if (edadValor == null) return null;
  if ((unidad ?? "años") === "meses") return "Bebés: 0 a 2";
  if (edadValor < 3) return "Bebés: 0 a 2";
  if (edadValor < 12) return "Niños: 3 a 11";
  if (edadValor < 18) return "Adolescente: 12 a 17";
  if (edadValor < 30) return "Joven: 18 a 29";
  if (edadValor < 60) return "Adultos: 30 a 59";
  return "Adultos mayores: 60 a más";
}

export const OPCIONES_SEXO = ["Femenino", "Masculino", "Otro"] as const;

// Estados dinámicos calculados (única fuente de verdad)
export const ESTADOS_PACIENTE = [
  "Activo",
  "En pausa",
  "Abandonó",
  "Completó tratamiento",
  "Sin asistencias",
] as const;
export type EstadoPaciente = (typeof ESTADOS_PACIENTE)[number];

// Vistas de la app (SPA de ruta única)
export type Vista =
  | "dashboard"
  | "visita"
  | "pacientes"
  | "nuevo"
  | "ingresos"
  | "debe";
