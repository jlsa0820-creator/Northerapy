"use client";

import { useMemo, useState } from "react";
import { useCrmStore } from "@/lib/store";
import {
  PAQUETE_PRECIO,
  PRECIO_DICLOFENACO,
  TARIFAS,
  EstadoLinea,
  METODOS_PAGO,
  TarifaMode,
} from "@/lib/types";
import {
  calcularEstado,
  deudaDePaciente,
  diasLaboralesSinAsistir,
  esFechaFutura,
  esFinDeSemana,
  fmtFecha,
  hoyISO,
  paqueteInfo,
  plural,
  soles,
} from "@/lib/business";
import { StatusBadge } from "./badges";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarPlus, CheckCircle2, Loader2, Search, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  pacienteInicial: number | null;
  onPacienteUsado: () => void;
}

export function VisitaView({ pacienteInicial, onPacienteUsado }: Props) {
  const { pacientes, asistencias, ingresos, registrarVisita } = useCrmStore();
  const { toast } = useToast();

  // Paciente efectivo: el preseleccionado (p. ej. desde «Pacientes») o el elegido localmente
  const [idLocal, setIdLocal] = useState<number | null>(null);
  const pacienteId = pacienteInicial ?? idLocal;

  // Búsqueda
  const [query, setQuery] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);

  // Formulario
  const [fecha, setFecha] = useState(hoyISO());
  const [zonas, setZonas] = useState(1);
  // Tarifa efectiva: la elegida por el usuario o la derivada del paquete activo
  const [tarifaElegida, setTarifaElegida] = useState<TarifaMode | null>(null);
  const [tarifaOtro, setTarifaOtro] = useState("");
  const [dicloCant, setDicloCant] = useState(0);
  const [ortoMonto, setOrtoMonto] = useState("");
  const [venderPaquete, setVenderPaquete] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [metodoGlobal, setMetodoGlobal] = useState<EstadoLinea>("efectivo");
  const [metodoLineas, setMetodoLineas] = useState({ terapia: "efectivo", extras: "efectivo" });
  const [exito, setExito] = useState<string | null>(null);

  const paciente = useMemo(
    () => pacientes.find((p) => p.paciente_id === pacienteId) ?? null,
    [pacientes, pacienteId]
  );
  const ingresosPaciente = useMemo(
    () => ingresos.filter((i) => i.paciente_id === pacienteId),
    [ingresos, pacienteId]
  );
  const asistencia = useMemo(
    () => asistencias.find((a) => a.paciente_id === pacienteId) ?? null,
    [asistencias, pacienteId]
  );
  const estado = useMemo(
    () => (paciente ? calcularEstado({ paciente, asistencia, ingresos: ingresosPaciente }) : null),
    [paciente, asistencia, ingresosPaciente]
  );
  const deuda = useMemo(() => deudaDePaciente(ingresosPaciente), [ingresosPaciente]);
  const paquete = useMemo(() => paqueteInfo(ingresosPaciente), [ingresosPaciente]);
  const tarifa: TarifaMode = tarifaElegida ?? (paquete?.activo ? "cubierta" : "suelta");

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pacientes
      .filter((p) => p.nombre_completo.toLowerCase().includes(q))
      .sort((a, b) => {
        const ia = a.nombre_completo.toLowerCase().indexOf(q);
        const ib = b.nombre_completo.toLowerCase().indexOf(q);
        if (ia !== ib) return ia - ib;
        return a.nombre_completo.localeCompare(b.nombre_completo, "es");
      })
      .slice(0, 8);
  }, [pacientes, query]);

  // Índice activo recortado al tamaño de resultados actuales
  const indiceSeguro = Math.min(indiceActivo, Math.max(0, resultados.length - 1));

  const precioZona = tarifa === "otro" ? Number(tarifaOtro || 0) : TARIFAS[tarifa as keyof typeof TARIFAS];
  const montoTerapia = Number.isFinite(precioZona) ? precioZona * zonas : 0;
  const montoDiclo = dicloCant * PRECIO_DICLOFENACO;
  const montoOrto = Number(ortoMonto || 0) || 0;
  const totalVisita = montoTerapia + montoDiclo + montoOrto;
  const totalConPaquete = totalVisita + (venderPaquete ? PAQUETE_PRECIO : 0);

  const finDeSemanaWarn = fecha && esFinDeSemana(fecha) && fecha === hoyISO();
  const fechaMala = fecha && esFechaFutura(fecha);

  function seleccionarPaciente(id: number) {
    setIdLocal(id);
    onPacienteUsado();
    setQuery("");
    setMenuAbierto(false);
    setExito(null);
    setVenderPaquete(false);
    setTarifaElegida(null);
  }

  function onBuscarTeclado(e: React.KeyboardEvent) {
    if (!menuAbierto || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceActivo((i) => (i + 1) % resultados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceActivo((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      seleccionarPaciente(resultados[indiceSeguro].paciente_id);
    } else if (e.key === "Escape") {
      setMenuAbierto(false);
    }
  }

  async function guardar(cobrarAhora: boolean) {
    if (!paciente) return;
    if (fechaMala) {
      toast({ title: "Fecha inválida", description: "No puedes registrar visitas con fecha futura.", variant: "destructive" });
      return;
    }
    if (cobrarAhora) {
      setMetodoLineas({ terapia: metodoGlobal, extras: metodoGlobal });
      setCobrando(true);
      return;
    }
    await persistir({
      terapia: { estado: montoTerapia > 0 ? "debe" : "no_aplica", monto: montoTerapia },
      diclofenaco: { estado: montoDiclo > 0 ? "debe" : "no_aplica", monto: montoDiclo },
      ortopedico: { estado: montoOrto > 0 ? "debe" : "no_aplica", monto: montoOrto },
      paquete: venderPaquete ? "debe" : null,
    });
  }

  async function confirmarCobro() {
    await persistir({
      terapia: {
        estado: montoTerapia > 0 ? (metodoLineas.terapia as EstadoLinea) : "no_aplica",
        monto: montoTerapia,
      },
      diclofenaco: {
        estado: montoDiclo > 0 ? (metodoLineas.extras as EstadoLinea) : "no_aplica",
        monto: montoDiclo,
      },
      ortopedico: {
        estado: montoOrto > 0 ? (metodoLineas.extras as EstadoLinea) : "no_aplica",
        monto: montoOrto,
      },
      paquete: venderPaquete ? (metodoLineas.terapia as EstadoLinea) : null,
    });
    setCobrando(false);
  }

  async function persistir(m: {
    terapia: { estado: EstadoLinea; monto: number };
    diclofenaco: { estado: EstadoLinea; monto: number };
    ortopedico: { estado: EstadoLinea; monto: number };
    paquete: EstadoLinea | null;
  }) {
    if (!paciente) return;
    setGuardando(true);
    const res = await registrarVisita({
      pacienteId: paciente.paciente_id,
      fecha,
      zonas,
      terapia: m.terapia,
      diclofenaco: m.diclofenaco,
      ortopedico: m.ortopedico,
      venderPaquete: m.paquete ? { estado: m.paquete } : null,
    });
    setGuardando(false);
    if (res.ok) {
      const texto = m.paquete === null && !m.terapia.monto && !m.diclofenaco.monto && !m.ortopedico.monto
        ? "Visita registrada (sin cargos)"
        : m.terapia.estado === "debe" && (m.terapia.monto > 0 || m.diclofenaco.monto > 0 || m.ortopedico.monto > 0)
          ? "Visita registrada. El monto quedó como deuda (estado «debe»)."
          : "Visita y cobro registrados ✓";
      setExito(texto);
      toast({ title: "Guardado en Supabase ✓", description: texto });
      // Reset de la visita (mantiene el paciente para agilizar)
      setDicloCant(0);
      setOrtoMonto("");
      setVenderPaquete(false);
      setTarifaOtro("");
    } else {
      toast({ title: "No se pudo guardar", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10">
          <CalendarPlus className="size-5 text-teal-300" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Anotar visita y cobro</h1>
          <p className="text-sm text-muted-foreground">Busca al paciente, anota la terapia y cobra en un solo paso.</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Escribe el nombre del paciente…"
            className="h-11 pl-9 text-base"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMenuAbierto(true);
            }}
            onFocus={() => setMenuAbierto(true)}
            onKeyDown={onBuscarTeclado}
            aria-label="Buscar paciente por nombre"
            role="combobox"
            aria-expanded={menuAbierto && resultados.length > 0}
          />
        </div>
        {menuAbierto && query.trim() && (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl"
          >
            {resultados.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">Sin coincidencias para «{query}».</li>
            )}
            {resultados.map((p, i) => {
              const idx = p.nombre_completo.toLowerCase().indexOf(query.trim().toLowerCase());
              const nombre = idx >= 0 ? (
                <>
                  {p.nombre_completo.slice(0, idx)}
                  <mark className="rounded bg-teal-500/25 px-0.5 text-teal-200">{p.nombre_completo.slice(idx, idx + query.trim().length)}</mark>
                  {p.nombre_completo.slice(idx + query.trim().length)}
                </>
              ) : p.nombre_completo;
              return (
                <li key={p.paciente_id}>
                  <button
                    role="option"
                    aria-selected={i === indiceSeguro}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                      i === indiceSeguro ? "bg-accent text-accent-foreground" : "hover:bg-secondary/60"
                    )}
                    onMouseEnter={() => setIndiceActivo(i)}
                    onClick={() => seleccionarPaciente(p.paciente_id)}
                  >
                    <span>{nombre}</span>
                    <span className="text-[11px] text-muted-foreground">ID {p.paciente_id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Ficha del paciente */}
      {paciente && estado && (
        <Card className="border-border/70 bg-card/80">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold">{paciente.nombre_completo}</p>
                <p className="text-xs text-muted-foreground">
                  {paciente.diagnostico ?? "Sin diagnóstico registrado"}
                </p>
              </div>
              <StatusBadge estado={estado} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sesiones</p>
                <p className="num-tabular mt-0.5 font-semibold">
                  {paciente.sesiones_totales}
                  {paciente.sesiones_programadas ? ` / ${paciente.sesiones_programadas}` : ""}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Última vez</p>
                <p className="mt-0.5">
                  {asistencia?.ultima_asistencia ? (
                    <>
                      {fmtFecha(asistencia.ultima_asistencia)}
                      <span className="block text-[11px] text-muted-foreground">
                        hace {plural(diasLaboralesSinAsistir(asistencia.ultima_asistencia) ?? 0, "día laboral", "días laborales")}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Primera visita</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deuda</p>
                <p className={cn("num-tabular mt-0.5 font-semibold", deuda > 0 ? "text-rose-400" : "text-emerald-400")}>
                  {deuda > 0 ? soles(deuda) : "Al día"}
                </p>
              </div>
              {paquete && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paquete</p>
                  <p className={cn("mt-0.5 font-semibold", paquete.activo ? "text-teal-300" : "text-muted-foreground")}>
                    {paquete.activo ? `Activo · quedan ${paquete.restantes}` : "Agotado"}
                  </p>
                </div>
              )}
            </div>

            {paquete?.activo && (
              <p className="mt-3 rounded-lg border border-teal-500/25 bg-teal-500/8 px-3 py-2 text-xs text-teal-200">
                Paquete de 5 sesiones activo: le quedan {paquete.restantes} (usadas {paquete.usadas} de 5, comprado el {fmtFecha(paquete.fechaCompra)}). La tarifa «Cubierta por paquete» quedó seleccionada.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {paciente && (
        <Card className="border-border/70 bg-card/80">
          <CardContent className="space-y-5 p-4 sm:p-5">
            {exito && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {exito}
              </p>
            )}

            {/* Fecha */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fecha-visita">Fecha de la visita *</Label>
                <Input
                  id="fecha-visita"
                  type="date"
                  max={hoyISO()}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className={cn("w-full sm:w-44", fechaMala && "border-rose-500/60")}
                />
                {fechaMala && <p className="text-xs text-rose-400">No se permiten fechas futuras.</p>}
                {finDeSemanaWarn && <p className="text-xs text-amber-400">Es fin de semana: confirma que la visita fue hoy.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Zonas a tratar *</Label>
                <RadioGroup value={String(zonas)} onValueChange={(v) => setZonas(Number(v))} className="flex gap-2">
                  {[1, 2].map((z) => (
                    <label
                      key={z}
                      className={cn(
                        "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors",
                        zonas === z ? "border-teal-500/50 bg-teal-500/10 text-teal-200" : "border-border/70 text-muted-foreground hover:border-border"
                      )}
                    >
                      <RadioGroupItem value={String(z)} id={`zona-${z}`} className="sr-only" />
                      {plural(z, "zona", "zonas")}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>

            {/* Tarifa */}
            <div className="space-y-1.5">
              <Label>Tarifa de la terapia</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    { id: "cubierta", titulo: "Cubierta", sub: "S/ 0 · incluida en paquete" },
                    { id: "paquete", titulo: "Paquete", sub: `S/ ${TARIFAS.paquete} por zona` },
                    { id: "suelta", titulo: "Suelta", sub: `S/ ${TARIFAS.suelta} por zona` },
                  ] as { id: TarifaMode; titulo: string; sub: string }[]
                ).map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setTarifaElegida(op.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      tarifa === op.id ? "border-teal-500/50 bg-teal-500/10" : "border-border/70 hover:border-border"
                    )}
                  >
                    <span className={cn("block text-sm font-semibold", tarifa === op.id ? "text-teal-200" : "")}>{op.titulo}</span>
                    <span className="block text-[11px] text-muted-foreground">{op.sub}</span>
                  </button>
                ))}
                <div className={cn("rounded-lg border px-3 py-2 transition-colors", tarifa === "otro" ? "border-teal-500/50 bg-teal-500/10" : "border-border/70")}>
                  <button type="button" className="block w-full text-left text-sm font-semibold" onClick={() => setTarifaElegida("otro")}>
                    Otro monto
                  </button>
                  <Input
                    aria-label="Monto personalizado por zona"
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="S/ libre"
                    className="mt-1 h-7 border-border/70 text-xs"
                    value={tarifaOtro}
                    onChange={(e) => {
                      setTarifaElegida("otro");
                      setTarifaOtro(e.target.value);
                    }}
                  />
                </div>
              </div>
              {tarifa === "cubierta" && !paquete?.activo && (
                <p className="text-xs text-amber-400">
                  Este paciente no tiene paquete activo: la sesión quedará en S/ 0. Revisa que sea correcto.
                </p>
              )}
            </div>

            {/* Extras */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="diclo">Diclofenaco (S/ {PRECIO_DICLOFENACO} c/u)</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setDicloCant(Math.max(0, dicloCant - 1))} aria-label="Quitar diclofenaco">−</Button>
                  <Input
                    id="diclo"
                    type="number"
                    min={0}
                    className="num-tabular w-20 text-center"
                    value={dicloCant}
                    onChange={(e) => setDicloCant(Math.max(0, Number(e.target.value || 0)))}
                  />
                  <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setDicloCant(dicloCant + 1)} aria-label="Agregar diclofenaco">+</Button>
                  <span className="num-tabular text-sm text-muted-foreground">= {soles(montoDiclo)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orto">Ortopédico (monto libre)</Label>
                <Input
                  id="orto"
                  type="number"
                  min={0}
                  step="0.5"
                  placeholder="S/ 0.00"
                  className="num-tabular w-40"
                  value={ortoMonto}
                  onChange={(e) => setOrtoMonto(e.target.value)}
                />
              </div>
            </div>

            {/* Vender paquete */}
            <div
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors",
                venderPaquete ? "border-teal-500/40 bg-teal-500/8" : "border-border/70 bg-secondary/30"
              )}
            >
              <div>
                <p className="text-sm font-semibold">¿Le vendes el paquete de 5 sesiones?</p>
                <p className="text-[11px] text-muted-foreground">
                  Cargo único de {soles(PAQUETE_PRECIO)} fechado hoy: la sesión de este día ya cuenta y quedan 4.
                  {paquete?.activo ? " (Ya tiene un paquete activo — revisa antes de vender otro.)" : ""}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={venderPaquete}
                onClick={() => setVenderPaquete(!venderPaquete)}
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  venderPaquete ? "bg-teal-500" : "bg-secondary border border-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 size-5 rounded-full bg-white transition-all",
                    venderPaquete ? "left-6" : "left-1"
                  )}
                />
              </button>
            </div>

            {/* Desglose */}
            <div className="rounded-xl border border-border/70 bg-background/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desglose</p>
              <ul className="num-tabular space-y-1 text-sm">
                <li className="flex justify-between"><span className="text-muted-foreground">Terapia ({tarifa === "otro" ? "monto libre" : tarifa} × {zonas} {zonas === 1 ? "zona" : "zonas"})</span><span>{soles(montoTerapia)}</span></li>
                {dicloCant > 0 && (
                  <li className="flex justify-between"><span className="text-muted-foreground">Diclofenaco × {dicloCant}</span><span>{soles(montoDiclo)}</span></li>
                )}
                {montoOrto > 0 && (
                  <li className="flex justify-between"><span className="text-muted-foreground">Ortopédico</span><span>{soles(montoOrto)}</span></li>
                )}
                {venderPaquete && (
                  <li className="flex justify-between"><span className="text-muted-foreground">Paquete de 5 sesiones</span><span>{soles(PAQUETE_PRECIO)}</span></li>
                )}
                <li className="flex justify-between border-t border-border/60 pt-2 text-base font-bold">
                  <span>Total {venderPaquete ? "(incluye paquete)" : ""}</span>
                  <span className="text-teal-300">{soles(totalConPaquete)}</span>
                </li>
              </ul>
            </div>

            {/* Acciones */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1 border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                onClick={() => void guardar(false)}
                disabled={guardando || !!fechaMala}
              >
                {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Guardar visita (cobrar después)"}
              </Button>
              <Button className="flex-1 font-semibold" onClick={() => void guardar(true)} disabled={guardando || !!fechaMala}>
                <Wallet className="size-4" aria-hidden /> Guardar y cobrar ahora
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Se creará el ingreso en Supabase y se actualizarán sus sesiones y resumen de asistencia.
            </p>
          </CardContent>
        </Card>
      )}

      {!paciente && !query && (
        <Card className="border-dashed border-border/70 bg-card/40">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Empieza escribiendo el nombre del paciente para ver su ficha.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Modal de cobro */}
      <Dialog open={cobrando} onOpenChange={setCobrando}>
        <DialogContent className="border-border/70 bg-card">
          <DialogHeader>
            <DialogTitle>Cobrar {soles(totalConPaquete)}</DialogTitle>
            <DialogDescription>
              Elige el método de pago. Puedes usar métodos distintos para la terapia y los productos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Método general</p>
              <div className="grid grid-cols-3 gap-2">
                {METODOS_PAGO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodoGlobal(m)}
                    className={cn(
                      "min-h-11 rounded-lg border text-sm font-medium capitalize transition-colors",
                      metodoGlobal === m ? "border-teal-500/50 bg-teal-500/10 text-teal-200" : "border-border/70 hover:border-border"
                    )}
                  >
                    {m === "efectivo" ? "Efectivo" : m === "yape" ? "Yape" : "Tarjeta"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
              {(montoTerapia > 0 || (venderPaquete && PAQUETE_PRECIO > 0)) && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Terapia{venderPaquete ? " + paquete" : ""}</span>
                  <div className="flex items-center gap-2">
                    <span className="num-tabular font-semibold">{soles(montoTerapia + (venderPaquete ? PAQUETE_PRECIO : 0))}</span>
                    <Select
                      value={metodoLineas.terapia}
                      onValueChange={(v) => setMetodoLineas((ml) => ({ ...ml, terapia: v }))}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs" aria-label="Método para terapia">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METODOS_PAGO.map((m) => (
                          <SelectItem key={m} value={m} className="capitalize">
                            {m === "efectivo" ? "Efectivo" : m === "yape" ? "Yape" : "Tarjeta"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {(montoDiclo > 0 || montoOrto > 0) && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Diclofenaco{montoOrto > 0 ? " + ortopédico" : ""}</span>
                  <div className="flex items-center gap-2">
                    <span className="num-tabular font-semibold">{soles(montoDiclo + montoOrto)}</span>
                    <Select
                      value={metodoLineas.extras}
                      onValueChange={(v) => setMetodoLineas((ml) => ({ ...ml, extras: v }))}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs" aria-label="Método para productos">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METODOS_PAGO.map((m) => (
                          <SelectItem key={m} value={m} className="capitalize">
                            {m === "efectivo" ? "Efectivo" : m === "yape" ? "Yape" : "Tarjeta"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-bold">
                <span>Total a cobrar</span>
                <span className="num-tabular text-teal-300">{soles(totalConPaquete)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCobrando(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={() => void confirmarCobro()} disabled={guardando}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : `Confirmar cobro de ${soles(totalConPaquete)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
