// frontend/src/pages/ExaminerSession.tsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Session, AttendanceRecord } from '../types/api';
import { format } from 'date-fns';

export function ExaminerSession() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [codeLoading, setCodeLoading] = useState(false);
  const [activeCode, setActiveCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [{ data: sessionData }, { data: attendanceData }] = await Promise.all([
          api.get(`/examiner/sessions/${id}`),
          api.get(`/examiner/sessions/${id}/attendance`),
        ]);
        setSession(sessionData);
        setAttendance(attendanceData);
        if (sessionData.hasActiveCode) {
          setActiveCode({ code: sessionData.checkinCode!, expiresAt: sessionData.codeExpiresAt! });
        }
      } catch (err: any) {
        setError(err.response?.data?.message ?? 'Failed to load session');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!activeCode) return;
    const interval = setInterval(() => {
      const remaining = new Date(activeCode.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setActiveCode(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCode]);

  const handleStartCheckin = async () => {
    setCodeLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/examiner/sessions/${id}/start-checkin`);
      setActiveCode(data);
      setSuccess('Check-in code generated!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to start check-in');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleStopCheckin = async () => {
    setCodeLoading(true);
    setError('');
    try {
      await api.post(`/examiner/sessions/${id}/stop-checkin`);
      setActiveCode(null);
      setSuccess('Check-in stopped');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to stop check-in');
    } finally {
      setCodeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!session) return null;

  const timeRemaining = activeCode 
    ? Math.max(0, Math.ceil((new Date(activeCode.expiresAt).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/examiner/dashboard" className="text-primary-600 hover:underline text-sm mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{session.courseCode} - {session.courseTitle}</h1>
          <p className="text-gray-600">
            {format(new Date(session.startTime), 'EEEE, MMMM d, yyyy • HH:mm')} - {format(new Date(session.endTime), 'HH:mm')}
            {session.room && ` • Room: ${session.room}`}
            • {session.sessionType}
          </p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>}

      {/* Check-in Code Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Student Check-in Code</h2>
        
        {activeCode ? (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400 mb-2">CURRENT CODE (expires in {timeRemaining}s)</p>
              <p className="font-mono text-5xl tracking-widest text-green-400">{activeCode.code}</p>
              <p className="text-xs text-gray-500 mt-2">
                Rotates every 2 minutes • Valid for 10 minutes total
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="font-medium text-green-800">Instructions for Students</p>
                <ol className="list-decimal list-inside text-green-700 mt-1 space-y-1">
                  <li>Open SAMS app</li>
                  <li>Tap "Enter Code"</li>
                  <li>Type: <span className="font-mono">{activeCode.code}</span></li>
                  <li>Submit</li>
                </ol>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="font-medium text-blue-800">Live Attendance</p>
                <p className="text-blue-700 mt-1">
                  {attendance.filter(a => a.status === 'PRESENT').length} / {attendance.length} checked in
                </p>
              </div>
            </div>

            <button
              onClick={handleStopCheckin}
              disabled={codeLoading}
              className="btn-danger w-full"
            >
              {codeLoading ? 'Stopping...' : 'Stop Check-in'}
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No active check-in session</p>
            <button
              onClick={handleStartCheckin}
              disabled={codeLoading}
              className="btn-primary"
            >
              {codeLoading ? 'Starting...' : 'Start Check-in'}
            </button>
          </div>
        )}
      </div>

      {/* Attendance List */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Attendance Records</h2>
          <span className="badge-info">{attendance.length} total</span>
        </div>

        {attendance.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No check-ins yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-2">Reg No.</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Method</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendance.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="py-3 font-mono text-sm">{record.student?.regNo ?? 'N/A'}</td>
                    <td className="py-3">{record.student?.name ?? 'Unknown'}</td>
                    <td className="py-3">
                      <span className={`badge ${
                        record.status === 'PRESENT' ? 'badge-success' :
                        record.status === 'LATE' ? 'badge-warning' :
                        record.status === 'EXCUSED' ? 'badge-info' : 'badge-danger'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-gray-600">{record.method}</td>
                    <td className="py-3 text-sm text-gray-500">
                      {format(new Date(record.recordedAt), 'HH:mm:ss')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}