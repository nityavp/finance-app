import { useState } from 'react';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice;
  canApprove: boolean;
  onApprove: (id: string, status: 'approved' | 'rejected', reason?: string) => void;
  onClose: () => void;
}

export default function InvoiceDetail({ invoice, canApprove, onApprove, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Invoice Details</h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}>Close</button>
        </div>

        {invoice.imageData && (
          <img src={invoice.imageData} alt="Invoice" style={{ width: '100%', borderRadius: 8, marginBottom: 16, maxHeight: 300, objectFit: 'contain', background: 'var(--gray-100)' }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Vendor</span><p style={{ fontWeight: 600 }}>{invoice.vendorName || '-'}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Invoice #</span><p style={{ fontWeight: 600 }}>{invoice.invoiceNumber || '-'}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Date</span><p style={{ fontWeight: 600 }}>{invoice.invoiceDate || '-'}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Due Date</span><p style={{ fontWeight: 600 }}>{invoice.dueDate || '-'}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Subtotal</span><p style={{ fontWeight: 600 }}>{invoice.currency} {invoice.subtotal?.toLocaleString()}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Tax</span><p style={{ fontWeight: 600 }}>{invoice.currency} {invoice.tax?.toLocaleString()}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Total</span><p style={{ fontWeight: 700, fontSize: 20, color: 'var(--blue)' }}>{invoice.currency} {invoice.totalAmount?.toLocaleString()}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Status</span><p><span className={`badge badge-${invoice.status}`}>{invoice.status}</span></p></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Category</span><p style={{ fontWeight: 600 }}>{invoice.category || '-'}</p></div>
          <div><span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Uploaded By</span><p style={{ fontWeight: 600 }}>{invoice.uploadedByName}</p></div>
        </div>

        {invoice.tags?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Tags</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {invoice.tags.map(t => <span key={t} style={{ background: 'var(--gray-100)', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{t}</span>)}
            </div>
          </div>
        )}

        {invoice.lineItems?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, display: 'block' }}>Line Items</span>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
                <tbody>
                  {invoice.lineItems.map((item, i) => (
                    <tr key={i}><td>{item.description}</td><td>{item.quantity}</td><td>{item.unitPrice}</td><td>{item.amount}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {invoice.approvedByName && (
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              {invoice.status === 'approved' ? 'Approved' : 'Rejected'} by <strong>{invoice.approvedByName}</strong> on {new Date(invoice.approvalDate!).toLocaleDateString()}
            </p>
            {invoice.rejectionReason && <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 4 }}>Reason: {invoice.rejectionReason}</p>}
          </div>
        )}

        {canApprove && invoice.status === 'pending' && (
          <div style={{ marginTop: 20 }}>
            {showReject ? (
              <div>
                <textarea className="input" placeholder="Reason for rejection..." value={reason} onChange={e => setReason(e.target.value)} rows={3} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-danger" onClick={() => onApprove(invoice._id, 'rejected', reason)} style={{ flex: 1 }}>Confirm Reject</button>
                  <button className="btn btn-outline" onClick={() => setShowReject(false)} style={{ flex: 1 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-success" onClick={() => onApprove(invoice._id, 'approved')} style={{ flex: 1 }}>Approve</button>
                <button className="btn btn-danger" onClick={() => setShowReject(true)} style={{ flex: 1 }}>Reject</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
