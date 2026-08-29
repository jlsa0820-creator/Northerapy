"use client";

import * as XLSX from "xlsx";
import { Asistencia, Ingreso, Paciente } from "./types";
import { deudaDePaciente, fmtFecha, totalDeIngreso } from "./business";

function descargar(rows: Record<string, unknown>[], nombre: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  // Ajustar ancho de columnas
  const cols = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.min(
      42,
      Math.max(k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length + 2))
    ),
  }));
  ws["!cols"] = cols;
  XLSX.writeFile(wb, nombre);
}

export function exportarPacientes(
  pacientes: Paciente[],
  asistencias: Asistencia[],
  ingresos: Ingreso[],
  sufijo = ""
) {
  const asisMap = new Map(asistencias.map((a) => [a.paciente_id, a]));
  const rows = pacientes.map((p) => {
    const a = asisMap.get(p.paciente_id);
    const ing = ingresos.filter((i) => i.paciente_id === p.paciente_id);
    return {
      "ID": p.paciente_id,
      "Nombre completo": p.nombre_completo,
      "Grupo de edad": p.grupo_edad ?? "",
      "Edad": p.edad_valor ?? "",
      "Unidad": p.edad_unidad ?? "",
      "Sexo": p.sexo ?? "",
      "Celular principal": p.celular_principal ?? "",
      "Nota celular": p.celular_nota ?? "",
      "Celular adicional": p.celular_adicional ?? "",
      "Cómo nos conoció": p.como_nos_conocio ?? "",
      "Referido por": p.referido_por ?? "",
      "Diagnóstico": p.diagnostico ?? "",
      "Sistema afectado": p.sistema_afectado ?? "",
      "Primera sesión": fmtFecha(p.primera_sesion),
      "Sesiones programadas": p.sesiones_programadas ?? "",
      "Sesiones totales": p.sesiones_totales,
      "Última asistencia": a?.ultima_asistencia ? fmtFecha(a.ultima_asistencia) : "",
      "Adherencia %": a?.pct_adherencia ?? "",
      "Días sin asistir": a?.dias_sin_asistir ?? "",
      "Frec. semanal": a?.frec_semanal ?? "",
      "Deuda (S/)": deudaDePaciente(ing),
      "Status": p.status ?? "",
    };
  });
  descargar(rows, `northerapy_pacientes${sufijo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportarIngresos(ingresos: Ingreso[], pacientes: Paciente[], sufijo = "") {
  const pacMap = new Map(pacientes.map((p) => [p.paciente_id, p.nombre_completo]));
  const rows = [...ingresos]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id))
    .map((i) => ({
      "ID": i.id,
      "Fecha": fmtFecha(i.fecha),
      "Paciente": pacMap.get(i.paciente_id) ?? `#${i.paciente_id}`,
      "Zonas": i.zonas,
      "Terapia estado": i.terapia_estado ?? "",
      "Terapia S/": i.terapia_monto ?? 0,
      "Diclofenaco estado": i.diclofenaco_estado ?? "",
      "Diclofenaco S/": i.diclofenaco_monto ?? 0,
      "Ortopédico estado": i.ortopedico_estado ?? "",
      "Ortopédico S/": i.ortopedico_monto ?? 0,
      "Total S/": totalDeIngreso(i),
    }));
  descargar(rows, `northerapy_ingresos${sufijo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
