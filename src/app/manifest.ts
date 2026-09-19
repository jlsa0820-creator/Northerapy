import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Northerapy CRM — Centro de Fisioterapia",
    short_name: "Northerapy",
    description:
      "Gestión de pacientes, visitas, cobros e ingresos del centro de fisioterapia Northerapy.",
    id: "/",
    start_url: "/?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0F172A",
    theme_color: "#0F172A",
    lang: "es",
    dir: "ltr",
    categories: ["business", "medical", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Anotar visita y cobro",
        short_name: "Visita",
        description: "Registrar la visita de hoy y cobrarla",
        url: "/?v=visita",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Nuevo paciente",
        short_name: "Nuevo",
        description: "Dar de alta un paciente",
        url: "/?v=nuevo",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Quién debe",
        short_name: "Deudas",
        description: "Ver deudas pendientes de cobro",
        url: "/?v=debe",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
