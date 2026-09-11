(() => {
  // ── Solo para pruebas de UI: sesión + datos simulados de Supabase ──
  try {
    const SESSION = {
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMSIsImVtYWlsIjoidGVzdEBub3J0aGVyYXB5LnBlIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwLCJpYXQiOjE3ODgwMDAwMDB9.sig",
      token_type: "bearer",
      expires_in: 2314465329,
      expires_at: 4102444800,
      refresh_token: "fake-refresh",
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "test@northerapy.pe",
        email_confirmed_at: "2026-01-01T00:00:00Z",
        confirmed_at: "2026-01-01T00:00:00Z",
        last_sign_in_at: "2026-09-01T00:00:00Z",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    };
    localStorage.setItem("sb-vmoomnoiburpbmrbspwb-auth-token", JSON.stringify(SESSION));
  } catch (e) { /* fuera de origen */ }

  const MOCK = {
    pacientes: [
      {
        paciente_id: 3,
        nombre_completo: "Aladino Gordillo",
        grupo_edad: "Adultos: 30 a 59",
        edad_valor: 57,
        edad_unidad: "años",
        sexo: "Masculino",
        celular_principal: "999888777",
        como_nos_conocio: "Referidos",
        diagnostico: "Lumbalgia",
        primera_sesion: "2026-01-12",
        sesiones_programadas: null,
        sesiones_totales: 51,
        status: "Abandonó",
      },
    ],
    asistencias: [
      {
        id: 3,
        paciente_id: 3,
        ultima_asistencia: "2026-06-11",
        ses_programadas: null,
        ses_totales: 51,
        pct_adherencia: 0,
        dias_sin_asistir: 61,
        frec_semanal: 1.6,
        status: "Abandonó",
      },
    ],
    ingresos: [],
  };

  const USER = MOCK ? { id: "00000000-0000-0000-0000-000000000001", email: "test@northerapy.pe", aud: "authenticated", role: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {} } : null;

  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    for (const tabla of ["pacientes", "asistencias", "ingresos"]) {
      if (url.includes("/rest/v1/" + tabla)) return Promise.resolve(json(MOCK[tabla]));
    }
    if (url.includes("/auth/v1/user")) return Promise.resolve(json(USER));
    if (url.includes("/auth/v1/token")) return Promise.resolve(json({}));
    return origFetch(input, init);
  };
})();
