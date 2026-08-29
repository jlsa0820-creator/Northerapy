"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PacienteForm, type DatosGuardado } from "./paciente-form";
import { useCrmStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Vista } from "@/lib/types";
import { UserPlus } from "lucide-react";

interface Props {
  irA: (v: Vista, pacienteId?: number) => void;
}

export function NuevoPacienteView({ irA }: Props) {
  const crearPaciente = useCrmStore((s) => s.crearPaciente);
  const { toast } = useToast();
  const [guardando, setGuardando] = useState(false);

  async function guardar(datos: DatosGuardado): Promise<boolean> {
    setGuardando(true);
    const res = await crearPaciente(datos);
    setGuardando(false);
    if (res.ok) {
      toast({
        title: "Paciente creado ✓",
        description: "Ya puedes anotar su primera visita y cobro.",
      });
      irA("visita", res.id);
      return true;
    }
    toast({
      title: "No se pudo crear el paciente",
      description: res.error,
      variant: "destructive",
    });
    return false;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10">
          <UserPlus className="size-5 text-teal-300" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Nuevo paciente</h1>
          <p className="text-sm text-muted-foreground">Llena sus datos paso a paso con lenguaje simple.</p>
        </div>
      </div>

      <Card className="border-border/70 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ficha del paciente</CardTitle>
          <CardDescription>Los campos con * son obligatorios. Todo se guarda en Supabase al finalizar.</CardDescription>
        </CardHeader>
        <CardContent>
          <PacienteForm modo="pasos" onGuardar={guardar} guardando={guardando} />
        </CardContent>
      </Card>
    </div>
  );
}
