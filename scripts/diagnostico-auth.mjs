// Diagnóstico del endpoint de autenticación de Supabase (Northerapy CRM)
// 1) ¿Está habilitado el login por email+contraseña?
// 2) ¿Qué error devuelve para credenciales que no existen?
// 3) Configuración visible del proveedor de email (confirmación, etc.)

const URL = "https://vmoomnoiburpbmrbspwb.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtb29tbm9pYnVycGJtcmJzcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTM3MTgsImV4cCI6MjEwMzUyOTcxOH0.d1yC4nRopgfLCQG1vVWyWr7UNDC_cTHejdYczSCBzDA";

async function prueba(nombre, path, opciones) {
  try {
    const res = await fetch(`${URL}${path}`, {
      headers: { apikey: ANON, "Content-Type": "application/json" },
      ...opciones,
    });
    const texto = await res.text();
    let cuerpo;
    try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto.slice(0, 300); }
    console.log(`\n=== ${nombre} → HTTP ${res.status} ===`);
    console.log(JSON.stringify(cuerpo, null, 2).slice(0, 900));
    return { res, cuerpo };
  } catch (e) {
    console.log(`\n=== ${nombre} → FALLO DE RED ===`);
    console.log(String(e));
    return { res: null, cuerpo: null };
  }
}

// 1) Login con credenciales inexistentes (para ver el error exacto del proveedor)
await prueba(
  "Login email+password (cuenta falsa)",
  "/auth/v1/token?grant_type=password",
  { method: "POST", body: JSON.stringify({ email: "noexiste-diagnostico@test.com", password: "clave-mala-123456" }) }
);

// 2) Configuración de auth visible (proveedores habilitados, confirmación de email)
await prueba("Settings de auth", "/auth/v1/settings", { method: "GET" });

// 3) Healthcheck del endpoint de signup (para saber si el registro está abierto)
await prueba(
  "Signup (cuenta falsa, solo para leer el error)",
  "/auth/v1/signup",
  { method: "POST", body: JSON.stringify({ email: "noexiste-diagnostico2@test.com", password: "clave-mala-123456" }) }
);
