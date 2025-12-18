import { useAuth } from '../context/AuthContext';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, Book, Users, CreditCard, 
  Library, Settings, LogOut, FileText, Repeat 
} from 'lucide-react';
import Notifications from './Notifications'; // Add this

const SidebarItem = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
        isActive 
          ? 'bg-blue-600 text-white' 
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </Link>
  );
};

export default function Layout() {
  const { user, logout } = useAuth();
  const isStaff = user?.role === 'Librarian' || user?.role === 'Admin';

  return (
    <div className="flex h-screen bg-gray-100">
      {/* --- Sidebar --- */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col shadow-xl">
        <div className="p-6 flex items-center space-x-3 border-b border-gray-800">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Library size={24} className="text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">LibSys</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <SidebarItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem to="/books" icon={Book} label="Book Catalog" />

          {/* Member Links */}
          {!isStaff && (
            <>
              <SidebarItem to="/my-loans" icon={Repeat} label="My Loans" />
              <SidebarItem to="/my-fines" icon={CreditCard} label="My Fines" />
            </>
          )}

          {/* Staff Links */}
          {isStaff && (
            <>
              <SidebarItem to="/members" icon={Users} label="Member Management" />
              <SidebarItem to="/circulation" icon={Repeat} label="Circulation Desk" />
              <SidebarItem to="/reports" icon={FileText} label="Reports" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <SidebarItem to="/profile" icon={Settings} label="My Profile" />
          <button 
            onClick={logout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:bg-gray-800 hover:text-red-300 rounded-lg transition-colors mt-2"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* --- Main Content Area --- */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-8">
          <h2 className="text-gray-500 text-sm">
            Welcome back, <span className="text-gray-900 font-semibold">{user?.sub}</span>
            {/* ... Role badge ... */}
          </h2>

          {/* Right Side Actions */}
          <div className="flex items-center gap-4">
            {!isStaff && <Notifications />} {/* Only Members need alerts typically */}
            {/* You could add a Profile Avatar here too */}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-8">
          <Outlet /> {/* This is where child routes render */}
        </main>
      </div>
    </div>
  );
}