import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_SOCKET_URL || '';

function Admin() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [error, setError] = useState('');

  const [info, setInfo] = useState(null);
  const [replays, setReplays] = useState([]);
  const [partnerUrl, setPartnerUrl] = useState('');
  const [partnerId, setPartnerId] = useState('');

  const [activeTab, setActiveTab] = useState('info'); // 'info', 'replays', 'federation'
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const handleError = (err, customMessage) => {
    console.error(err);
    if (customMessage) {
      if (typeof customMessage === 'function') {
        customMessage(t('Connection error'));
      } else {
        alert(t('Connection error'));
      }
    }
  };

  useEffect(() => {
    if (token) {
      fetchInfo();
      fetchReplays();
    }
  }, [token]);

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('adminToken', data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      handleError(err, setError);
    }
  };

  const handleLogout = () => {
    setToken('');
    localStorage.removeItem('adminToken');
    setInfo(null);
  };

  const fetchInfo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/info`, { headers: authHeaders });
      if (res.ok) setInfo(await res.json());
      else if (res.status === 401 || res.status === 403) handleLogout();
    } catch (e) {
      handleError(e);
    }
  };

  const fetchReplays = async () => {
    try {
      const res = await fetch(`${API_URL}/api/replays`);
      if (res.ok) setReplays(await res.json());
    } catch (e) {
      handleError(e);
    }
  };

  const handleDeleteReplay = async (id) => {
    if (!window.confirm('Delete this replay?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/replays/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) fetchReplays();
    } catch (e) {
      handleError(e);
    }
  };

  const handleClearReplays = async () => {
    if (!window.confirm('Are you sure you want to delete ALL replays?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/replays`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) fetchReplays();
    } catch (e) {
      handleError(e);
    }
  };

  const handleConnectPartner = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/admin/federation/link`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ partnerUrl, partnerId })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Successfully linked!');
        setPartnerUrl('');
        setPartnerId('');
        fetchInfo();
      } else {
        alert(data.error || 'Failed to link');
      }
    } catch (e) {
      handleError(e, true);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setPasswordMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/password`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordMessage('Password updated successfully.');
        setNewPassword('');
      } else {
        setPasswordMessage(data.error || 'Failed to update password.');
      }
    } catch (err) {
      handleError(err, setPasswordMessage);
    }
  };

  const handleDeleteLink = async (id) => {
    if (!window.confirm('Remove this partner?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/federation/link/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) fetchInfo();
    } catch (e) {
      handleError(e);
    }
  };

  const handleSync = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/federation/sync`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully synced ${data.synced} replays from partners!`);
        fetchReplays();
      } else {
        alert('Failed to sync');
      }
    } catch (e) {
      handleError(e, true);
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto panel p-6 rounded-lg shadow-md mt-10">
        <h2 className="text-2xl font-bold mb-4 text-center">Admin Login</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-2 border rounded-md bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--text-color)]"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto panel p-6 rounded-lg shadow-md space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <button onClick={handleLogout} className="py-2 px-4 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm">
          Logout
        </button>
      </div>

      <div className="flex space-x-4 border-b border-[var(--border-color)] pb-2 mb-4">
        {['info', 'replays', 'federation'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 capitalize rounded-t-lg transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'info' && info && (
        <div className="space-y-4">
          <div>
            <h3 className="font-bold text-lg border-b border-[var(--border-color)] pb-2 mb-2">System Information</h3>
            <p><span className="font-semibold">Instance ID:</span> {info.instanceId}</p>
          </div>

          <div className="mt-8 pt-4 border-t border-[var(--border-color)]">
            <h3 className="font-bold text-lg mb-2">Reset Admin Password</h3>
            <form onSubmit={handlePasswordReset} className="max-w-sm space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full p-2 border rounded-md bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--text-color)]"
                  required
                  minLength={4}
                />
              </div>
              <button type="submit" className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded">
                Update Password
              </button>
              {passwordMessage && <p className="text-sm mt-2 font-medium">{passwordMessage}</p>}
            </form>
          </div>
        </div>
      )}

      {activeTab === 'replays' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-2">
            <h3 className="font-bold text-lg">Manage Replays</h3>
            <button onClick={handleClearReplays} className="py-1 px-3 bg-red-600 hover:bg-red-700 text-white rounded text-sm">
              Clear All Replays
            </button>
          </div>
          {replays.length === 0 ? (
             <p className="text-gray-500 text-center py-4">No replays found.</p>
          ) : (
             <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="p-2">Date</th>
                      <th className="p-2">White</th>
                      <th className="p-2">Black</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replays.map(r => (
                      <tr key={r.id} className="border-b border-[var(--border-color)] hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="p-2 truncate max-w-xs">{r.white_player_id || 'Anon'}</td>
                        <td className="p-2 truncate max-w-xs">{r.is_cpu ? `CPU Lvl ${r.cpu_level}` : (r.black_player_id || 'Anon')}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2">
                          <button onClick={() => handleDeleteReplay(r.id)} className="text-red-500 hover:text-red-700 text-sm font-semibold">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          )}
        </div>
      )}

      {activeTab === 'federation' && (
        <div className="space-y-6">
          <div>
             <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-2">
               <h3 className="font-bold text-lg">Federation Links</h3>
               <span className="text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-2 py-1 rounded font-bold">
                 v{info?.version || '1.0.0'}
               </span>
             </div>
             {info?.links?.length > 0 ? (
               <div className="overflow-x-auto mb-4">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="border-b border-[var(--border-color)] text-sm">
                       <th className="p-2">URL</th>
                       <th className="p-2">ID</th>
                       <th className="p-2 text-center">Status</th>
                       <th className="p-2 text-center">Version</th>
                       <th className="p-2 text-center">Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {info.links.map(link => (
                       <tr key={link.id} className="border-b border-[var(--border-color)] hover:bg-black/5 dark:hover:bg-white/5 text-sm">
                         <td className="p-2 font-mono">{link.partner_url}</td>
                         <td className="p-2 truncate max-w-[150px]" title={link.id}>{link.id}</td>
                         <td className="p-2 text-center">
                           {link.isActive ? (
                             <span className="text-green-600 font-bold">Online</span>
                           ) : (
                             <span className="text-red-600 font-bold">Offline</span>
                           )}
                         </td>
                         <td className="p-2 text-center">{link.version || '?'}</td>
                         <td className="p-2 text-center">
                           <button onClick={() => handleDeleteLink(link.id)} className="text-red-500 hover:text-red-700 font-semibold">
                             Remove
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             ) : (
               <p className="text-gray-500 mb-4">No partner instances connected.</p>
             )}

             <button onClick={handleSync} className="py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded">
                Sync Replays from Partners
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--border-color)]">
              <div className="panel p-4 rounded bg-black/5 dark:bg-white/5 flex flex-col items-center justify-center text-center">
                 <h4 className="font-bold mb-2 text-xl">My Instance ID</h4>
                 <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                   Share this ID and your URL with the partner admin to establish a connection.
                 </p>
                 <div className="w-full mt-2 text-lg font-mono p-4 bg-[var(--bg-color)] rounded border border-[var(--border-color)] tracking-wider break-all shadow-inner">
                    {info?.instanceId}
                 </div>
              </div>

              <div className="panel p-4 rounded bg-black/5 dark:bg-white/5">
                 <h4 className="font-bold mb-2 text-xl border-b border-[var(--border-color)] pb-2">Add Partner</h4>
                 <form onSubmit={handleConnectPartner} className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-semibold mb-1">Partner URL</label>
                      <input
                        type="url"
                        placeholder="https://partner-chess.example.com"
                        value={partnerUrl}
                        onChange={e => setPartnerUrl(e.target.value)}
                        className="w-full p-2 text-sm border rounded-md bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-color)]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Partner Instance ID</label>
                      <input
                        type="text"
                        placeholder="e.g. 9e742e07-a3b8-4345-9c89-792e09217a1c"
                        value={partnerId}
                        onChange={e => setPartnerId(e.target.value)}
                        className="w-full p-2 text-sm font-mono border rounded-md bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-color)]"
                        required
                      />
                    </div>
                    <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors mt-2">
                      Save Link
                    </button>
                 </form>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
