"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, ArrowLeft, KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

export function LoginView() {
  const { signIn, enviarRecuperacion, guardarNuevaContrasena, recoveryMode, setRecoveryMode } = useCrmStore();
  const { toast } = useToast();

  const [modo, setModo] = useState<"login" | "recuperar" | "nueva">(recoveryMode ? "nueva" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Escribe tu correo y contraseña.");
      return;
    }
    setCargando(true);
    const res = await signIn(email, password);
    setCargando(false);
    if (!res.ok && res.error) setError(res.error);
  }

  async function onRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError("Escribe el correo de tu cuenta.");
      return;
    }
    setCargando(true);
    const res = await enviarRecuperacion(email);
    setCargando(false);
    if (res.ok) {
      toast({
        title: "Correo enviado",
        description: "Revisa tu bandeja de entrada y sigue el enlace para crear una nueva contraseña.",
      });
      setModo("login");
    } else {
      setError(res.error ?? "No se pudo enviar el correo.");
    }
  }

  async function onNuevaContrasena(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    const res = await guardarNuevaContrasena(password);
    setCargando(false);
    if (res.ok) {
      toast({ title: "Contraseña actualizada", description: "Ya puedes iniciar sesión con tu nueva contraseña." });
      setPassword("");
      setPassword2("");
      setRecoveryMode(false);
      setModo("login");
    } else {
      setError(res.error ?? "No se pudo actualizar la contraseña.");
    }
  }

  const esLogin = modo === "login";
  const esNueva = modo === "nueva";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Fondo decorativo premium */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 size-96 rounded-full bg-teal-400/5 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10">
            <Activity className="size-6 text-teal-300" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Northerapy CRM</h1>
          <p className="text-sm text-muted-foreground">Gestión de pacientes, terapias e ingresos</p>
        </div>

        <Card className="border-border/70 bg-card/90 shadow-2xl shadow-black/40 backdrop-blur">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">
              {esLogin && "Iniciar sesión"}
              {esNueva && "Crear nueva contraseña"}
              {modo === "recuperar" && "Recuperar contraseña"}
            </CardTitle>
            <CardDescription>
              {esLogin && "Acceso exclusivo para el equipo del centro."}
              {esNueva && "Define la nueva contraseña de tu cuenta."}
              {modo === "recuperar" && "Te enviaremos un enlace a tu correo."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {esLogin && (
              <form onSubmit={onLogin} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="tu@correo.com"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                {error && (
                  <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full font-semibold" disabled={cargando}>
                  {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Entrar"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-teal-300 hover:underline"
                  onClick={() => {
                    setError(null);
                    setModo("recuperar");
                  }}
                >
                  Olvidé mi contraseña
                </button>
              </form>
            )}

            {modo === "recuperar" && (
              <form onSubmit={onRecuperar} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email-rec">Correo de tu cuenta</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="email-rec"
                      type="email"
                      placeholder="tu@correo.com"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                {error && (
                  <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full font-semibold" disabled={cargando}>
                  {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Enviar enlace"}
                </Button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-teal-300"
                  onClick={() => {
                    setError(null);
                    setModo("login");
                  }}
                >
                  <ArrowLeft className="size-3" aria-hidden /> Volver a iniciar sesión
                </button>
              </form>
            )}

            {esNueva && (
              <form onSubmit={onNuevaContrasena} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="pass1">Nueva contraseña</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="pass1"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Mínimo 6 caracteres"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass2">Repite la contraseña</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="pass2"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className="pl-9"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                    />
                  </div>
                </div>
                {error && (
                  <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full font-semibold" disabled={cargando}>
                  {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Guardar contraseña"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/70">
          Uso interno · Datos protegidos con Supabase Auth y RLS
        </p>
      </div>
    </main>
  );
}
