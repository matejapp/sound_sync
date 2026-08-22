import { useState } from "react";
import { ArrowRight, CheckCircle, Eye, EyeSlash, Waveform } from "@phosphor-icons/react";
import { isSupabaseConfigured, resetPassword, signIn, signUp, updatePassword } from "../lib/supabase.js";

export function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim();
    try {
      if (mode === "reset") {
        await resetPassword(email);
        setMessage("Check your inbox for the reset link.");
      } else if (mode === "signup") {
        const result = await signUp({
          email,
          password: String(values.get("password") || ""),
          username: String(values.get("username") || "").trim(),
          displayName: String(values.get("displayName") || "").trim(),
        });
        if (!result.session) setMessage("Account created. Confirm your email to continue.");
      } else {
        await signIn(email, String(values.get("password") || ""));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-art-panel">
        <div className="auth-brand"><span><Waveform weight="fill" /></span> SoundSync</div>
        <div className="auth-art-copy">
          <span className="eyebrow dark">Your music, your people</span>
          <h1>Build the playlist people remember.</h1>
          <p>Upload original tracks, shape a mix, and share it with listeners in one place.</p>
        </div>
        <img src="/art/reggae-pulse.png" alt="Colorful editorial collage of two music listeners" />
      </section>

      <section className="auth-form-panel">
        <div className="auth-mobile-brand"><Waveform weight="fill" /> SoundSync</div>
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">{mode === "signup" ? "Create an account" : mode === "reset" ? "Account recovery" : "Welcome back"}</span>
          <h2>{mode === "signup" ? "Start your library." : mode === "reset" ? "Reset your password." : "Sign in to SoundSync."}</h2>
          <p>{mode === "signup" ? "Your profile and first playlist are only a minute away." : mode === "reset" ? "We’ll send a secure reset link to your email." : "Pick up where your last listening session ended."}</p>

          {!isSupabaseConfigured && <div className="form-notice error">Supabase environment values are missing.</div>}
          {error && <div className="form-notice error">{error}</div>}
          {message && <div className="form-notice success"><CheckCircle weight="fill" /> {message}</div>}

          {mode === "signup" && (
            <div className="auth-inline-fields">
              <label><span>Username</span><input name="username" minLength="3" maxLength="30" pattern="[A-Za-z0-9_]+" required placeholder="marko_music" /></label>
              <label><span>Display name</span><input name="displayName" maxLength="80" placeholder="Marko" /></label>
            </div>
          )}
          <label><span>Email</span><input type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
          {mode !== "reset" && (
            <label><span>Password</span><div className="password-field"><input type={showPassword ? "text" : "password"} name="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength="8" required placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash /> : <Eye />}</button></div></label>
          )}
          {mode === "signin" && <button className="auth-text-button" type="button" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>}
          <button className="auth-submit" type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}<ArrowRight weight="bold" /></button>
          <div className="auth-switch">
            {mode === "signin" ? <>New to SoundSync? <button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Create an account</button></> : <>Already have an account? <button type="button" onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>Sign in</button></>}
          </div>
        </form>
      </section>
    </main>
  );
}

export function PasswordRecoveryScreen({ onComplete }) {
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") || "");
    const confirmation = String(values.get("confirmation") || "");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      await updatePassword(password);
      window.history.replaceState({}, "", "/");
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page recovery-page">
      <section className="auth-art-panel">
        <div className="auth-brand"><span><Waveform weight="fill" /></span> SoundSync</div>
        <div className="auth-art-copy"><span className="eyebrow dark">Account recovery</span><h1>Back to your music.</h1><p>Choose a new password to finish recovering your SoundSync account.</p></div>
        <img src="/art/reggae-pulse.png" alt="Colorful editorial collage of two music listeners" />
      </section>
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">Secure reset</span>
          <h2>Set a new password.</h2>
          <p>Use at least eight characters.</p>
          {error && <div className="form-notice error">{error}</div>}
          <label><span>New password</span><div className="password-field"><input type={showPassword ? "text" : "password"} name="password" autoComplete="new-password" minLength="8" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash /> : <Eye />}</button></div></label>
          <label><span>Confirm password</span><input type={showPassword ? "text" : "password"} name="confirmation" autoComplete="new-password" minLength="8" required /></label>
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}<ArrowRight weight="bold" /></button>
        </form>
      </section>
    </main>
  );
}
