#!/bin/bash
# Prueba E2E del campo manual «cobro de paquete» (Sí/No) en pacientes:
#   1) columna «Paquete» (entre Diagnóstico y Sesiones) en la tabla,
#   2) resaltado en la sección Clínico de la ficha,
#   3) selector Sí/No en nuevo paciente y en editar (flujo stateful).
# Usa --init-script con el mini-PostgREST simulado (POST/PATCH reales).
AB="agent-browser"
BASE="http://localhost:3000"
INIT="/home/z/my-project/scripts/init-mock-supabase.js"
PASOS=0
FALLOS=0
ok()   { PASOS=$((PASOS+1)); echo "   ✓ $1"; }
mal()  { PASOS=$((PASOS+1)); FALLOS=$((FALLOS+1)); echo "   ✗ $1"; }

# Clic en un botón del diálogo más alto (con la ficha abierta hay 2 anidados)
btn_dialogo() {
  $AB eval "[...document.querySelectorAll('[role=dialog]')[document.querySelectorAll('[role=dialog]').length-1].querySelectorAll('button')].find(b => b.innerText.trim() === '$1')?.click()" >/dev/null 2>&1
}
# innerText del diálogo más alto
dlg() {
  $AB eval "document.querySelectorAll('[role=dialog]')[document.querySelectorAll('[role=dialog]').length-1]?.innerText" 2>/dev/null
}
# Pulsar el botón Sí/No del selector de paquete dentro del diálogo abierto
pulsar_paquete() { # $1 = Sí | No
  $AB eval "[...document.querySelectorAll('[role=dialog] button[aria-pressed]')].find(b => b.innerText.trim().startsWith('$1'))?.click()" >/dev/null 2>&1
}
# Estados «texto=true|false» de los botones del selector en el diálogo
estado_selector() {
  $AB eval "[...document.querySelectorAll('[role=dialog] button[aria-pressed]')].map(b => b.innerText.trim().split('\\n')[0] + '=' + b.getAttribute('aria-pressed')).join(' | ')" 2>/dev/null
}

echo "── 1. Abrir la app con datos simulados (init-script stateful)"
$AB close >/dev/null 2>&1 || true
sleep 3
$AB open "$BASE" --init-script "$INIT" >/dev/null
$AB wait --load networkidle >/dev/null
$AB wait 2500 >/dev/null

echo "── 2. Ir a «Pacientes» y verificar la columna nueva"
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Pacientes" >/dev/null 2>&1 && break
  $AB wait 1000 >/dev/null
done
$AB wait 800 >/dev/null
T=$($AB eval "document.body.innerText" 2>/dev/null)
echo "$T" | grep -q "Paquete" && ok "Columna «Paquete» en la tabla" || mal "FALTA la columna «Paquete»"
POS=$($AB eval "[...document.querySelectorAll('thead th')].map(th => th.innerText.trim()).join(',')" 2>/dev/null)
echo "$POS" | grep -q "Diagnóstico,Paquete,Sesiones" && ok "Posición correcta: entre Diagnóstico y Sesiones" || mal "Posición de la columna: $POS"
ROW=$($AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Paciente Ejemplo'))?.innerText" 2>/dev/null)
echo "$ROW" | grep -q "No" && ok "Paciente existente muestra «No»" || mal "FALTA el «No» del paciente sin paquete"

echo "── 3. Ficha del paciente SIN paquete (sección Clínico)"
for i in 1 2 3 4 5; do
  $AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Paciente Ejemplo'))?.click()" >/dev/null 2>&1
  D=$(dlg)
  echo "$D" | grep -q "Clínico" && break
  $AB wait 700 >/dev/null
done
D=$(dlg)
echo "$D" | grep -q "No se le cobra paquete" && ok "Ficha: «No se le cobra paquete» resaltado" || mal "FALTA el mensaje sin paquete en la ficha"
echo "$D" | grep -q "Hay que cobrarle paquete" && mal "El Sí aparece donde NO debería" || ok "Sin mensaje de cobro para el paciente sin paquete"
$AB screenshot /home/z/my-project/scripts/paquete-ficha-no.png >/dev/null

echo "── 4. Editar paciente: selector con valor actual (No)"
btn_dialogo "Editar"
$AB wait 800 >/dev/null
D=$(dlg)
echo "$D" | grep -q "¿Hay que cobrarle paquete?" && ok "Selector presente en «Editar paciente»" || mal "FALTA el selector en editar"
EST=$(estado_selector)
echo "$EST" | grep -q "No=true" && ok "En editar, «No» viene preseleccionado ($EST)" || mal "En editar el No no está preseleccionado ($EST)"
$AB eval "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))" >/dev/null 2>&1
$AB wait 600 >/dev/null

echo "── 5. Nuevo paciente CON paquete (flujo completo del formulario)"
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Nuevo paciente" >/dev/null 2>&1 && break
  $AB wait 1000 >/dev/null
done
$AB wait 700 >/dev/null
# Paso 1: datos personales
$AB find label "Nombre y apellidos *" fill "Rosa Prueba Paquete" >/dev/null 2>&1 || true
$AB eval "document.getElementById('sexo')?.click()" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find role option click --name "Femenino" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find label "Edad" fill "41" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
for i in 1 2 3; do
  $AB find role button click --name "Siguiente" >/dev/null 2>&1 || true
  $AB wait 600 >/dev/null
  $AB eval "document.body.innerText" 2>/dev/null | grep -q "Celular principal" && break
done
# Paso 2: contacto
$AB find label "Celular principal *" fill "912345678" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
for i in 1 2 3; do
  $AB find role button click --name "Siguiente" >/dev/null 2>&1 || true
  $AB wait 600 >/dev/null
  $AB eval "document.body.innerText" 2>/dev/null | grep -q "conoció" && break
done
# Paso 3: origen (Posta para no pedir referido)
$AB eval "[...document.querySelectorAll('button[role=combobox]')].find(b => b.innerText.includes('Selecciona'))?.click()" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find role option click --name "Posta" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
for i in 1 2 3; do
  $AB find role button click --name "Siguiente" >/dev/null 2>&1 || true
  $AB wait 600 >/dev/null
  $AB eval "document.body.innerText" 2>/dev/null | grep -q "Sistema afectado" && break
done
# Paso 4: información clínica → diagnóstico + selector de paquete en Sí
$AB find label "Diagnóstico" fill "Fractura de tobillo" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
T=$($AB eval "document.body.innerText" 2>/dev/null)
echo "$T" | grep -q "¿Hay que cobrarle paquete?" && ok "Selector presente en nuevo paciente" || mal "FALTA el selector en nuevo paciente"
echo "$T" | grep -q "solo para pacientes con fractura" && ok "Nota «solo para pacientes con fractura» visible" || mal "FALTA la nota de ayuda"
$AB eval "[...document.querySelectorAll('button[aria-pressed]')].find(b => b.innerText.trim().startsWith('Sí'))?.click()" >/dev/null 2>&1
$AB wait 300 >/dev/null
EST=$($AB eval "[...document.querySelectorAll('button[aria-pressed]')].map(b => b.innerText.trim().split('\\n')[0] + '=' + b.getAttribute('aria-pressed')).join(' | ')" 2>/dev/null)
echo "$EST" | grep -q "Sí=true" && echo "$EST" | grep -q "No=false" && ok "Al pulsar Sí: Sí=true y No=false ($EST)" || mal "El selector no cambió de estado ($EST)"
$AB screenshot /home/z/my-project/scripts/paquete-form-nuevo.png >/dev/null
$AB find role button click --name "Guardar paciente" >/dev/null 2>&1 || true
$AB wait 2500 >/dev/null

echo "── 6. La tabla muestra «Sí» para la nueva paciente"
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Pacientes" >/dev/null 2>&1 && break
  $AB wait 1000 >/dev/null
done
$AB wait 800 >/dev/null
for i in 1 2 3 4 5; do
  ROW=$($AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Rosa Prueba Paquete'))?.innerText" 2>/dev/null)
  echo "$ROW" | grep -q "Sí" && break
  $AB wait 700 >/dev/null
done
echo "$ROW" | grep -q "Rosa Prueba Paquete" && echo "$ROW" | grep -q "Sí" && ok "Fila de «Rosa Prueba Paquete» con «Sí» en Paquete" || mal "La fila no muestra el Sí: $ROW"

echo "── 7. Ficha de la paciente CON paquete (resaltado en Clínico)"
for i in 1 2 3 4 5; do
  $AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Rosa Prueba Paquete'))?.click()" >/dev/null 2>&1
  D=$(dlg)
  echo "$D" | grep -q "Hay que cobrarle paquete" && break
  $AB wait 700 >/dev/null
done
D=$(dlg)
echo "$D" | grep -q "Hay que cobrarle paquete" && ok "Ficha: «Hay que cobrarle paquete» resaltado" || mal "FALTA el resaltado con paquete Sí"
echo "$D" | grep -q "Se le cobra por paquete de 5 sesiones" && ok "Detalle «paquete de 5 sesiones» presente" || mal "FALTA el detalle del paquete"
$AB screenshot /home/z/my-project/scripts/paquete-ficha-si.png >/dev/null

echo "── 8. Editar: cambiar de Sí a No (PATCH stateful)"
btn_dialogo "Editar"
$AB wait 800 >/dev/null
EST=$(estado_selector)
echo "$EST" | grep -q "Sí=true" && ok "En editar, «Sí» preseleccionado ($EST)" || mal "En editar el Sí no está preseleccionado ($EST)"
pulsar_paquete "No"
$AB wait 300 >/dev/null
btn_dialogo "Guardar cambios"
$AB wait 1500 >/dev/null
# Volver a la tabla y verificar el cambio
$AB eval "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))" >/dev/null 2>&1 || true
$AB wait 600 >/dev/null
for i in 1 2 3 4 5; do
  ROW=$($AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Rosa Prueba Paquete'))?.innerText" 2>/dev/null)
  echo "$ROW" | grep -q "No" && break
  $AB wait 700 >/dev/null
done
echo "$ROW" | grep -q "No" && ok "Tras editar, la fila muestra «No»" || mal "La edición no se refleja: $ROW"

echo "── 9. Errores de consola"
ERRS=$($AB errors 2>/dev/null | head -5 || true)
[ -z "$ERRS" ] && ok "0 errores de consola" || { mal "Errores de consola"; echo "$ERRS"; }

echo ""
echo "RESULTADO: $((PASOS-FALLOS))/$PASOS verificaciones OK"
[ "$FALLOS" -eq 0 ] || exit 1
