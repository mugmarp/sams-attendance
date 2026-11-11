// frontend/src/components/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return <Outlet />;

  const navItems = user.role === 'STUDENT' 
    ? [
        { path: '/student/checkin', label: 'Check In', icon: '✏️' },
        { path: '/student/summary', label: 'My Attendance', icon: '📊' },
      ]
    : user.role === 'EXAMINER'
    ? [
        { path: '/examiner/dashboard', label: 'Dashboard', icon: '📅' },
      ]
    : [
        { path: '/examiner/dashboard', label: 'Examiner View', icon: '📅' },
      ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📚</span>
              <span className="text-xl font-bold text-primary-700">SAMS Attendance</span>
              <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                MUST
              </span>
            </div>
            
            <nav className="hidden md:flex items-center gap-6">
              {navItems.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-1 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-primary-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">
                {user.name} ({user.role})
              </span>
              <button
                onClick={handleLogout}
                className="btn-secondary text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}