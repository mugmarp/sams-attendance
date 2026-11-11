// frontend/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { ExaminerDashboard } from './pages/ExaminerDashboard';
import { ExaminerSession } from './pages/ExaminerSession';
import { StudentCheckin } from './pages/StudentCheckin';
import { StudentSummary } from './pages/StudentSummary';
import { AdminEligibility } from './pages/AdminEligibility';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route
          path="/examiner/*"
          element={
            <ProtectedRoute allowedRoles={['EXAMINER', 'ADMIN']}>
              <Routes>
                <Route path="dashboard" element={<ExaminerDashboard />} />
                <Route path="session/:id" element={<ExaminerSession />} />
                <Route path="" element={<Navigate to="dashboard" replace />} />
              </Routes>
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/*"
          element={
            <ProtectedRoute allowedRoles={['STUDENT']}>
              <Routes>
                <Route path="checkin" element={<StudentCheckin />} />
                <Route path="summary" element={<StudentSummary />} />
                <Route path="" element={<Navigate to="checkin" replace />} />
              </Routes>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Routes>
                <Route path="eligibility/:courseId" element={<AdminEligibility />} />
                <Route path="" element={<Navigate to="/examiner/dashboard" replace />} />
              </Routes>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/examiner/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;