"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (/sw.js) cuando la página terminó de cargar.
 * Silencioso: si el navegador no lo soporta o falla, la app funciona igual.
 */
export function RegistroSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sin SW la app sigue funcionando (solo pierde offline/instalable) */
      });
    };

    if (document.readyState === "complete") {
      registrar();
      return;
    }
    window.addEventListener("load", registrar, { once: true });
    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
