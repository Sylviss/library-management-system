import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { Search, ArrowRight, ArrowLeft, Clock, User, BookOpen, Trash2, Check, X } from 'lucide-react';

export default function Circulation() {
  const [activeTab, setActiveTab] = useState('issue'); // 'issue', 'return', 'history'

  // --- Issue State ---
  const [memberQuery, setMemberQuery] = useState('');
  const [foundMembers, setFoundMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [issueBarcode, setIssueBarcode] = useState('');
  const [scannedItem, setScannedItem] = useState(null); // New state for the preview

 // --- RETURN TAB STATE ---
  const [returnBarcode, setReturnBarcode] = useState('');
  const [returnCondition, setReturnCondition] = useState('Good');
  const [returnMember, setReturnMember] = useState(null); // The member returning the book
  const [memberLoans, setMemberLoans] = useState([]); // List of items this member has
  const [scannedReturnItem, setScannedReturnItem] = useState(null); // The item preview

  // --- Reservation State ---
  const [resQuery, setResQuery] = useState('');
  const [reservationList, setReservationList] = useState([]);

  const [retMemQuery, setRetMemQuery] = useState('');
  const [retMemResults, setRetMemResults] = useState([]);

  // --- Handlers ---

  // --- HELPER: Fetch Member Loans ---
  const fetchMemberLoans = async (memberId) => {
    try {
      const res = await api.get(`/members/${memberId}/loans`);
      setMemberLoans(res.data.active_loans);
    } catch (error) {
      console.error("Could not load member loans");
    }
  };

  const searchMembers = async (e) => {
    e.preventDefault();
    if (!memberQuery) return;
    try {
      const res = await api.get(`/members/search?q=${memberQuery}`);
      setFoundMembers(res.data);
      if (res.data.length === 0) toast("No members found");
    } catch (error) {
      toast.error("Search failed");
    }
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!issueBarcode) return;
    
    try {
      const res = await api.get(`/items/${issueBarcode}/details`);
      setScannedItem(res.data);
      
      // Warn if status is bad
      if (res.data.status !== 'Available') {
        toast.error(`Warning: This item is ${res.data.status}`);
      }
    } catch (error) {
      toast.error("Item not found");
      setScannedItem(null);
    }
  };

  // MODIFIED: Confirm the issue
  const handleIssue = async () => {
    if (!selectedMember || !scannedItem) return;

    try {
      await api.post('/loans/issue', {
        member_id: selectedMember.id,
        book_item_barcode: scannedItem.barcode,
        days: 14
      });
      toast.success("Book Issued Successfully!");
      
      // Reset for next book
      setIssueBarcode('');
      setScannedItem(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Issue failed");
    }
  };

  const searchReservations = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await api.get(`/admin/reservations/search?q=${resQuery}`);
      setReservationList(res.data);
    } catch (error) {
      toast.error("Failed to load reservations");
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    if (!returnBarcode) return;

    try {
      const res = await api.post('/loans/return', {
        book_item_barcode: returnBarcode,
        condition: returnCondition
      });
      
      setReturnResult(res.data);
      toast.success("Book Returned");
      
      // Check for alerts (Fines/Reservations) in the backend response logic
      // Note: In a real app, we'd check specific flags. 
      // For now, we rely on the backend logic we wrote to print/handle it.
      
      setReturnBarcode('');
    } catch (error) {
      toast.error(error.response?.data?.detail || "Return failed");
      setReturnResult(null);
    }
  };

  // --- HANDLER 1: Scan Item (Manual or Clicked) ---
  const handleReturnScan = async (e, barcodeOverride = null) => {
    if (e) e.preventDefault();
    const barcode = barcodeOverride || returnBarcode;
    if (!barcode) return;

    try {
      // 1. Get Item Details
      const res = await api.get(`/items/${barcode}/details`);
      const itemData = res.data;
      setScannedReturnItem(itemData);
      setReturnBarcode(itemData.barcode); // Ensure input matches

      // 2. Logic: Auto-Fill Member
      if (itemData.current_borrower_id) {
        // If we haven't selected a member, OR the scanned book belongs to someone else
        if (!returnMember || returnMember.id !== itemData.current_borrower_id) {
          // Auto-set the member context
          setReturnMember({ 
            id: itemData.current_borrower_id, 
            full_name: itemData.current_borrower_name 
          });
          // Fetch their other loans too
          fetchMemberLoans(itemData.current_borrower_id);
          toast.success(`Identified Borrower: ${itemData.current_borrower_name}`);
        }
      }
    } catch (error) {
      toast.error("Item not found");
      setScannedReturnItem(null);
    }
  };

  // --- HANDLER 2: Search Member ---
  const handleReturnMemberSearch = async (e) => {
    e.preventDefault();
    if (!retMemQuery) return;
    const res = await api.get(`/members/search?q=${retMemQuery}`);
    setRetMemResults(res.data);
  };

  // --- HANDLER 3: Select Member ---
  const selectReturnMember = (member) => {
    setReturnMember(member);
    setRetMemResults([]);
    setRetMemQuery('');
    fetchMemberLoans(member.id);
  };

  // --- HANDLER 4: Process Return ---
  const confirmReturn = async () => {
    if (!returnBarcode) return;
    try {
      await api.post('/loans/return', {
        book_item_barcode: returnBarcode,
        condition: returnCondition
      });
      toast.success("Book Returned Successfully");
      
      // Cleanup
      setScannedReturnItem(null);
      setReturnBarcode('');
      // Refresh member list if selected
      if (returnMember) fetchMemberLoans(returnMember.id);
    } catch (error) {
      toast.error("Return failed");
    }
  };

  // Load all reservations when tab opens
  useEffect(() => {
    if (activeTab === 'reservations') {
      searchReservations();
    }
  }, [activeTab]);

  const handleCancelRes = async (id) => {
    if(!window.confirm("Cancel this reservation?")) return;
    try {
      await api.post(`/reservations/${id}/cancel`);
      toast.success("Reservation Canceled");
      searchReservations(); // Refresh list
    } catch (error) {
      toast.error("Failed to cancel");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Circulation Desk</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {['issue', 'return', 'reservations'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium text-sm transition-colors capitalize ${
              activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'reservations' ? 'Manage Reservations' : `${tab} Book`}
          </button>
        ))}
      </div>

      {/* --- ISSUE TAB --- */}
      {activeTab === 'issue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Step 1: Find Member */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User className="text-blue-500" /> 1. Identify Member
            </h2>
            
            {!selectedMember ? (
              <>
                <form onSubmit={searchMembers} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Name, Email, or Phone..."
                    className="flex-1 border rounded-lg px-4 py-2"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                  />
                  <button type="submit" className="bg-gray-100 p-2 rounded-lg hover:bg-gray-200">
                    <Search size={20} />
                  </button>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {foundMembers.map(member => (
                    <div 
                      key={member.id}
                      onClick={() => setSelectedMember(member)}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition flex justify-between items-center"
                    >
                      <div>
                        <div className="font-medium">{member.full_name}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded ${member.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {member.status}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <div className="inline-block p-4 bg-blue-100 rounded-full mb-3">
                  <User size={32} className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold">{selectedMember.full_name}</h3>
                <p className="text-gray-500 mb-4">{selectedMember.email}</p>
                <button 
                  onClick={() => { setSelectedMember(null); setFoundMembers([]); }}
                  className="text-sm text-red-500 hover:underline"
                >
                  Change Member
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Scan & Confirm */}
          <div className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 ${!selectedMember ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <BookOpen className="text-blue-500" /> 2. Scan Item
            </h2>
            
            {/* Scan Form */}
            <form onSubmit={handleScan} className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="Scan barcode..."
                className="flex-1 border rounded-lg px-4 py-2 font-mono"
                value={issueBarcode}
                onChange={(e) => setIssueBarcode(e.target.value)}
                autoFocus // Focus here automatically
              />
              <button type="submit" className="bg-gray-800 text-white px-4 rounded-lg hover:bg-gray-900">
                Check
              </button>
            </form>

            {/* Preview Card */}
            {scannedItem && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 animate-fade-in">
                <div className="flex gap-4">
                  {/* Cover Thumb */}
                  <div className="w-16 h-24 bg-gray-200 rounded shrink-0 overflow-hidden">
                    {scannedItem.book_cover ? (
                      <img src={scannedItem.book_cover} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <BookOpen size={20} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 line-clamp-1">{scannedItem.book_title}</h3>
                    <p className="text-sm text-gray-600 mb-2">{scannedItem.book_author}</p>
                    
                    <div className="flex justify-between items-center">
                      <span className={`text-xs px-2 py-1 rounded font-bold ${
                        scannedItem.status === 'Available' ? 'bg-green-100 text-green-700' : 
                        scannedItem.status === 'Reserved' ? 'bg-yellow-100 text-yellow-700' : // <--- NEW COLOR
                        'bg-red-100 text-red-700'
                      }`}>
                        {scannedItem.status}
                      </span>
                      <span className="font-mono text-xs text-gray-500">{scannedItem.barcode}</span>
                    </div>
                    {scannedItem.status === 'Reserved' && scannedItem.reserved_for?.length > 0 && (
                      <div className="mt-3 bg-yellow-50 p-2 rounded border border-yellow-100">
                        <span className="text-xs font-bold text-yellow-800 uppercase block mb-1">
                          Reserved For:
                        </span>
                        <ul className="text-xs text-yellow-900 list-disc list-inside">
                          {scannedItem.reserved_for.map((name, idx) => (
                            <li key={idx}>{name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Final Action Button */}
                <button 
                  onClick={handleIssue}
                  // FIX: Allow clicking if Available OR Reserved
                  disabled={scannedItem.status !== 'Available' && scannedItem.status !== 'Reserved'}
                  className={`w-full mt-4 py-2 rounded-lg font-bold transition-colors ${
                    // Visual feedback: Green for Available, Orange for Reserved, Gray for others
                    scannedItem.status === 'Available' 
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' 
                      : scannedItem.status === 'Reserved'
                        ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {/* Dynamic Label */}
                  {scannedItem.status === 'Reserved' 
                    ? `Attempt to Issue Reserved Item` 
                    : `Confirm Issue to ${selectedMember.full_name.split(' ')[0]}`
                  }
                </button>
              </div>
            )}
            
            {!scannedItem && (
              <p className="text-xs text-gray-400 mt-2">
                Enter barcode and press Enter to verify book details.
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- RETURN TAB CONTENT --- */}
      {activeTab === 'return' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COL 1: Identify Member (Optional/Auto-fill) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <User className="text-green-600" /> 1. Identify Member
            </h2>

            {returnMember ? (
              <div className="bg-green-50 border border-green-100 p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-green-900">{returnMember.full_name}</h3>
                    <p className="text-xs text-green-700">ID: {returnMember.id}</p>
                  </div>
                  <button onClick={() => { setReturnMember(null); setMemberLoans([]); }} className="text-green-600 hover:text-green-800">
                    <X size={16} />
                  </button>
                </div>
                
                {/* Active Loans Dropdown / List */}
                <div className="mt-4">
                  <p className="text-xs font-bold text-gray-500 mb-2 uppercase">Currently Borrowed ({memberLoans.length})</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {memberLoans.map(loan => (
                      <div 
                        key={loan.id} 
                        onClick={() => handleReturnScan(null, loan.book_item_barcode || loan.book_item_id)}
                        className={`p-2 rounded border cursor-pointer text-sm flex justify-between items-center transition ${
                          returnBarcode === (loan.book_item_barcode || loan.book_item_id)
                            ? 'bg-blue-100 border-blue-300' 
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-mono">{loan.book_item_barcode || loan.book_item_id}</span>
                        <span className="text-xs text-gray-500">Due: {new Date(loan.due_date).toLocaleDateString()}</span>
                      </div>
                    ))}
                    {memberLoans.length === 0 && <p className="text-xs text-gray-400">No active loans.</p>}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Scan a book to auto-identify, or search manually.
                </p>
                <form onSubmit={handleReturnMemberSearch} className="flex gap-2 mb-2">
                  <input
                    type="text" placeholder="Search member..."
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={retMemQuery} onChange={e => setRetMemQuery(e.target.value)}
                  />
                  <button type="submit" className="bg-gray-100 p-2 rounded hover:bg-gray-200"><Search size={16} /></button>
                </form>
                {/* Results */}
                <div className="space-y-1">
                  {retMemResults.map(m => (
                    <div key={m.id} onClick={() => selectReturnMember(m)} className="p-2 hover:bg-gray-50 cursor-pointer text-sm border-b">
                      {m.full_name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* COL 2: Scan Item */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <BookOpen className="text-green-600" /> 2. Scan Item & Confirm
              </h2>
              
              <form onSubmit={(e) => handleReturnScan(e)} className="flex gap-2 mb-6">
                <input
                  type="text"
                  placeholder="Scan barcode here..."
                  className="flex-1 text-lg p-3 border-2 border-gray-300 rounded-lg font-mono focus:border-green-500 outline-none"
                  value={returnBarcode}
                  onChange={(e) => setReturnBarcode(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="bg-gray-800 text-white px-6 rounded-lg hover:bg-gray-900">
                  Check
                </button>
              </form>

              {/* Preview Panel */}
              {scannedReturnItem && (
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 animate-fade-in flex flex-col md:flex-row gap-6">
                  {/* Cover */}
                  <div className="w-24 h-36 bg-gray-200 rounded-lg shrink-0 overflow-hidden shadow-sm">
                    {scannedReturnItem.book_cover ? (
                      <img src={scannedReturnItem.book_cover} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400"><BookOpen /></div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{scannedReturnItem.book_title}</h3>
                      <p className="text-gray-600">{scannedReturnItem.book_author}</p>
                    </div>

                    <div className="flex gap-4 text-sm">
                      <div className="bg-white px-3 py-1 rounded border">
                        <span className="text-gray-500 block text-xs">Status</span>
                        <span className={`font-bold ${scannedReturnItem.status === 'Borrowed' ? 'text-blue-600' : 'text-gray-800'}`}>
                          {scannedReturnItem.status}
                        </span>
                      </div>
                      {scannedReturnItem.due_date && (
                        <div className="bg-white px-3 py-1 rounded border">
                          <span className="text-gray-500 block text-xs">Due Date</span>
                          <span className={new Date(scannedReturnItem.due_date) < new Date() ? "text-red-600 font-bold" : "text-gray-800"}>
                            {new Date(scannedReturnItem.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Condition & Action */}
                    <div className="pt-4 flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-1">Condition</label>
                        <select 
                          className="w-full border p-2.5 rounded-lg bg-white"
                          value={returnCondition}
                          onChange={(e) => setReturnCondition(e.target.value)}
                        >
                          <option value="Good">Good</option>
                          <option value="Damaged">Damaged (Apply Fine)</option>
                        </select>
                      </div>
                      <button 
                        onClick={confirmReturn}
                        disabled={scannedReturnItem.status === 'Available'}
                        className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                      >
                        Confirm Return
                      </button>
                    </div>
                    {scannedReturnItem.status === 'Available' && (
                      <p className="text-xs text-red-500">This item is already available.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* --- RESERVATIONS TAB (NEW) --- */}
      {activeTab === 'reservations' && (
        <div className="space-y-6">
          
          {/* Search Bar */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <form onSubmit={searchReservations} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Search by member name or book title..." 
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={resQuery}
                  onChange={(e) => setResQuery(e.target.value)}
                />
              </div>
              <button type="submit" className="bg-gray-100 px-6 rounded-lg hover:bg-gray-200 font-medium">
                Search
              </button>
            </form>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-700 border-b">
                <tr>
                  <th className="p-4">ID</th>
                  <th className="p-4">Member</th>
                  <th className="p-4">Book ID</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reservationList.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-gray-500">No reservations found.</td></tr>
                ) : (
                  reservationList.map(res => (
                    <tr key={res.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-mono text-xs text-gray-400">#{res.id}</td>
                      
                      {/* Member Name (Clickable shortcut to Member Details) */}
                      <td className="p-4">
                        <button 
                          onClick={() => navigate(`/members/${res.member_id}`)}
                          className="text-blue-600 font-medium hover:underline text-left"
                        >
                          {res.member_name}
                        </button>
                      </td>

                      {/* Book Title */}
                      <td className="p-4 text-gray-700 font-medium">
                        {res.book_title}
                      </td>

                      {/* Status & Position */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className={`w-fit px-2 py-0.5 rounded-full text-xs font-bold ${
                            res.status === 'Fulfilled' ? 'bg-green-100 text-green-700' :
                            res.status === 'Pending' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {res.status === 'Fulfilled' ? 'READY FOR PICKUP' : 'IN QUEUE'}
                          </span>
                          
                          {res.status === 'Pending' && (
                            <span className="text-[10px] text-gray-500 font-bold mt-1 uppercase">
                              Position: #{res.queue_position}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-gray-500 text-xs">
                        {new Date(res.reservation_date).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        {['Pending', 'Fulfilled'].includes(res.status) && (
                          <button 
                            onClick={() => handleCancelRes(res.id)}
                            className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors group"
                            title="Cancel and Reassign Book"
                          >
                            <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}