// frontend/src/pages/StudentSummary.tsx
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { StudentAttendanceSummary } from '../types/api';
import { format } from 'date-fns';

export function StudentSummary() {
  const [summary, setSummary] = useState<StudentAttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const { data } = await api.get('/student/attendance/summary');
        setSummary(data);
      } catch (err: any) {
        setError(err.response?.data?.message ?? 'Failed to load attendance summary');
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return <div className="card text-center text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Attendance Summary</h1>
        <p className="text-gray-600">Track your attendance across all courses</p>
      </div>

      {summary.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl">📊</span>
          <h3 className="mt-2 text-lg font-medium text-gray-900">No attendance data yet</h3>
          <p className="text-gray-500">Your attendance will appear here after you start checking in.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {summary.map(course => (
            <div key={course.courseId} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-primary-600">{course.courseCode}</p>
                  <p className="font-medium text-gray-900">{course.courseTitle}</p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${
                    course.attendancePct >= 80 ? 'text-green-600' :
                    course.attendancePct >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {course.attendancePct.toFixed(1)}%
                  </p>
                  <p className="text-sm text-gray-500">
                    {course.presentCount} / {course.totalSessions} sessions
                  </p>
                </div>
              </div>
              
              <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    course.attendancePct >= 80 ? 'bg-green-500' :
                    course.attendancePct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(course.attendancePct, 100)}%` }}
                />
              </div>
              
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {course.attendancePct >= 80 ? '✅ Exam Eligible' : '⚠️ Below 80% threshold'}
                </span>
                <span className="text-gray-400">
                  Need {Math.max(0, Math.ceil(course.totalSessions * 0.8) - course.presentCount)} more sessions
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="card">
        <h3 className="font-medium text-gray-900 mb-3">Attendance Status</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="w-8 h-8 bg-green-500 rounded-full mx-auto mb-2"></div>
            <p className="text-sm font-medium text-green-800">≥ 80%</p>
            <p className="text-xs text-green-600">Exam Eligible</p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg">
            <div className="w-8 h-8 bg-yellow-500 rounded-full mx-auto mb-2"></div>
            <p className="text-sm font-medium text-yellow-800">60-79%</p>
            <p className="text-xs text-yellow-600">At Risk</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="w-8 h-8 bg-red-500 rounded-full mx-auto mb-2"></div>
            <p className="text-sm font-medium text-red-800">< 60%</p>
            <p className="text-xs text-red-600">Not Eligible</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-4 text-center">
          Per MUST Examination Regulations §2.3: Minimum 80% attendance required to sit for exams
        </p>
      </div>
    </div>
  );
}