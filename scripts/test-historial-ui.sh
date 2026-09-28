#!/bin/bash
# Prueba E2E del historial médico (fase 2): episodios en la app.
# Usa --init-script con el mini-PostgREST simulado (stateful: POST/PATCH reales).
# Las filas de la tabla de pacientes no son botones → clics dirigidos por JS.
AB="agent-browser"
BASE="http://localhost:3000"
INIT="/home/z/my-project/scripts/init-mock-supabase.js"
PASOS=0
FALLOS=0
ok()   { PASOS=$((PASOS+1)); echo "   ✓ $1"; }
mal()  { PASOS=$((PASOS+1)); FALLOS=$((FALLOS+1)); echo "   ✗ $1"; }
# Clic dentro del diálogo MÁS ALTO (el último del DOM: con la ficha abierta hay 2 anidados)
btn_dialogo() {
  $AB eval "[...document.querySelectorAll('[role=dialog]')[document.querySelectorAll('[role=dialog]').length-1].querySelectorAll('button')].find(b => b.innerText.trim() === '$1')?.click()" >/dev/null 2>&1
}
# innerText del diálogo más alto
dlg() {
  $AB eval "document.querySelectorAll('[role=dialog]')[document.querySelectorAll('[role=dialog]').length-1]?.innerText" 2>/dev/null
}
cerrar_dialogo() {
  $AB eval "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))" >/dev/null 2>&1
  $AB wait 500 >/dev/null
}

echo "── 1. Abrir la app con init-script (sesión + datos simulados)"
$AB close >/dev/null 2>&1 || true
sleep 3
$AB open "$BASE" --init-script "$INIT" >/dev/null
$AB wait --load networkidle >/dev/null
$AB wait 2500 >/dev/null

echo "── 2. Ficha del paciente: sección Historial médico (1 episodio abandonado)"
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Pacientes" >/dev/null 2>&1 && break
  $AB wait 1000 >/dev/null
done
$AB wait 800 >/dev/null
for i in 1 2 3 4 5 6; do
  $AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Paciente Ejemplo'))?.click()" >/dev/null 2>&1
  D1=$($AB eval "document.querySelector('[role=dialog]')?.innerText" 2>/dev/null)
  echo "$D1" | grep -qi "historial médico" && break
  $AB wait 700 >/dev/null
done
echo "$D1" | grep -qi "historial médico" && ok "Sección «Historial médico» presente" || mal "FALTA sección Historial médico"
echo "$D1" | grep -q "Lumbalgia" && ok "Episodio «Lumbalgia» visible" || mal "FALTA episodio Lumbalgia"
echo "$D1" | grep -q "Abandonado" && ok "Insignia «Abandonado» visible" || mal "FALTA insignia Abandonado"
echo "$D1" | grep -qE "2 sesiones" && ok "Conteo 2 sesiones (rango ene–jun)" || mal "Conteo de sesiones incorrecto"
echo "$D1" | grep -q "Reabrir" && ok "Botón «Reabrir» en episodio cerrado" || mal "FALTA botón Reabrir"
echo "$D1" | grep -q "Abrir episodio" && ok "Botón «Abrir episodio» (sin episodio activo)" || mal "FALTA botón Abrir episodio"
$AB screenshot /home/z/my-project/scripts/historial-ficha-1episodio.png >/dev/null

echo "── 3. Ir a «Visita y cobro»"
cerrar_dialogo
for i in 1 2 3 4 5; do
  $AB find role button click --name "Visita y cobro" >/dev/null 2>&1 && break
  $AB wait 800 >/dev/null
done
$AB wait 600 >/dev/null

echo "── 4. Seleccionar paciente → aviso ámbar «Sin episodio en tratamiento»"
$AB find label "Buscar paciente por nombre" fill "Ejemplo" >/dev/null 2>&1 || true
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Paciente Ejemplo ID 3" >/dev/null 2>&1 && break
  $AB wait 500 >/dev/null
done
$AB wait 900 >/dev/null
D2=$($AB eval "document.body.innerText" 2>/dev/null)
echo "$D2" | grep -q "Sin episodio en tratamiento" && ok "Aviso «Sin episodio en tratamiento» visible" || mal "FALTA aviso sin episodio"

echo "── 5. Abrir episodio nuevo (vuelve por otro problema: cervicalgia)"
for i in 1 2 3 4; do
  $AB find role button click --name "Abrir episodio" >/dev/null 2>&1 && break
  $AB wait 500 >/dev/null
done
$AB wait 700 >/dev/null
D3=$($AB eval "document.querySelector('[role=dialog]')?.innerText" 2>/dev/null)
PREFILL=$($AB eval "document.getElementById('ep-diagnostico')?.value" 2>/dev/null)
echo "$D3" | grep -q "Abrir episodio de atención" && ok "Diálogo «Abrir episodio de atención» abierto" || mal "FALTA diálogo de abrir episodio"
echo "$PREFILL" | grep -q "Lumbalgia" && ok "Diagnóstico pre-rellenado con el de su ficha (Lumbalgia)" || mal "Diagnóstico no pre-rellenado (valor: $PREFILL)"
$AB find label "Diagnóstico" fill "Cervicalgia" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
btn_dialogo "Abrir episodio"
$AB wait 1500 >/dev/null
D4=$($AB eval "document.body.innerText" 2>/dev/null)
echo "$D4" | grep -q "Episodio en tratamiento" && ok "Tras guardar: panel esmeralda «Episodio en tratamiento»" || mal "FALTA panel de episodio activo"
echo "$D4" | grep -q "Cervicalgia" && ok "Muestra el diagnóstico nuevo (Cervicalgia)" || mal "No muestra Cervicalgia"
echo "$D4" | grep -qE "0 sesiones" && ok "Episodio nuevo con 0 sesiones (visita aún no registrada)" || mal "Conteo de sesiones del episodio nuevo incorrecto"

echo "── 6. Volver a la ficha: historial con 2 episodios (antecedentes)"
for i in 1 2 3 4; do
  $AB find role button click --name "Pacientes" >/dev/null 2>&1 && break
  $AB wait 800 >/dev/null
done
$AB wait 700 >/dev/null
for i in 1 2 3 4 5; do
  $AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Paciente Ejemplo'))?.click()" >/dev/null 2>&1
  D5=$(dlg)
  echo "$D5" | grep -q "Cervicalgia" && break
  $AB wait 700 >/dev/null
done
N_EPS=$(echo "$D5" | grep -oE "en curso|Abandonado" | wc -l | tr -d ' ')
[ "${N_EPS:-0}" -ge 2 ] && ok "Historial con 2 episodios (abandonado + en curso)" || mal "No se ven 2 episodios ($N_EPS)"
echo "$D5" | grep -q "Cervicalgia" && echo "$D5" | grep -q "En tratamiento" && ok "Episodio nuevo «Cervicalgia · En tratamiento»" || mal "FALTA episodio activo Cervicalgia"
echo "$D5" | grep -q "Lumbalgia" && echo "$D5" | grep -q "Abandonado" && ok "Antecedente «Lumbalgia · Abandonado» conservado" || mal "FALTA antecedente Lumbalgia abandonado"
echo "$D5" | grep -q "Reabrir" && ok "«Reabrir» visible en el episodio cerrado" || mal "FALTA Reabrir"
$AB screenshot /home/z/my-project/scripts/historial-ficha-2episodios.png >/dev/null

echo "── 7. Cerrar el episodio activo (completó su tratamiento)"
for i in 1 2 3 4; do
  $AB find role button click --name "Cerrar episodio" >/dev/null 2>&1 && break
  $AB wait 500 >/dev/null
done
$AB wait 800 >/dev/null
D6=$(dlg)
FECHA_DEF=$($AB eval "document.getElementById('ep-fin')?.value" 2>/dev/null)
echo "$D6" | grep -q "¿Cómo terminó" && ok "Diálogo de cierre con «¿Cómo terminó?»" || mal "FALTA diálogo de cierre"
echo "$D6" | grep -q "Completó su tratamiento" && ok "Opción por defecto «Completó su tratamiento»" || mal "FALTA opción por defecto"
echo "$FECHA_DEF" | grep -qE "2026-" && ok "Fecha de fin por defecto ($FECHA_DEF, su última sesión u hoy)" || mal "FALTA fecha de fin por defecto"
btn_dialogo "Sí, cerrar episodio"
$AB wait 1500 >/dev/null
D7=$(dlg)
echo "$D7" | grep -q "Completado" && ok "Episodio quedó «Completado»" || mal "No quedó Completado"
echo "$D7" | grep -q "Reabrir" && ok "Botón «Reabrir» disponible tras cerrar" || mal "FALTA Reabrir tras cerrar"
$AB screenshot /home/z/my-project/scripts/historial-ficha-cerrado.png >/dev/null

echo "── 8. Reabrir → vuelve a «En tratamiento»"
$AB find role button click --name "Reabrir" >/dev/null 2>&1 || true
$AB wait 1500 >/dev/null
D8=$($AB eval "document.querySelector('[role=dialog]')?.innerText" 2>/dev/null)
echo "$D8" | grep -q "En tratamiento" && ok "Episodio reabierto (En tratamiento)" || mal "No se reabrió"

echo "── 9. Errores de consola"
ERRS=$($AB errors 2>/dev/null | head -5 || true)
[ -z "$ERRS" ] && ok "0 errores de consola" || { mal "Errores de consola"; echo "$ERRS"; }

echo ""
echo "RESULTADO: $((PASOS-FALLOS))/$PASOS verificaciones OK"
[ "$FALLOS" -eq 0 ] || exit 1
