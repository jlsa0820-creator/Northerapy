#!/bin/bash
# Prueba del diálogo de cobro simplificado (solo método general, sin desplegables por línea).
set -e
AB="agent-browser"
BASE="http://localhost:3000"

echo "── 1. Abrir la app"
$AB open "$BASE/" >/dev/null
$AB wait --load networkidle >/dev/null

echo "── 2. Inyectar sesión simulada"
SESSION='{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMSIsImVtYWlsIjoidGVzdEBub3J0aGVyYXB5LnBlIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3ODgwMDAwMDB9.sig","token_type":"bearer","expires_in":2314465329,"expires_at":4102444800,"refresh_token":"fake-refresh","user":{"id":"00000000-0000-0000-0000-000000000001","aud":"authenticated","role":"authenticated","email":"test@northerapy.pe","email_confirmed_at":"2026-01-01T00:00:00Z","confirmed_at":"2026-01-01T00:00:00Z","last_sign_in_at":"2026-09-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-09-01T00:00:00Z"}}'
$AB storage local set "sb-vmoomnoiburpbmrbspwb-auth-token" "$SESSION" >/dev/null

echo "── 3. Simular datos de Supabase"
$AB network route "**/rest/v1/pacientes*" --body '[{"paciente_id":3,"nombre_completo":"Paciente Ejemplo","grupo_edad":"Adultos: 30 a 59","edad_valor":57,"edad_unidad":"años","sexo":"Masculino","celular_principal":"999888777","como_nos_conocio":"Referidos","diagnostico":"Lumbalgia","primera_sesion":"2026-01-12","sesiones_programadas":null,"sesiones_totales":51,"status":"Abandonó"}]' >/dev/null
$AB network route "**/rest/v1/asistencias*" --body '[{"id":3,"paciente_id":3,"ultima_asistencia":"2026-06-11","ses_programadas":null,"ses_totales":51,"pct_adherencia":0,"dias_sin_asistir":61,"frec_semanal":1.6,"status":"Abandonó"}]' >/dev/null
$AB network route "**/rest/v1/ingresos*" --body '[]' >/dev/null

echo "── 4. Recargar y entrar"
$AB reload >/dev/null
$AB wait --load networkidle >/dev/null
$AB wait 1500 >/dev/null

echo "── 5. Ir a «Visita y cobro»"
$AB find role button click --name "Visita y cobro" >/dev/null || $AB find text "Visita y cobro" click >/dev/null || $AB find role link click --name "Visita y cobro" >/dev/null
$AB wait 600 >/dev/null

echo "── 6. Seleccionar paciente"
$AB find label "Buscar paciente por nombre" fill "Ejemplo" >/dev/null 2>&1 || true
$AB wait 500 >/dev/null
$AB find text "Paciente Ejemplo" click >/dev/null
$AB wait 500 >/dev/null

echo "── 7. Añadir diclofenaco (para ver 2 líneas en el desglose)"
$AB find text "+" click >/dev/null 2>&1 || true
$AB wait 300 >/dev/null

echo "── 8. Abrir diálogo de cobro («Guardar y cobrar ahora»)"
$AB find text "Guardar y cobrar ahora" click >/dev/null
$AB wait 700 >/dev/null

SNAP=$($AB snapshot -c 2>/dev/null)

echo "── 9. Verificaciones del diálogo"
echo "$SNAP" | grep -q "Método de pago" && echo "   ✓ Título «Método de pago» presente" || echo "   ✗ FALTA título Método de pago"
echo "$SNAP" | grep -q "Elige el método de pago: se aplicará a todas las líneas" && echo "   ✓ Descripción actualizada" || echo "   ✗ Descripción vieja"
echo "$SNAP" | grep -q '"Método para terapia"' && echo "   ✗ AÚN HAY desplegable por línea (terapia)" || echo "   ✓ Sin desplegable por línea (terapia)"
echo "$SNAP" | grep -q '"Método para productos"' && echo "   ✗ AÚN HAY desplegable por línea (productos)" || echo "   ✓ Sin desplegable por línea (productos)"
echo "$SNAP" | grep -q "Terapia" && echo "$SNAP" | grep -q "Diclofenaco" && echo "   ✓ Desglose de montos visible (terapia + productos)" || echo "   ? Solo una línea en el desglose"
echo "$SNAP" | grep -q "Total a cobrar" && echo "   ✓ Total visible" || echo "   ✗ FALTA total"
echo "$SNAP" | grep -q "Métodos distintos" && echo "   ✗ Queda texto viejo «métodos distintos»" || echo "   ✓ Sin texto viejo"
echo "$SNAP" | grep -q "Método general" && echo "   ✗ Queda etiqueta «Método general»" || echo "   ✓ Sin etiqueta duplicada"

echo "── 10. Clic en «Yape» y confirmar selección"
$AB find text "Yape" click >/dev/null
$AB wait 400 >/dev/null
echo "   (seleccionado Yape; captura a continuación)"

echo "── 11. Captura y errores de consola"
$AB screenshot /home/z/my-project/scripts/visita-cobro-simplificado.png >/dev/null
$AB errors 2>/dev/null | head -5 || true

echo "── 12. Cerrar diálogo sin guardar"
$AB find text "Cancelar" click >/dev/null 2>&1 || true
$AB wait 300 >/dev/null

echo "── FIN"
