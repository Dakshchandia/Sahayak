"use client";
import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, AlertCircle, Info, Lock } from "lucide-react";

const DEMO_ACCOUNTS = [
  { role: "Personnel", email: "ravi.kumar@sahayak.local", password: "Demo@1234" },
  { role: "Welfare Officer", email: "welfare.officer@sahayak.local", password: "Demo@1234" },
  { role: "Commander", email: "commander@sahayak.local", password: "Demo@1234" },
  { role: "Administrator", email: "admin@sahayak.local", password: "Admin@1234" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // prevent double-submit
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }

      // Store CSRF token for subsequent requests
      if (data.csrfToken) {
        sessionStorage.setItem("csrfToken", data.csrfToken);
      }

      const role = data.user?.role;
      if (role === "personnel") router.push("/personnel/dashboard");
      else if (role === "welfare_officer") router.push("/welfare");
      else if (role === "commander") router.push("/commander");
      else if (role === "admin") router.push("/admin");
      else router.push("/");
    } catch {
      setError("Unable to connect. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(acc: (typeof DEMO_ACCOUNTS)[0]) {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Brand */}
        <div className="login-brand">
          <span className="brand-icon-lg">
            <ShieldCheck size={32} />
          </span>
          <div>
            <h1>SAHAYAK</h1>
            <p>Personnel Wellbeing System</p>
          </div>
        </div>

        {/* Demo notice */}
        {isDemoMode && (
          <div className="demo-banner">
            <Info size={15} />
            <span>
              Demo mode — use the credential shortcuts below. Not for real personal data.
            </span>
          </div>
        )}

        {/* Login form */}
        <form className="login-form" onSubmit={handleLogin} noValidate>
          <div className="field-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@unit.gov.in"
              required
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <div className="field-group">
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="toggle-pass"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" id="login-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Signing in…" : "Sign in to SAHAYAK"}
          </button>
        </form>

        {/* Demo account shortcuts */}
        {isDemoMode && (
          <div className="demo-accounts">
            <p className="demo-heading">
              <Lock size={13} /> Demo credentials (local demonstration only)
            </p>
            <div className="demo-grid">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  className="demo-account-btn"
                  onClick={() => fillDemo(acc)}
                >
                  <span className="demo-role">{acc.role}</span>
                  <span className="demo-email">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <footer className="login-footer">
          <ShieldCheck size={13} />
          <span>Welfare first. Human always. Confidential support.</span>
        </footer>
      </div>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          background: #f5f7f8;
          display: grid;
          place-items: center;
          padding: 24px;
        }
        .login-container {
          width: 100%;
          max-width: 440px;
          background: white;
          border: 1px solid #e0e8eb;
          border-radius: 14px;
          padding: 36px;
          box-shadow: 0 4px 20px #15303a08;
        }
        .login-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }
        .brand-icon-lg {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          background: #112d39;
          border-radius: 12px;
          color: #7adfc7;
        }
        .login-brand h1 {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 2px;
          color: #19313d;
          margin: 0;
        }
        .login-brand p {
          font-size: 13px;
          color: #7b8e97;
          margin: 4px 0 0;
        }
        .demo-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fffbea;
          border: 1px solid #e8d98a;
          border-radius: 7px;
          padding: 10px 13px;
          font-size: 12px;
          color: #7a6820;
          margin-bottom: 22px;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-group label {
          font-size: 13px;
          font-weight: 600;
          color: #3a5260;
        }
        .field-group input {
          border: 1px solid #dce5e8;
          border-radius: 7px;
          padding: 11px 14px;
          font-size: 14px;
          width: 100%;
          box-sizing: border-box;
          outline-offset: 3px;
          transition: border-color 0.15s;
        }
        .field-group input:focus {
          border-color: #147d6e;
        }
        .password-field {
          position: relative;
        }
        .password-field input {
          padding-right: 44px;
        }
        .toggle-pass {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #8b9ba3;
          display: grid;
          place-items: center;
          border-radius: 4px;
          padding: 2px;
        }
        .toggle-pass:hover {
          color: #147d6e;
        }
        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fdf2f2;
          border: 1px solid #e8c2c0;
          border-radius: 7px;
          padding: 10px 13px;
          font-size: 13px;
          color: #9b3a36;
        }
        .login-button {
          background: #137e6d;
          color: white;
          border-radius: 7px;
          padding: 12px;
          font-size: 14px;
          font-weight: 600;
          width: 100%;
          transition: background 0.2s;
          margin-top: 4px;
        }
        .login-button:hover:not(:disabled) {
          background: #0c6c5d;
        }
        .login-button:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .demo-accounts {
          margin-top: 24px;
          padding-top: 22px;
          border-top: 1px solid #edf1f3;
        }
        .demo-heading {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1px;
          color: #8b9ba3;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .demo-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .demo-account-btn {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 3px;
          background: #f8fafb;
          border: 1px solid #e3eaed;
          border-radius: 7px;
          padding: 10px 12px;
          text-align: left;
          transition: border-color 0.15s, background 0.15s;
        }
        .demo-account-btn:hover {
          border-color: #b3d0ca;
          background: #f0f7f5;
        }
        .demo-role {
          font-size: 12px;
          font-weight: 600;
          color: #2e5560;
        }
        .demo-email {
          font-size: 11px;
          color: #8b9ba3;
        }
        .login-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 24px;
          font-size: 12px;
          color: #9aabB3;
        }
        @media (max-width: 480px) {
          .login-container { padding: 26px 20px; }
          .demo-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f8" }}>
        <div style={{ textAlign: "center", color: "#8b9ba3" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⟳</div>
          <p style={{ fontSize: 14 }}>Loading…</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}