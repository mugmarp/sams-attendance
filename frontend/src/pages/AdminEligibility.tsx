// frontend/src/pages/AdminEligibility.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import type { EligibilityStudent } from '../types/api';

export function AdminEligibility() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = useState<{ code: string; title: string } | null>(null);
  const [students, setStudents] = useState<EligibilityStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchEligibility = async () => {
      try {
        const { data } = await api.get(`/admin/eligibility/${courseId}`);
        setCourse(data.course);
        setStudents(data.students);
      } catch (err: any) {
        setError(err.response?.data?.message ?? 'Failed to load eligibility');
      } finally {
        setLoading(false);
      }
    };
    fetchEligibility();
  }, [courseId]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const response = await api.get(`/admin/eligibility/${courseId}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eligibility_${course?.code}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

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

  const eligibleCount = students.filter(s => s.eligible).length;
  const totalCount = students.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exam Eligibility</h1>
          <p className="text-gray-600">
            {course?.code} - {course?.title}
          </p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="btn-primary"
        >
          {exporting ? 'Generating PDF...' : '📄 Export PDF (Appendix D)'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card bg-green-50 border-green-200">
          <p className="text-sm text-green-700">Eligible</p>
          <p className="text-3xl font-bold text-green-800">{eligibleCount}</p>
        </div>
        <div className="card bg-red-50 border-red-200">
          <p className="text-sm text-red-700">Not Eligible</p>
          <p className="text-3xl font-bold text-red-800">{totalCount - eligibleCount}</p>
        </div>
        <div className="card bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-700">Total Students</p>
          <p className="text-3xl font-bold text-blue-800">{totalCount}</p>
        </div>
      </div>

      {/* Eligibility Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Student Eligibility List</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Filter:</label>
            <select
              onChange={e => {
                const filter = e.target.value;
                // In a real app, you'd filter the students array
              }}
              className="input w-auto"
            >
              <option value="all">All Students</option>
              <option value="eligible">Eligible Only</option>
              <option value="ineligible">Not Eligible</option>
            </select>
          </div>
        </div>

        {students.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No students enrolled in this course</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Reg No.</th>
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Present</th>
                  <th className="pb-2">Total</th>
                  <th className="pb-2">Attendance %</th>
                  <th className="pb-2">Eligible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((student, index) => (
                  <tr key={student.studentId} className={`hover:bg-gray-50 ${!student.eligible ? 'bg-red-50' : ''}`}>
                    <td className="py-3 font-mono text-sm">{index + 1}</td>
                    <td className="py-3 font-mono text-sm">{student.regNo}</td>
                    <td className="py-3">{student.name}</td>
                    <td className="py-3 text-center font-medium">{student.presentCount}</td>
                    <td className="py-3 text-center text-gray-500">{student.totalSessions}</td>
                    <td className="py-3 text-center">
                      <span className={`font-medium ${
                        student.attendancePct >= 80 ? 'text-green-600' :
                        student.attendancePct >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {student.attendancePct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className={student.eligible ? 'badge-success' : 'badge-danger'}>
                        {student.eligible ? 'YES' : 'NO'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-sm text-gray-600">
          <span>🟢 Green = Exam Eligible (≥80%)</span>
          <span>🔴 Red = Not Eligible (<80%)</span>
          <span>Per MUST Regulations §2.3</span>
        </div>
      </div>
    </div>
  );
}