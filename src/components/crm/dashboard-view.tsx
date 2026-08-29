"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCrmStore } from "@/lib/store";
import {
  CRITERIO_SEGMENTO,
  calcularEstado,
  desglosePorMetodo,
  deudaDePaciente,
  edadLegible,
  enRango,
  fmtFecha,
  fechaLocal,
  isoDeFecha,
  pagadoDeIngreso,
  rangoDePreset,
  segmentoDe,
  soles,
  totalDeIngreso,
  type PeriodoPreset,
  type Rango,
  type Segmento,
} from "@/lib/business";
import { Vista } from "@/lib/types";
import { KPICard } from "./kpi-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORES = ["#2DD4BF", "#F59E0B", "#F43F5E", "#A3E635", "#E879F9", "#22D3EE", "#FDA4AF", "#86EFAC"];
const EJES = { tick: { fill: "#8FA3BF", fontSize: 11 }, grid: "rgba(148,163,184,0.12)" };

// Iconos KPI (emoji con estilo consistente)
const IcoDinero = ({ className }: { className?: string }) => <span className={cn(className, "text-base")} aria-hidden>💰</span>;
const IcoFacturado = ({ className }: { className?: string }) => <span className={cn(className, "text-base")} aria-hidden>🧾</span>;
const IcoDeuda = ({ className }: { className?: string }) => <span className={cn(className, "text-base")} aria-hidden>⚠️</span>;
const IcoTerapia = ({ className }: { className?: string }) => <span className={cn(className, "text-base")} aria-hidden>🦵</span>;
const IcoAtendidos = ({ className }: { className?: string }) => <span className={cn(className, "text-base")} aria-hidden>🧑‍🦽</span>;
const IcoNuevos = ({ className }: { className?: string }) => <span className={cn(className, "text-base")} aria-hidden>✨</span>;

function TooltipGrafico({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label != null && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="num-tabular flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

interface Props {
  irA: (v: Vista, pacienteId?: number) => void;
}

export function DashboardView({ irA }: Props) {
  const { pacientes, asistencias, ingresos } = useCrmStore();
  const [periodo, setPeriodo] = useState<PeriodoPreset>("mes");
  const rango = rangoDePreset(periodo);

  const datos = useMemo(() => {
    // Mapas base
    const ingresosPorPaciente = new Map<number, typeof ingresos>();
    for (const i of ingresos) {
      const arr = ingresosPorPaciente.get(i.paciente_id) ?? [];
      arr.push(i);
      ingresosPorPaciente.set(i.paciente_id, arr);
    }
    const asisPorPaciente = new Map(asistencias.map((a) => [a.paciente_id, a]));

    const ctxPacientes = pacientes.map((p) => ({
      p,
      ctx: {
        paciente: p,
        asistencia: asisPorPaciente.get(p.paciente_id) ?? null,
        ingresos: ingresosPorPaciente.get(p.paciente_id) ?? [],
      },
    }));

    const enPeriodo = ingresos.filter((i) => enRango(i.fecha, rango));
    const visitasPeriodo = enPeriodo.filter((i) => i.zonas > 0);
    const dineroMetodo = desglosePorMetodo(enPeriodo);

    const dineroEntro = dineroMetodo.efectivo + dineroMetodo.yape + dineroMetodo.tarjeta;
    const facturado = enPeriodo.reduce((acc, i) => acc + totalDeIngreso(i), 0);
    const deudaViva = pacientes.reduce((acc, p) => {
      const d = deudaDePaciente(ingresosPorPaciente.get(p.paciente_id) ?? []);
      return acc + Math.max(0, d);
    }, 0);

    const unicos = new Set(visitasPeriodo.map((i) => i.paciente_id)).size;
    const nuevos = pacientes.filter((p) => p.primera_sesion && enRango(p.primera_sesion, rango));

    // Serie temporal (diaria o mensual según el rango)
    const dias = rango.from && rango.to ? diasEntre(rango.from, rango.to) : 400;
    const mensual = dias > 62;
    const serie = new Map<string, { asistencias: number; dinero: number }>();
    const clave = (iso: string) => (mensual ? iso.slice(0, 7) : iso);
    if (rango.from) {
      // inicializar ejes para evitar huecos
      const cursor = fechaLocal(rango.from)!;
      const fin = fechaLocal(rango.to ?? isoDeFecha(new Date()))!;
      let guardia = 0;
      while (cursor <= fin && guardia < 500) {
        serie.set(clave(isoDeFecha(cursor)), { asistencias: 0, dinero: 0 });
        cursor.setDate(cursor.getDate() + (mensual ? 28 : 1));
        guardia++;
      }
    }
    for (const i of visitasPeriodo) {
      const k = clave(i.fecha);
      const cur = serie.get(k) ?? { asistencias: 0, dinero: 0 };
      cur.asistencias += 1;
      serie.set(k, cur);
    }
    for (const i of enPeriodo) {
      const k = clave(i.fecha);
      const cur = serie.get(k) ?? { asistencias: 0, dinero: 0 };
      cur.dinero += pagadoDeIngreso(i);
      serie.set(k, cur);
    }
    const serieLista = [...serie.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => ({
        periodo: mensual ? nombreMes(k) : k.slice(8, 10) + "/" + k.slice(5, 7),
        ...v,
      }));

    // Donuts y barras
    const porMetodo = [
      { name: "Efectivo", value: Math.round(dineroMetodo.efectivo * 100) / 100 },
      { name: "Yape", value: Math.round(dineroMetodo.yape * 100) / 100 },
      { name: "Tarjeta", value: Math.round(dineroMetodo.tarjeta * 100) / 100 },
    ].filter((d) => d.value > 0);

    const estadosCount = new Map<string, number>();
    for (const { ctx } of ctxPacientes) {
      const e = calcularEstado(ctx);
      estadosCount.set(e, (estadosCount.get(e) ?? 0) + 1);
    }
    const porEstado = [...estadosCount.entries()].map(([name, value]) => ({ name, value }));

    const conocioCount = new Map<string, number>();
    for (const p of pacientes) {
      const k = p.como_nos_conocio?.trim() || "Sin dato";
      conocioCount.set(k, (conocioCount.get(k) ?? 0) + 1);
    }
    const porConocio = [...conocioCount.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const servicios = [
      { name: "Fisioterapia", value: Math.round(enPeriodo.reduce((a, i) => a + (i.terapia_monto ?? 0), 0) * 100) / 100 },
      { name: "Diclofenaco", value: Math.round(enPeriodo.reduce((a, i) => a + (i.diclofenaco_monto ?? 0), 0) * 100) / 100 },
      { name: "Ortopédico", value: Math.round(enPeriodo.reduce((a, i) => a + (i.ortopedico_monto ?? 0), 0) * 100) / 100 },
    ];

    // Segmentación
    const porSegmento = new Map<Segmento, { p: typeof pacientes[number]; ctx: (typeof ctxPacientes)[number]["ctx"] }[]>();
    for (const item of ctxPacientes) {
      const s = segmentoDe(item.ctx);
      const arr = porSegmento.get(s) ?? [];
      arr.push({ p: item.p, ctx: item.ctx });
      porSegmento.set(s, arr);
    }

    // Adherencia promedio (pacientes con programa definido)
    const adhs = ctxPacientes
      .map(({ ctx }) => {
        const ses = Math.max(ctx.paciente.sesiones_totales, ctx.asistencia?.ses_totales ?? 0);
        const prog = ctx.paciente.sesiones_programadas ?? ctx.asistencia?.ses_programadas ?? null;
        return prog && prog > 0 ? Math.min(100, Math.round((ses / prog) * 100)) : null;
      })
      .filter((v): v is number => v != null);
    const adherenciaProm = adhs.length ? Math.round(adhs.reduce((a, b) => a + b, 0) / adhs.length) : null;

    // Días laborales del periodo
    const diasLaborales = contarLaborales(rango);

    return {
      dineroEntro,
      dineroMetodo,
      facturado,
      deudaViva,
      asistencias: visitasPeriodo.length,
      unicos,
      nuevos,
      porPaciente: ingresosPorPaciente,
      serieLista,
      porMetodo,
      porEstado,
      porConocio,
      servicios,
      porSegmento,
      adherenciaProm,
      diasLaborales,
    };
  }, [pacientes, asistencias, ingresos, rango]);

  const promedioDia = datos.diasLaborales > 0 ? (datos.asistencias / datos.diasLaborales).toFixed(1) : "—";

  return (
    <div className="space-y-5">
      {/* Encabezado + selector de periodo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Resumen del negocio</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{rango.label}</p>
        </div>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoPreset)}>
          <SelectTrigger className="w-52" aria-label="Seleccionar periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="mes_anterior">Mes anterior</SelectItem>
            <SelectItem value="3m">Últimos 3 meses</SelectItem>
            <SelectItem value="anio">Este año</SelectItem>
            <SelectItem value="todo">Todo el histórico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPICard
          titulo="Dinero que entró"
          valor={soles(datos.dineroEntro)}
          icono={IcoDinero}
          detalle={
            <span className="num-tabular">
              Efe {soles(datos.dineroMetodo.efectivo)} · Yape {soles(datos.dineroMetodo.yape)} · Tarj{" "}
              {soles(datos.dineroMetodo.tarjeta)}
            </span>
          }
          nota="Solo cuenta líneas pagadas con método real (efectivo, yape o tarjeta) dentro del periodo seleccionado."
        />
        <KPICard
          titulo="Servicios facturados"
          valor={soles(datos.facturado)}
          icono={IcoFacturado}
          detalle="Pagado + por cobrar del periodo"
          acento="violet"
          nota="Todo lo facturado en el periodo (terapias, diclofenaco y ortopédicos), sin importar si ya se cobró."
        />
        <KPICard
          titulo="Por cobrar (deuda viva)"
          valor={soles(datos.deudaViva)}
          icono={IcoDeuda}
          detalle="Deuda actual de todos los pacientes"
          acento="rose"
          nota="Refleja la deuda viva en este momento — líneas con estado «debe» — independientemente del periodo seleccionado arriba."
        />
        <KPICard
          titulo="Asistencias"
          valor={String(datos.asistencias)}
          icono={IcoTerapia}
          detalle={`Promedio ${promedioDia} por día laboral`}
        />
        <KPICard
          titulo="Pacientes atendidos"
          valor={String(datos.unicos)}
          icono={IcoAtendidos}
          detalle={`Únicos en el periodo`}
          acento="emerald"
        />
        <KPICard
          titulo="Pacientes nuevos"
          valor={String(datos.nuevos.length)}
          icono={IcoNuevos}
          detalle={datos.nuevos.length ? `Desde ${fmtFecha(datos.nuevos.reduce((min, p) => (p.primera_sesion! < min ? p.primera_sesion! : min), datos.nuevos[0].primera_sesion!))}` : "Sin nuevos aún"}
          acento="amber"
        />
      </div>

      {/* Evolución */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Asistencias por {datos.serieLista.length > 1 && rango.from && diasEntre(rango.from, rango.to ?? isoDeFecha(new Date())) > 62 ? "mes" : "día"}</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos.serieLista} margin={{ top: 5, right: 10, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={EJES.grid} vertical={false} />
                <XAxis dataKey="periodo" tick={EJES.tick} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tick={EJES.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip content={<TooltipGrafico />} />
                <Line type="monotone" dataKey="asistencias" name="Asistencias" stroke="#2DD4BF" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Dinero que entra</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={datos.serieLista} margin={{ top: 5, right: 10, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="gradDinero" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={EJES.grid} vertical={false} />
                <XAxis dataKey="periodo" tick={EJES.tick} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tick={EJES.tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `S/${v}`} />
                <RTooltip content={<TooltipGrafico />} />
                <Area type="monotone" dataKey="dinero" name="Cobrado (S/)" stroke="#2DD4BF" strokeWidth={2} fill="url(#gradDinero)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Donuts y barras */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Dinero por método</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {datos.porMetodo.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={datos.porMetodo} dataKey="value" nameKey="name" innerRadius={45} outerRadius={68} paddingAngle={3} stroke="none">
                    {datos.porMetodo.map((_, i) => (
                      <Cell key={i} fill={COLORES[i % COLORES.length]} />
                    ))}
                  </Pie>
                  <RTooltip content={<TooltipGrafico />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#8FA3BF" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin cobros en el periodo</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Estado de los pacientes</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {datos.porEstado.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={datos.porEstado} dataKey="value" nameKey="name" innerRadius={45} outerRadius={68} paddingAngle={3} stroke="none">
                    {datos.porEstado.map((_, i) => (
                      <Cell key={i} fill={COLORES[(i + 2) % COLORES.length]} />
                    ))}
                  </Pie>
                  <RTooltip content={<TooltipGrafico />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#8FA3BF" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin datos</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Servicios del periodo</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos.servicios} layout="vertical" margin={{ top: 5, right: 12, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={EJES.grid} horizontal={false} />
                <XAxis type="number" tick={EJES.tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `S/${v}`} />
                <YAxis type="category" dataKey="name" tick={EJES.tick} tickLine={false} axisLine={false} width={72} />
                <RTooltip content={<TooltipGrafico />} />
                <Bar dataKey="value" name="Facturado (S/)" radius={[0, 6, 6, 0]} barSize={18}>
                  {datos.servicios.map((_, i) => (
                    <Cell key={i} fill={COLORES[i % COLORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cómo nos conocieron</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos.porConocio} layout="vertical" margin={{ top: 5, right: 12, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={EJES.grid} horizontal={false} />
                <XAxis type="number" tick={EJES.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={EJES.tick} tickLine={false} axisLine={false} width={92} />
                <RTooltip content={<TooltipGrafico />} />
                <Bar dataKey="value" name="Pacientes" fill="#22D3EE" radius={[0, 6, 6, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Segmentación de comportamiento */}
      <Card className="border-border/70 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Users2 className="size-4 text-teal-300" aria-hidden /> Análisis de comportamiento
          </CardTitle>
          <p className="text-xs italic text-muted-foreground">
            Se consideran los pacientes tanto nuevos como antiguos atendidos en el periodo.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(CRITERIO_SEGMENTO) as Segmento[]).map((seg) => {
            const lista = datos.porSegmento.get(seg) ?? [];
            return (
              <Collapsible key={seg} className="rounded-lg border border-border/60 bg-secondary/30">
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {seg}
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold",
                        lista.length ? "bg-teal-500/15 text-teal-300" : "bg-slate-500/15 text-slate-400"
                      )}>
                        {lista.length}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{CRITERIO_SEGMENTO[seg]}</p>
                  </div>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto px-3.5 pb-3">
                    {lista.length === 0 && <li className="text-xs text-muted-foreground">Sin pacientes en este segmento.</li>}
                    {lista.map(({ p, ctx }) => (
                      <li key={p.paciente_id} className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2">
                        <button
                          className="w-full text-left text-xs font-medium hover:text-teal-300"
                          onClick={() => irA("visita", p.paciente_id)}
                        >
                          {p.nombre_completo}
                          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                            {edadLegible(p)} · {ctx.paciente.sistema_afectado ?? "sin sistema registrado"} · {calcularEstado(ctx)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Utilidades locales ──────────────────────────────────────────────────────

function diasEntre(fromISO: string, toISO: string): number {
  const a = fechaLocal(fromISO)!;
  const b = fechaLocal(toISO)!;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function contarLaborales(r: Rango): number {
  const desde = r.from ? fechaLocal(r.from)! : null;
  const hasta = r.to ? fechaLocal(r.to)! : null;
  if (!desde || !hasta) return 0;
  const cursor = new Date(desde);
  let n = 0;
  let guardia = 0;
  while (cursor <= hasta && guardia < 800) {
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) n++;
    cursor.setDate(cursor.getDate() + 1);
    guardia++;
  }
  return n;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
function nombreMes(clave: string): string {
  const [, mm] = clave.split("-");
  const idx = Number(mm) - 1;
  return `${MESES[idx] ?? mm} ${clave.slice(2, 4)}`;
}
