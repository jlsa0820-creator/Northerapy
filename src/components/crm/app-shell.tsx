"use client";

import { useEffect, useState } from "react";
import { useCrmStore } from "@/lib/store";
import { Vista } from "@/lib/types";
import { LoginView } from "./login-view";
import { DashboardView } from "./dashboard-view";
import { PacientesView } from "./pacientes-view";
import { NuevoPacienteView } from "./nuevo-paciente-view";
import { VisitaView } from "./visita-view";
import { IngresosView } from "./ingresos-view";
import { QuienDebeView } from "./quien-debe-view";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  Activity,
  CalendarPlus,
  CircleDollarSign,
  HandCoins,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deudaDePaciente } from "@/lib/business";

const NAV: { id: Vista; etiqueta: string; icono: typeof LayoutDashboard }[] = [
  { id: "dashboard", etiqueta: "Resumen", icono: LayoutDashboard },
  { id: "visita", etiqueta: "Visita y cobro", icono: CalendarPlus },
  { id: "pacientes", etiqueta: "Pacientes", icono: Users },
  { id: "nuevo", etiqueta: "Nuevo paciente", icono: UserPlus },
  { id: "ingresos", etiqueta: "Dinero que entra", icono: CircleDollarSign },
  { id: "debe", etiqueta: "Quién debe", icono: HandCoins },
];

export function CrmApp() {
  const {
    session,
    authReady,
    dataReady,
    loadingData,
    loadError,
    initAuth,
    loadData,
    signOut,
    ingresos,
    recoveryMode,
    setRecoveryMode,
  } = useCrmStore();

  const [vista, setVista] = useState<Vista>("dashboard");
  const [pacientePreselecc, setPacientePreselecc] = useState<number | null>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  // Init de auth + detección de enlace de recuperación en la URL
  useEffect(() => {
    const desuscribir = initAuth();
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setRecoveryMode(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    return desuscribir;
  }, []);

  function irA(v: Vista, pacienteId?: number) {
    setVista(v);
    setPacientePreselecc(pacienteId ?? null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  const nDeudores = (() => {
    const ids = new Set(ingresos.map((i) => i.paciente_id));
    let n = 0;
    for (const id of ids) {
      if (deudaDePaciente(ingresos.filter((i) => i.paciente_id === id)) > 0) n++;
    }
    return n;
  })();

  // Pantallas de carga y login
  if (!authReady) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-7 animate-spin text-teal-300" aria-hidden />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  if (!session || recoveryMode) return <LoginView />;

  if (!dataReady) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-7 animate-spin text-teal-300" aria-hidden />
        <p className="text-sm text-muted-foreground">Cargando tus pacientes…</p>
      </main>
    );
  }

  const correo = session.user?.email ?? "equipo@northerapy";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Cabecera */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10">
              <Activity className="size-4 text-teal-300" aria-hidden />
            </div>
            <span className="hidden text-sm font-bold tracking-tight sm:block">Northerapy CRM</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {loadError && (
              <span className="hidden max-w-48 truncate text-[11px] text-amber-400 md:block" title={loadError}>
                ⚠ {loadError}
              </span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground hover:text-teal-300"
                    onClick={() => void loadData()}
                    aria-label="Actualizar datos desde Supabase"
                    disabled={loadingData}
                  >
                    <RefreshCw className={cn("size-4", loadingData && "animate-spin")} aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Actualizar datos (si cambiaron algo directo en la base)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hidden max-w-40 truncate rounded-md border border-border/70 bg-secondary/60 px-2.5 py-1 text-xs text-muted-foreground sm:block">
                    {correo}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Sesión activa</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="outline"
              size="sm"
              className="h-9 border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
              onClick={() => setConfirmarSalida(true)}
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Cuerpo */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-3 py-4 sm:px-5 sm:py-6">
        {/* Navegación lateral (desktop) */}
        <nav aria-label="Navegación principal" className="hidden w-56 shrink-0 lg:block">
          <ul className="sticky top-20 space-y-1">
            {NAV.map((item) => {
              const activo = vista === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => irA(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                      activo
                        ? "border-teal-500/40 bg-teal-500/10 text-teal-200 shadow-[0_0_20px_-8px_rgba(45,212,191,0.5)]"
                        : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-secondary/50 hover:text-foreground"
                    )}
                    aria-current={activo ? "page" : undefined}
                  >
                    <item.icono className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 text-left">{item.etiqueta}</span>
                    {item.id === "debe" && nDeudores > 0 && (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                        {nDeudores}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="sticky top-[30rem] mt-4 px-3 text-[11px] leading-relaxed text-muted-foreground/60">
            Todo lo que registres aquí se guarda directamente en Supabase.
          </p>
        </nav>

        {/* Contenido de la vista */}
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">
          {vista === "dashboard" && <DashboardView irA={irA} />}
          {vista === "visita" && (
            <VisitaView pacienteInicial={pacientePreselecc} onPacienteUsado={() => setPacientePreselecc(null)} />
          )}
          {vista === "pacientes" && <PacientesView irA={irA} />}
          {vista === "nuevo" && <NuevoPacienteView irA={irA} />}
          {vista === "ingresos" && <IngresosView irA={irA} />}
          {vista === "debe" && <QuienDebeView />}
        </main>
      </div>

      {/* Navegación inferior (móvil) */}
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-sidebar/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((item) => {
            const activo = vista === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => irA(item.id)}
                  className={cn(
                    "relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors",
                    activo ? "text-teal-300" : "text-muted-foreground"
                  )}
                  aria-current={activo ? "page" : undefined}
                >
                  {activo && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-teal-400" aria-hidden />}
                  <item.icono className="size-5" aria-hidden />
                  <span className="leading-tight">{item.etiqueta.split(" ")[0]}</span>
                  {item.id === "debe" && nDeudores > 0 && (
                    <span className="absolute right-1.5 top-1 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                      {nDeudores}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Confirmación de salida */}
      <AlertDialog open={confirmarSalida} onOpenChange={setConfirmarSalida}>
        <AlertDialogContent className="border-border/70 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se vaciarán los datos en memoria de este navegador. Tendrás que volver a iniciar sesión para continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500/90 text-white hover:bg-rose-500"
              onClick={() => void signOut()}
            >
              Sí, salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
