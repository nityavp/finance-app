export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  canApprove: boolean;
  approvalLimit?: number;
  active?: boolean;
  createdAt?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  _id: string;
  uploadedBy: string;
  uploadedByName: string;
  fileName: string;
  imageData?: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  currency: string;
  originalCurrency?: string;
  originalAmount?: number;
  subtotal: number;
  tax: number;
  lineItems: LineItem[];
  category: string;
  tags: string[];
  notes: string;
  rawOcrText: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedByName?: string;
  approvalDate?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface Ledger {
  _id: string;
  name: string;
  type: 'income' | 'expense' | 'asset' | 'liability';
  description: string;
  createdAt: string;
}

export interface Stats {
  totalInvoices: number;
  pendingInvoices: number;
  approvedInvoices: number;
  rejectedInvoices: number;
  totalUsers: number;
  totalExpenses: number;
  pendingAmount: number;
  byCategory: { _id: string; total: number; count: number }[];
  byMonth: { _id: string; total: number; count: number }[];
  byUser: { _id: string; total: number; count: number; approved: number; pending: number }[];
  byStatus: { _id: string; total: number; count: number }[];
  recentPending: Invoice[];
}
