import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { Users, BookOpen, Clock, AlertCircle } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
    <div className={`p-4 rounded-full ${color} text-white`}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-gray-500 text-sm">{title}</p>
      <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
    </div>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const isStaff = user?.role === 'Librarian' || user?.role === 'Admin';

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (isStaff) {
          // Fetch Admin Stats
          const res = await api.get('/reports/stats');
          setStats(res.data);
        } else {
          // Fetch Member Stats (Loans + Fines)
          const [loansRes, finesRes] = await Promise.all([
            api.get('/my/loans'),
            api.get('/my/fines')
          ]);
          
          setStats({
            active_loans: loansRes.data.active_loans.length,
            past_loans: loansRes.data.past_loans.length,
            unpaid_fines: finesRes.data.length,
            // Calculate total debt
            total_debt: finesRes.data.reduce((sum, f) => sum + (f.amount - f.amount_paid), 0)
          });
        }
      } catch (error) {
        console.error("Failed to fetch dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isStaff]);

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      
      {isStaff ? (
        // --- Admin / Librarian View ---
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Members" value={stats?.total_members} icon={Users} color="bg-blue-500" />
          <StatCard title="Active Loans" value={stats?.active_loans} icon={BookOpen} color="bg-green-500" />
          <StatCard title="Pending Reservations" value={stats?.pending_reservations} icon={Clock} color="bg-yellow-500" />
          <StatCard title="Unpaid Fines Total" value={`$${stats?.total_fines_unpaid}`} icon={AlertCircle} color="bg-red-500" />
          <StatCard title="Total Books (Titles)" value={stats?.total_titles} icon={BookOpen} color="bg-purple-500" />
        </div>
      ) : (
        // --- Member View ---
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Books You Have" value={stats?.active_loans} icon={BookOpen} color="bg-blue-500" />
          <StatCard title="Past Readings" value={stats?.past_loans} icon={Clock} color="bg-gray-500" />
          <StatCard 
            title="Unpaid Fines" 
            value={`$${stats?.total_debt}`} 
            icon={AlertCircle} 
            color={stats?.total_debt > 0 ? "bg-red-500" : "bg-green-500"} 
          />
        </div>
      )}

      {/* Placeholder for recent activity or recommendations */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          {isStaff ? "Quick Actions" : "Recommended For You"}
        </h3>
        <p className="text-gray-500">
          {isStaff 
            ? "Use the sidebar to manage catalog, members, and circulation." 
            : "Visit the 'Book Catalog' to see personal recommendations based on your history."}
        </p>
      </div>
    </div>
  );
}