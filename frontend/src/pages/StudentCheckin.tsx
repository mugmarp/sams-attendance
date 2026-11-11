// frontend/src/pages/StudentCheckin.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Session } from '../types/api';
import { format } from 'date-fns';

export function StudentCheckin() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const { data } = await api.get('/student/sessions/upcoming');
        setSessions(data);
      } catch (err: any) {
        setError(err.response?.data?.message ?? 'Failed to load sessions');
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  const handleCheckin = async (sessionId: string) => {
    if (!code.trim()) {
      setError('Please enter the check-in code');
      return;
    }
    
    setCheckingIn(true);
    setError('');
    setSuccess('');
    
    try {
      const { data } = await api.post('/student/checkin', { sessionId, code: code.trim().toUpperCase() });
      setSuccess(`Checked in to ${data.session.courseCode}!`);
      setCode('');
      setSelectedSession(null);
      // Refresh sessions
      const { data: fresh } = await api.get('/student/sessions/upcoming');
      setSessions(fresh);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Check In</h1>
        <p className="text-gray-600">Enter the 6-digit code displayed by your examiner</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>}

      {/* Code Input */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Enter Check-in Code</h2>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="session" className="label">Select Session</label>
            <select
              id="session"
              value={selectedSession?.id ?? ''}
              onChange={e => {
                const session = sessions.find(s => s.id === e.target.value);
                setSelectedSession(session ?? null);
              }}
              className="input"
              disabled={sessions.length === 0}
            >
              <option value="">Choose a session...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.courseCode} - {format(new Date(s.startTime), 'MMM d, HH:mm')} {s.room ? `(${s.room})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="code" className="label">Check-in Code</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="input font-mono text-2xl tracking-widest text-center"
              placeholder="7K9M2P"
              maxLength={6}
              autoComplete="off"
              autoFocus
            />
            <p className="text-sm text-gray-500">6 characters • Case insensitive</p>
          </div>

          <button
            onClick={() => selectedSession && handleCheckin(selectedSession.id)}
            disabled={!selectedSession || !code.trim() || code.length !== 6 || checkingIn}
            className="btn-primary w-full py-3 text-lg disabled:opacity-50"
          >
            {checkingIn ? 'Checking In...' : 'Check In'}
          </button>
        </div>
      </div>

      {/* Upcoming Sessions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Upcoming Sessions</h2>
        
        {sessions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No upcoming sessions</p>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => (
              <div key={session.id} className={`p-4 rounded-lg border ${session.checkedIn ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-primary-300'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${session.checkedIn ? 'bg-green-100' : 'bg-primary-100'}`}>
                      {session.checkedIn ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-primary-600">📅</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{session.courseCode}</p>
                      <p className="text-sm text-gray-500">{session.courseTitle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {format(new Date(session.startTime), 'MMM d, HH:mm')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.room ?? 'Room TBA'}
                    </p>
                    {session.checkedIn && (
                      <span className="badge-success mt-1 inline-block">Checked In</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}