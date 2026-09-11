"use client";

import { create } from "zustand";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  Asistencia,
  EstadoLinea,
  Ingreso,
  Paciente,
} from "./types";
import {
  calcularEstado,
  diasLaboralesSinAsistir,
  deudaDePaciente,
  frecSemanal,
  isoDeFecha,
  pctAdherencia,
} from "./business";

// ─── Utilidades ──────────────────────────────────────────────────────────────

export interface Resultado {
  ok: boolean;
  error?: string;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function sanearPaciente(r: Record<string, unknown>): Paciente {
  return {
    ...r,
    paciente_id: Number(r.paciente_id),
    edad_valor: num(r.edad_valor),
    sesiones_programadas: num(r.sesiones_programadas),
    sesiones_totales: Number(r.sesiones_totales ?? 0),
  } as unknown as Paciente;
}

function sanearAsistencia(r: Record<string, unknown>): Asistencia {
  return {
    ...r,
    id: Number(r.id),
    paciente_id: Number(r.paciente_id),
    ses_programadas: num(r.ses_programadas),
    ses_totales: Number(r.ses_totales ?? 0),
    pct_adherencia: num(r.pct_adherencia),
    dias_sin_asistir: num(r.dias_sin_asistir),
    frec_semanal: num(r.frec_semanal),
  } as unknown as Asistencia;
}

function sanearIngreso(r: Record<string, unknown>): Ingreso {
  return {
    ...r,
    id: Number(r.id),
    paciente_id: Number(r.paciente_id),
    zonas: Number(r.zonas ?? 0),
    terapia_monto: num(r.terapia_monto),
    diclofenaco_monto: num(r.diclofenaco_monto),
    ortopedico_monto: num(r.ortopedico_monto),
    total: num(r.total),
  } as unknown as Ingreso;
}

function traducirErrorAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Ese correo no está confirmado todavía. Revisa tu bandeja de entrada.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("leaked") || m.includes("filtered") || m.includes("compromised"))
    return "Esa contraseña ha sido filtrada en internet. Por favor usa una distinta.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos seguidos. Espera un momento y vuelve a probar.";
  if (m.includes("validate email") || m.includes("invalid email")) return "Escribe un correo válido.";
  if (m.includes("user not found")) return "No existe una cuenta con ese correo.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "No se pudo conectar con el servidor. Revisa tu conexión a internet.";
  return msg;
}

function traducirErrorDatos(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("row-level security") || m.includes("rls"))
    return "Tu cuenta no tiene permiso sobre esta tabla. Verifica con el administrador del equipo.";
  if (m.includes("duplicate key value")) return "Ese registro ya existe. Intenta de nuevo.";
  if (m.includes("non-default value") || m.includes("identity column"))
    return "La base de datos genera los IDs automáticamente; no se permiten IDs manuales en esa tabla.";
  if (m.includes("json") && m.includes("requested")) return "Error de formato en los datos enviados.";
  if (m.includes("jwt") || m.includes("token")) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  return msg;
}

/** Descarga completa con paginación (Supabase devuelve máx. 1000 filas por página) */
async function fetchAll<T>(tabla: string, orden: string, saneador: (r: Record<string, unknown>) => T): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .order(orden)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(traducirErrorDatos(error.message));
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows.map(saneador));
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/**
 * Fusiona filas de asistencias en el caché local por id (actualiza las
 * existentes y añade las nuevas, ordenadas por id).
 */
function fusionarAsistencias(actuales: Asistencia[], filas: Record<string, unknown>[]): Asistencia[] {
  const map = new Map(actuales.map((a) => [a.id, a]));
  for (const f of filas) {
    const s = sanearAsistencia(f);
    map.set(s.id, s);
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

/**
 * Inserta una fila en tablas con PK bigint: primero prueba SIN id para que la
 * BD lo genere (IDENTITY GENERATED ALWAYS/BY DEFAULT, secuencia o default).
 *
 * Un id explícito en una columna GENERATED ALWAYS AS IDENTITY es rechazado por
 * Postgres con "cannot insert a non-DEFAULT value into column ..." (la palabra
 * "GENERATED" solo aparece en el DETAIL, que Supabase no devuelve en el mensaje
 * principal, por eso el reintento anterior no se activaba). Además, los ids
 * manuales no avanzan la secuencia y acabarían colisionando: el id manual
 * (max+1) queda solo como plan B para columnas sin auto-generación.
 */
async function insertarFila(
  tabla: string,
  pk: string,
  fila: Record<string, unknown>,
  idsExistentes: number[],
  saneador: (r: Record<string, unknown>) => unknown
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const maxId = idsExistentes.length ? Math.max(...idsExistentes) : 0;

  // Intento 1: sin id → lo genera la BD
  let res = await supabase.from(tabla).insert(fila).select().single();
  if (!res.error) return { data: res.data as Record<string, unknown>, error: null };

  const msg = res.error.message.toLowerCase();
  const code = res.error.code ?? "";

  // La PK exige valor explícito (columna sin auto-generación → NOT NULL sobre la PK)
  if (code === "23502" || (msg.includes("null value in column") && msg.includes(pk))) {
    // Intento 2: id manual max+1
    res = await supabase.from(tabla).insert({ ...fila, [pk]: maxId + 1 }).select().single();
    if (!res.error) return { data: res.data as Record<string, unknown>, error: null };
    if (res.error.message.toLowerCase().includes("duplicate")) {
      // Conflicto de concurrencia: probar con ids aleatorios en un rango alto
      for (let i = 0; i < 3; i++) {
        const candidato = maxId + 1 + Math.floor(Math.random() * 5000) + 1;
        res = await supabase.from(tabla).insert({ ...fila, [pk]: candidato }).select().single();
        if (!res.error) return { data: res.data as Record<string, unknown>, error: null };
      }
    }
  }
  void saneador;
  return { data: null, error: traducirErrorDatos(res.error.message) };
}

// ─── Tipos de entrada ────────────────────────────────────────────────────────

export type PacienteInput = Omit<Paciente, "paciente_id" | "sesiones_totales" | "status">;

export interface LineaVisita {
  estado: EstadoLinea;
  monto: number;
}

export interface VisitaInput {
  pacienteId: number;
  fecha: string;
  zonas: number;
  terapia: LineaVisita;
  diclofenaco: LineaVisita;
  ortopedico: LineaVisita;
  venderPaquete?: { estado: EstadoLinea } | null;
}

export interface EdicionIngreso {
  fecha: string;
  zonas: number;
  terapia_estado: string | null;
  terapia_monto: number | null;
  diclofenaco_estado: string | null;
  diclofenaco_monto: number | null;
  ortopedico_estado: string | null;
  ortopedico_monto: number | null;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface CrmState {
  // auth
  session: Session | null;
  authReady: boolean;
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<Resultado>;
  signOut: () => Promise<void>;
  enviarRecuperacion: (email: string) => Promise<Resultado>;
  guardarNuevaContrasena: (password: string) => Promise<Resultado>;
  setRecoveryMode: (v: boolean) => void;

  // datos
  pacientes: Paciente[];
  asistencias: Asistencia[];
  ingresos: Ingreso[];
  dataReady: boolean;
  loadingData: boolean;
  loadError: string | null;
  initAuth: () => () => void;
  loadData: () => Promise<void>;

  // operaciones
  crearPaciente: (input: PacienteInput) => Promise<Resultado & { id?: number }>;
  actualizarPaciente: (id: number, cambios: Partial<PacienteInput>) => Promise<Resultado>;
  eliminarPaciente: (id: number) => Promise<Resultado>;
  registrarVisita: (input: VisitaInput) => Promise<Resultado>;
  actualizarIngreso: (id: number, cambios: EdicionIngreso) => Promise<Resultado>;
  eliminarIngreso: (id: number) => Promise<Resultado>;
  cobrarLineas: (
    items: { ingresoId: number; linea: "terapia" | "diclofenaco" | "ortopedico"; metodo: EstadoLinea }[]
  ) => Promise<Resultado>;
}

export const useCrmStore = create<CrmState>((set, get) => ({
  session: null,
  authReady: false,
  recoveryMode: false,
  pacientes: [],
  asistencias: [],
  ingresos: [],
  dataReady: false,
  loadingData: false,
  loadError: null,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: traducirErrorAuth(error.message) };
    return { ok: true };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ pacientes: [], asistencias: [], ingresos: [], dataReady: false, session: null });
  },

  enviarRecuperacion: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (error) return { ok: false, error: traducirErrorAuth(error.message) };
    return { ok: true };
  },

  guardarNuevaContrasena: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: traducirErrorAuth(error.message) };
    return { ok: true };
  },

  setRecoveryMode: (v) => set({ recoveryMode: v }),

  initAuth: () => {
    let primeraVez = true;
    const { data } = supabase.auth.onAuthStateChange((evento, session) => {
      set({ session });
      if (session && (evento === "INITIAL_SESSION" || evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED")) {
        if (primeraVez || !get().dataReady) {
          primeraVez = false;
          void get().loadData();
        }
      }
      if (evento === "SIGNED_OUT") {
        set({ pacientes: [], asistencias: [], ingresos: [], dataReady: false, session: null });
      }
    });
    // Marca auth lista tras la consulta inicial de sesión
    void supabase.auth.getSession().then(({ data: s }) => {
      set({ session: s.session, authReady: true });
      if (s.session && !get().dataReady && !get().loadingData) void get().loadData();
    });
    return () => data.subscription.unsubscribe();
  },

  loadData: async () => {
    if (!get().session) return;
    if (get().loadingData) return;
    set({ loadingData: true, loadError: null });
    try {
      const [pacientes, asistencias, ingresos] = await Promise.all([
        fetchAll("pacientes", "paciente_id", sanearPaciente),
        fetchAll("asistencias", "id", sanearAsistencia),
        fetchAll("ingresos", "id", sanearIngreso),
      ]);
      set({ pacientes, asistencias, ingresos, dataReady: true });
    } catch (e) {
      set({
        loadError: e instanceof Error ? e.message : "Error desconocido al cargar los datos.",
        dataReady: true, // desbloquea la app aunque falle, como en la documentación
      });
    } finally {
      set({ loadingData: false });
    }
  },

  crearPaciente: async (input) => {
    const fila: Record<string, unknown> = { ...input, sesiones_totales: 0, status: "Sin asistencias" };
    const ids = get().pacientes.map((p) => p.paciente_id);
    const { data, error } = await insertarFila("pacientes", "paciente_id", fila, ids, sanearPaciente);
    if (error || !data) return { ok: false, error: error ?? "No se pudo crear el paciente." };
    const nuevo = sanearPaciente(data);
    set({ pacientes: [...get().pacientes, nuevo].sort((a, b) => a.paciente_id - b.paciente_id) });
    return { ok: true, id: nuevo.paciente_id };
  },

  actualizarPaciente: async (id, cambios) => {
    const { data, error } = await supabase
      .from("pacientes")
      .update(cambios)
      .eq("paciente_id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error ? traducirErrorDatos(error.message) : "Sin respuesta." };
    const actualizado = sanearPaciente(data as Record<string, unknown>);
    set({
      pacientes: get().pacientes.map((p) => (p.paciente_id === id ? actualizado : p)),
    });
    // Si cambian las sesiones programadas, reflejarlo en asistencias
    if (cambios.sesiones_programadas !== undefined) {
      await sincronizarResumen(id, set, get);
    }
    return { ok: true };
  },

  eliminarPaciente: async (id) => {
    // Cascada manual: ingresos → asistencias → paciente
    const { error: eIng } = await supabase.from("ingresos").delete().eq("paciente_id", id);
    if (eIng) return { ok: false, error: traducirErrorDatos(eIng.message) };
    const { error: eAsis } = await supabase.from("asistencias").delete().eq("paciente_id", id);
    if (eAsis) return { ok: false, error: traducirErrorDatos(eAsis.message) };
    const { error: ePac } = await supabase.from("pacientes").delete().eq("paciente_id", id);
    if (ePac) return { ok: false, error: traducirErrorDatos(ePac.message) };
    set({
      ingresos: get().ingresos.filter((i) => i.paciente_id !== id),
      asistencias: get().asistencias.filter((a) => a.paciente_id !== id),
      pacientes: get().pacientes.filter((p) => p.paciente_id !== id),
    });
    return { ok: true };
  },

  registrarVisita: async (input) => {
    const { pacientes, asistencias, ingresos } = get();
    const paciente = pacientes.find((p) => p.paciente_id === input.pacienteId);
    if (!paciente) return { ok: false, error: "Paciente no encontrado." };

    const idsIngresos = ingresos.map((i) => i.id);
    const filasCreadas: Ingreso[] = [];

    // 1a. Fila de compra de paquete (zonas = 0, terapia S/150)
    if (input.venderPaquete) {
      const filaPaquete = {
        paciente_id: input.pacienteId,
        fecha: input.fecha,
        zonas: 0,
        terapia_estado: input.venderPaquete.estado,
        terapia_monto: 150,
        diclofenaco_estado: "no_aplica",
        diclofenaco_monto: 0,
        ortopedico_estado: "no_aplica",
        ortopedico_monto: 0,
        total: 150,
      };
      const res = await insertarFila("ingresos", "id", filaPaquete, idsIngresos, sanearIngreso);
      if (res.error || !res.data) return { ok: false, error: res.error ?? "No se pudo registrar el paquete." };
      const creado = sanearIngreso(res.data);
      filasCreadas.push(creado);
      idsIngresos.push(creado.id);
    }

    // 1b. Fila de la visita
    const totalVisita = input.terapia.monto + input.diclofenaco.monto + input.ortopedico.monto;
    const filaVisita = {
      paciente_id: input.pacienteId,
      fecha: input.fecha,
      zonas: input.zonas,
      terapia_estado: input.terapia.estado,
      terapia_monto: input.terapia.monto,
      diclofenaco_estado: input.diclofenaco.estado,
      diclofenaco_monto: input.diclofenaco.monto,
      ortopedico_estado: input.ortopedico.estado,
      ortopedico_monto: input.ortopedico.monto,
      total: totalVisita,
    };
    const resV = await insertarFila("ingresos", "id", filaVisita, idsIngresos, sanearIngreso);
    if (resV.error || !resV.data) return { ok: false, error: resV.error ?? "No se pudo registrar la visita." };
    const visitaRow = sanearIngreso(resV.data);
    filasCreadas.push(visitaRow);

    // 2. Actualizar caché de ingresos
    const nuevosIngresos = [...ingresos, ...filasCreadas].sort((a, b) => a.id - b.id);
    set({ ingresos: nuevosIngresos });

    // 3. Recalcular resumen (asistencias + pacientes)
    await sincronizarResumen(input.pacienteId, set, get, input.zonas > 0 ? 1 : 0);
    return { ok: true };
  },

  actualizarIngreso: async (id, cambios) => {
    const prev = get().ingresos.find((i) => i.id === id);
    if (!prev) return { ok: false, error: "Ingreso no encontrado." };
    const total =
      (cambios.terapia_monto ?? 0) + (cambios.diclofenaco_monto ?? 0) + (cambios.ortopedico_monto ?? 0);
    const { data, error } = await supabase
      .from("ingresos")
      .update({ ...cambios, total })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error ? traducirErrorDatos(error.message) : "Sin respuesta." };
    const actualizado = sanearIngreso(data as Record<string, unknown>);
    set({ ingresos: get().ingresos.map((i) => (i.id === id ? actualizado : i)) });

    // Ajuste de sesiones si cambió la condición de zonas
    const eraSesion = prev.zonas > 0;
    const esSesion = actualizado.zonas > 0;
    const delta = esSesion === eraSesion ? 0 : esSesion ? 1 : -1;
    if (delta !== 0 || cambios.fecha !== prev.fecha || total !== prev.total) {
      await sincronizarResumen(actualizado.paciente_id, set, get, delta);
    }
    return { ok: true };
  },

  eliminarIngreso: async (id) => {
    const prev = get().ingresos.find((i) => i.id === id);
    if (!prev) return { ok: false, error: "Ingreso no encontrado." };
    const { error } = await supabase.from("ingresos").delete().eq("id", id);
    if (error) return { ok: false, error: traducirErrorDatos(error.message) };
    set({ ingresos: get().ingresos.filter((i) => i.id !== id) });
    await sincronizarResumen(prev.paciente_id, set, get, prev.zonas > 0 ? -1 : 0);
    return { ok: true };
  },

  cobrarLineas: async (items) => {
    try {
      for (const it of items) {
        const { error } = await supabase
          .from("ingresos")
          .update({ [`${it.linea}_estado`]: it.metodo })
          .eq("id", it.ingresoId);
        if (error) throw error;
      }
      // Actualizar caché local
      const map = new Map(items.map((it) => [it.ingresoId, it]));
      set({
        ingresos: get().ingresos.map((i) => {
          const it = map.get(i.id);
          if (!it) return i;
          return { ...i, [`${it.linea}_estado`]: it.metodo };
        }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: traducirErrorDatos(e instanceof Error ? e.message : "Error al cobrar.") };
    }
  },
}));

// ─── Sincronización del resumen (asistencias + pacientes) ────────────────────

type SetState = (partial: Partial<CrmState>) => void;
type GetState = () => CrmState;

/**
 * Reconstruye la fila de `asistencias` y los contadores de `pacientes`
 * a partir del estado actual, aplicando `deltaSesiones` (±1) cuando procede.
 */
async function sincronizarResumen(
  pacienteId: number,
  set: SetState,
  get: GetState,
  deltaSesiones = 0
): Promise<void> {
  const { pacientes, asistencias, ingresos } = get();
  const paciente = pacientes.find((p) => p.paciente_id === pacienteId);
  const actual = asistencias.find((a) => a.paciente_id === pacienteId);
  const ingresosPaciente = ingresos.filter((i) => i.paciente_id === pacienteId);
  if (!paciente) return;

  const sesionesDeIngresos = ingresosPaciente.filter((i) => i.zonas > 0).length;
  const sesionesPrevias = Math.max(paciente.sesiones_totales ?? 0, actual?.ses_totales ?? 0);
  let sesiones = Math.max(0, sesionesPrevias + deltaSesiones);
  sesiones = Math.max(sesiones, sesionesDeIngresos);

  const sesionesIngreso = ingresosPaciente
    .filter((i) => i.zonas > 0)
    .map((i) => i.fecha)
    .sort()
    .reverse();
  const ultimaCalculada = sesionesIngreso[0] ?? null;
  const ultima =
    ultimaCalculada ??
    actual?.ultima_asistencia ??
    (paciente.primera_sesion && paciente.primera_sesion > isoDeFecha(new Date()) ? paciente.primera_sesion : null) ??
    paciente.primera_sesion ??
    null;

  const programadas = paciente.sesiones_programadas ?? actual?.ses_programadas ?? null;
  const pct = pctAdherencia(sesiones, programadas);
  const dias = ultima ? diasLaboralesSinAsistir(ultima) : null;
  const frec = frecSemanal(ingresosPaciente);

  const status = calcularEstado({
    paciente: { ...paciente, sesiones_totales: sesiones },
    asistencia: actual ? { ...actual, ultima_asistencia: ultima, ses_totales: sesiones } : null,
    ingresos: ingresosPaciente,
  });

  // 1. Pacientes
  const { error: ePac } = await supabase
    .from("pacientes")
    .update({ sesiones_totales: sesiones, status })
    .eq("paciente_id", pacienteId);
  if (!ePac) {
    set({
      pacientes: get().pacientes.map((p) =>
        p.paciente_id === pacienteId ? { ...p, sesiones_totales: sesiones, status } : p
      ),
    });
  }

  // 2. Asistencias: actualizar por paciente_id — la fila puede haberla creado
  //    ya el trigger de la BD al insertarse el ingreso, y su id puede faltar
  //    en el caché local (con PK identity no se conoce de antemano).
  const fila = {
    paciente_id: pacienteId,
    ultima_asistencia: ultima,
    ses_programadas: programadas,
    ses_totales: sesiones,
    pct_adherencia: pct,
    dias_sin_asistir: dias,
    frec_semanal: frec,
    status,
  };
  const updA = await supabase.from("asistencias").update(fila).eq("paciente_id", pacienteId).select();
  const actualizadas = !updA.error && Array.isArray(updA.data) ? (updA.data as Record<string, unknown>[]) : [];
  if (actualizadas.length > 0) {
    set({ asistencias: fusionarAsistencias(get().asistencias, actualizadas) });
  } else {
    // No existía: crearla (sin id explícito; si la PK lo exige, reintenta con id)
    const ids = get().asistencias.map((a) => a.id);
    const ins = await insertarFila("asistencias", "id", fila, ids, sanearAsistencia);
    if (!ins.error && ins.data) {
      set({ asistencias: fusionarAsistencias(get().asistencias, [ins.data]) });
    } else {
      // Carrera con el trigger de la BD (creó la fila entre medias): releerla
      const sel = await supabase.from("asistencias").select().eq("paciente_id", pacienteId);
      if (!sel.error && Array.isArray(sel.data) && sel.data.length > 0) {
        set({ asistencias: fusionarAsistencias(get().asistencias, sel.data as Record<string, unknown>[]) });
      }
    }
  }
}

// Selector de conveniencia
export function deudaTotalPaciente(state: { ingresos: Ingreso[] }, pacienteId: number): number {
  return deudaDePaciente(state.ingresos.filter((i) => i.paciente_id === pacienteId));
}
