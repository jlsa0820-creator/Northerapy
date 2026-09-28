#!/bin/bash
# Prueba de los botones de Tarifa de la terapia (bug setTarifa) con datos simulados.
set -e
AB="agent-browser"
BASE="http://localhost:3000"

echo "── 1. Abrir la app"
$AB open "$BASE/" >/dev/null
$AB wait --load networkidle >/dev/null

echo "── 2. Inyectar sesión simulada (expira año 2100, sin refresh)"
SESSION='{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMSIsImVtYWlsIjoidGVzdEBub3J0aGVyYXB5LnBlIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3ODgwMDAwMDB9.sig","token_type":"bearer","expires_in":2314465329,"expires_at":4102444800,"refresh_token":"fake-refresh","user":{"id":"00000000-0000-0000-0000-000000000001","aud":"authenticated","role":"authenticated","email":"test@northerapy.pe","email_confirmed_at":"2026-01-01T00:00:00Z","confirmed_at":"2026-01-01T00:00:00Z","last_sign_in_at":"2026-09-01T00:00:00Z","app_metadata":{"provider":"email","providers":["email"]},"user_metadata":{},"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-09-01T00:00:00Z"}}'
$AB storage local set "sb-vmoomnoiburpbmrbspwb-auth-token" "$SESSION" >/dev/null

echo "── 3. Simular datos de Supabase (1 paciente estilo Ejemplo, sin paquete activo)"
$AB network route "**/rest/v1/pacientes*" --body '[{"paciente_id":3,"nombre_completo":"Paciente Ejemplo","grupo_edad":"Adultos: 30 a 59","edad_valor":57,"edad_unidad":"años","sexo":"Masculino","celular_principal":"999888777","celular_nota":null,"celular_adicional":null,"celular_revision":null,"como_nos_conocio":"Referidos","referido_por":null,"diagnostico":"Lumbalgia y dorsalgia","sistema_afectado":null,"primera_sesion":"2026-01-12","sesiones_programadas":null,"sesiones_totales":51,"status":"Abandonó"}]' >/dev/null
$AB network route "**/rest/v1/asistencias*" --body '[{"id":3,"paciente_id":3,"ultima_asistencia":"2026-06-11","ses_programadas":null,"ses_totales":51,"pct_adherencia":0,"dias_sin_asistir":61,"frec_semanal":1.6,"status":"Abandonó"}]' >/dev/null
$AB network route "**/rest/v1/ingresos*" --body '[]' >/dev/null

echo "── 4. Recargar y entrar a la app"
$AB reload >/dev/null
$AB wait --load networkidle >/dev/null
$AB wait 1500 >/dev/null

echo "── 5. Ir a «Anotar visita y cobro»"
$AB find role button click --name "Anotar visita" >/dev/null || $AB find text "Anotar visita" click >/dev/null
$AB wait 600 >/dev/null

echo "── 6. Buscar y seleccionar al paciente"
$AB find label "Buscar paciente por nombre" fill "Ejemplo" >/dev/null 2>&1 || $AB find placeholder "Escribe el nombre del paciente…" fill "Ejemplo" >/dev/null 2>&1 || true
$AB wait 500 >/dev/null
$AB find text "Paciente Ejemplo" click >/dev/null
$AB wait 500 >/dev/null

echo "── 7. Clic en «Cubierta» (antes no respondía)"
$AB find text "Cubierta" click >/dev/null
$AB wait 400 >/dev/null
echo "   Desglose tras clic Cubierta:"
$AB snapshot -c 2>/dev/null | grep -o "Terapia (cubierta[^)]*)" || echo "   ✗ NO CAMBIÓ"
$AB snapshot -c 2>/dev/null | grep -c "no tiene paquete activo" >/dev/null && echo "   ✓ Aviso de paquete inactivo visible" || true

echo "── 8. Clic en «Paquete»"
$AB find text "Paquete" click >/dev/null
$AB wait 400 >/dev/null
echo "   Desglose tras clic Paquete:"
$AB snapshot -c 2>/dev/null | grep -o "Terapia (paquete[^)]*)\|S/ 30.00" | head -2 || echo "   ✗ NO CAMBIÓ"

echo "── 9. Clic en «Suelta»"
$AB find text "Suelta" click >/dev/null
$AB wait 400 >/dev/null
echo "   Desglose tras clic Suelta:"
$AB snapshot -c 2>/dev/null | grep -o "Terapia (suelta[^)]*)" || echo "   ✗ NO CAMBIÓ"

echo "── 10. Captura y errores de consola"
$AB screenshot /home/z/my-project/scripts/visita-tarifas-fixed.png >/dev/null
$AB errors 2>/dev/null | head -5 || true
echo "── FIN"
