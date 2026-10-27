"use client";

import { useState } from "react";
import { ApiError, api } from "@/client/api";
import { Portrait } from "@/components/ui";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { body: { password } });
      window.location.replace("/");
    } catch (err) {
      setPassword("");
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Try again.");
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-navy-950 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(#ffffff22 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#16301a] to-transparent" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 w-fit rounded-lg bg-navy-900 p-2 shadow-[0_6px_0_#04061a]">
            <Portrait equipped={{}} tier={0} size={96} />
          </div>
          <h1 className="font-pixel text-4xl text-gold drop-shadow-[0_3px_0_#04061a]">FOUR WINS</h1>
          <p className="font-pixel text-cream-dim">The Life RPG · Level up in real life</p>
          <div className="mt-3 flex justify-center gap-2" aria-hidden>
            {PILLARS.map((p) => (
              <span key={p} className="text-xl" title={PILLAR_META[p].name}>
                {PILLAR_META[p].icon}
              </span>
            ))}
          </div>
        </div>
        <form onSubmit={submit} className="px-panel space-y-3 p-5" aria-label="Log in">
          <label className="block">
            <span className="px-label">Access password</span>
            <input
              className="px-input text-lg"
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
          </label>
          {error && (
            <p id="login-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button className="px-btn w-full text-lg" disabled={busy || !password}>
            {busy ? "Opening the gates…" : "Enter the world ▸"}
          </button>
          <p className="text-center text-xs text-cream-faint">Private world. Attempts are rate-limited.</p>
        </form>
      </div>
    </main>
  );
}
