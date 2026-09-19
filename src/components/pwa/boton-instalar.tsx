"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function yaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
  );
}

function esIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
}

/**
 * Botón «Instalar app»: usa el prompt nativo cuando el navegador lo permite
 * (Chrome/Android/desktop) y muestra instrucciones en Safari iOS.
 */
export function BotonInstalar() {
  const { toast } = useToast();
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalada, setInstalada] = useState(yaInstalada);

  useEffect(() => {
    if (yaInstalada()) return;

    const alPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    const alInstalar = () => {
      setInstalada(true);
      setEvento(null);
    };

    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (instalada) return null;

  async function instalar() {
    if (evento) {
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      if (outcome === "accepted") {
        setInstalada(true);
        setEvento(null);
      }
      return;
    }
    toast({
      title: esIOS() ? "Instalar en iPhone/iPad" : "Instalar la app",
      description: esIOS()
        ? "Toca el botón Compartir (cuadrado con una flecha ↑) y elige «Añadir a pantalla de inicio»."
        : "Abre el menú del navegador (⋮) y elige «Instalar aplicación» o «Añadir a pantalla de inicio».",
      duration: 7000,
    });
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-teal-300"
            onClick={() => void instalar()}
            aria-label="Instalar app en tu celular"
          >
            <Smartphone className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Instalar como app</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
