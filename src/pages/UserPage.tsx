import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { Invoice } from '../types';
import InvoiceDetail from '../components/InvoiceDetail';

export default function UserPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('upload');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadInvoices = () => {
    api.get('/invoices/mine').then(r => setInvoices(r.data));
    if (user?.canApprove) {
      api.get('/invoices/pending').then(r => setPendingInvoices(r.data));
    }
  };

  useEffect(() => { loadInvoices(); }, []);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('invoice', file);
      await api.post('/invoices/upload', fd);
      loadInvoices();
      setTab('past');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (id: string, status: 'approved' | 'rejected', reason?: string) => {
    await api.put(`/invoices/${id}/approve`, { status, rejectionReason: reason });
    loadInvoices();
    setSelectedInvoice(null);
  };

  const tabs: { key: string; label: string }[] = [
    { key: 'upload', label: 'Upload Invoice' },
    { key: 'past', label: 'Past Invoices' },
  ];
  if (user?.canApprove) tabs.push({ key: 'approvals', label: `Approvals (${pendingInvoices.length})` });

  return (
    <div>
      <div className="header">
        <h1>Finance App</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>{user?.name}</span>
          <button className="btn btn-sm" onClick={logout} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>Logout</button>
        </div>
      </div>
      <div className="page">
        <div className="tabs">
          {tabs.map(t => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {tab === 'upload' && (
          <div>
            <div
              className={`upload-zone ${dragOver ? 'drag' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
            >
              {uploading ? (
                <div>
                  <span className="spinner" style={{ width: 40, height: 40 }} />
                  <p style={{ marginTop: 16, fontWeight: 600, color: 'var(--gray-600)' }}>Processing invoice with AI...</p>
                  <p style={{ marginTop: 4, fontSize: 13, color: 'var(--gray-400)' }}>Extracting details via OCR</p>
                </div>
              ) : (
                <div>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <p style={{ marginTop: 12, fontWeight: 600, color: 'var(--gray-600)' }}>Tap to upload invoice</p>
                  <p style={{ marginTop: 4, fontSize: 13, color: 'var(--gray-400)' }}>or drag & drop image/PDF here</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            </div>
          </div>
        )}

        {tab === 'past' && (
          <div>
            {invoices.length === 0 ? (
              <div className="empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>No invoices yet</p>
              </div>
            ) : invoices.map(inv => (
              <div key={inv._id} className="invoice-card" onClick={() => setSelectedInvoice(inv)} style={{ cursor: 'pointer' }}>
                <div className="top">
                  <div>
                    <div className="vendor">{inv.vendorName || inv.fileName}</div>
                    <div className="meta">
                      <span>{inv.invoiceNumber}</span>
                      <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount">₹{inv.totalAmount.toLocaleString()}</div>
                    <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                  </div>
                </div>
                {inv.category && <span style={{ fontSize: 12, background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 4 }}>{inv.category}</span>}
              </div>
            ))}
          </div>
        )}

        {tab === 'approvals' && (
          <div>
            {pendingInvoices.length === 0 ? (
              <div className="empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gray-300)" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <p>No pending approvals</p>
              </div>
            ) : pendingInvoices.map(inv => (
              <div key={inv._id} className="invoice-card" onClick={() => setSelectedInvoice(inv)} style={{ cursor: 'pointer' }}>
                <div className="top">
                  <div>
                    <div className="vendor">{inv.vendorName || inv.fileName}</div>
                    <div className="meta">
                      <span>By: {inv.uploadedByName}</span>
                      <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="amount">₹{inv.totalAmount.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedInvoice && (
        <InvoiceDetail
          invoice={selectedInvoice}
          canApprove={!!user?.canApprove}
          onApprove={handleApprove}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
