import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  canApprove: { type: Boolean, default: false },
  approvalLimit: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const invoiceSchema = new mongoose.Schema({
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedByName: { type: String },
  fileName: { type: String },
  imageData: { type: String },
  // OCR extracted fields
  vendorName: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  totalAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  lineItems: [{ description: String, quantity: Number, unitPrice: Number, amount: Number }],
  tax: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  category: { type: String, default: 'General' },
  tags: [String],
  notes: { type: String, default: '' },
  // Raw OCR text
  rawOcrText: { type: String, default: '' },
  // Approval
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedByName: { type: String },
  approvalDate: { type: Date },
  rejectionReason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const ledgerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['income', 'expense', 'asset', 'liability'], required: true },
  description: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
export const Invoice = mongoose.model('Invoice', invoiceSchema);
export const Ledger = mongoose.model('Ledger', ledgerSchema);
