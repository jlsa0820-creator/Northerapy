"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EstadoPaciente } from "@/lib/types";

const CONFIG: Record<string, { cls: string; dot: string }> = {
  "Activo": { cls: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25", dot: "bg-emerald-400" },
  "En pausa": { cls: "bg-amber-500/12 text-amber-300 border-amber-500/25", dot: "bg-amber-400" },
  "Abandonó": { cls: "bg-rose-500/12 text-rose-300 border-rose-500/25", dot: "bg-rose-400" },
  "Completó tratamiento": { cls: "bg-teal-500/12 text-teal-300 border-teal-500/25", dot: "bg-teal-400" },
  "Sin asistencias": { cls: "bg-slate-500/12 text-slate-300 border-slate-500/25", dot: "bg-slate-400" },
};

export function StatusBadge({ estado, className }: { estado: string; className?: string }) {
  const c = CONFIG[estado] ?? CONFIG["Sin asistencias"];
  return (
    <Badge variant="outline" className={cn("gap-1.5 whitespace-nowrap font-medium", c.cls, className)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
      {estado}
    </Badge>
  );
}

const METODO_CLS: Record<string, string> = {
  efectivo: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  yape: "bg-violet-500/10 text-violet-300 border-violet-500/25",
  tarjeta: "bg-sky-500/10 text-sky-300 border-sky-500/25",
  debe: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  no_aplica: "bg-slate-500/10 text-slate-400 border-slate-500/25",
};

export function MetodoBadge({ metodo }: { metodo: string | null }) {
  if (!metodo) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", METODO_CLS[metodo] ?? METODO_CLS.no_aplica)}>
      {metodo === "no_aplica" ? "No aplica" : metodo.charAt(0).toUpperCase() + metodo.slice(1)}
    </Badge>
  );
}

export function estadoNormalizado(estado: string | null | undefined): EstadoPaciente | string {
  if (!estado) return "Sin asistencias";
  const conocidos: EstadoPaciente[] = ["Activo", "En pausa", "Abandonó", "Completó tratamiento", "Sin asistencias"];
  return conocidos.find((c) => c.toLowerCase() === estado.toLowerCase()) ?? estado;
}

/** Sí/No manual de «hay que cobrarle paquete»: el Sí resalta en ámbar, el No queda discreto. */
export function PaqueteBadge({ cobra }: { cobra: boolean | null | undefined }) {
  if (cobra) {
    return (
      <Badge variant="outline" className="whitespace-nowrap border-amber-500/30 bg-amber-500/15 font-semibold text-amber-300">
        Sí
      </Badge>
    );
  }
  return <span className="text-muted-foreground">No</span>;
}
