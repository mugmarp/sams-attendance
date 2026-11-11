import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, home } from "./hooks/useAuth";
import { Login } from "./pages/Login";
import { ExaminerDashboard } from "./pages/ExaminerDashboard";
import { ExaminerSession } from "./pages/ExaminerSession";
import { StudentCheckin } from "./pages/StudentCheckin";
import { StudentSummary } from "./pages/StudentSummary";
import { AdminEligibility } from "./pages/AdminEligibility";
import { AdminCourses } from "./pages/AdminCourses";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
function Home() {
  const { user, isLoading } = useAuth();
  return isLoading ? (
    <p role="status">Loading…</p>
  ) : (
    <Navigate to={user ? home(user.role) : "/login"} replace />
  );
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route
          path="/examiner/dashboard"
          element={
            <ProtectedRoute allowedRoles={["EXAMINER", "ADMIN"]}>
              <ExaminerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/examiner/session/:id"
          element={
            <ProtectedRoute allowedRoles={["EXAMINER", "ADMIN"]}>
              <ExaminerSession />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/checkin"
          element={
            <ProtectedRoute allowedRoles={["STUDENT"]}>
              <StudentCheckin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/summary"
          element={
            <ProtectedRoute allowedRoles={["STUDENT"]}>
              <StudentSummary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/courses"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <AdminCourses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/eligibility/:courseId"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <AdminEligibility />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
