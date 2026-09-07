"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GRUPOS_EDAD_SUGERIDOS, OPCIONES_CONOCIO, OPCIONES_SEXO, grupoEdadDeValor } from "@/lib/types";
import { hoyISO } from "@/lib/business";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface FormularioPaciente {
  nombre_completo: string;
  sexo: string;
  edad_valor: string;
  edad_unidad: "años" | "meses";
  grupo_edad: string;
  celular_principal: string;
  celular_nota: string;
  celular_adicional: string;
  celular_revision: boolean;
  como_nos_conocio: string;
  referido_por: string;
  diagnostico: string;
  sistema_afectado: string;
  primera_sesion: string;
  sesiones_programadas: string;
}

export const FORM_VACIO: FormularioPaciente = {
  nombre_completo: "",
  sexo: "",
  edad_valor: "",
  edad_unidad: "años",
  grupo_edad: "",
  celular_principal: "",
  celular_nota: "",
  celular_adicional: "",
  celular_revision: false,
  como_nos_conocio: "",
  referido_por: "",
  diagnostico: "",
  sistema_afectado: "",
  primera_sesion: hoyISO(),
  sesiones_programadas: "",
};

export type DatosGuardado = {
  nombre_completo: string;
  sexo: string | null;
  edad_valor: number | null;
  edad_unidad: string | null;
  grupo_edad: string | null;
  celular_principal: string;
  celular_nota: string | null;
  celular_adicional: string | null;
  celular_revision: string | null;
  como_nos_conocio: string;
  referido_por: string | null;
  diagnostico: string | null;
  sistema_afectado: string | null;
  primera_sesion: string;
  sesiones_programadas: number | null;
};

export function grupoEdadSugerido(edad: number, unidad: "años" | "meses"): string {
  // Misma fórmula centralizada que usará la base de datos (types.ts → SQL nor_grupo_edad)
  return (
    grupoEdadDeValor(edad, unidad) ?? ""
  );
}

interface Props {
  modo: "pasos" | "completo";
  inicial?: FormularioPaciente;
  onGuardar: (datos: DatosGuardado) => Promise<boolean>; // true = éxito (cerrar)
  onCancelar?: () => void;
  guardando?: boolean;
}

const PASOS = ["Datos personales", "Contacto", "Origen", "Información clínica"] as const;

export function PacienteForm({ modo, inicial, onGuardar, onCancelar, guardando }: Props) {
  const [f, setF] = useState<FormularioPaciente>(inicial ?? FORM_VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof FormularioPaciente, string>>>({});
  const [paso, setPaso] = useState(0);

  const set = <K extends keyof FormularioPaciente>(campo: K, valor: FormularioPaciente[K], autoGrupo = false) => {
    setF((prev) => {
      const siguiente = { ...prev, [campo]: valor };
      // Auto-derivar grupo de edad cuando cambia la edad (salvo edición manual posterior del grupo)
      if (autoGrupo && campo === "edad_valor") {
        const n = Number(valor);
        if (valor !== "" && !isNaN(n) && n >= 0) {
          siguiente.grupo_edad = grupoEdadSugerido(n, siguiente.edad_unidad);
        }
      }
      if (autoGrupo && campo === "edad_unidad") {
        const n = Number(prev.edad_valor);
        if (prev.edad_valor !== "" && !isNaN(n) && n >= 0) {
          siguiente.grupo_edad = grupoEdadSugerido(n, valor as "años" | "meses");
        }
      }
      return siguiente;
    });
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const opcionesSexo = useMemo(() => {
    const actuales = OPCIONES_SEXO as readonly string[];
    return f.sexo && !actuales.includes(f.sexo) ? [f.sexo, ...actuales] : actuales;
  }, [f.sexo]);

  const opcionesGrupo = useMemo(() => {
    return f.grupo_edad && !GRUPOS_EDAD_SUGERIDOS.includes(f.grupo_edad)
      ? [f.grupo_edad, ...GRUPOS_EDAD_SUGERIDOS]
      : GRUPOS_EDAD_SUGERIDOS;
  }, [f.grupo_edad]);
  void opcionesGrupo;

  function validarPaso(n: number): boolean {
    const e: typeof errores = {};
    if (n === 0) {
      if (f.nombre_completo.trim().length < 3) e.nombre_completo = "Escribe el nombre completo (mínimo 3 letras).";
      else if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(f.nombre_completo)) e.nombre_completo = "El nombre debe contener letras.";
      if (f.edad_valor !== "") {
        const n = Number(f.edad_valor);
        if (isNaN(n) || n < 0) e.edad_valor = "La edad debe ser un número válido.";
        else if (f.edad_unidad === "meses" && n > 35) e.edad_valor = "En meses, el máximo esperado es 35 (usa años).";
        else if (f.edad_unidad === "años" && n > 120) e.edad_valor = "Revisa la edad: más de 120 años.";
      }
      if (!f.sexo) e.sexo = "Selecciona una opción.";
    }
    if (n === 1) {
      const digitos = f.celular_principal.replace(/\D/g, "");
      if (!digitos) e.celular_principal = "El celular es obligatorio para poder contactarlo.";
      else if (digitos.length !== 9) e.celular_principal = "El celular debe tener 9 dígitos (ej. 987 654 321).";
    }
    if (n === 2) {
      if (!f.como_nos_conocio) e.como_nos_conocio = "Selecciona cómo nos conoció.";
      if (f.como_nos_conocio === "Referidos" && !f.referido_por.trim())
        e.referido_por = "Escribe quién lo refirió.";
    }
    if (n === 3) {
      if (!f.primera_sesion) e.primera_sesion = "Indica la fecha de su primera sesión.";
      else if (f.primera_sesion > hoyISO()) e.primera_sesion = "La fecha no puede ser futura.";
      if (f.sesiones_programadas !== "") {
        const n = Number(f.sesiones_programadas);
        if (isNaN(n) || n < 1 || !Number.isInteger(n)) e.sesiones_programadas = "Debe ser un número entero mayor a 0.";
      }
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function submitFinal() {
    // Validar el paso actual en modo pasos; todos en modo completo
    if (modo === "pasos" && !validarPaso(paso)) return;
    if (modo === "completo") {
      for (let i = 0; i < PASOS.length; i++) {
        if (!validarPaso(i)) {
          setPaso(i);
          return;
        }
      }
    }
    const ok = await onGuardar({
      nombre_completo: f.nombre_completo.trim(),
      sexo: f.sexo || null,
      edad_valor: f.edad_valor === "" ? null : Number(f.edad_valor),
      edad_unidad: f.edad_valor === "" ? null : f.edad_unidad,
      grupo_edad: f.grupo_edad || null,
      celular_principal: f.celular_principal.trim(),
      celular_nota: f.celular_nota.trim() || null,
      celular_adicional: f.celular_adicional.trim() || null,
      celular_revision: f.celular_revision ? "Sí" : null,
      como_nos_conocio: f.como_nos_conocio,
      referido_por: f.referido_por.trim() || null,
      diagnostico: f.diagnostico.trim() || null,
      sistema_afectado: f.sistema_afectado.trim() || null,
      primera_sesion: f.primera_sesion,
      sesiones_programadas: f.sesiones_programadas === "" ? null : Number(f.sesiones_programadas),
    });
    if (!ok && modo === "completo") return;
  }

  const campo = "space-y-1.5";
  const inputCls = (k: keyof FormularioPaciente) => cn(errores[k] && "border-rose-500/60 focus-visible:ring-rose-500/40");

  function renderSeccion(n: number) {
    switch (n) {
      case 0:
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={cn(campo, "sm:col-span-2")}>
              <Label htmlFor="nombre">Nombre y apellidos *</Label>
              <Input
                id="nombre"
                placeholder="Ej. María Torres Quispe"
                value={f.nombre_completo}
                onChange={(e) => set("nombre_completo", e.target.value)}
                className={inputCls("nombre_completo")}
                autoComplete="off"
              />
              {errores.nombre_completo && <p className="text-xs text-rose-400">{errores.nombre_completo}</p>}
              <p className="text-[11px] text-muted-foreground">Se escribe junto: nombre y apellidos en un solo campo.</p>
            </div>
            <div className={campo}>
              <Label htmlFor="sexo">Sexo *</Label>
              <Select value={f.sexo} onValueChange={(v) => set("sexo", v)}>
                <SelectTrigger id="sexo" className={cn("w-full", inputCls("sexo"))}>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {opcionesSexo.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.sexo && <p className="text-xs text-rose-400">{errores.sexo}</p>}
            </div>
            <div className={campo}>
              <Label>Edad</Label>
              <div className="flex gap-2">
                <Input
                  aria-label="Edad"
                  type="number"
                  min={0}
                  placeholder="Ej. 34"
                  value={f.edad_valor}
                  onChange={(e) => set("edad_valor", e.target.value, true)}
                  className={cn("w-full", inputCls("edad_valor"))}
                />
                <Select value={f.edad_unidad} onValueChange={(v) => set("edad_unidad", v as "años" | "meses", true)}>
                  <SelectTrigger className="w-28" aria-label="Unidad de edad">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="años">años</SelectItem>
                    <SelectItem value="meses">meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {errores.edad_valor && <p className="text-xs text-rose-400">{errores.edad_valor}</p>}
              <p className="text-[11px] text-muted-foreground">Para bebés usa meses.</p>
            </div>
            <div className={cn(campo, "sm:col-span-2")}>
              <Label htmlFor="grupo">Grupo de edad</Label>
              <Input
                id="grupo"
                list="grupos-edad"
                placeholder="Se completa solo según la edad"
                value={f.grupo_edad}
                onChange={(e) => set("grupo_edad", e.target.value)}
              />
              <datalist id="grupos-edad">
                {GRUPOS_EDAD_SUGERIDOS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">Sugerido automáticamente; ajústalo si corresponde.</p>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={campo}>
              <Label htmlFor="cel">Celular principal *</Label>
              <Input
                id="cel"
                inputMode="tel"
                placeholder="987 654 321"
                value={f.celular_principal}
                onChange={(e) => set("celular_principal", e.target.value)}
                className={inputCls("celular_principal")}
              />
              {errores.celular_principal && <p className="text-xs text-rose-400">{errores.celular_principal}</p>}
            </div>
            <div className={campo}>
              <Label htmlFor="celnota">¿De quién es el número?</Label>
              <Input
                id="celnota"
                placeholder="Ej. De su esposo / Su hija"
                value={f.celular_nota}
                onChange={(e) => set("celular_nota", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Solo si el número no es del paciente.</p>
            </div>
            <div className={campo}>
              <Label htmlFor="cel2">Celular adicional</Label>
              <Input
                id="cel2"
                inputMode="tel"
                placeholder="Opcional"
                value={f.celular_adicional}
                onChange={(e) => set("celular_adicional", e.target.value)}
              />
            </div>
            <div className={cn(campo, "flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5")}>
              <div>
                <Label htmlFor="rev" className="text-sm">Marcar número para revisar</Label>
                <p className="text-[11px] text-muted-foreground">Si dudamos de si el número es correcto</p>
              </div>
              <Switch id="rev" checked={f.celular_revision} onCheckedChange={(v) => set("celular_revision", v)} />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={campo}>
              <Label>¿Cómo nos conoció? *</Label>
              <Select value={f.como_nos_conocio} onValueChange={(v) => set("como_nos_conocio", v)}>
                <SelectTrigger className={cn("w-full", inputCls("como_nos_conocio"))}>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {OPCIONES_CONOCIO.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.como_nos_conocio && <p className="text-xs text-rose-400">{errores.como_nos_conocio}</p>}
            </div>
            <div className={campo}>
              <Label htmlFor="ref">Detalles / ¿Quién lo refirió?</Label>
              <Input
                id="ref"
                placeholder="Ej. Recomendada por Rosa M."
                value={f.referido_por}
                onChange={(e) => set("referido_por", e.target.value)}
                className={inputCls("referido_por")}
              />
              {errores.referido_por && <p className="text-xs text-rose-400">{errores.referido_por}</p>}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={cn(campo, "sm:col-span-2")}>
              <Label htmlFor="diag">Diagnóstico</Label>
              <Input
                id="diag"
                placeholder="Ej. Lumbalgia crónica / Post operatorio rodilla"
                value={f.diagnostico}
                onChange={(e) => set("diagnostico", e.target.value)}
              />
            </div>
            <div className={cn(campo, "sm:col-span-2")}>
              <Label htmlFor="sist">Sistema afectado</Label>
              <Input
                id="sist"
                list="sistemas"
                placeholder="Ej. Musculoesquelético / Neurológico"
                value={f.sistema_afectado}
                onChange={(e) => set("sistema_afectado", e.target.value)}
              />
              <datalist id="sistemas">
                <option value="Musculoesquelético" />
                <option value="Neurológico" />
                <option value="Cardiovascular" />
                <option value="Respiratorio" />
                <option value="Pediátrico" />
                <option value="Gerontológico" />
              </datalist>
            </div>
            <div className={campo}>
              <Label htmlFor="primera">Primera sesión *</Label>
              <Input
                id="primera"
                type="date"
                max={hoyISO()}
                value={f.primera_sesion}
                onChange={(e) => set("primera_sesion", e.target.value)}
                className={inputCls("primera_sesion")}
              />
              {errores.primera_sesion && <p className="text-xs text-rose-400">{errores.primera_sesion}</p>}
            </div>
            <div className={campo}>
              <Label htmlFor="prog">Sesiones programadas</Label>
              <Input
                id="prog"
                type="number"
                min={1}
                placeholder="Ej. 10"
                value={f.sesiones_programadas}
                onChange={(e) => set("sesiones_programadas", e.target.value)}
                className={inputCls("sesiones_programadas")}
              />
              {errores.sesiones_programadas && <p className="text-xs text-rose-400">{errores.sesiones_programadas}</p>}
              <p className="text-[11px] text-muted-foreground">Cuántas sesiones tiene planificadas en total.</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  if (modo === "completo") {
    return (
      <div className="space-y-6">
        {PASOS.map((_, i) => (
          <section key={i}>
            {i > 0 && <hr className="mb-6 border-border/50" />}
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-teal-300">{PASOS[i]}</h4>
            {renderSeccion(i)}
          </section>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          {onCancelar && (
            <Button type="button" variant="ghost" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </Button>
          )}
          <Button onClick={() => void submitFinal()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Indicador de pasos */}
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Progreso del formulario">
        {PASOS.map((p, i) => (
          <div key={p} className="flex flex-1 flex-col gap-1">
            <div
              className={cn(
                "h-1 rounded-full transition-colors",
                i < paso ? "bg-teal-400" : i === paso ? "bg-teal-300/60" : "bg-secondary"
              )}
              aria-hidden
            />
            <span className={cn("truncate text-[10px]", i === paso ? "text-teal-300" : "text-muted-foreground")}>
              {p}
            </span>
          </div>
        ))}
      </div>

      {renderSeccion(paso)}

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setPaso((p) => Math.max(0, p - 1))}
          disabled={paso === 0 || guardando}
        >
          <ChevronLeft className="size-4" aria-hidden /> Atrás
        </Button>
        <p className="text-xs text-muted-foreground">Paso {paso + 1} de {PASOS.length}</p>
        {paso < PASOS.length - 1 ? (
          <Button
            type="button"
            onClick={() => {
              if (validarPaso(paso)) setPaso((p) => p + 1);
            }}
          >
            Siguiente <ChevronRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button onClick={() => void submitFinal()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar paciente"}
          </Button>
        )}
      </div>
    </div>
  );
}
