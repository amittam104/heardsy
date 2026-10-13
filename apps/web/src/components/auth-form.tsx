import { EnvelopeSimpleIcon, LockSimpleIcon, MagicWandIcon, UserIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { cn } from "@openheard/ui/lib/utils";

import { Button } from "@openheard/ui/components/button";
import { GoogleIcon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";

const INPUT = "min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60 sm:text-sm";
const QUIET = "inline-flex min-h-8 items-center rounded-md px-1 text-[13px] text-muted-foreground outline-none hover:text-foreground";

function Field({ id, label, icon, children, invalid }: { id: string; label: string; icon: React.ReactNode; children: React.ReactNode; invalid?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      <div className={cn("flex h-10 items-center gap-2.5 rounded-lg border bg-card px-3 text-muted-foreground transition-colors has-[[data-focus=parent]:focus-visible]:outline-2 has-[[data-focus=parent]:focus-visible]:outline-offset-2", invalid ? "animate-shake border-destructive has-[[data-focus=parent]:focus-visible]:outline-destructive motion-reduce:animate-none" : "border-input focus-within:border-ring has-[[data-focus=parent]:focus-visible]:outline-ring")}>
        {icon}
        {children}
      </div>
    </div>
  );
}

export function AuthForm({
  wsName,
  hasGoogle,
  callbackURL,
  onSuccess,
  showFirstAccountHint = false,
  onGoogleClick,
  intro = "Vote and comment as yourself.",
}: {
  wsName: string;
  hasGoogle: boolean;
  callbackURL: string;
  onSuccess: () => void;
  showFirstAccountHint?: boolean;
  onGoogleClick?: () => void;
  intro?: string;
}) {
  const [mode, setMode] = useState<"in" | "up" | "magic">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  function onError(err: { error: { message?: string; statusText: string } }) {
    setError(err.error.message || err.error.statusText || "Unable to reach the server.");
    setBusy(false);
    emailRef.current?.focus();
  }

  function switchMode(next: "in" | "up" | "magic") {
    setError("");
    setMode(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (mode === "in") await authClient.signIn.email({ email, password }, { onSuccess, onError });
    else if (mode === "up") await authClient.signUp.email({ name, email, password }, { onSuccess, onError });
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    await authClient.signIn.magicLink(
      { email, callbackURL },
      {
        onSuccess: () => {
          setMagicSent(true);
          setBusy(false);
        },
        onError,
      },
    );
  }

  const recovery = mode === "magic" ? "Check the address and try again." : mode === "in" ? "Check your email and password, or reset your password." : "Check the details and try again.";
  const errorText = error ? (
    <p id={errorId} role="alert" className="text-[13px] text-pretty text-destructive">
      {error.replace(/\.?$/, ".")} {recovery}
    </p>
  ) : null;
  const invalidProps = error ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  const emailField = (
    <Field id={`${id}-email`} label="Email" icon={<EnvelopeSimpleIcon aria-hidden className="size-[15px] shrink-0" />} invalid={!!error}>
      <input ref={emailRef} id={`${id}-email`} type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} autoComplete="email" spellCheck={false} placeholder="you@company.com" data-focus="parent" className={INPUT} {...invalidProps} />
    </Field>
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance">{mode === "up" ? "Create your account" : `Sign in to ${wsName}`}</h1>
        <p className="text-sm text-pretty text-muted-foreground">{intro}</p>
      </div>

      {hasGoogle ? (
        <>
          <Button
            variant="secondary"
            full
            size="lg"
            disabled={busy}
            className="font-semibold text-foreground"
            onClick={() => {
              onGoogleClick?.();
              setBusy(true);
              authClient.signIn.social({ provider: "google", callbackURL });
            }}
          >
            <GoogleIcon className="mr-1.5 size-4" /> Continue with Google
          </Button>
          <div className="flex w-full items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      {mode === "magic" ? (
        magicSent ? (
          <div role="status" className="flex w-full flex-col items-center gap-2 rounded-lg border bg-card px-5 py-6 text-center">
            <MagicWandIcon aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-[13px] text-pretty text-muted-foreground">
              We sent a sign-in link to <span className="break-all text-foreground">{email}</span>. It may take a minute to arrive.
            </p>
            <button type="button" onClick={() => { setMagicSent(false); switchMode("in"); }} className={cn(QUIET, "mt-1")}>
              Back to password sign-in
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="flex w-full flex-col gap-3">
            {emailField}
            {errorText}
            <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
              {busy ? "Sending link…" : "Email me a link"}
            </Button>
            <button type="button" onClick={() => switchMode("in")} className={cn(QUIET, "self-center")}>
              Sign in with password
            </button>
          </form>
        )
      ) : (
        <form onSubmit={submit} className="flex w-full flex-col gap-3">
          {mode === "up" ? (
            <Field id={`${id}-name`} label="Name" icon={<UserIcon aria-hidden className="size-[15px] shrink-0" />}>
              <input id={`${id}-name`} name="name" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} autoComplete="name" placeholder="Ada Lovelace" data-focus="parent" className={INPUT} />
            </Field>
          ) : null}
          {emailField}
          <Field id={`${id}-password`} label="Password" icon={<LockSimpleIcon aria-hidden className="size-[15px] shrink-0" />} invalid={!!error}>
            <input
              id={`${id}-password`}
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              aria-describedby={mode === "up" ? `${id}-password-hint` : undefined}
              data-focus="parent" className={INPUT}
              {...invalidProps}
            />
          </Field>
          {mode === "up" ? (
            <p id={`${id}-password-hint`} className="-mt-1 text-xs text-muted-foreground">
              Use at least 8 characters.
            </p>
          ) : null}
          {errorText}
          <Button type="submit" full arrow size="lg" disabled={busy} className="mt-1">
            {busy ? (mode === "in" ? "Signing in…" : "Creating account…") : mode === "in" ? "Sign in" : "Create account"}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            {mode === "in" ? (
              <Link to="/reset-password" className={QUIET}>
                Forgot password?
              </Link>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => switchMode("magic")} className={QUIET}>
              Email me a link instead
            </button>
          </div>
        </form>
      )}

      <p className="text-center text-[13px] text-muted-foreground">
        {mode === "up" ? "Already have an account?" : "New here?"}{" "}
        <button type="button" onClick={() => switchMode(mode === "up" ? "in" : "up")} className={cn(QUIET, "px-0.5 font-medium text-foreground underline-offset-4 hover:underline")}>
          {mode === "up" ? "Sign in" : "Create an account"}
        </button>
      </p>

      {showFirstAccountHint ? <p className="rounded-lg border bg-card px-3 py-2.5 text-center text-xs text-pretty text-muted-foreground">You’re setting up this install. The first account you create becomes the admin.</p> : null}
    </div>
  );
}
