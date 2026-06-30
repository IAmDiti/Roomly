const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'roomly_secret_2026';

function requireAdmin(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/auth/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'manager') return res.redirect('/auth/login');
    req.user = decoded;
    req.hotelId = decoded.hotel_id;
    next();
  } catch {
    res.redirect('/auth/login');
  }
}

function requireCleaner(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/auth/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.hotelId = decoded.hotel_id;
    next();
  } catch {
    res.redirect('/auth/login');
  }
}

module.exports = { requireAdmin, requireCleaner, JWT_SECRET };
