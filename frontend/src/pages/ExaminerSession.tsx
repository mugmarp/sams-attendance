// frontend/src/pages/ExaminerDashboard.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Session } from '../types/api';
import { format } from 'date-fns';

export function ExaminerDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const { data } = await api.get('/examiner/sessions/today');
        setSessions(data);
      } catch (err: any) {
        setError(err.response?.data?.message ?? 'Failed to load sessions');
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's Sessions</h1>
          <p className="text-gray-600">{today}</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl">📅</span>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No sessions today</h3>
          <p className="text-gray-500">You have no classes scheduled for today.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map(session => (
            <Link
              key={session.id}
              to={`/examiner/session/${session.id}`}
              className="card hover:shadow-md transition-shadow flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-xl">
                  {session.sessionType === 'LECTURE' ? '📖' : session.sessionType === 'PRACTICAL' ? '🔬' : '📝'}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{session.courseCode} - {session.courseTitle}</p>
                  <p className="text-sm text-gray-500">
                    {format(new Date(session.startTime), 'HH:mm')} - {format(new Date(session.endTime), 'HH:mm')}
                    {session.room && ` • ${session.room}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {session.hasActiveCode ? (
                  <span className="badge-success">🔴 Check-in Active</span>
                ) : (
                  <span className="badge-info">⚪ Not Started</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}