"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface KPICardProps {
  titulo: string;
  valor: string;
  icono: React.ComponentType<{ className?: string }>;
  detalle?: React.ReactNode;
  nota?: string;
  acento?: "teal" | "amber" | "rose" | "violet" | "emerald";
}

const ACENTOS: Record<string, string> = {
  teal: "text-teal-300 bg-teal-500/10 border-teal-500/20",
  emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  amber: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  rose: "text-rose-300 bg-rose-500/10 border-rose-500/20",
  violet: "text-violet-300 bg-violet-500/10 border-violet-500/20",
};

export function KPICard({ titulo, valor, icono: Icono, detalle, nota, acento = "teal" }: KPICardProps) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-lg shadow-black/20 backdrop-blur">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
            {titulo}
          </p>
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", ACENTOS[acento])}>
            <Icono className="size-4" aria-hidden />
          </div>
        </div>
        <p className="num-tabular mt-2 text-xl font-bold text-foreground sm:text-2xl">{valor}</p>
        {detalle && <div className="mt-1.5 text-xs text-muted-foreground">{detalle}</div>}
        {nota && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-teal-300 transition-colors" type="button">
                  <Info className="size-3" aria-hidden /> ¿Por qué este monto?
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64 text-xs bg-popover border-border">
                <p>{nota}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
