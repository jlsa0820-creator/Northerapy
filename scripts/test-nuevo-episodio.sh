#!/bin/bash
# Prueba E2E: nuevo paciente con diagnóstico → su primer episodio se abre solo.
AB="agent-browser"
BASE="http://localhost:3000"
INIT="/home/z/my-project/scripts/init-mock-supabase.js"
PASOS=0
FALLOS=0
ok()   { PASOS=$((PASOS+1)); echo "   ✓ $1"; }
mal()  { PASOS=$((PASOS+1)); FALLOS=$((FALLOS+1)); echo "   ✗ $1"; }

echo "── 1. Abrir la app con datos simulados"
$AB close >/dev/null 2>&1 || true
sleep 3
$AB open "$BASE" --init-script "$INIT" >/dev/null
$AB wait --load networkidle >/dev/null
$AB wait 2500 >/dev/null

echo "── 2. Ir a «Nuevo paciente»"
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Nuevo paciente" >/dev/null 2>&1 && break
  $AB wait 1000 >/dev/null
done
$AB wait 700 >/dev/null

echo "── 3. Paso 1: datos personales"
$AB find label "Nombre y apellidos *" fill "María Prueba Historial" >/dev/null 2>&1 || true
$AB eval "document.getElementById('sexo')?.click()" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find role option click --name "Femenino" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find label "Edad" fill "42" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
for i in 1 2 3; do
  $AB find role button click --name "Siguiente" >/dev/null 2>&1 || true
  $AB wait 600 >/dev/null
  $AB eval "document.body.innerText" 2>/dev/null | grep -q "Celular principal" && break
done

echo "── 4. Paso 2: contacto"
$AB find label "Celular principal *" fill "987654321" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
for i in 1 2 3; do
  $AB find role button click --name "Siguiente" >/dev/null 2>&1 || true
  $AB wait 600 >/dev/null
  $AB eval "document.body.innerText" 2>/dev/null | grep -q "conoció" && break
done

echo "── 5. Paso 3: origen (Referidos exige quién lo refirió)"
$AB eval "[...document.querySelectorAll('button[role=combobox]')].find(b => b.innerText.includes('Selecciona'))?.click()" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find role option click --name "Referidos" >/dev/null 2>&1 || true
$AB wait 400 >/dev/null
$AB find label "Detalles / ¿Quién lo refirió?" fill "Rosa M." >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
for i in 1 2 3; do
  $AB find role button click --name "Siguiente" >/dev/null 2>&1 || true
  $AB wait 600 >/dev/null
  $AB eval "document.body.innerText" 2>/dev/null | grep -q "Sistema afectado" && break
done

echo "── 6. Paso 4: información clínica + guardar"
$AB find label "Diagnóstico" fill "Tendinitis de hombro" >/dev/null 2>&1 || true
$AB wait 300 >/dev/null
$AB screenshot /home/z/my-project/scripts/historial-nuevo-form.png >/dev/null
$AB find role button click --name "Guardar paciente" >/dev/null 2>&1 || true
$AB wait 2500 >/dev/null

echo "── 7. Tras guardar: toast con episodio + redirección a visita"
D1=$($AB eval "document.body.innerText" 2>/dev/null)
echo "$D1" | grep -q "Se abrió su primer episodio" && ok "Toast: «Se abrió su primer episodio»" || mal "FALTA toast del episodio"
echo "$D1" | grep -q "Tendinitis de hombro" && ok "El toast/panel menciona el diagnóstico" || mal "No menciona el diagnóstico"
echo "$D1" | grep -q "Episodio en tratamiento" && ok "Panel esmeralda «Episodio en tratamiento» en visita" || mal "FALTA panel de episodio en visita"
echo "$D1" | grep -q "María Prueba Historial" && ok "Paciente preseleccionado en «Anotar visita»" || mal "No se redirigió con el paciente"
echo "$D1" | grep -qE "0 sesiones" && ok "Episodio nuevo arranca en 0 sesiones" || mal "Conteo inicial incorrecto"
$AB screenshot /home/z/my-project/scripts/historial-nuevo-visita.png >/dev/null

echo "── 8. Ficha de la paciente: su primer episodio"
for i in 1 2 3 4; do
  $AB find role button click --name "Pacientes" >/dev/null 2>&1 && break
  $AB wait 800 >/dev/null
done
$AB wait 700 >/dev/null
for i in 1 2 3 4 5; do
  $AB eval "[...document.querySelectorAll('tr')].find(r => r.innerText.includes('María Prueba Historial'))?.click()" >/dev/null 2>&1
  D2=$($AB eval "document.querySelector('[role=dialog]')?.innerText" 2>/dev/null)
  echo "$D2" | grep -q "Tendinitis de hombro" && break
  $AB wait 700 >/dev/null
done
echo "$D2" | grep -qi "historial médico" && ok "Sección «Historial médico» en su ficha" || mal "FALTA sección historial"
echo "$D2" | grep -q "Tendinitis de hombro" && ok "Episodio «Tendinitis de hombro» en su ficha" || mal "FALTA episodio en ficha"
echo "$D2" | grep -q "En tratamiento" && ok "Estado «En tratamiento»" || mal "FALTA estado en tratamiento"
$AB screenshot /home/z/my-project/scripts/historial-nuevo-ficha.png >/dev/null

echo "── 9. Errores de consola"
ERRS=$($AB errors 2>/dev/null | head -5 || true)
[ -z "$ERRS" ] && ok "0 errores de consola" || { mal "Errores de consola"; echo "$ERRS"; }

echo ""
echo "RESULTADO: $((PASOS-FALLOS))/$PASOS verificaciones OK"
[ "$FALLOS" -eq 0 ] || exit 1
