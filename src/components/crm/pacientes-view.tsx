"use client";

import { useMemo, useState } from "react";
import { useCrmStore } from "@/lib/store";
import {
  calcularEstado,
  deudaDePaciente,
  diasLaboralesSinAsistir,
  edadLegible,
  fmtFecha,
  paqueteInfo,
  pctAdherencia,
  plural,
  soles,
  totalDeIngreso,
} from "@/lib/business";
import { Ingreso, OPCIONES_CONOCIO, Paciente, Vista } from "@/lib/types";
import { StatusBadge, MetodoBadge } from "./badges";
import { SeccionHistorial } from "./episodios";
import { PacienteForm, type FormularioPaciente } from "./paciente-form";
import { exportarPacientes } from "@/lib/excel";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FilePenLine,
  History,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const POR_PAGINA = 15;

interface Props {
  irA: (v: Vista, pacienteId?: number) => void;
}

export function PacientesView({ irA }: Props) {
  const { pacientes, asistencias, ingresos, eliminarPaciente, actualizarPaciente } = useCrmStore();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroOrigen, setFiltroOrigen] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const [detalle, setDetalle] = useState<Paciente | null>(null);
  const [editando, setEditando] = useState<Paciente | null>(null);
  const [eliminando, setEliminando] = useState<Paciente | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const asisMap = useMemo(() => new Map(asistencias.map((a) => [a.paciente_id, a])), [asistencias]);
  const ingresosPorPaciente = useMemo(() => {
    const m = new Map<number, Ingreso[]>();
    for (const i of ingresos) {
      const arr = m.get(i.paciente_id) ?? [];
      arr.push(i);
      m.set(i.paciente_id, arr);
    }
    return m;
  }, [ingresos]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pacientes
      .map((p) => {
        const ing = ingresosPorPaciente.get(p.paciente_id) ?? [];
        const estado = calcularEstado({ paciente: p, asistencia: asisMap.get(p.paciente_id) ?? null, ingresos: ing });
        const deuda = deudaDePaciente(ing);
        return { p, estado, deuda };
      })
      .filter(({ p, estado }) => {
        if (q && !p.nombre_completo.toLowerCase().includes(q) && !String(p.paciente_id).includes(q)) return false;
        if (filtroEstado !== "todos" && estado !== filtroEstado) return false;
        if (filtroOrigen !== "todos" && (p.como_nos_conocio ?? "Sin dato") !== filtroOrigen) return false;
        return true;
      })
      .sort((a, b) => a.p.nombre_completo.localeCompare(b.p.nombre_completo, "es"));
  }, [pacientes, asisMap, ingresosPorPaciente, busqueda, filtroEstado, filtroOrigen]);

  const totalPaginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const visibles = filas.slice(paginaSegura * POR_PAGINA, (paginaSegura + 1) * POR_PAGINA);

  const ingresosDetalle = detalle ? (ingresosPorPaciente.get(detalle.paciente_id) ?? []) : [];
  const ingresosDetalleOrdenados = [...ingresosDetalle].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  function copiar(texto: string) {
    void navigator.clipboard?.writeText(texto);
    toast({ title: "Copiado", description: texto });
  }

  function formInicial(p: Paciente): FormularioPaciente {
    return {
      nombre_completo: p.nombre_completo ?? "",
      sexo: p.sexo ?? "",
      edad_valor: p.edad_valor != null ? String(p.edad_valor) : "",
      edad_unidad: (p.edad_unidad as "años" | "meses") ?? "años",
      grupo_edad: p.grupo_edad ?? "",
      celular_principal: p.celular_principal ?? "",
      celular_nota: p.celular_nota ?? "",
      celular_adicional: p.celular_adicional ?? "",
      celular_revision: p.celular_revision != null && p.celular_revision !== "",
      como_nos_conocio: p.como_nos_conocio ?? "",
      referido_por: p.referido_por ?? "",
      diagnostico: p.diagnostico ?? "",
      sistema_afectado: p.sistema_afectado ?? "",
      primera_sesion: p.primera_sesion ?? "",
      sesiones_programadas: p.sesiones_programadas != null ? String(p.sesiones_programadas) : "",
    };
  }

  async function guardarEdicion(datos: Parameters<typeof actualizarPaciente>[1]): Promise<boolean> {
    if (!editando) return false;
    setGuardandoEdicion(true);
    const res = await actualizarPaciente(editando.paciente_id, datos);
    setGuardandoEdicion(false);
    if (res.ok) {
      toast({ title: "Paciente actualizado ✓", description: "Los cambios ya están en Supabase." });
      setEditando(null);
      return true;
    }
    toast({ title: "No se pudo actualizar", description: res.error, variant: "destructive" });
    return false;
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    const nIng = (ingresosPorPaciente.get(eliminando.paciente_id) ?? []).length;
    const res = await eliminarPaciente(eliminando.paciente_id);
    if (res.ok) {
      toast({
        title: "Paciente eliminado",
        description: `Se borraron también ${plural(nIng, "ingreso", "ingresos")} y su resumen de asistencias.`,
      });
      setEliminando(null);
      setDetalle(null);
    } else {
      toast({ title: "No se pudo eliminar", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Mis pacientes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {plural(filas.length, "paciente", "pacientes")} · toca una fila para ver su ficha completa
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => exportarPacientes(pacientes, asistencias, ingresos)}
          >
            <Download className="size-4" aria-hidden /> Excel
          </Button>
          <Button size="sm" className="h-9" onClick={() => irA("nuevo")}>
            <UserPlus className="size-4" aria-hidden /> Nuevo
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Buscar por nombre o ID…"
            className="pl-9"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(0);
            }}
            aria-label="Buscar paciente"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filtroEstado} onValueChange={(v) => { setFiltroEstado(v); setPagina(0); }}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="Activo">Activos</SelectItem>
              <SelectItem value="En pausa">En pausa</SelectItem>
              <SelectItem value="Abandonó">Abandonaron</SelectItem>
              <SelectItem value="Completó tratamiento">Completaron</SelectItem>
              <SelectItem value="Sin asistencias">Sin asistencias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroOrigen} onValueChange={(v) => { setFiltroOrigen(v); setPagina(0); }}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por origen">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo origen</SelectItem>
              {OPCIONES_CONOCIO.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
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
                <TableHead className="min-w-52">Paciente</TableHead>
                <TableHead className="min-w-24">Edad</TableHead>
                <TableHead className="min-w-32">Celular</TableHead>
                <TableHead className="min-w-28 hidden md:table-cell">Origen</TableHead>
                <TableHead className="min-w-40 hidden lg:table-cell">Diagnóstico</TableHead>
                <TableHead className="min-w-24">Sesiones</TableHead>
                <TableHead className="min-w-36">Estado</TableHead>
                <TableHead className="min-w-24 text-right">Deuda</TableHead>
                <TableHead className="w-20 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                    No hay pacientes con esos filtros.
                  </TableCell>
                </TableRow>
              )}
              {visibles.map(({ p, estado, deuda }) => (
                <TableRow
                  key={p.paciente_id}
                  className="cursor-pointer"
                  onClick={() => setDetalle(p)}
                >
                  <TableCell>
                    <div className="font-medium">{p.nombre_completo}</div>
                    <div className="text-[11px] text-muted-foreground">ID {p.paciente_id}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{edadLegible(p)}</TableCell>
                  <TableCell>
                    {p.celular_principal ? (
                      <button
                        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-teal-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          copiar(p.celular_principal!);
                        }}
                        title="Copiar número"
                      >
                        <Phone className="size-3" aria-hidden /> {p.celular_principal}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{p.como_nos_conocio ?? "—"}</TableCell>
                  <TableCell className="hidden max-w-44 truncate text-muted-foreground lg:table-cell" title={p.diagnostico ?? ""}>
                    {p.diagnostico ?? "—"}
                  </TableCell>
                  <TableCell className="num-tabular text-muted-foreground">
                    {p.sesiones_totales}
                    {p.sesiones_programadas ? ` / ${p.sesiones_programadas}` : ""}
                  </TableCell>
                  <TableCell><StatusBadge estado={estado} /></TableCell>
                  <TableCell className={cn("num-tabular text-right font-semibold", deuda > 0 ? "text-rose-400" : "text-muted-foreground")}>
                    {deuda > 0 ? soles(deuda) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-teal-300" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre_completo}`}>
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-rose-400" onClick={() => setEliminando(p)} aria-label={`Eliminar ${p.nombre_completo}`}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Página {paginaSegura + 1} de {totalPaginas}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="size-8" disabled={paginaSegura === 0} onClick={() => setPagina(paginaSegura - 1)} aria-label="Página anterior">
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" size="icon" className="size-8" disabled={paginaSegura >= totalPaginas - 1} onClick={() => setPagina(paginaSegura + 1)} aria-label="Página siguiente">
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Diálogo de detalle */}
      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-border/70 bg-card">
          {detalle && (() => {
            const a = asisMap.get(detalle.paciente_id);
            const ing = ingresosPorPaciente.get(detalle.paciente_id) ?? [];
            const estado = calcularEstado({ paciente: detalle, asistencia: a ?? null, ingresos: ing });
            const deuda = deudaDePaciente(ing);
            const paq = paqueteInfo(ing);
            // Valores siempre frescos (calculados, no almacenados): la misma fórmula que la BD
            const sesionesDet = Math.max(detalle.sesiones_totales ?? 0, a?.ses_totales ?? 0);
            const programadasDet = detalle.sesiones_programadas ?? a?.ses_programadas ?? null;
            const pctDet = pctAdherencia(sesionesDet, programadasDet);
            const diasDet = diasLaboralesSinAsistir(a?.ultima_asistencia);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="pr-6">{detalle.nombre_completo}</DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2">
                    <StatusBadge estado={estado} />
                    {deuda > 0 && (
                      <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-300">
                        Debe {soles(deuda)}
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <Info etiqueta="Edad" valor={edadLegible(detalle)} />
                    <Info etiqueta="Sexo" valor={detalle.sexo ?? "—"} />
                    <Info etiqueta="Grupo" valor={detalle.grupo_edad ?? "—"} />
                    <Info etiqueta="Origen" valor={detalle.como_nos_conocio ?? "—"} />
                    {detalle.referido_por && <Info etiqueta="Referido por" valor={detalle.referido_por} />}
                    <Info etiqueta="Primera sesión" valor={fmtFecha(detalle.primera_sesion)} />
                    <Info etiqueta="Sesiones" valor={`${detalle.sesiones_totales}${detalle.sesiones_programadas ? ` de ${detalle.sesiones_programadas} programadas` : ""}`} />
                    <Info etiqueta="Última asistencia" valor={a?.ultima_asistencia ? fmtFecha(a.ultima_asistencia) : "—"} />
                    {pctDet != null && (
                      <Info etiqueta="Adherencia" valor={`${pctDet}%`} />
                    )}
                    {diasDet != null && (
                      <Info etiqueta="Días sin asistir" valor={plural(diasDet, "día laboral", "días laborales")} />
                    )}
                  </div>

                  {paq && (
                    <div className="rounded-lg border border-teal-500/25 bg-teal-500/8 px-3 py-2.5 text-xs">
                      <p className="font-semibold text-teal-300">
                        Paquete de 5 sesiones {paq.activo ? "activo" : "agotado"}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        Usadas {paq.usadas} de 5 · le {paq.restantes > 0 ? `quedan ${paq.restantes}` : "no le queda ninguna"} · comprado el {fmtFecha(paq.fechaCompra)}
                      </p>
                    </div>
                  )}

                  <Separator className="bg-border/50" />

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contacto</p>
                    <div className="space-y-1">
                      {detalle.celular_principal && (
                        <button className="flex items-center gap-2 text-sm hover:text-teal-300" onClick={() => copiar(detalle.celular_principal!)}>
                          <Phone className="size-3.5 text-muted-foreground" aria-hidden /> {detalle.celular_principal}
                          <Copy className="size-3 text-muted-foreground" aria-hidden />
                        </button>
                      )}
                      {detalle.celular_nota && <p className="text-xs text-muted-foreground">Nota: {detalle.celular_nota}</p>}
                      {detalle.celular_adicional && (
                        <p className="text-xs text-muted-foreground">Adicional: {detalle.celular_adicional}</p>
                      )}
                      {detalle.celular_revision && (
                        <p className="text-xs font-medium text-amber-400">⚠ Número marcado para revisión manual</p>
                      )}
                    </div>
                  </div>

                  {(detalle.diagnostico || detalle.sistema_afectado) && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clínico</p>
                      {detalle.diagnostico && <p className="text-sm">Diagnóstico: {detalle.diagnostico}</p>}
                      {detalle.sistema_afectado && <p className="text-sm text-muted-foreground">Sistema: {detalle.sistema_afectado}</p>}
                    </div>
                  )}

                  <SeccionHistorial paciente={detalle} />

                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <History className="size-3.5" aria-hidden /> Últimas visitas y pagos
                    </p>
                    {ingresosDetalleOrdenados.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin registros todavía.</p>
                    ) : (
                      <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                        {ingresosDetalleOrdenados.slice(0, 8).map((i) => (
                          <li key={i.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5 text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <CalendarDays className="size-3" aria-hidden /> {fmtFecha(i.fecha)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {i.zonas > 0 && <span className="text-muted-foreground">{plural(i.zonas, "zona", "zonas")}</span>}
                              <MetodoBadge metodo={i.terapia_estado} />
                              <span className="num-tabular font-semibold">{soles(totalDeIngreso(i))}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditando(detalle); setDetalle(null); }}>
                    <FilePenLine className="size-4" aria-hidden /> Editar
                  </Button>
                  <Button size="sm" onClick={() => irA("visita", detalle.paciente_id)}>
                    Anotar visita
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Diálogo de edición */}
      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-border/70 bg-card">
          <DialogHeader>
            <DialogTitle>Editar paciente</DialogTitle>
            <DialogDescription>
              Los cambios se guardan directamente en Supabase.
            </DialogDescription>
          </DialogHeader>
          {editando && (
            <PacienteForm
              modo="completo"
              inicial={formInicial(editando)}
              guardando={guardandoEdicion}
              onGuardar={guardarEdicion}
              onCancelar={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!eliminando} onOpenChange={(v) => !v && setEliminando(null)}>
        <AlertDialogContent className="border-border/70 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {eliminando?.nombre_completo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán también sus {plural((ingresosPorPaciente.get(eliminando?.paciente_id ?? 0) ?? []).length, "registro de ingreso", "registros de ingresos")} y su resumen de asistencias de Supabase. Esta acción no se puede deshacer.
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
              Sí, eliminar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5">{valor}</p>
    </div>
  );
}
