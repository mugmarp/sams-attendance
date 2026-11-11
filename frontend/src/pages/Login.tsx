// frontend/src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <span className="text-4xl">📚</span>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">SAMS Attendance</h1>
          <p className="mt-2 text-gray-600">Student Attendance Management System</p>
          <p className="mt-1 text-sm text-gray-500">Mbarara University of Science and Technology</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="student@student.must.ac.ug"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="text-center text-sm text-gray-500 space-y-2">
          <p>Demo credentials:</p>
          <div className="bg-gray-100 rounded-lg p-3 text-left">
            <p className="font-mono text-xs"><strong>Admin:</strong> admin@must.ac.ug / admin123</p>
            <p className="font-mono text-xs"><strong>Examiner:</strong> lecturer.name@must.ac.ug / examiner123</p>
            <p className="font-mono text-xs"><strong>Student:</strong> alice.nakato@student.must.ac.ug / student123</p>
          </div>
        </div>
      </div>
    </div>
  );
}