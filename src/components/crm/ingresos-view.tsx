"use client";

import { useMemo, useState } from "react";
import { useCrmStore, EdicionIngreso } from "@/lib/store";
import { ESTADOS_LINEA, EstadoLinea, Ingreso, Vista } from "@/lib/types";
import { desglosePorMetodo, fmtFecha, plural, soles, totalDeIngreso } from "@/lib/business";
import { exportarIngresos } from "@/lib/excel";
import { MetodoBadge } from "./badges";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CircleDollarSign, Download, Pencil, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const POR_PAGINA = 20;

interface Props {
  irA: (v: Vista, pacienteId?: number) => void;
}

export function IngresosView({ irA }: Props) {
  const { pacientes, ingresos, actualizarIngreso, eliminarIngreso } = useCrmStore();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroMetodo, setFiltroMetodo] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Ingreso | null>(null);
  const [eliminando, setEliminando] = useState<Ingreso | null>(null);
  const [guardando, setGuardando] = useState(false);

  const pacMap = useMemo(() => new Map(pacientes.map((p) => [p.paciente_id, p])), [pacientes]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ingresos
      .filter((i) => {
        const nombre = pacMap.get(i.paciente_id)?.nombre_completo.toLowerCase() ?? `#${i.paciente_id}`;
        if (q && !nombre.includes(q)) return false;
        if (desde && i.fecha < desde) return false;
        if (hasta && i.fecha > hasta) return false;
        if (filtroMetodo !== "todos") {
          const estados = [i.terapia_estado, i.diclofenaco_estado, i.ortopedico_estado];
          if (!estados.includes(filtroMetodo)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));
  }, [ingresos, pacMap, busqueda, desde, hasta, filtroMetodo]);

  const totales = useMemo(() => {
    const metodos = desglosePorMetodo(filas);
    const entrado = metodos.efectivo + metodos.yape + metodos.tarjeta;
    const facturado = filas.reduce((acc, i) => acc + totalDeIngreso(i), 0);
    return { metodos, entrado, facturado, porCobrar: facturado - entrado };
  }, [filas]);

  const totalPaginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const visibles = filas.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);

  // Formulario de edición
  const [ed, setEd] = useState<EdicionIngreso | null>(null);
  function abrirEdicion(i: Ingreso) {
    setEditando(i);
    setEd({
      fecha: i.fecha,
      zonas: i.zonas,
      terapia_estado: i.terapia_estado ?? "no_aplica",
      terapia_monto: i.terapia_monto ?? 0,
      diclofenaco_estado: i.diclofenaco_estado ?? "no_aplica",
      diclofenaco_monto: i.diclofenaco_monto ?? 0,
      ortopedico_estado: i.ortopedico_estado ?? "no_aplica",
      ortopedico_monto: i.ortopedico_monto ?? 0,
    });
  }

  async function guardarEdicion() {
    if (!ed || !editando) return;
    setGuardando(true);
    const res = await actualizarIngreso(editando.id, ed);
    setGuardando(false);
    if (res.ok) {
      toast({ title: "Ingreso actualizado ✓", description: "Los cambios ya están en Supabase." });
      setEditando(null);
    } else {
      toast({ title: "No se pudo actualizar", description: res.error, variant: "destructive" });
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    const eraSesion = eliminando.zonas > 0;
    const res = await eliminarIngreso(eliminando.id);
    if (res.ok) {
      toast({
        title: "Ingreso eliminado",
        description: eraSesion
          ? "Se descontó la sesión y se actualizó el resumen del paciente."
          : "El registro se borró de Supabase.",
      });
      setEliminando(null);
    } else {
      toast({ title: "No se pudo eliminar", description: res.error, variant: "destructive" });
    }
  }

  const totalEd = ed ? (ed.terapia_monto ?? 0) + (ed.diclofenaco_monto ?? 0) + (ed.ortopedico_monto ?? 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <CircleDollarSign className="size-6 text-teal-300" aria-hidden /> Dinero que entra
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {plural(filas.length, "registro", "registros")} · cada visita genera sus líneas de terapia, diclofenaco y ortopédico
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => exportarIngresos(filas, pacientes)}>
          <Download className="size-4" aria-hidden /> Excel
        </Button>
      </div>

      {/* Totales del filtro */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TotalChip titulo="Dinero que entró" valor={soles(totales.entrado)} clase="text-teal-300" />
        <TotalChip titulo="Facturado" valor={soles(totales.facturado)} clase="text-violet-300" />
        <TotalChip titulo="Por cobrar (debe)" valor={soles(totales.porCobrar)} clase={totales.porCobrar > 0 ? "text-rose-400" : "text-muted-foreground"} />
        <div className="col-span-2 rounded-xl border border-border/70 bg-card/60 px-3.5 py-2.5 md:col-span-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Desglose</p>
          <p className="num-tabular mt-0.5 text-xs text-muted-foreground">
            Efectivo <b className="text-emerald-300">{soles(totales.metodos.efectivo)}</b> · Yape{" "}
            <b className="text-violet-300">{soles(totales.metodos.yape)}</b> · Tarjeta{" "}
            <b className="text-sky-300">{soles(totales.metodos.tarjeta)}</b>
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Buscar por paciente…"
            className="pl-9"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(0); }}
            aria-label="Buscar ingreso por paciente"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div>
            <Input
              type="date"
              aria-label="Desde"
              className="w-full lg:w-40"
              value={desde}
              onChange={(e) => { setDesde(e.target.value); setPagina(0); }}
            />
          </div>
          <div>
            <Input
              type="date"
              aria-label="Hasta"
              className="w-full lg:w-40"
              value={hasta}
              onChange={(e) => { setHasta(e.target.value); setPagina(0); }}
            />
          </div>
          <Select value={filtroMetodo} onValueChange={(v) => { setFiltroMetodo(v); setPagina(0); }}>
            <SelectTrigger className="w-full lg:w-44" aria-label="Filtrar por método">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los métodos</SelectItem>
              {ESTADOS_LINEA.map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "efectivo" ? "Efectivo" : m === "yape" ? "Yape" : m === "tarjeta" ? "Tarjeta" : m === "debe" ? "Debe" : "No aplica"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-24">Fecha</TableHead>
                <TableHead className="min-w-44">Paciente</TableHead>
                <TableHead className="min-w-16">Zonas</TableHead>
                <TableHead className="min-w-32">Terapia</TableHead>
                <TableHead className="min-w-32 hidden md:table-cell">Diclofenaco</TableHead>
                <TableHead className="min-w-32 hidden lg:table-cell">Ortopédico</TableHead>
                <TableHead className="min-w-24 text-right">Total</TableHead>
                <TableHead className="w-20 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                    No hay ingresos con esos filtros.
                  </TableCell>
                </TableRow>
              )}
              {visibles.map((i) => {
                const pac = pacMap.get(i.paciente_id);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="num-tabular whitespace-nowrap text-muted-foreground">{fmtFecha(i.fecha)}</TableCell>
                    <TableCell>
                      <button
                        className="max-w-44 truncate font-medium hover:text-teal-300"
                        onClick={() => pac && irA("visita", pac.paciente_id)}
                        title={pac?.nombre_completo ?? `#${i.paciente_id}`}
                      >
                        {pac?.nombre_completo ?? `Paciente #${i.paciente_id}`}
                      </button>
                      {i.zonas === 0 && (
                        <span className="ml-1.5 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300">
                          Paquete
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i.zonas > 0 ? i.zonas : "—"}</TableCell>
                    <TableCell>
                      <LineaResumen estado={i.terapia_estado} monto={i.terapia_monto} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <LineaResumen estado={i.diclofenaco_estado} monto={i.diclofenaco_monto} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <LineaResumen estado={i.ortopedico_estado} monto={i.ortopedico_monto} />
                    </TableCell>
                    <TableCell className="num-tabular text-right font-semibold">{soles(totalDeIngreso(i))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-teal-300" onClick={() => abrirEdicion(i)} aria-label="Editar ingreso">
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-rose-400" onClick={() => setEliminando(i)} aria-label="Eliminar ingreso">
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Página {paginaSegura + 1} de {totalPaginas} · {filas.length} registros
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={paginaSegura === 0} onClick={() => setPagina(paginaSegura - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={paginaSegura >= totalPaginas - 1} onClick={() => setPagina(paginaSegura + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edición */}
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-lg border-border/70 bg-card">
          <DialogHeader>
            <DialogTitle>Editar ingreso</DialogTitle>
            <DialogDescription>
              {pacMap.get(editando?.paciente_id ?? 0)?.nombre_completo ?? ""} · el total se recalcula automáticamente.
            </DialogDescription>
          </DialogHeader>
          {ed && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ed-fecha">Fecha</Label>
                  <Input id="ed-fecha" type="date" value={ed.fecha} onChange={(e) => setEd({ ...ed, fecha: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ed-zonas">Zonas</Label>
                  <Input
                    id="ed-zonas"
                    type="number"
                    min={0}
                    max={2}
                    value={ed.zonas}
                    onChange={(e) => setEd({ ...ed, zonas: Math.max(0, Number(e.target.value || 0)) })}
                  />
                  <p className="text-[11px] text-muted-foreground">0 = solo venta (ej. paquete), no cuenta como sesión.</p>
                </div>
              </div>

              {(
                [
                  { clave: "terapia", titulo: "Terapia" },
                  { clave: "diclofenaco", titulo: "Diclofenaco" },
                  { clave: "ortopedico", titulo: "Ortopédico" },
                ] as const
              ).map((l) => (
                <div key={l.clave} className="grid grid-cols-[1fr_112px] items-end gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{l.titulo} — estado</Label>
                    <Select
                      value={ed[`${l.clave}_estado`]}
                      onValueChange={(v) => setEd({ ...ed, [`${l.clave}_estado`]: v })}
                    >
                      <SelectTrigger className="w-full" aria-label={`Estado de ${l.titulo}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_LINEA.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m === "efectivo" ? "Efectivo" : m === "yape" ? "Yape" : m === "tarjeta" ? "Tarjeta" : m === "debe" ? "Debe" : "No aplica"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`ed-${l.clave}`} className="text-xs uppercase tracking-wider text-muted-foreground">Monto S/</Label>
                    <Input
                      id={`ed-${l.clave}`}
                      type="number"
                      min={0}
                      step="0.5"
                      className="num-tabular"
                      value={ed[`${l.clave}_monto`] ?? 0}
                      onChange={(e) => setEd({ ...ed, [`${l.clave}_monto`]: Number(e.target.value || 0) })}
                    />
                  </div>
                </div>
              ))}

              <div className="flex justify-between rounded-lg border border-teal-500/25 bg-teal-500/8 px-3.5 py-2.5">
                <span className="text-sm font-semibold">Total del ingreso</span>
                <span className="num-tabular text-sm font-bold text-teal-300">{soles(totalEd)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
            <Button onClick={() => void guardarEdicion()} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <AlertDialog open={!!eliminando} onOpenChange={(v) => !v && setEliminando(null)}>
        <AlertDialogContent className="border-border/70 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este ingreso?</AlertDialogTitle>
            <AlertDialogDescription>
              {eliminando && eliminando.zonas > 0
                ? "Esta fila cuenta como una sesión: se descontará del total de sesiones del paciente y se recalculará su resumen de asistencia."
                : "El registro se borrará de Supabase."}{" "}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500/90 text-white hover:bg-rose-500"
              onClick={(e) => {
                e.preventDefault();
                void confirmarEliminar();
              }}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TotalChip({ titulo, valor, clase }: { titulo: string; valor: string; clase: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 px-3.5 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</p>
      <p className={cn("num-tabular mt-0.5 text-lg font-bold", clase)}>{valor}</p>
    </div>
  );
}

function LineaResumen({ estado, monto }: { estado: string | null; monto: number | null }) {
  if (!estado || estado === "no_aplica" || !monto) {
    return (
      <span className="text-xs text-muted-foreground/60">—</span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <MetodoBadge metodo={estado} />
      <span className="num-tabular text-xs">{soles(monto)}</span>
    </span>
  );
}
