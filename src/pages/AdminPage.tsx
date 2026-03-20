import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { Invoice, Ledger, Stats, User } from '../types';
import InvoiceDetail from '../components/InvoiceDetail';

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<'dashboard' | 'users' | 'invoices' | 'ledger' | 'approvals'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // User form
  const [uf, setUf] = useState({ username: '', password: '', name: '', canApprove: false, approvalLimit: 0 });
  // Ledger form
  const [lf, setLf] = useState({ name: '', type: 'expense' as string, description: '' });

  const loadAll = () => {
    api.get('/stats').then(r => setStats(r.data));
    api.get('/users').then(r => setUsers(r.data));
    api.get('/invoices').then(r => setInvoices(r.data));
    api.get('/invoices/pending').then(r => setPendingInvoices(r.data));
    api.get('/ledgers').then(r => setLedgers(r.data));
  };

  useEffect(() => { loadAll(); }, []);

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id || (editingUser as any)._id}`, uf);
      } else {
        await api.post('/users', uf);
      }
      setShowUserModal(false);
      setEditingUser(null);
      setUf({ username: '', password: '', name: '', canApprove: false, approvalLimit: 0 });
      loadAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Deactivate this user?')) return;
    await api.delete(`/users/${id}`);
    loadAll();
  };

  const handleSaveLedger = async () => {
    await api.post('/ledgers', lf);
    setShowLedgerModal(false);
    setLf({ name: '', type: 'expense', description: '' });
    loadAll();
  };

  const handleDeleteLedger = async (id: string) => {
    if (!confirm('Delete this ledger?')) return;
    await api.delete(`/ledgers/${id}`);
    loadAll();
  };

  const handleApprove = async (id: string, status: 'approved' | 'rejected', reason?: string) => {
    await api.put(`/invoices/${id}/approve`, { status, rejectionReason: reason });
    loadAll();
    setSelectedInvoice(null);
  };

  const editUser = (u: User) => {
    setEditingUser(u);
    setUf({ username: u.username, password: '', name: u.name, canApprove: u.canApprove, approvalLimit: u.approvalLimit || 0 });
    setShowUserModal(true);
  };

  return (
    <div>
      <div className="header">
        <h1>Finance Admin</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>{user?.name}</span>
          <button className="btn btn-sm" onClick={logout} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>Logout</button>
        </div>
      </div>

      <div className="page page-admin">
        <div className="tabs">
          {(['dashboard', 'users', 'invoices', 'approvals', 'ledger'] as const).map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'approvals' ? `Approvals (${pendingInvoices.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* DASHBOARD */}
        {tab === 'dashboard' && stats && (
          <div>
            <div className="stat-grid">
              <div className="stat-card"><div className="label">Total Invoices</div><div className="value">{stats.totalInvoices}</div></div>
              <div className="stat-card"><div className="label">Pending</div><div className="value" style={{ color: 'var(--orange)' }}>{stats.pendingInvoices}</div></div>
              <div className="stat-card"><div className="label">Approved</div><div className="value" style={{ color: 'var(--green)' }}>{stats.approvedInvoices}</div></div>
              <div className="stat-card"><div className="label">Total Expenses</div><div className="value" style={{ color: 'var(--blue)' }}>₹{stats.totalExpenses.toLocaleString()}</div></div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Expenses by Category</h3>
              {stats.byCategory.length === 0 ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No data yet</p> : (
                <div>
                  {stats.byCategory.map(c => (
                    <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ fontWeight: 600 }}>{c._id || 'Uncategorized'}</span>
                      <span>₹{c.total.toLocaleString()} <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>({c.count})</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Monthly Expenses</h3>
              {stats.byMonth.length === 0 ? <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No data yet</p> : (
                <div>
                  {stats.byMonth.map(m => (
                    <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ fontWeight: 600 }}>{m._id}</span>
                      <span>₹{m.total.toLocaleString()} <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>({m.count} invoices)</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Users ({users.length})</h2>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingUser(null); setUf({ username: '', password: '', name: '', canApprove: false, approvalLimit: 0 }); setShowUserModal(true); }}>+ Add User</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Approver</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={(u as any)._id}>
                      <td style={{ fontWeight: 600 }}>{u.name}</td>
                      <td>{u.username}</td>
                      <td><span className="badge" style={{ background: u.role === 'admin' ? '#dbeafe' : 'var(--gray-100)', color: u.role === 'admin' ? 'var(--blue)' : 'var(--gray-600)' }}>{u.role}</span></td>
                      <td>{u.canApprove ? '✓ Yes' : 'No'}</td>
                      <td><span className={`badge ${u.active !== false ? 'badge-approved' : 'badge-rejected'}`}>{u.active !== false ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <button className="btn btn-sm btn-outline" onClick={() => editUser(u)} style={{ marginRight: 4 }}>Edit</button>
                        {u.role !== 'admin' && <button className="btn btn-sm btn-danger" onClick={() => handleDeleteUser((u as any)._id)}>Remove</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INVOICES */}
        {tab === 'invoices' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>All Invoices ({invoices.length})</h2>
            {invoices.map(inv => (
              <div key={inv._id} className="invoice-card" onClick={() => setSelectedInvoice(inv)} style={{ cursor: 'pointer' }}>
                <div className="top">
                  <div>
                    <div className="vendor">{inv.vendorName || inv.fileName}</div>
                    <div className="meta">
                      <span>By: {inv.uploadedByName}</span>
                      <span>{inv.invoiceNumber}</span>
                      <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount">{inv.currency} {inv.totalAmount.toLocaleString()}</div>
                    <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {inv.category && <span style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 4 }}>{inv.category}</span>}
                  {inv.tags?.map(t => <span key={t} style={{ fontSize: 11, background: '#eff6ff', padding: '2px 8px', borderRadius: 4, color: 'var(--blue)' }}>{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* APPROVALS */}
        {tab === 'approvals' && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Pending Approvals ({pendingInvoices.length})</h2>
            {pendingInvoices.length === 0 ? (
              <div className="empty"><p>No pending approvals</p></div>
            ) : pendingInvoices.map(inv => (
              <div key={inv._id} className="invoice-card" onClick={() => setSelectedInvoice(inv)} style={{ cursor: 'pointer' }}>
                <div className="top">
                  <div>
                    <div className="vendor">{inv.vendorName || inv.fileName}</div>
                    <div className="meta"><span>By: {inv.uploadedByName}</span><span>{new Date(inv.createdAt).toLocaleDateString()}</span></div>
                  </div>
                  <div className="amount">{inv.currency} {inv.totalAmount.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LEDGER */}
        {tab === 'ledger' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Ledger Accounts ({ledgers.length})</h2>
              <button className="btn btn-primary btn-sm" onClick={() => setShowLedgerModal(true)}>+ Add Ledger</button>
            </div>
            {ledgers.length === 0 ? (
              <div className="empty"><p>No ledger accounts yet</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Type</th><th>Description</th><th>Actions</th></tr></thead>
                  <tbody>
                    {ledgers.map(l => (
                      <tr key={l._id}>
                        <td style={{ fontWeight: 600 }}>{l.name}</td>
                        <td><span className="badge" style={{ background: l.type === 'expense' ? '#fee2e2' : l.type === 'income' ? '#d1fae5' : '#dbeafe', color: l.type === 'expense' ? '#991b1b' : l.type === 'income' ? '#065f46' : '#1e40af' }}>{l.type}</span></td>
                        <td style={{ color: 'var(--gray-500)' }}>{l.description || '-'}</td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteLedger(l._id)}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{editingUser ? 'Edit User' : 'Create User'}</h2>
            <div className="form-group"><label>Full Name</label><input className="input" value={uf.name} onChange={e => setUf({ ...uf, name: e.target.value })} /></div>
            <div className="form-group"><label>Username</label><input className="input" value={uf.username} onChange={e => setUf({ ...uf, username: e.target.value })} disabled={!!editingUser} /></div>
            <div className="form-group"><label>{editingUser ? 'New Password (leave empty to keep)' : 'Password'}</label><input className="input" type="password" value={uf.password} onChange={e => setUf({ ...uf, password: e.target.value })} /></div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="canApprove" checked={uf.canApprove} onChange={e => setUf({ ...uf, canApprove: e.target.checked })} />
              <label htmlFor="canApprove" style={{ margin: 0 }}>Can approve invoices</label>
            </div>
            {uf.canApprove && (
              <div className="form-group"><label>Approval Limit (₹)</label><input className="input" type="number" value={uf.approvalLimit} onChange={e => setUf({ ...uf, approvalLimit: Number(e.target.value) })} /></div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveUser} style={{ flex: 1 }}>Save</button>
              <button className="btn btn-outline" onClick={() => setShowUserModal(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {showLedgerModal && (
        <div className="modal-overlay" onClick={() => setShowLedgerModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Create Ledger Account</h2>
            <div className="form-group"><label>Name</label><input className="input" value={lf.name} onChange={e => setLf({ ...lf, name: e.target.value })} placeholder="e.g., Office Supplies" /></div>
            <div className="form-group">
              <label>Type</label>
              <select className="input" value={lf.type} onChange={e => setLf({ ...lf, type: e.target.value })}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
              </select>
            </div>
            <div className="form-group"><label>Description</label><textarea className="input" value={lf.description} onChange={e => setLf({ ...lf, description: e.target.value })} rows={3} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveLedger} style={{ flex: 1 }}>Create</button>
              <button className="btn btn-outline" onClick={() => setShowLedgerModal(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail */}
      {selectedInvoice && (
        <InvoiceDetail
          invoice={selectedInvoice}
          canApprove={true}
          onApprove={handleApprove}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
