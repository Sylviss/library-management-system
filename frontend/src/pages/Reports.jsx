import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { FileText, Download, AlertTriangle, Clock, Users } from 'lucide-react';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('overdue'); // 'overdue', 'active_loans', 'activity'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- Fetch Data based on Tab ---
  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        let endpoint = '';
        if (activeTab === 'overdue') endpoint = '/reports/overdue';
        if (activeTab === 'active_loans') endpoint = '/reports/active_loans';
        if (activeTab === 'activity') endpoint = '/reports/member_activity';

        const res = await api.get(endpoint);
        setData(res.data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load report data");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [activeTab]);

  // --- Export to CSV Function ---
  const handleExport = () => {
    if (!data.length) return toast("No data to export");

    // 1. Convert JSON to CSV
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');

    // 2. Trigger Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `library_report_${activeTab}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render Helpers ---
  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
        activeTab === id 
          ? 'border-blue-600 text-blue-600 bg-blue-50' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">System Reports</h1>
        <button 
          onClick={handleExport}
          disabled={data.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-t-xl border-b border-gray-200 flex overflow-x-auto">
        <TabButton id="overdue" label="Overdue Books" icon={AlertTriangle} />
        <TabButton id="active_loans" label="Current Circulation" icon={Clock} />
        <TabButton id="activity" label="Member Activity" icon={Users} />
      </div>

      {/* Report Table Content */}
      <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Generating report...</div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No records found for this report.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-700 border-b">
                <tr>
                  {/* Dynamic Headers based on data keys */}
                  {Object.keys(data[0]).map((key) => (
                    <th key={key} className="p-4 capitalize font-semibold">
                      {key.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    {Object.values(row).map((val, i) => (
                      <td key={i} className="p-4 text-gray-600">
                        {/* Format booleans or numbers if needed */}
                        {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}