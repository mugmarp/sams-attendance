import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!user) return <Outlet />;
  const links =
    user.role === "STUDENT"
      ? [
          ["/student/checkin", "Check in"],
          ["/student/summary", "My attendance"],
        ]
      : user.role === "ADMIN"
        ? [
            ["/admin/courses", "Course reports"],
            ["/examiner/dashboard", "Classes"],
          ]
        : [["/examiner/dashboard", "My classes"]];
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto p-4 flex flex-wrap gap-4 items-center justify-between">
          <a href="/" className="font-bold text-xl text-primary-700">
            SAMS{" "}
            <span className="text-sm font-normal text-slate-500">
              MUST attendance
            </span>
          </a>
          <div className="flex gap-4 items-center">
            <span className="text-sm">
              {user.name} · {user.role.toLowerCase()}
            </span>
            <button
              className="btn-secondary"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
          <nav aria-label="Main navigation" className="w-full flex gap-4">
            {links.map(([path, title]) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `rounded px-3 py-2 text-sm font-medium ${isActive ? "bg-primary-100 text-primary-800" : "text-slate-600"}`
                }
              >
                {title}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      {!online && (
        <div
          className="bg-amber-100 text-amber-900 px-4 py-3 text-center"
          role="status"
        >
          You’re offline. Saved check-ins are pending until the server accepts
          them.
        </div>
      )}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="max-w-6xl mx-auto p-4 text-xs text-slate-500">
        Group B prototype · All times Africa/Kampala · Attendance qualification
        only; fees and coursework are not assessed.
      </footer>
    </div>
  );
}
