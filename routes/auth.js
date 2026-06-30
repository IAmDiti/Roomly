const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const { layout } = require('../lib/layout');
const { JWT_SECRET } = require('../middleware/auth');

// GET /auth/login
router.get('/login', (req, res) => {
  res.send(layout({
    title: 'Login',
    showNav: false,
    body: `
    <div class="auth-wrap">
      <div class="auth-box">
        <div class="auth-logo">🏨 Roomly</div>
        <div class="auth-sub">Sign in to your hotel dashboard</div>
        ${req.query.error ? `<div class="alert alert-error">${decodeURIComponent(req.query.error)}</div>` : ''}
        <form method="POST" action="/auth/login">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" type="email" name="email" placeholder="you@hotel.com" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" name="password" placeholder="••••••••" required/>
          </div>
          <button class="btn btn-primary" type="submit">Sign in</button>
        </form>
        <p style="text-align:center;margin-top:20px;font-size:13px;color:#888;">
          No account? <a href="/auth/register" style="color:#1a1a2e;font-weight:600;">Register your hotel</a>
        </p>
      </div>
    </div>`
  }));
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from('users')
    .select('*, hotels(*)')
    .eq('email', email.toLowerCase().trim())
    .eq('role', 'manager')
    .single();

  if (error || !user) {
    return res.redirect('/auth/login?error=' + encodeURIComponent('Invalid email or password'));
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.redirect('/auth/login?error=' + encodeURIComponent('Invalid email or password'));
  }

  const token = jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    hotel_id: user.hotel_id,
    hotel_name: user.hotels?.name
  }, JWT_SECRET, { expiresIn: '30d' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.redirect('/reservations');
});

// GET /auth/register
router.get('/register', (req, res) => {
  res.send(layout({
    title: 'Register',
    showNav: false,
    body: `
    <div class="auth-wrap">
      <div class="auth-box">
        <div class="auth-logo">🏨 Roomly</div>
        <div class="auth-sub">Register your hotel</div>
        ${req.query.error ? `<div class="alert alert-error">${decodeURIComponent(req.query.error)}</div>` : ''}
        <form method="POST" action="/auth/register">
          <div class="form-group">
            <label class="form-label">Hotel Name</label>
            <input class="form-input" type="text" name="hotel_name" placeholder="Hotel Kerchova" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Your Name</label>
            <input class="form-input" type="text" name="name" placeholder="Ardit" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" type="email" name="email" placeholder="you@hotel.com" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" name="password" placeholder="Min 8 characters" required/>
          </div>
          <button class="btn btn-primary" type="submit">Create account</button>
        </form>
        <p style="text-align:center;margin-top:20px;font-size:13px;color:#888;">
          Already registered? <a href="/auth/login" style="color:#1a1a2e;font-weight:600;">Sign in</a>
        </p>
      </div>
    </div>`
  }));
});

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { hotel_name, name, email, password } = req.body;

    if (!hotel_name || !name || !email || !password)
      return res.redirect('/auth/register?error=' + encodeURIComponent('All fields required'));
    if (password.length < 8)
      return res.redirect('/auth/register?error=' + encodeURIComponent('Password must be at least 8 characters'));

    const cleanEmail = email.toLowerCase().trim();

    // Check email not already taken
    const { data: existing } = await supabase
      .from('users').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing)
      return res.redirect('/auth/register?error=' + encodeURIComponent('Email already registered'));

    // Generate unique slug
    let slug = hotel_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data: slugCheck } = await supabase
      .from('hotels').select('id').eq('slug', slug).maybeSingle();
    if (slugCheck) slug = slug + '-' + Date.now();

    // Create hotel
    const { data: hotel, error: hotelErr } = await supabase
      .from('hotels')
      .insert({ name: hotel_name.trim(), slug, checkout_time: '11:00' })
      .select().single();

    if (hotelErr) {
      console.error('Hotel create error:', hotelErr);
      return res.redirect('/auth/register?error=' + encodeURIComponent('Could not create hotel: ' + hotelErr.message));
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create manager user
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({ hotel_id: hotel.id, name: name.trim(), email: cleanEmail, password_hash, role: 'manager' })
      .select().single();

    if (userErr) {
      console.error('User create error:', userErr);
      return res.redirect('/auth/register?error=' + encodeURIComponent('Could not create user: ' + userErr.message));
    }

    // Auto sign in
    const token = jwt.sign({
      id: user.id, email: user.email, role: user.role,
      hotel_id: hotel.id, hotel_name: hotel.name
    }, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.redirect('/reservations');

  } catch (err) {
    console.error('Register error:', err);
    res.redirect('/auth/register?error=' + encodeURIComponent('Server error: ' + err.message));
  }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/auth/login');
});

module.exports = router;
