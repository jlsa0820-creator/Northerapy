"use client";

import { useMemo, useState } from "react";
import { useCrmStore } from "@/lib/store";
import { EstadoLinea, Ingreso, METODOS_PAGO } from "@/lib/types";
import { deudaDePaciente, fmtFecha, plural, soles } from "@/lib/business";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HandCoins, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LineaPendiente {
  ingresoId: number;
  linea: "terapia" | "diclofenaco" | "ortopedico";
  concepto: string;
  monto: number;
  fecha: string;
}

export function QuienDebeView() {
  const { pacientes, ingresos, cobrarLineas } = useCrmStore();
  const { toast } = useToast();

  const [cobrandoPac, setCobrandoPac] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [metodo, setMetodo] = useState<EstadoLinea>("efectivo");
  const [guardando, setGuardando] = useState(false);

  const analisis = useMemo(() => {
    const ingresosPorPac = new Map<number, Ingreso[]>();
    for (const i of ingresos) {
      const arr = ingresosPorPac.get(i.paciente_id) ?? [];
      arr.push(i);
      ingresosPorPac.set(i.paciente_id, arr);
    }
    const deudores = pacientes
      .map((p) => {
        const ing = ingresosPorPac.get(p.paciente_id) ?? [];
        const deuda = deudaDePaciente(ing);
        // Última actividad con deuda: fecha del ingreso más reciente con líneas "debe"
        const conDeuda = ing.filter((i) => tieneDebe(i));
        const ultimaDeuda = conDeuda.reduce<string | null>((max, i) => (!max || i.fecha > max ? i.fecha : max), null);
        return { p, deuda, ultimaDeuda, ing };
      })
      .filter((d) => d.deuda > 0)
      .sort((a, b) => b.deuda - a.deuda);
    const alDia = pacientes.length - deudores.length;
    const totalDeuda = deudores.reduce((acc, d) => acc + d.deuda, 0);
    return { deudores, alDia, totalDeuda, ingresosPorPac };
  }, [pacientes, ingresos]);

  function lineasPendientes(pacienteId: number): LineaPendiente[] {
    const ing = analisis.ingresosPorPac.get(pacienteId) ?? [];
    const out: LineaPendiente[] = [];
    for (const i of ing) {
      if (i.terapia_estado === "debe" && (i.terapia_monto ?? 0) > 0)
        out.push({ ingresoId: i.id, linea: "terapia", concepto: "Terapia", monto: i.terapia_monto!, fecha: i.fecha });
      if (i.diclofenaco_estado === "debe" && (i.diclofenaco_monto ?? 0) > 0)
        out.push({ ingresoId: i.id, linea: "diclofenaco", concepto: "Diclofenaco", monto: i.diclofenaco_monto!, fecha: i.fecha });
      if (i.ortopedico_estado === "debe" && (i.ortopedico_monto ?? 0) > 0)
        out.push({ ingresoId: i.id, linea: "ortopedico", concepto: "Ortopédico", monto: i.ortopedico_monto!, fecha: i.fecha });
    }
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  function abrirCobro(pacienteId: number) {
    setCobrandoPac(pacienteId);
    setMetodo("efectivo");
    const todas = lineasPendientes(pacienteId);
    setSeleccion(new Set(todas.map((l) => claveDe(l))));
  }

  const pacienteCobro = pacientes.find((p) => p.paciente_id === cobrandoPac) ?? null;
  const lineasCobro = pacienteCobro ? lineasPendientes(pacienteCobro.paciente_id) : [];
  const totalSeleccionado = lineasCobro
    .filter((l) => seleccion.has(claveDe(l)))
    .reduce((acc, l) => acc + l.monto, 0);

  async function confirmarCobro() {
    if (!pacienteCobro || seleccion.size === 0) return;
    setGuardando(true);
    const items = lineasCobro
      .filter((l) => seleccion.has(claveDe(l)))
      .map((l) => ({ ingresoId: l.ingresoId, linea: l.linea, metodo }));
    const res = await cobrarLineas(items);
    setGuardando(false);
    if (res.ok) {
      toast({
        title: "Cobro registrado ✓",
        description: `${soles(totalSeleccionado)} cobrados por ${metodo === "efectivo" ? "efectivo" : metodo}. El dinero ya aparece en «Dinero que entra».`,
      });
      setCobrandoPac(null);
    } else {
      toast({ title: "No se pudo registrar el cobro", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10">
          <HandCoins className="size-5 text-rose-300" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Quién debe</h1>
          <p className="text-sm text-muted-foreground">
            Cobros pendientes según las líneas con estado «debe» en los ingresos.
          </p>
        </div>
      </div>

      {/* Resumen */}
      {analisis.deudores.length === 0 ? (
        <Card className="border-emerald-500/30 bg-emerald-500/8">
          <CardContent className="flex flex-col items-center gap-1.5 py-10 text-center">
            <p className="text-3xl" aria-hidden>🎉</p>
            <p className="text-lg font-bold text-emerald-300">¡Nadie debe!</p>
            <p className="text-sm text-muted-foreground">Todos los pacientes están al día.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-rose-500/30 bg-rose-500/8">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300/80">
                Deuda viva total
              </p>
              <p className="num-tabular text-2xl font-bold text-rose-300">{soles(analisis.totalDeuda)}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{analisis.deudores.length}</b> {plural(analisis.deudores.length, "paciente debe", "pacientes deben")} ·{" "}
              {analisis.alDia} al día
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista de deudores */}
      <div className="space-y-3">
        {analisis.deudores.map(({ p, deuda, ultimaDeuda }) => {
          const lineas = lineasPendientes(p.paciente_id);
          return (
            <Card key={p.paciente_id} className="border-border/70 bg-card/80">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.nombre_completo}</p>
                    <p className="text-xs text-muted-foreground">
                      {ultimaDeuda
                        ? `Última actividad con deuda: ${fmtFecha(ultimaDeuda)}`
                        : "Sin fecha registrada"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="num-tabular text-lg font-bold text-rose-300">{soles(deuda)}</p>
                      <p className="text-[11px] text-muted-foreground">{plural(lineas.length, "pendiente", "pendientes")}</p>
                    </div>
                    <Button size="sm" className="h-9 font-semibold" onClick={() => abrirCobro(p.paciente_id)}>
                      Cobrar
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {lineas.slice(0, 6).map((l) => (
                    <li
                      key={claveDe(l)}
                      className="num-tabular rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {fmtFecha(l.fecha)} · {l.concepto}: <b className="text-rose-300">{soles(l.monto)}</b>
                    </li>
                  ))}
                  {lineas.length > 6 && (
                    <li className="rounded-full border border-border/60 bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                      +{lineas.length - 6} más
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal de cobro */}
      <Dialog open={!!pacienteCobro} onOpenChange={(v) => !v && setCobrandoPac(null)}>
        <DialogContent className="max-w-md border-border/70 bg-card">
          <DialogHeader>
            <DialogTitle>Cobrar a {pacienteCobro?.nombre_completo}</DialogTitle>
            <DialogDescription>
              Selecciona los pendientes que paga ahora. Cada línea se marca como cobrada con el método elegido (aparece al instante en «Dinero que entra»).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {lineasCobro.map((l) => {
                const k = claveDe(l);
                const activo = seleccion.has(k);
                return (
                  <li key={k}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
                        activo ? "border-teal-500/40 bg-teal-500/8" : "border-border/60 bg-secondary/30"
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <Checkbox
                          checked={activo}
                          onCheckedChange={(v) =>
                            setSeleccion((prev) => {
                              const s = new Set(prev);
                              if (v) s.add(k);
                              else s.delete(k);
                              return s;
                            })
                          }
                          aria-label={`Seleccionar ${l.concepto} del ${fmtFecha(l.fecha)}`}
                        />
                        <span>
                          <span className="block text-sm">{l.concepto}</span>
                          <span className="block text-[11px] text-muted-foreground">{fmtFecha(l.fecha)} · ingreso #{l.ingresoId}</span>
                        </span>
                      </span>
                      <span className="num-tabular text-sm font-semibold">{soles(l.monto)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Método de pago</p>
              <div className="grid grid-cols-3 gap-2">
                {METODOS_PAGO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodo(m)}
                    className={cn(
                      "min-h-11 rounded-lg border text-sm font-medium transition-colors",
                      metodo === m ? "border-teal-500/50 bg-teal-500/10 text-teal-200" : "border-border/70 hover:border-border"
                    )}
                  >
                    {m === "efectivo" ? "Efectivo" : m === "yape" ? "Yape" : "Tarjeta"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between rounded-lg border border-teal-500/25 bg-teal-500/8 px-3.5 py-2.5">
              <span className="text-sm font-semibold">A cobrar ({seleccion.size} {plural(seleccion.size, "línea", "líneas")})</span>
              <span className="num-tabular text-sm font-bold text-teal-300">{soles(totalSeleccionado)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCobrandoPac(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarCobro()} disabled={guardando || seleccion.size === 0}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : `Cobrar ${soles(totalSeleccionado)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function tieneDebe(i: Ingreso): boolean {
  return (
    (i.terapia_estado === "debe" && (i.terapia_monto ?? 0) > 0) ||
    (i.diclofenaco_estado === "debe" && (i.diclofenaco_monto ?? 0) > 0) ||
    (i.ortopedico_estado === "debe" && (i.ortopedico_monto ?? 0) > 0)
  );
}

function claveDe(l: LineaPendiente): string {
  return `${l.ingresoId}:${l.linea}`;
}
