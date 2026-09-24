(() => {
  // ── Solo para pruebas de UI: sesión + mini-PostgREST simulado en memoria ──
  // Soporta GET (con filtros eq.), POST, PATCH y DELETE sobre las 4 tablas,
  // imitando las columnas y defaults reales (episodios.estado='activo',
  // ingresos.tipo relleno por convención como el trigger de la BD).
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

  const DB = {
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
        sistema_afectado: "Musculoesquelético",
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
    ingresos: [
      {
        id: 101,
        paciente_id: 3,
        fecha: "2026-01-12",
        zonas: 1,
        terapia_estado: "efectivo",
        terapia_monto: 35,
        diclofenaco_estado: "no_aplica",
        diclofenaco_monto: 0,
        ortopedico_estado: "no_aplica",
        ortopedico_monto: 0,
        total: 35,
        tipo: "sesion",
      },
      {
        id: 102,
        paciente_id: 3,
        fecha: "2026-06-11",
        zonas: 1,
        terapia_estado: "yape",
        terapia_monto: 35,
        diclofenaco_estado: "no_aplica",
        diclofenaco_monto: 0,
        ortopedico_estado: "no_aplica",
        ortopedico_monto: 0,
        total: 35,
        tipo: "sesion",
      },
    ],
    // Episodio cerrado (como lo dejaría el backfill con status «Abandonó»)
    episodios: [
      {
        id: 1,
        paciente_id: 3,
        diagnostico: "Lumbalgia",
        sistema_afectado: "Musculoesquelético",
        fecha_inicio: "2026-01-12",
        fecha_fin: "2026-06-11",
        estado: "abandonado",
        notas: null,
        created_at: "2026-01-12T10:00:00Z",
      },
    ],
  };

  const PK = { pacientes: "paciente_id", asistencias: "id", ingresos: "id", episodios: "id" };
  const TABLAS = Object.keys(PK);

  const USER = { id: "00000000-0000-0000-0000-000000000001", email: "test@northerapy.pe", aud: "authenticated", role: "authenticated", email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {} };

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // ?col=eq.valor (solo filtros eq.; ignora order/select/limit)
  function filtros(url) {
    const q = url.split("?")[1] ?? "";
    const f = {};
    for (const par of q.split("&")) {
      const m = /^(\w+)=eq\.(.+)$/.exec(decodeURIComponent(par));
      if (m) f[m[1]] = m[2];
    }
    return f;
  }

  function cabecera(init, nombre) {
    const h = init && init.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(nombre) ?? "";
    if (typeof h === "object") return h[nombre] ?? h[String(nombre).toLowerCase()] ?? "";
    return "";
  }

  function coinciden(fila, f) {
    return Object.entries(f).every(([k, v]) => String(fila[k]) === v);
  }

  function siguienteId(filas, pk) {
    return filas.reduce((m, x) => Math.max(m, Number(x[pk] ?? 0)), 0) + 1;
  }

  // Defaults por tabla, como en la BD real
  function completar(tabla, fila) {
    if (tabla === "episodios") {
      return {
        estado: "activo",
        fecha_fin: null,
        created_at: new Date().toISOString(),
        ...fila,
      };
    }
    if (tabla === "ingresos") {
      // Convención del trigger nor_ingresos_tipo
      const zonas = Number(fila.zonas ?? 0);
      const monto = Number(fila.terapia_monto ?? 0);
      const tipo = zonas > 0 ? "sesion" : monto >= 150 ? "compra_paquete" : "venta_producto";
      return { ...fila, tipo: fila.tipo ?? tipo };
    }
    return { ...fila };
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const tabla = TABLAS.find((t) => url.includes("/rest/v1/" + t));
    if (tabla) {
      const req = typeof input === "object" && input ? input : {};
      const metodo = String((init && init.method) || req.method || "GET").toUpperCase();
      const single = String(cabecera(init, "Accept")).includes("vnd.pgrst.object");
      const filas = DB[tabla];
      const pk = PK[tabla];

      if (metodo === "GET" || metodo === "HEAD") {
        const out = filas.filter((r) => coinciden(r, filtros(url)));
        return Promise.resolve(json(single ? (out[0] ?? null) : out));
      }
      if (metodo === "POST") {
        let cuerpo;
        try { cuerpo = JSON.parse((init && init.body) || "{}"); } catch (e) { cuerpo = {}; }
        const entrantes = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
        const creadas = entrantes.map((r) => {
          const fila = completar(tabla, { ...r });
          if (fila[pk] == null) fila[pk] = siguienteId(filas, pk);
          filas.push(fila);
          return fila;
        });
        return Promise.resolve(json(single ? (creadas[0] ?? null) : creadas, 201));
      }
      if (metodo === "PATCH" || metodo === "PUT") {
        let cambios;
        try { cambios = JSON.parse((init && init.body) || "{}"); } catch (e) { cambios = {}; }
        const f = filtros(url);
        const afectadas = filas.filter((r) => coinciden(r, f));
        for (const r of afectadas) Object.assign(r, cambios);
        return Promise.resolve(json(single ? (afectadas[0] ?? null) : afectadas));
      }
      if (metodo === "DELETE") {
        const f = filtros(url);
        const borrar = new Set(filas.filter((r) => coinciden(r, f)));
        DB[tabla] = filas.filter((r) => !borrar.has(r));
        return Promise.resolve(json([]));
      }
      return Promise.resolve(json({ message: "método no simulado" }, 405));
    }
    if (url.includes("/auth/v1/user")) return Promise.resolve(json(USER));
    if (url.includes("/auth/v1/token")) return Promise.resolve(json({}));
    return origFetch(input, init);
  };
})();
