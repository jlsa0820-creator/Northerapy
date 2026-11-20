# Northerapy CRM

CRM web para un centro de fisioterapia: registro de pacientes, visitas y cobros,
historial clínico por episodios y métricas del negocio — todo en una interfaz
rápida, en español y optimizada para móvil. Instalable como app (PWA).

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e) ![PWA](https://img.shields.io/badge/PWA-instalable-a855f7)

## Características

- **🔐 Acceso seguro** — autenticación por email y contraseña (Supabase Auth) con
  recuperación de contraseña. Toda la base de datos está protegida con RLS:
  solo usuarios autenticados pueden leer y escribir.
- **📊 Resumen** — KPIs del negocio del mes (ingresos, sesiones, pacientes
  activos, deuda pendiente) con gráficas de evolución diaria y métodos de pago.
- **🗓️ Visita y cobro** — registra la sesión del día en segundos: zonas a
  tratar, tarifa (suelta, cubierta por paquete u otro monto), venta de productos
  (diclofenaco, ortopédico) y método de pago por concepto (efectivo, Yape,
  tarjeta, debe). Al vender un paquete de 5 sesiones, la sesión del día queda
  cubierta y las siguientes se descuentan automáticamente.
- **👥 Pacientes** — buscador, ficha completa y **historial clínico por
  episodios**: cada diagnóstico tiene su propia línea de tiempo con sesiones
  acumuladas, estado (activo / completado / abandonado) y fechas de alta y
  cierre. Si un paciente regresa con un diagnóstico nuevo, se abre un nuevo
  episodio y el conteo de sesiones vuelve a empezar.
- **➕ Nuevo paciente** — alta con datos demográficos, contacto, origen
  (referido, posta, paciente antiguo…) y diagnóstico inicial. Incluye el campo
  manual **«¿Hay que cobrarle paquete?» (Sí/No)** — pensado para los pacientes
  con fractura — visible como columna en la lista de pacientes y resaltado en
  la sección clínica de su ficha.
- **💰 Dinero que entra** — ingresos por fecha con desglose por concepto y
  método de pago, y exportación a Excel.
- **⚠️ Quién debe** — pacientes con pagos pendientes (“debe”) y totales por
  cobrar.
- **📱 PWA** — instalable en el celular (icono, pantalla completa, atajos a
  “Anotar visita” y “Nuevo paciente”), soporte offline básico y UI adaptada a
  zonas táctiles y safe-areas de iOS.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 |
| Lenguaje | TypeScript 5 |
| UI | Tailwind CSS 4 · shadcn/ui · lucide-react |
| Estado | Zustand |
| Gráficas | Recharts |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Exportación | xlsx |

## Puesta en marcha

Requisitos: Node.js 20+ (o Bun 1.x).

```bash
# 1. Instalar dependencias
npm install        # o: bun install

# 2. (Opcional) configurar variables de entorno en .env.local
#    NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>

# 3. Ejecutar en desarrollo
npm run dev        # o: bun run dev  →  http://localhost:3000
```

> Si no hay variables de entorno, la app usa el proyecto Supabase configurado
> por defecto en `src/lib/supabase.ts`. La *anon key* es pública por diseño:
> el acceso a los datos lo controla RLS, que solo admite usuarios autenticados.

### Producción

```bash
npm run build && npm start
```

## Base de datos

El backend es una base de datos PostgreSQL en Supabase con estas tablas:

- `pacientes` — datos demográficos, contacto, diagnóstico y estado.
- `asistencias` — contadores por paciente (sesiones totales, días sin asistir,
  frecuencia semanal), mantenidos por trigger.
- `ingresos` — un registro por cobro: terapia, productos y paquetes, con
  método de pago y total.
- `episodios` — historial clínico: un episodio por diagnóstico, con la
  restricción de un solo episodio activo por paciente y las sesiones
  calculadas automáticamente a partir de `ingresos`.

En `download/` están los scripts SQL listos para el SQL Editor de Supabase
(esquema, vistas, fórmulas escalables e historial médico por episodios).

## Estructura del proyecto

```
src/
├── app/              # App Router: página única, manifest PWA, iconos
├── components/
│   ├── crm/          # Vistas del CRM (resumen, visita y cobro, pacientes…)
│   ├── pwa/          # Botón de instalación y registro del service worker
│   └── ui/           # Componentes base (shadcn/ui)
├── hooks/            # Hooks compartidos
└── lib/              # Cliente Supabase, store Zustand, tipos y lógica de negocio
scripts/              # Tests E2E (agent-browser), tests SQL (PGlite) y mock de Supabase
download/             # Scripts SQL para Supabase
public/               # Iconos PWA, logo, service worker
```

## Testing

- **Tests de lógica SQL** (PGlite, sin conexión):

  ```bash
  node scripts/test-formulas-sql.mjs
  node scripts/test-historial-medico.mjs
  ```

- **Tests E2E de UI** — usan un mock de Supabase en memoria
  (`scripts/init-mock-supabase.js`) y [agent-browser](https://www.npmjs.com/package/agent-browser)
  para recorrer la app de verdad:

  ```bash
  ./scripts/test-historial-ui.sh
  ./scripts/test-cobro-desplegables.sh
  ```
Despliegue en Vercel
