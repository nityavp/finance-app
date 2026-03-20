import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { User, Invoice, Ledger } from './models.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Connect DB and seed admin
await mongoose.connect(process.env.MONGODB_URI);
console.log('MongoDB connected');

const adminExists = await User.findOne({ role: 'admin' });
if (!adminExists) {
  await User.create({
    username: 'admin',
    password: await bcrypt.hash('admin123', 10),
    name: 'Administrator',
    role: 'admin',
    canApprove: true,
    approvalLimit: 999999999,
  });
  console.log('Default admin created: admin / admin123');
}

// ============ AUTH ============
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, active: true });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user._id, username: user.username, name: user.name, role: user.role, canApprove: user.canApprove },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, username: user.username, name: user.name, role: user.role, canApprove: user.canApprove } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

// ============ USERS (admin) ============
app.get('/api/users', auth, adminOnly, async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, name, canApprove, approvalLimit } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashed, name, canApprove: canApprove || false, approvalLimit: approvalLimit || 0 });
    res.json({ ...user.toObject(), password: undefined });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    } else {
      delete updates.password;
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ ok: true });
});

// ============ INVOICES ============
app.post('/api/invoices/upload', auth, upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // OCR with Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent([
      {
        inlineData: { mimeType, data: base64 },
      },
      `Extract all invoice details from this image. Return ONLY valid JSON (no markdown, no code blocks) with these fields:
{
  "vendorName": "",
  "invoiceNumber": "",
  "invoiceDate": "",
  "dueDate": "",
  "originalCurrency": "",
  "originalAmount": 0,
  "totalAmount": 0,
  "currency": "INR",
  "subtotal": 0,
  "tax": 0,
  "category": "",
  "lineItems": [{"description": "", "quantity": 0, "unitPrice": 0, "amount": 0}],
  "tags": [],
  "rawText": ""
}
IMPORTANT: ALL monetary values (totalAmount, subtotal, tax, lineItems amounts) MUST be converted to Indian Rupees (INR). If the invoice is in USD, EUR, GBP, AUD, SGD or any other currency, convert all amounts to INR using approximate current exchange rates. Set "currency" to "INR" always. Store the original currency in "originalCurrency" and original total in "originalAmount" for reference. If the invoice is already in INR, set originalCurrency to "INR" and originalAmount same as totalAmount.
If a field is not found, use the default value. For rawText, include all readable text from the invoice.`,
    ]);

    let ocrData;
    const responseText = result.response.text();
    try {
      // Try to parse, handling potential markdown code blocks
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      ocrData = JSON.parse(cleaned);
    } catch {
      ocrData = { rawText: responseText };
    }

    const invoice = await Invoice.create({
      uploadedBy: req.user.id,
      uploadedByName: req.user.name,
      fileName: req.file.originalname,
      imageData: `data:${mimeType};base64,${base64}`,
      vendorName: ocrData.vendorName || '',
      invoiceNumber: ocrData.invoiceNumber || '',
      invoiceDate: ocrData.invoiceDate || '',
      dueDate: ocrData.dueDate || '',
      totalAmount: ocrData.totalAmount || 0,
      currency: 'INR',
      originalCurrency: ocrData.originalCurrency || 'INR',
      originalAmount: ocrData.originalAmount || ocrData.totalAmount || 0,
      subtotal: ocrData.subtotal || 0,
      tax: ocrData.tax || 0,
      lineItems: ocrData.lineItems || [],
      category: ocrData.category || 'General',
      tags: ocrData.tags || [],
      rawOcrText: ocrData.rawText || responseText || '',
      status: 'pending',
    });

    res.json(invoice);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's invoices
app.get('/api/invoices/mine', auth, async (req, res) => {
  const invoices = await Invoice.find({ uploadedBy: req.user.id }).sort({ createdAt: -1 });
  res.json(invoices);
});

// Get invoices pending approval (for approvers)
app.get('/api/invoices/pending', auth, async (req, res) => {
  if (!req.user.canApprove && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not an approver' });
  }
  const invoices = await Invoice.find({ status: 'pending' }).sort({ createdAt: -1 });
  res.json(invoices);
});

// Get all invoices (admin)
app.get('/api/invoices', auth, adminOnly, async (req, res) => {
  const { status, category, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const invoices = await Invoice.find(filter).sort({ createdAt: -1 });
  res.json(invoices);
});

// Get single invoice
app.get('/api/invoices/:id', auth, async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  res.json(invoice);
});

// Approve/reject invoice
app.put('/api/invoices/:id/approve', auth, async (req, res) => {
  if (!req.user.canApprove && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not an approver' });
  }
  const { status, rejectionReason } = req.body;
  const update = {
    status,
    approvedBy: req.user.id,
    approvedByName: req.user.name,
    approvalDate: new Date(),
  };
  if (status === 'rejected') update.rejectionReason = rejectionReason || '';
  const invoice = await Invoice.findByIdAndUpdate(req.params.id, update, { new: true });
  res.json(invoice);
});

// ============ LEDGER ============
app.get('/api/ledgers', auth, async (req, res) => {
  const ledgers = await Ledger.find().sort({ createdAt: -1 });
  res.json(ledgers);
});

app.post('/api/ledgers', auth, adminOnly, async (req, res) => {
  const ledger = await Ledger.create({ ...req.body, createdBy: req.user.id });
  res.json(ledger);
});

app.delete('/api/ledgers/:id', auth, adminOnly, async (req, res) => {
  await Ledger.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ============ DASHBOARD STATS (admin) ============
app.get('/api/stats', auth, adminOnly, async (req, res) => {
  const [totalInvoices, pendingInvoices, approvedInvoices, rejectedInvoices, totalUsers] = await Promise.all([
    Invoice.countDocuments(),
    Invoice.countDocuments({ status: 'pending' }),
    Invoice.countDocuments({ status: 'approved' }),
    Invoice.countDocuments({ status: 'rejected' }),
    User.countDocuments({ active: true }),
  ]);

  const totalExpenses = await Invoice.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
  ]);

  const byCategory = await Invoice.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: '$category', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  const byMonth = await Invoice.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 12 },
  ]);

  res.json({
    totalInvoices,
    pendingInvoices,
    approvedInvoices,
    rejectedInvoices,
    totalUsers,
    totalExpenses: totalExpenses[0]?.total || 0,
    byCategory,
    byMonth: byMonth.reverse(),
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
