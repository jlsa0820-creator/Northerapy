"use client";

import { useState } from "react";
import { useCrmStore } from "@/lib/store";
import { Episodio, EpisodioEstado, ETIQUETA_EPISODIO, Paciente } from "@/lib/types";
import { episodioActivoDe, fmtFecha, hoyISO, plural, sesionesDeEpisodio } from "@/lib/business";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Insignia de estado del episodio ─────────────────────────────────────────

const CLS_EPISODIO: Record<EpisodioEstado, { cls: string; dot: string }> = {
  // En tratamiento ≈ «Activo» (esmeralda) · Completado ≈ «Completó tratamiento» (teal) · Abandonado ≈ «Abandonó» (rosa)
  activo: { cls: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25", dot: "bg-emerald-400" },
  completado: { cls: "bg-teal-500/12 text-teal-300 border-teal-500/25", dot: "bg-teal-400" },
  abandonado: { cls: "bg-rose-500/12 text-rose-300 border-rose-500/25", dot: "bg-rose-400" },
};

export function EpisodioBadge({ estado }: { estado: EpisodioEstado }) {
  const c = CLS_EPISODIO[estado];
  return (
    <Badge variant="outline" className={cn("gap-1.5 whitespace-nowrap font-medium", c.cls)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
      {ETIQUETA_EPISODIO[estado]}
    </Badge>
  );
}

// ─── Diálogo: abrir (nuevo) episodio ─────────────────────────────────────────
// Se monta al abrirse (estado fresco por cada uso, sin efectos).

interface PropsAbrir {
  paciente: Paciente;
  fechaSugerida: string;
  onCerrado: () => void;
}

export function DialogoAbrirEpisodio({ paciente, fechaSugerida, onCerrado }: PropsAbrir) {
  const crearEpisodio = useCrmStore((s) => s.crearEpisodio);
  const { toast } = useToast();
  const [diagnostico, setDiagnostico] = useState(paciente.diagnostico ?? "");
  const [sistema, setSistema] = useState(paciente.sistema_afectado ?? "");
  const [notas, setNotas] = useState("");
  const [fechaInicio, setFechaInicio] = useState(fechaSugerida || hoyISO());
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!diagnostico.trim()) return;
    setGuardando(true);
    const res = await crearEpisodio({
      pacienteId: paciente.paciente_id,
      diagnostico,
      sistemaAfectado: sistema,
      fechaInicio: fechaInicio || hoyISO(),
      notas,
    });
    setGuardando(false);
    if (res.ok) {
      toast({
        title: "Episodio abierto ✓",
        description: `«${diagnostico.trim()}» desde el ${fmtFecha(fechaInicio || hoyISO())}. Las visitas con esa fecha o posterior contarán aquí.`,
      });
      onCerrado();
    } else {
      toast({ title: "No se pudo abrir el episodio", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrado()}>
      <DialogContent className="max-w-md border-border/70 bg-card">
        <DialogHeader>
          <DialogTitle>Abrir episodio de atención</DialogTitle>
          <DialogDescription>
            {paciente.nombre_completo} · un episodio agrupa las sesiones de un mismo diagnóstico,
            desde su fecha de inicio hasta que lo cierres.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="ep-diagnostico">Diagnóstico *</Label>
            <Input
              id="ep-diagnostico"
              placeholder="Lumbalgia, cervicalgia…"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
            />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ep-sistema">Sistema afectado</Label>
              <Input
                id="ep-sistema"
                placeholder="Musculoesquelético…"
                value={sistema}
                onChange={(e) => setSistema(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-inicio">Fecha de inicio *</Label>
              <Input
                id="ep-inicio"
                type="date"
                max={hoyISO()}
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-notas">Notas (opcional)</Label>
            <Textarea
              id="ep-notas"
              rows={2}
              placeholder="Motivo de la vuelta, hallazgos, acuerdo de tratamiento…"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrado} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando || !diagnostico.trim()}>
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Abrir episodio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: cerrar episodio ────────────────────────────────────────────────

interface PropsCerrar {
  episodio: Episodio;
  onCerrado: () => void;
}

export function DialogoCerrarEpisodio({ episodio, onCerrado }: PropsCerrar) {
  const cerrarEpisodio = useCrmStore((s) => s.cerrarEpisodio);
  const ingresos = useCrmStore((s) => s.ingresos);
  const { toast } = useToast();
  const { sesiones, ultima } = sesionesDeEpisodio(ingresos, episodio.paciente_id, episodio);
  const [estado, setEstado] = useState<"completado" | "abandonado">("completado");
  const [fechaFin, setFechaFin] = useState(ultima ?? hoyISO());
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!fechaFin) return;
    setGuardando(true);
    const res = await cerrarEpisodio(episodio.id, estado, fechaFin);
    setGuardando(false);
    if (res.ok) {
      toast({
        title: "Episodio cerrado ✓",
        description: `«${episodio.diagnostico}» quedó como ${ETIQUETA_EPISODIO[estado].toLowerCase()} hasta el ${fmtFecha(fechaFin)} (${plural(sesiones, "sesión", "sesiones")}).`,
      });
      onCerrado();
    } else {
      toast({ title: "No se pudo cerrar el episodio", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrado()}>
      <DialogContent className="max-w-md border-border/70 bg-card">
        <DialogHeader>
          <DialogTitle>Cerrar episodio</DialogTitle>
          <DialogDescription>
            «{episodio.diagnostico}» · desde el {fmtFecha(episodio.fecha_inicio)} · {plural(sesiones, "sesión", "sesiones")}.
            Al cerrarlo, las visitas con fecha posterior quedarán fuera de este episodio.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>¿Cómo terminó?</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as "completado" | "abandonado")}>
              <SelectTrigger aria-label="Desenlace del episodio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completado">Completó su tratamiento</SelectItem>
                <SelectItem value="abandonado">Lo abandonó</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-fin">Fecha de fin *</Label>
            <Input
              id="ep-fin"
              type="date"
              min={episodio.fecha_inicio}
              max={hoyISO()}
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
            {ultima && <p className="text-xs text-muted-foreground">Su última sesión fue el {fmtFecha(ultima)}.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrado} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando || !fechaFin}>
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Sí, cerrar episodio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sección «Historial médico» (ficha del paciente) ─────────────────────────

export function SeccionHistorial({ paciente }: { paciente: Paciente }) {
  const episodios = useCrmStore((s) => s.episodios);
  const ingresos = useCrmStore((s) => s.ingresos);
  const reabrirEpisodio = useCrmStore((s) => s.reabrirEpisodio);
  const { toast } = useToast();
  const [abriendo, setAbriendo] = useState(false);
  const [cerrando, setCerrando] = useState<Episodio | null>(null);

  const eps = episodios
    .filter((e) => e.paciente_id === paciente.paciente_id)
    .sort((a, b) => (a.fecha_inicio === b.fecha_inicio ? b.id - a.id : a.fecha_inicio < b.fecha_inicio ? 1 : -1));
  const activo = episodioActivoDe(episodios, paciente.paciente_id);

  async function reabrir(e: Episodio) {
    const res = await reabrirEpisodio(e.id);
    if (res.ok) {
      toast({
        title: "Episodio reabierto",
        description: `«${e.diagnostico}» vuelve a estar en tratamiento; las visitas nuevas contarán aquí.`,
      });
    } else {
      toast({ title: "No se pudo reabrir", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="size-3.5" aria-hidden /> Historial médico
        </p>
        {!activo && (
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setAbriendo(true)}>
            <Plus className="size-3.5" aria-hidden /> Abrir episodio
          </Button>
        )}
      </div>

      {eps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin episodios registrados todavía. Abre uno cuando el paciente inicie o retome un tratamiento.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {eps.map((e) => {
            const { sesiones, ultima } = sesionesDeEpisodio(ingresos, paciente.paciente_id, e);
            return (
              <li
                key={e.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  e.estado === "activo" ? "border-emerald-500/25 bg-emerald-500/5" : "border-border/50 bg-background/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.diagnostico}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtFecha(e.fecha_inicio)} – {e.fecha_fin ? fmtFecha(e.fecha_fin) : "en curso"} ·{" "}
                      {plural(sesiones, "sesión", "sesiones")}
                      {ultima ? ` · última ${fmtFecha(ultima)}` : ""}
                    </p>
                    {e.notas && <p className="mt-1 text-xs italic text-muted-foreground">“{e.notas}”</p>}
                  </div>
                  <EpisodioBadge estado={e.estado} />
                </div>
                {e.estado === "activo" ? (
                  <Button variant="ghost" size="sm" className="mt-1.5 h-7 px-2.5 text-xs text-muted-foreground" onClick={() => setCerrando(e)}>
                    Cerrar episodio
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 h-7 px-2.5 text-xs text-muted-foreground"
                    disabled={!!activo}
                    title={activo ? "Ya tiene otro episodio en tratamiento" : "Volver a ponerlo en tratamiento"}
                    onClick={() => void reabrir(e)}
                  >
                    <RotateCcw className="size-3" aria-hidden /> Reabrir
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {abriendo && (
        <DialogoAbrirEpisodio paciente={paciente} fechaSugerida={hoyISO()} onCerrado={() => setAbriendo(false)} />
      )}
      {cerrando && <DialogoCerrarEpisodio episodio={cerrando} onCerrado={() => setCerrando(null)} />}
    </div>
  );
}

// ─── Panel compacto para «Anotar visita y cobro» ─────────────────────────────

export function PanelEpisodioVisita({ paciente, fechaSugerida }: { paciente: Paciente; fechaSugerida: string }) {
  const episodios = useCrmStore((s) => s.episodios);
  const ingresos = useCrmStore((s) => s.ingresos);
  const [abriendo, setAbriendo] = useState(false);

  const activo = episodioActivoDe(episodios, paciente.paciente_id);

  if (activo) {
    const { sesiones } = sesionesDeEpisodio(ingresos, paciente.paciente_id, activo);
    return (
      <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-200">
        Episodio en tratamiento: <span className="font-semibold">{activo.diagnostico}</span> · desde el{" "}
        {fmtFecha(activo.fecha_inicio)} · {plural(sesiones, "sesión", "sesiones")}. Esta visita contará en su episodio.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2">
      <p className="text-xs text-amber-200">
        Sin episodio en tratamiento{paciente.diagnostico ? ` (su último diagnóstico fue «${paciente.diagnostico}»)` : ""}.
        Si hoy inicia o retoma un tratamiento, ábrele un episodio para que las sesiones queden en su historial.
      </p>
      <Button variant="outline" size="sm" className="h-7 shrink-0 border-amber-500/40 px-2.5 text-xs text-amber-200 hover:bg-amber-500/10" onClick={() => setAbriendo(true)}>
        <Plus className="size-3.5" aria-hidden /> Abrir episodio
      </Button>
      {abriendo && (
        <DialogoAbrirEpisodio paciente={paciente} fechaSugerida={fechaSugerida} onCerrado={() => setAbriendo(false)} />
      )}
    </div>
  );
}
