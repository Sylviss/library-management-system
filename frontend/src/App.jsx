import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout'; // Import Layout
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BookCatalog from './pages/BookCatalog';
import Circulation from './pages/Circulation';
import MyLoans from './pages/MyLoans';
import MyFines from './pages/MyFines';
import MemberManagement from './pages/MemberManagement';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import AdminStaff from './pages/AdminStaff';
import MemberDetails from './pages/MemberDetails';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

// Placeholder components for routes we haven't built yet
const Placeholder = ({ title }) => <h1 className="text-2xl font-bold">{title} Page (Coming Soon)</h1>;

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Protected Area (Wrapped in Layout) */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            
            <Route path="/books" element={<BookCatalog />} />
            <Route path="/profile" element={<Profile />} />
            
            {/* Member Routes */}
            <Route path="/my-loans" element={<MyLoans />} />
            <Route path="/my-fines" element={<MyFines />} />
            
            {/* Staff Routes */}
            <Route path="/members" element={<MemberManagement />} />
            <Route path="/circulation" element={<Circulation />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/members/:id" element={<MemberDetails />} />
            {/* Admin Routes */}
            <Route path="/admin/staff" element={<AdminStaff />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;