#!/bin/bash
# Prueba del diálogo de cobro con desplegables por línea (reversión: sin método general).
# Usa --init-script para stubbear fetch (el mocking por network route falla por CORS cross-origin).
set -e
AB="agent-browser"
BASE="http://localhost:3000"
INIT="/home/z/my-project/scripts/init-mock-supabase.js"

echo "── 1. Abrir la app con init-script (sesión + datos simulados)"
$AB close >/dev/null 2>&1 || true
sleep 3
$AB open "$BASE" --init-script "$INIT" >/dev/null
$AB wait --load networkidle >/dev/null
$AB wait 2500 >/dev/null

echo "── 2. Ir a «Visita y cobro» (con reintentos)"
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Visita y cobro" >/dev/null 2>&1 && break
  $AB wait 1000 >/dev/null
done
$AB wait 600 >/dev/null

echo "── 3. Seleccionar paciente"
$AB find label "Buscar paciente por nombre" fill "Aladino" >/dev/null 2>&1 || true
for i in 1 2 3 4 5 6; do
  $AB find role button click --name "Aladino Gordillo ID 3" >/dev/null 2>&1 && break
  $AB wait 500 >/dev/null
done
$AB wait 700 >/dev/null

echo "── 4. Añadir diclofenaco (para ver 2 líneas con desplegable)"
$AB find label "Agregar diclofenaco" click >/dev/null 2>&1 || $AB find text "+" click >/dev/null 2>&1 || true
$AB wait 400 >/dev/null

echo "── 5. Abrir diálogo de cobro («Guardar y cobrar ahora»)"
for i in 1 2 3 4 5; do
  $AB find role button click --name "Guardar y cobrar ahora" >/dev/null 2>&1 && break
  $AB wait 600 >/dev/null
done
$AB wait 800 >/dev/null

SNAP=$($AB snapshot -c 2>/dev/null)

echo "── 6. Verificaciones del diálogo"
echo "$SNAP" | grep -q '"Método para terapia"' && echo "   ✓ Desplegable junto al monto de terapia" || echo "   ✗ FALTA desplegable de terapia"
echo "$SNAP" | grep -q '"Método para productos"' && echo "   ✓ Desplegable junto al monto de productos" || echo "   ✗ FALTA desplegable de productos"
echo "$SNAP" | grep -q "se aplicará a todas las líneas" && echo "   ✗ Queda texto del método general" || echo "   ✓ Sin método general (texto)"
echo "$SNAP" | grep -q "Método general" && echo "   ✗ Queda etiqueta «Método general»" || echo "   ✓ Sin etiqueta «Método general»"
echo "$SNAP" | grep -q "Terapia" && echo "$SNAP" | grep -q "Diclofenaco" && echo "   ✓ Desglose visible (terapia + productos)" || echo "   ? Solo una línea en el desglose"
echo "$SNAP" | grep -qE "S/.?41\.00" && echo "   ✓ Total correcto S/ 41 (35 terapia + 6 diclofenaco)" || echo "   ? Total no es S/ 41"
DOMTXT=$($AB eval "document.querySelector('[role=dialog]').innerText" 2>/dev/null)
echo "$DOMTXT" | grep -q "Total a cobrar" && echo "   ✓ Total a cobrar visible (DOM)" || echo "   ✗ FALTA total en el DOM"
echo "$DOMTXT" | grep -q "métodos distintos para la terapia y los productos" && echo "   ✓ Descripción por línea presente (DOM)" || echo "   ✗ FALTA descripción por línea en el DOM"
echo "$DOMTXT" | grep -q "Método general" && echo "   ✗ Queda «Método general» en el DOM" || echo "   ✓ Sin sección general en el DOM"
echo "$DOMTXT" | grep -q "Efectivo" && echo "$DOMTXT" | grep -qE "S/.?35\.00" && echo "$DOMTXT" | grep -qE "S/.?6\.00" && echo "   ✓ Montos y métodos por línea visibles" || echo "   ? Faltan montos en el DOM"

echo "── 7. Cambiar el método de la terapia a Yape"
$AB find label "Método para terapia" click >/dev/null 2>&1 || true
$AB wait 500 >/dev/null
$AB find role option --name "Yape" click >/dev/null 2>&1 || $AB find text "Yape" click >/dev/null 2>&1 || true
$AB wait 500 >/dev/null
SNAP2=$($AB snapshot -c 2>/dev/null)
echo "$SNAP2" | grep -q "Yape" && echo "   ✓ Yape quedó seleccionado en el desplegable de terapia" || echo "   ✗ No se pudo seleccionar Yape"
echo "$SNAP2" | grep -q "Efectivo" && echo "   ✓ Productos siguen en Efectivo (independientes)" || echo "   ? Productos no visibles en Efectivo"

echo "── 8. Captura y errores de consola"
$AB screenshot /home/z/my-project/scripts/visita-cobro-desplegables.png >/dev/null
$AB errors 2>/dev/null | head -5 || true

echo "── 9. Cerrar diálogo sin guardar"
$AB find text "Cancelar" click >/dev/null 2>&1 || true
$AB find text "Efectivo" click >/dev/null 2>&1 || true
$AB wait 400 >/dev/null

echo "── FIN"
