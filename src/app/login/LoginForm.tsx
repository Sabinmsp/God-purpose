"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "@/client/api";
import { Portrait } from "@/components/ui";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";

type Mode = "login" | "signup";
interface SignupPolicy {
  open: boolean;
  needsCode: boolean;
}

const MIN_PASSWORD = 8;
const USERNAME = /^[a-z0-9_]{3,24}$/;

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [policy, setPolicy] = useState<SignupPolicy | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  // The password stays in component memory only while the code is asked for.
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<SignupPolicy>("/api/auth/signup", { method: "GET" })
      .then(setPolicy)
      .catch(() => setPolicy({ open: false, needsCode: false }));
  }, []);

  const restart = () => {
    setNeedsCode(false);
    setPassword("");
    setCode("");
    setError("");
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword("");
    setConfirm("");
    setCode("");
    setNeedsCode(false);
    setError("");
  };

  const name = username.trim().toLowerCase();
  const signupProblem =
    mode !== "signup"
      ? ""
      : !displayName.trim()
        ? "Enter your name."
        : !USERNAME.test(name)
          ? "Usernames are 3–24 letters, numbers or underscores."
          : password.length < MIN_PASSWORD
            ? `Use at least ${MIN_PASSWORD} characters for your password.`
            : password !== confirm
              ? "The passwords don't match."
              : policy?.needsCode && !invite.trim()
                ? "Enter your invite code."
                : "";
  const canSubmit = mode === "signup" ? !signupProblem : Boolean(name && password && (!needsCode || code.trim()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!canSubmit) {
      if (signupProblem) setError(signupProblem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await api("/api/auth/signup", { body: { displayName: displayName.trim(), username: name, password, ...(policy?.needsCode ? { code: invite.trim() } : {}) } });
      } else {
        await api("/api/auth/login", { body: needsCode ? { username: name, password, code: code.trim() } : { username: name, password } });
      }
      window.location.replace("/");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (mode === "signup") {
        setError(apiErr ? apiErr.message : "Could not reach the server. Try again.");
      } else if (apiErr?.code === "TOTP_REQUIRED") {
        setNeedsCode(true);
      } else if (apiErr?.code === "BAD_CODE") {
        setCode("");
        setError(apiErr.message);
      } else {
        restart();
        setError(apiErr ? apiErr.message : "Could not reach the server. Try again.");
      }
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
        <form onSubmit={submit} className="px-panel space-y-3 p-5" aria-label={mode === "signup" ? "Create an account" : "Log in"} noValidate>
          {mode === "signup" && <h2 className="font-pixel text-lg text-gold">Create your character</h2>}
          {needsCode ? (
            <label className="block">
              <span className="px-label">🔐 Authenticator code</span>
              <input
                className="px-input text-center font-mono text-2xl tracking-[0.3em]"
                name="code"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                maxLength={11}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : "code-help"}
              />
              <span id="code-help" className="mt-1 block text-xs text-cream-faint">
                Open your authenticator app and type the 6-digit code for Four Wins. Lost your phone? Use a recovery code.
              </span>
            </label>
          ) : (
            <>
              {mode === "signup" && (
                <label className="block">
                  <span className="px-label">Your name</span>
                  <input className="px-input text-lg" name="name" autoComplete="given-name" autoFocus maxLength={24} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  <span className="mt-1 block text-xs text-cream-faint">Shown in the game and used by the AI coach.</span>
                </label>
              )}
              <label className="block">
                <span className="px-label">Username</span>
                <input
                  className="px-input text-lg"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus={mode === "login"}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                  aria-invalid={Boolean(error)}
                />
                {mode === "signup" && <span className="mt-1 block text-xs text-cream-faint">3–24 letters, numbers or underscores. You log in with this.</span>}
              </label>
              <label className="block">
                <span className="px-label">Password</span>
                <input
                  className="px-input text-lg"
                  type="password"
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </label>
              {mode === "signup" && (
                <>
                  <label className="block">
                    <span className="px-label">Repeat password</span>
                    <input className="px-input text-lg" type="password" name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    <span className="mt-1 block text-xs text-cream-faint">At least {MIN_PASSWORD} characters. A short sentence is easy to remember and hard to guess.</span>
                  </label>
                  {policy?.needsCode && (
                    <label className="block">
                      <span className="px-label">Invite code</span>
                      <input className="px-input" name="invite" autoCapitalize="none" autoCorrect="off" value={invite} onChange={(e) => setInvite(e.target.value)} />
                    </label>
                  )}
                </>
              )}
            </>
          )}
          {error && (
            <p id="login-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button className="px-btn w-full text-lg" disabled={busy}>
            {busy ? "Opening the gates…" : mode === "signup" ? "Start my journey ▸" : needsCode ? "Verify ▸" : "Enter the world ▸"}
          </button>
          {needsCode && (
            <button type="button" className="px-ghost w-full text-xs" onClick={restart}>
              ← Use a different password
            </button>
          )}
          {!needsCode && policy?.open && (
            <button type="button" className="px-ghost w-full text-sm" onClick={() => switchMode(mode === "login" ? "signup" : "login")} data-testid="switch-mode">
              {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
            </button>
          )}
          <p className="text-center text-xs text-cream-faint">Your progress is private to your account. Attempts are rate-limited.</p>
        </form>
      </div>
    </main>
  );
}
