import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { User, Invoice, Ledger, Journey, Trip, Lead } from './models.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const OLA_API_KEY = process.env.OLA_MAPS_API_KEY;

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Finance access: admin or finance_manager
function financeAccess(req, res, next) {
  if (!['admin', 'finance_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Finance access required' });
  next();
}

// Operations access: admin, operations_manager, branch_manager
function opsAccess(req, res, next) {
  if (!['admin', 'operations_manager', 'branch_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Operations access required' });
  next();
}

await mongoose.connect(process.env.MONGODB_URI);
console.log('MongoDB connected');

const adminExists = await User.findOne({ role: 'admin' });
if (!adminExists) {
  await User.create({ username: 'admin', password: await bcrypt.hash('admin123', 10), name: 'Administrator', role: 'admin', canApprove: true, approvalLimit: 999999999, hasJourneyAccess: true });
  console.log('Default admin created: admin / admin123');
}

// AUTH
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, active: true });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id, username: user.username, name: user.name, role: user.role, canApprove: user.canApprove, hasJourneyAccess: user.hasJourneyAccess }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, name: user.name, role: user.role, canApprove: user.canApprove, hasJourneyAccess: user.hasJourneyAccess, branch: user.branch } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

// USERS
app.get('/api/users', auth, adminOnly, async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, name, role, canApprove, approvalLimit, approveScope, approveForUsers, hasJourneyAccess, branch, managedBy } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      username, password: hashed, name,
      role: role || 'user',
      canApprove: canApprove || false,
      approvalLimit: approvalLimit || 0,
      approveScope: approveScope || 'all',
      approveForUsers: approveForUsers || [],
      hasJourneyAccess: hasJourneyAccess || false,
      branch: branch || '',
      managedBy: managedBy || undefined,
    });
    res.json({ ...user.toObject(), password: undefined });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) updates.password = await bcrypt.hash(updates.password, 10);
    else delete updates.password;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ ok: true });
});

app.get('/api/users/list', auth, async (req, res) => {
  const users = await User.find({ active: true }).select('_id name username role branch hasJourneyAccess').sort({ name: 1 });
  res.json(users);
});

// INVOICES / CLAIMS
app.post('/api/invoices/upload', auth, upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      `Extract all invoice details from this image. Return ONLY valid JSON (no markdown, no code blocks) with these fields:
{ "vendorName": "", "invoiceNumber": "", "invoiceDate": "", "dueDate": "", "originalCurrency": "", "originalAmount": 0, "totalAmount": 0, "currency": "INR", "subtotal": 0, "tax": 0, "category": "", "lineItems": [{"description": "", "quantity": 0, "unitPrice": 0, "amount": 0}], "tags": [], "rawText": "" }
RULES: 1. ALL monetary values MUST be converted to INR. Use approx rates: 1 USD=84, 1 EUR=91, 1 GBP=106, 1 AUD=55, 1 SGD=63, 1 CAD=61, 1 AED=23, 1 JPY=0.56. 2. AUTO-CATEGORIZE into: "Office Supplies", "Software & SaaS", "Travel & Transport", "Food & Beverages", "Utilities", "Rent & Lease", "Professional Services", "Marketing & Advertising", "Equipment", "Maintenance & Repairs", "Insurance", "Telecommunications", "Raw Materials", "Logistics & Shipping", "Salary & Wages", "Medical & Healthcare", "Legal & Compliance", "Training & Education", "Miscellaneous". 3. Add relevant tags.`
    ]);
    let ocrData;
    const responseText = result.response.text();
    try { const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(); ocrData = JSON.parse(cleaned); }
    catch { ocrData = { rawText: responseText }; }
    const invoice = await Invoice.create({
      uploadedBy: req.user.id, uploadedByName: req.user.name, fileName: req.file.originalname,
      imageData: `data:${mimeType};base64,${base64}`,
      vendorName: ocrData.vendorName || '', invoiceNumber: ocrData.invoiceNumber || '',
      invoiceDate: ocrData.invoiceDate || '', dueDate: ocrData.dueDate || '',
      totalAmount: ocrData.totalAmount || 0, currency: 'INR',
      originalCurrency: ocrData.originalCurrency || 'INR', originalAmount: ocrData.originalAmount || ocrData.totalAmount || 0,
      subtotal: ocrData.subtotal || 0, tax: ocrData.tax || 0,
      lineItems: ocrData.lineItems || [], category: ocrData.category || 'General',
      tags: ocrData.tags || [], rawOcrText: ocrData.rawText || responseText || '', status: 'pending',
      isManualClaim: false,
    });
    res.json(invoice);
  } catch (err) { console.error('Upload error:', err); res.status(500).json({ error: err.message }); }
});

app.post('/api/claims/manual', auth, async (req, res) => {
  try {
    const { vendorName, invoiceNumber, invoiceDate, dueDate, totalAmount, category, notes, lineItems, tags } = req.body;
    if (!vendorName || !totalAmount) return res.status(400).json({ error: 'Vendor name and total amount are required' });
    const subtotal = (lineItems && lineItems.length > 0) ? lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) : Number(totalAmount) || 0;
    const invoice = await Invoice.create({
      uploadedBy: req.user.id, uploadedByName: req.user.name,
      vendorName, invoiceNumber: invoiceNumber || '', invoiceDate: invoiceDate || '', dueDate: dueDate || '',
      totalAmount: Number(totalAmount) || 0, currency: 'INR', originalCurrency: 'INR', originalAmount: Number(totalAmount) || 0,
      subtotal, tax: (Number(totalAmount) || 0) - subtotal,
      lineItems: lineItems || [], category: category || 'Miscellaneous', tags: tags || [], notes: notes || '',
      status: 'pending', isManualClaim: true,
    });
    res.json(invoice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/invoices/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Claim not found' });
    if (invoice.uploadedBy.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    if (invoice.status !== 'pending') return res.status(400).json({ error: 'Can only edit pending claims' });
    const allowedFields = ['vendorName', 'invoiceNumber', 'invoiceDate', 'dueDate', 'totalAmount', 'category', 'notes', 'lineItems', 'tags', 'subtotal', 'tax'];
    const updates = {};
    for (const field of allowedFields) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    if (updates.totalAmount !== undefined) { updates.totalAmount = Number(updates.totalAmount); updates.originalAmount = updates.totalAmount; }
    const updated = await Invoice.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/invoices/mine', auth, async (req, res) => {
  const invoices = await Invoice.find({ uploadedBy: req.user.id }).sort({ createdAt: -1 });
  res.json(invoices);
});

app.get('/api/invoices/pending', auth, async (req, res) => {
  if (!req.user.canApprove && !['admin', 'finance_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Not an approver' });
  const filter = { status: 'pending' };
  if (!['admin', 'finance_manager'].includes(req.user.role)) {
    const approver = await User.findById(req.user.id);
    if (approver && approver.approveScope === 'selected' && approver.approveForUsers?.length > 0) {
      filter.uploadedBy = { $in: approver.approveForUsers };
    }
  }
  const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
  res.json(invoices);
});

app.get('/api/invoices', auth, async (req, res) => {
  if (!['admin', 'finance_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const { status, category, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (from || to) { filter.createdAt = {}; if (from) filter.createdAt.$gte = new Date(from); if (to) filter.createdAt.$lte = new Date(to); }
  const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
  res.json(invoices);
});

app.get('/api/invoices/:id', auth, async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  res.json(invoice);
});

app.put('/api/invoices/:id/approve', auth, async (req, res) => {
  if (!req.user.canApprove && !['admin', 'finance_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Not an approver' });
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Claim not found' });
  if (!['admin', 'finance_manager'].includes(req.user.role)) {
    const approver = await User.findById(req.user.id);
    if (approver && approver.approveScope === 'selected' && approver.approveForUsers?.length > 0) {
      const allowed = approver.approveForUsers.map(id => id.toString());
      if (!allowed.includes(invoice.uploadedBy.toString())) return res.status(403).json({ error: 'Not authorized to approve this user\'s claims' });
    }
  }
  const { status, rejectionReason } = req.body;
  const update = { status, approvedBy: req.user.id, approvedByName: req.user.name, approvalDate: new Date() };
  if (status === 'rejected') update.rejectionReason = rejectionReason || '';
  const updated = await Invoice.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json(updated);
});

// LEDGER
app.get('/api/ledgers', auth, async (req, res) => { const ledgers = await Ledger.find().sort({ createdAt: -1 }); res.json(ledgers); });
app.post('/api/ledgers', auth, adminOnly, async (req, res) => { const ledger = await Ledger.create({ ...req.body, createdBy: req.user.id }); res.json(ledger); });
app.delete('/api/ledgers/:id', auth, adminOnly, async (req, res) => { await Ledger.findByIdAndDelete(req.params.id); res.json({ ok: true }); });

// STATS
app.get('/api/stats', auth, async (req, res) => {
  if (!['admin', 'finance_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const [totalInvoices, pendingInvoices, approvedInvoices, rejectedInvoices, totalUsers] = await Promise.all([
    Invoice.countDocuments(), Invoice.countDocuments({ status: 'pending' }),
    Invoice.countDocuments({ status: 'approved' }), Invoice.countDocuments({ status: 'rejected' }),
    User.countDocuments({ active: true }),
  ]);
  const totalExpenses = await Invoice.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
  const byCategory = await Invoice.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$category', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]);
  const byMonth = await Invoice.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }, { $sort: { _id: -1 } }, { $limit: 12 }]);
  const byUser = await Invoice.aggregate([{ $group: { _id: '$uploadedByName', total: { $sum: '$totalAmount' }, count: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$totalAmount', 0] } }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } }, { $sort: { total: -1 } }]);
  const byStatus = await Invoice.aggregate([{ $group: { _id: '$status', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]);
  const pendingAmount = await Invoice.aggregate([{ $match: { status: 'pending' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
  const recentPending = await Invoice.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(10);
  res.json({ totalInvoices, pendingInvoices, approvedInvoices, rejectedInvoices, totalUsers, totalExpenses: totalExpenses[0]?.total || 0, pendingAmount: pendingAmount[0]?.total || 0, byCategory, byMonth: byMonth.reverse(), byUser, byStatus, recentPending });
});

// ===== OLA MAPS API =====

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${lat},${lng}&api_key=${OLA_API_KEY}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (data.status === 'ok' && data.results?.length > 0) return data.results[0].formatted_address;
    return '';
  } catch { return ''; }
}

async function getDistanceMatrix(originLat, originLng, destLat, destLng, mode = 'driving') {
  try {
    const url = `https://api.olamaps.io/routing/v1/distanceMatrix?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=${mode}&api_key=${OLA_API_KEY}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (data.status === 'SUCCESS' && data.rows?.length > 0) {
      const el = data.rows[0].elements[0];
      return { distanceKm: Math.round((el.distance / 1000) * 100) / 100, durationMinutes: Math.round((el.duration / 60) * 100) / 100 };
    }
    return null;
  } catch { return null; }
}

// Reverse geocode endpoint (for frontend use)
app.post('/api/maps/reverse-geocode', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const address = await reverseGeocode(lat, lng);
    res.json({ address });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Distance matrix endpoint
app.post('/api/maps/distance', auth, async (req, res) => {
  try {
    const { originLat, originLng, destLat, destLng, mode } = req.body;
    if (!originLat || !originLng || !destLat || !destLng) return res.status(400).json({ error: 'Origin and destination coordinates required' });
    const result = await getDistanceMatrix(originLat, originLng, destLat, destLng, mode);
    if (!result) return res.status(404).json({ error: 'Could not calculate distance' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== JOURNEY TRACKER APIs =====

// Start a new journey (day)
app.post('/api/journeys/start', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.hasJourneyAccess && user?.role !== 'admin') return res.status(403).json({ error: 'Journey access not enabled' });
    const existing = await Journey.findOne({ userId: req.user.id, status: 'active' });
    if (existing) return res.status(400).json({ error: 'You already have an active journey. End it first.', journey: existing });
    const today = new Date().toISOString().split('T')[0];
    const { lat, lng } = req.body;
    // Reverse geocode to get address
    const address = (lat && lng) ? await reverseGeocode(lat, lng) : '';
    const journey = await Journey.create({
      userId: req.user.id, userName: req.user.name, date: today,
      startLocation: { lat: lat || 0, lng: lng || 0, address },
    });
    res.json(journey);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// End a journey - reverse geocode + calculate total distance
app.put('/api/journeys/:id/end', auth, async (req, res) => {
  try {
    const journey = await Journey.findById(req.params.id);
    if (!journey) return res.status(404).json({ error: 'Journey not found' });
    if (journey.userId.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    if (journey.status !== 'active') return res.status(400).json({ error: 'Journey already ended' });
    // End any active trips
    await Trip.updateMany({ journeyId: journey._id, status: 'active' }, { status: 'completed', endTime: new Date(), updatedAt: new Date() });
    const { lat, lng } = req.body;
    // Reverse geocode end location
    const endAddress = (lat && lng) ? await reverseGeocode(lat, lng) : '';
    // Calculate distance from start to end
    let distanceKm = null, durationMinutes = null;
    if (lat && lng && journey.startLocation?.lat && journey.startLocation?.lng) {
      const dist = await getDistanceMatrix(journey.startLocation.lat, journey.startLocation.lng, lat, lng);
      if (dist) { distanceKm = dist.distanceKm; durationMinutes = dist.durationMinutes; }
    }
    // Also sum up all trip distances
    const trips = await Trip.find({ journeyId: journey._id });
    const totalTripDistance = trips.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
    const updated = await Journey.findByIdAndUpdate(req.params.id, {
      status: 'completed', endTime: new Date(),
      endLocation: { lat: lat || 0, lng: lng || 0, address: endAddress },
      distanceKm: distanceKm || totalTripDistance || null,
      durationMinutes,
      totalTripDistance: Math.round(totalTripDistance * 100) / 100,
      updatedAt: new Date(),
    }, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get active journey for current user
app.get('/api/journeys/active', auth, async (req, res) => {
  const journey = await Journey.findOne({ userId: req.user.id, status: 'active' });
  res.json(journey || null);
});

// Get my journeys
app.get('/api/journeys/mine', auth, async (req, res) => {
  const journeys = await Journey.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(journeys);
});

// Get all journeys (ops/admin)
app.get('/api/journeys', auth, async (req, res) => {
  if (!['admin', 'operations_manager', 'branch_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const { userId, date, from, to } = req.query;
  const filter = {};
  if (userId) filter.userId = userId;
  if (date) filter.date = date;
  if (from || to) { filter.date = {}; if (from) filter.date.$gte = from; if (to) filter.date.$lte = to; }
  // Branch managers see only users managed by them or in their branch
  if (req.user.role === 'branch_manager') {
    const managedUsers = await User.find({ $or: [{ managedBy: req.user.id }, { branch: (await User.findById(req.user.id))?.branch }], active: true }).select('_id');
    filter.userId = { $in: managedUsers.map(u => u._id) };
  }
  const journeys = await Journey.find(filter).sort({ createdAt: -1 });
  res.json(journeys);
});

// Get journey detail with trips
app.get('/api/journeys/:id', auth, async (req, res) => {
  const journey = await Journey.findById(req.params.id);
  if (!journey) return res.status(404).json({ error: 'Not found' });
  const trips = await Trip.find({ journeyId: journey._id }).sort({ sequence: 1 });
  const leads = await Lead.find({ journeyId: journey._id }).sort({ createdAt: -1 });
  res.json({ journey, trips, leads });
});

// ===== TRIP APIs =====

// Start a trip within a journey - reverse geocode start location
app.post('/api/trips/start', auth, async (req, res) => {
  try {
    const journey = await Journey.findOne({ userId: req.user.id, status: 'active' });
    if (!journey) return res.status(400).json({ error: 'No active journey. Start your day first.' });
    // End any active trip (also calculate its distance)
    const activeTripToEnd = await Trip.findOne({ journeyId: journey._id, userId: req.user.id, status: 'active' });
    if (activeTripToEnd) {
      const { lat, lng } = req.body;
      let endAddress = '', distanceKm = null, durationMinutes = null;
      if (lat && lng) {
        endAddress = await reverseGeocode(lat, lng);
        if (activeTripToEnd.startLocation?.lat && activeTripToEnd.startLocation?.lng) {
          const dist = await getDistanceMatrix(activeTripToEnd.startLocation.lat, activeTripToEnd.startLocation.lng, lat, lng);
          if (dist) { distanceKm = dist.distanceKm; durationMinutes = dist.durationMinutes; }
        }
      }
      await Trip.findByIdAndUpdate(activeTripToEnd._id, {
        status: 'completed', endTime: new Date(),
        endLocation: { lat: lat || 0, lng: lng || 0, address: endAddress },
        distanceKm, durationMinutes, updatedAt: new Date(),
      });
    }
    const tripCount = await Trip.countDocuments({ journeyId: journey._id });
    const { purpose, lat, lng } = req.body;
    // Reverse geocode start location
    const startAddress = (lat && lng) ? await reverseGeocode(lat, lng) : '';
    const trip = await Trip.create({
      journeyId: journey._id, userId: req.user.id, userName: req.user.name,
      sequence: tripCount + 1, purpose: purpose || '',
      startLocation: { lat: lat || 0, lng: lng || 0, address: startAddress },
      location: { lat: lat || 0, lng: lng || 0, address: startAddress },
    });
    await Journey.findByIdAndUpdate(journey._id, { totalTrips: tripCount + 1, updatedAt: new Date() });
    res.json(trip);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// End a trip - reverse geocode + distance calculation via OLA
app.put('/api/trips/:id/end', auth, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.userId.toString() !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    const { notes, lat, lng } = req.body;
    // Reverse geocode end location
    let endAddress = '';
    let distanceKm = null, durationMinutes = null;
    if (lat && lng) {
      endAddress = await reverseGeocode(lat, lng);
      // Calculate distance from trip start to end
      const startLat = trip.startLocation?.lat || trip.location?.lat;
      const startLng = trip.startLocation?.lng || trip.location?.lng;
      if (startLat && startLng) {
        const dist = await getDistanceMatrix(startLat, startLng, lat, lng);
        if (dist) { distanceKm = dist.distanceKm; durationMinutes = dist.durationMinutes; }
      }
    }
    const updated = await Trip.findByIdAndUpdate(req.params.id, {
      status: 'completed', endTime: new Date(), notes: notes || trip.notes,
      endLocation: { lat: lat || 0, lng: lng || 0, address: endAddress },
      distanceKm, durationMinutes, updatedAt: new Date(),
    }, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get trips for a journey
app.get('/api/trips/journey/:journeyId', auth, async (req, res) => {
  const trips = await Trip.find({ journeyId: req.params.journeyId }).sort({ sequence: 1 });
  res.json(trips);
});

// Get active trip
app.get('/api/trips/active', auth, async (req, res) => {
  const journey = await Journey.findOne({ userId: req.user.id, status: 'active' });
  if (!journey) return res.json(null);
  const trip = await Trip.findOne({ journeyId: journey._id, userId: req.user.id, status: 'active' });
  res.json(trip || null);
});

// ===== LEAD APIs =====

// Add a lead to a trip
app.post('/api/leads', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({ userId: req.user.id, status: 'active' });
    if (!trip) return res.status(400).json({ error: 'No active trip. Start a trip first.' });
    const { contactName, phone, email, company, designation, productInterest, notes, followUpDate, lat, lng } = req.body;
    if (!contactName) return res.status(400).json({ error: 'Contact name is required' });
    // Reverse geocode lead location
    const leadAddress = (lat && lng) ? await reverseGeocode(lat, lng) : '';
    const lead = await Lead.create({
      tripId: trip._id, journeyId: trip.journeyId, userId: req.user.id, userName: req.user.name,
      contactName, phone: phone || '', email: email || '', company: company || '',
      designation: designation || '', productInterest: productInterest || '',
      notes: notes || '', followUpDate: followUpDate || '',
      location: { lat: lat || 0, lng: lng || 0, address: leadAddress },
    });
    // Update counts
    await Trip.findByIdAndUpdate(trip._id, { $inc: { leadsCount: 1 }, updatedAt: new Date() });
    await Journey.findByIdAndUpdate(trip.journeyId, { $inc: { totalLeads: 1 }, updatedAt: new Date() });
    res.json(lead);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get my leads
app.get('/api/leads/mine', auth, async (req, res) => {
  const { status } = req.query;
  const filter = { userId: req.user.id };
  if (status) filter.status = status;
  const leads = await Lead.find(filter).sort({ createdAt: -1 });
  res.json(leads);
});

// Get all leads (ops/admin)
app.get('/api/leads', auth, async (req, res) => {
  if (!['admin', 'operations_manager', 'branch_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const { status, userId, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (userId) filter.userId = userId;
  if (from || to) { filter.createdAt = {}; if (from) filter.createdAt.$gte = new Date(from); if (to) filter.createdAt.$lte = new Date(to); }
  if (req.user.role === 'branch_manager') {
    const managedUsers = await User.find({ $or: [{ managedBy: req.user.id }, { branch: (await User.findById(req.user.id))?.branch }], active: true }).select('_id');
    filter.userId = { $in: managedUsers.map(u => u._id) };
  }
  const leads = await Lead.find(filter).sort({ createdAt: -1 });
  res.json(leads);
});

// Update lead status (relation manager can update own, ops/admin can update any)
app.put('/api/leads/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const isOwner = lead.userId.toString() === req.user.id;
    const isOps = ['admin', 'operations_manager', 'branch_manager'].includes(req.user.role);
    if (!isOwner && !isOps) return res.status(403).json({ error: 'Not authorized' });
    const { status, notes, followUpDate, conversionNotes } = req.body;
    const updates = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (followUpDate !== undefined) updates.followUpDate = followUpDate;
    if (status === 'converted') {
      updates.convertedBy = req.user.id;
      updates.convertedByName = req.user.name;
      updates.convertedDate = new Date();
      updates.conversionNotes = conversionNotes || '';
      // Update journey converted count
      await Journey.findByIdAndUpdate(lead.journeyId, { $inc: { totalConverted: 1 }, updatedAt: new Date() });
    }
    const updated = await Lead.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get lead detail
app.get('/api/leads/:id', auth, async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

// ===== JOURNEY STATS =====
app.get('/api/journey-stats', auth, async (req, res) => {
  if (!['admin', 'operations_manager', 'branch_manager'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const filter = {};
  if (req.user.role === 'branch_manager') {
    const managedUsers = await User.find({ $or: [{ managedBy: req.user.id }, { branch: (await User.findById(req.user.id))?.branch }], active: true }).select('_id');
    filter.userId = { $in: managedUsers.map(u => u._id) };
  }
  const today = new Date().toISOString().split('T')[0];
  const [totalJourneys, activeJourneys, todayJourneys, totalLeads, convertedLeads, totalTrips] = await Promise.all([
    Journey.countDocuments(filter),
    Journey.countDocuments({ ...filter, status: 'active' }),
    Journey.countDocuments({ ...filter, date: today }),
    Lead.countDocuments(filter.userId ? { userId: filter.userId } : {}),
    Lead.countDocuments(filter.userId ? { userId: filter.userId, status: 'converted' } : { status: 'converted' }),
    Trip.countDocuments(filter.userId ? { userId: filter.userId } : {}),
  ]);
  const byUser = await Journey.aggregate([
    ...(filter.userId ? [{ $match: { userId: { $in: filter.userId.$in } } }] : []),
    { $group: { _id: '$userName', journeys: { $sum: 1 }, leads: { $sum: '$totalLeads' }, converted: { $sum: '$totalConverted' }, trips: { $sum: '$totalTrips' } } },
    { $sort: { journeys: -1 } }
  ]);
  const leadsByStatus = await Lead.aggregate([
    ...(filter.userId ? [{ $match: { userId: { $in: filter.userId.$in } } }] : []),
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const recentJourneys = await Journey.find(filter).sort({ createdAt: -1 }).limit(10);
  res.json({ totalJourneys, activeJourneys, todayJourneys, totalLeads, convertedLeads, totalTrips, byUser, leadsByStatus, recentJourneys });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
