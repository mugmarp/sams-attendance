import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, home } from "../hooks/useAuth";
import { message } from "../services/api";
export function Login() {
  const { login, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (isLoading) return <p role="status">Loading…</p>;
  if (user) return <Navigate to={home(user.role)} replace />;
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-6">
        <div>
          <p className="text-primary-700 font-bold tracking-widest text-sm">
            MUST · GROUP B
          </p>
          <h1 className="text-3xl font-bold mt-3">SAMS Attendance</h1>
          <p className="text-slate-600 mt-2">
            A clearer record of every class.
          </p>
        </div>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const signedIn = await login(email, password);
              navigate(home(signedIn.role), { replace: true });
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <label className="block">
            Email
            <input
              className="input mt-1"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            Password
            <input
              className="input mt-1"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-slate-500">
          Use the account supplied by your course administrator. The
          demonstration accounts are documented in the project README.
        </p>
      </div>
    </main>
  );
}
