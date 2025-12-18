import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { User, Lock, Save, Shield } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth(); // Get role/id from token context
  const isMember = user?.role === 'Member';

  // --- State ---
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    address: ''
  });
  
  const [passwords, setPasswords] = useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [loading, setLoading] = useState(true);

  // --- 1. Fetch Profile Data ---
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // We use the ID from the token to fetch specific details if needed, 
        // or a dedicated /my/profile endpoint if implemented.
        // For this setup, we'll try to fetch member details if they are a member.
        if (isMember) {
          const res = await api.get(`/members/${user.id}`);
          setProfile(res.data);
        } else {
          // Librarians just show basic info from token/context initially
          // In a real app, we'd have a specific GET /librarians/me endpoint
          setProfile({
            full_name: user?.sub || 'Staff Member', // Fallback
            email: user?.sub
          });
        }
      } catch (error) {
        toast.error("Could not load profile details");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user, isMember]);

  // --- 2. Update Personal Info (Member Only) ---
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!isMember) return; // Librarians can't update profile via this API yet

    try {
      await api.put('/my/profile', {
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        address: profile.address
      });
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  // --- 3. Change Password (All Users) ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.new_password !== passwords.confirm_password) {
      return toast.error("New passwords do not match");
    }

    try {
      await api.post('/my/password', {
        old_password: passwords.old_password,
        new_password: passwords.new_password
      });
      toast.success("Password changed successfully");
      setPasswords({ old_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to change password");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
      
      {/* --- Card 1: Personal Information --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <User className="text-blue-600" /> Personal Information
        </h2>
        
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded-lg mt-1"
              value={profile.full_name || ''}
              onChange={e => setProfile({...profile, full_name: e.target.value})}
              disabled={!isMember} // Librarians usually need Admin to change their name
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input 
              type="email" 
              className="w-full border p-2 rounded-lg mt-1 bg-gray-50 text-gray-500"
              value={profile.email || ''}
              disabled // Email is immutable
            />
          </div>

          {isMember && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                <input 
                  type="text" 
                  className="w-full border p-2 rounded-lg mt-1"
                  value={profile.phone_number || ''}
                  onChange={e => setProfile({...profile, phone_number: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <textarea 
                  className="w-full border p-2 rounded-lg mt-1 h-24 resize-none"
                  value={profile.address || ''}
                  onChange={e => setProfile({...profile, address: e.target.value})}
                />
              </div>
              
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2">
                <Save size={18} /> Save Changes
              </button>
            </>
          )}

          {!isMember && (
            <div className="bg-yellow-50 p-4 rounded-lg flex items-start gap-3 mt-4">
              <Shield className="text-yellow-600 shrink-0" size={20} />
              <p className="text-sm text-yellow-800">
                Staff profile details are managed by Administrators. Contact admin@library.com for updates.
              </p>
            </div>
          )}
        </form>
      </div>

      {/* --- Card 2: Security --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Lock className="text-purple-600" /> Security
        </h2>
        
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input 
              type="password" required
              className="w-full border p-2 rounded-lg mt-1"
              value={passwords.old_password}
              onChange={e => setPasswords({...passwords, old_password: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input 
              type="password" required
              className="w-full border p-2 rounded-lg mt-1"
              value={passwords.new_password}
              onChange={e => setPasswords({...passwords, new_password: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <input 
              type="password" required
              className="w-full border p-2 rounded-lg mt-1"
              value={passwords.confirm_password}
              onChange={e => setPasswords({...passwords, confirm_password: e.target.value})}
            />
          </div>

          <button type="submit" className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 flex justify-center items-center gap-2">
            <Lock size={18} /> Update Password
          </button>
        </form>
      </div>

    </div>
  );
}