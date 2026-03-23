import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'finance_manager', 'operations_manager', 'branch_manager', 'relation_manager', 'user'], default: 'user' },
  canApprove: { type: Boolean, default: false },
  approveScope: { type: String, enum: ['all', 'selected'], default: 'all' },
  approveForUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  approvalLimit: { type: Number, default: 0 },
  hasJourneyAccess: { type: Boolean, default: false },
  branch: { type: String, default: '' },
  managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const invoiceSchema = new mongoose.Schema({
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedByName: { type: String },
  fileName: { type: String },
  imageData: { type: String },
  vendorName: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  totalAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  originalCurrency: { type: String, default: 'INR' },
  originalAmount: { type: Number, default: 0 },
  lineItems: [{ description: String, quantity: Number, unitPrice: Number, amount: Number }],
  tax: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  category: { type: String, default: 'General' },
  tags: [String],
  notes: { type: String, default: '' },
  rawOcrText: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedByName: { type: String },
  approvalDate: { type: Date },
  rejectionReason: { type: String },
  isManualClaim: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const ledgerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['income', 'expense', 'asset', 'liability'], required: true },
  description: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

// Journey = a day's work session
const journeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  startLocation: {
    lat: Number,
    lng: Number,
    address: { type: String, default: '' },
  },
  endLocation: {
    lat: Number,
    lng: Number,
    address: { type: String, default: '' },
  },
  totalTrips: { type: Number, default: 0 },
  totalLeads: { type: Number, default: 0 },
  totalConverted: { type: Number, default: 0 },
  distanceKm: { type: Number, default: null },
  durationMinutes: { type: Number, default: null },
  totalTripDistance: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Trip = individual visit within a journey
const tripSchema = new mongoose.Schema({
  journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  sequence: { type: Number, default: 1 },
  purpose: { type: String, default: '' },
  location: {
    lat: Number,
    lng: Number,
    address: { type: String, default: '' },
  },
  startLocation: {
    lat: Number,
    lng: Number,
    address: { type: String, default: '' },
  },
  endLocation: {
    lat: Number,
    lng: Number,
    address: { type: String, default: '' },
  },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  distanceKm: { type: Number, default: null },
  durationMinutes: { type: Number, default: null },
  leadsCount: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Lead captured during a trip
const leadSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  journeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  // Lead info
  contactName: { type: String, required: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  company: { type: String, default: '' },
  designation: { type: String, default: '' },
  productInterest: { type: String, default: '' },
  status: { type: String, enum: ['new', 'contacted', 'follow_up', 'qualified', 'converted', 'lost'], default: 'new' },
  followUpDate: { type: String, default: '' },
  notes: { type: String, default: '' },
  location: {
    lat: Number,
    lng: Number,
    address: { type: String, default: '' },
  },
  // Conversion tracking
  convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  convertedByName: { type: String },
  convertedDate: { type: Date },
  conversionNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
export const Invoice = mongoose.model('Invoice', invoiceSchema);
export const Ledger = mongoose.model('Ledger', ledgerSchema);
export const Journey = mongoose.model('Journey', journeySchema);
export const Trip = mongoose.model('Trip', tripSchema);
export const Lead = mongoose.model('Lead', leadSchema);
