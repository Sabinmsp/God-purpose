"use client";

import { useState } from "react";
import { api } from "@/client/api";
import { useGame, useGameState } from "@/client/store";
import { useBusy } from "../ui";

type Setup = { secret: string; qrSvg: string };

/** Settings → Security: authenticator-app two-factor login. */
export function TwoFactorSection() {
  const s = useGameState();
  const { act, toast, refresh } = useGame();
  const { busy, run } = useBusy();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const { twoFactorEnabled, recoveryCodesLeft } = s.security;

  const fail = (err: unknown, title: string) => toast({ kind: "error", title: err instanceof Error ? err.message : title });

  const start = () =>
    run(async () => {
      try {
        setSetup(await api<Setup>("/api/auth/2fa/setup", { body: { currentPassword: password } }));
        setPassword("");
      } catch (err) {
        fail(err, "Could not start setup");
      }
    });

  const confirm = () =>
    run(async () => {
      try {
        const res = await api<{ recoveryCodes: string[] }>("/api/auth/2fa/confirm", { body: { code } });
        setSetup(null);
        setCode("");
        setCodes(res.recoveryCodes);
        await refresh();
        toast({ kind: "info", title: "Two-factor login is on", detail: "Other devices were signed out." });
      } catch (err) {
        setCode("");
        fail(err, "Could not verify the code");
      }
    });

  const newCodes = () =>
    run(async () => {
      try {
        const res = await api<{ recoveryCodes: string[] }>("/api/auth/2fa/recovery-codes", { body: { currentPassword: password, code } });
        setPassword("");
        setCode("");
        setCodes(res.recoveryCodes);
        await refresh();
      } catch (err) {
        setCode("");
        fail(err, "Could not create new codes");
      }
    });

  const turnOff = () =>
    run(async () => {
      if (await act("/api/auth/2fa/disable", { currentPassword: password, code })) {
        toast({ kind: "info", title: "Two-factor login is off" });
      }
      setPassword("");
      setCode("");
    });

  const passwordInput = (
    <input className="px-input" type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} />
  );
  const codeInput = (placeholder: string) => (
    <input
      className="px-input font-mono tracking-widest"
      inputMode="text"
      autoComplete="one-time-code"
      maxLength={11}
      placeholder={placeholder}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))}
      aria-label="Authenticator code"
    />
  );

  return (
    <div className="mt-4 space-y-2" data-testid="two-factor">
      <span className="px-label">Two-factor login {twoFactorEnabled ? "(on)" : "(off)"}</span>

      {codes ? (
        <div className="px-card space-y-2 border-l-4 !border-l-[var(--gold)] p-3" data-testid="recovery-codes">
          <p className="text-sm">
            <strong>Save these recovery codes now.</strong> Each one works once if you lose your phone. They won&apos;t be shown again.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {codes.map((c) => (
              <li key={c} className="rounded bg-navy-950 px-2 py-1 text-center">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-btn secondary flex-1"
              onClick={() =>
                navigator.clipboard?.writeText(codes.join("\n")).then(
                  () => toast({ kind: "info", title: "Copied" }),
                  () => toast({ kind: "error", title: "Copy failed. Write them down instead." }),
                )
              }
            >
              Copy
            </button>
            <button type="button" className="px-btn flex-1" onClick={() => setCodes(null)}>
              I saved them
            </button>
          </div>
        </div>
      ) : setup ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p className="text-xs text-cream-dim">1. Scan this with Google Authenticator, Authy, 1Password or Microsoft Authenticator.</p>
          {/* SVG generated on our server from the otpauth URI; no user input. */}
          <div className="mx-auto w-44 rounded bg-white p-2" aria-label="QR code for your authenticator app" role="img" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <p className="text-xs text-cream-faint">
            Can&apos;t scan? Enter this key manually: <code className="break-all font-mono text-cream">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </p>
          <p className="text-xs text-cream-dim">2. Type the 6-digit code the app shows.</p>
          {codeInput("123456")}
          <div className="flex gap-2">
            <button type="button" className="px-btn secondary flex-1" onClick={() => setSetup(null)}>
              Cancel
            </button>
            <button className="px-btn flex-1" disabled={busy || !/^\d{6}$/.test(code)}>
              Turn on
            </button>
          </div>
        </form>
      ) : twoFactorEnabled ? (
        <div className="space-y-2">
          <p className="text-xs text-cream-faint">
            Logging in needs your password and a code from your authenticator app. Recovery codes left: <strong>{recoveryCodesLeft}</strong>
            {recoveryCodesLeft <= 3 && " (make new ones soon)"}.
          </p>
          {passwordInput}
          {codeInput("Current code or recovery code")}
          <div className="flex gap-2">
            <button type="button" className="px-btn secondary flex-1" disabled={busy || !password || code.length < 6} onClick={() => void newCodes()}>
              New recovery codes
            </button>
            <button type="button" className="px-btn danger flex-1" disabled={busy || !password || code.length < 6} onClick={() => void turnOff()}>
              Turn off
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <p className="text-xs text-cream-faint">Adds a 6-digit code from your phone to every login, so a leaked password alone can&apos;t open your world.</p>
          {passwordInput}
          <button className="px-btn w-full" disabled={busy || !password}>
            🔐 Set up two-factor login
          </button>
        </form>
      )}
    </div>
  );
}
