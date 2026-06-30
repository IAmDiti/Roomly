const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware/auth');
const { layout } = require('../lib/layout');

router.get('/', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const fromDate = req.query.from || '';
  const toDate = req.query.to || '';
  const searched = fromDate && toDate;

  let reservations = [];
  let totalRevenue = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;
  let unpaidCount = 0;

  if (searched) {
    const { data } = await supabase
      .from('reservations')
      .select('*, room_types(name), rooms(number)')
      .eq('hotel_id', hotelId)
      .eq('status', 'checked_out')
      .gte('check_out', fromDate)
      .lte('check_out', toDate)
      .order('check_out', { ascending: false });

    reservations = data || [];

    reservations.forEach(r => {
      const amt = parseFloat(r.amount_paid) || 0;
      if (r.paid) {
        totalPaid += amt;
        totalRevenue += amt;
      } else {
        unpaidCount++;
      }
    });
  }

  const rows = reservations.map(r => {
    const nights = Math.round((new Date(r.check_out) - new Date(r.check_in)) / 86400000);
    const paidBadge = r.paid
      ? '<span class="badge" style="background:#e6f7ef;color:#1a7a4a;">✓ Paid' + (r.amount_paid ? ' · ' + r.amount_paid + ' MKD' : '') + (r.payment_method ? ' (' + r.payment_method + ')' : '') + '</span>'
      : '<span class="badge" style="background:#fee2e2;color:#dc2626;">✗ Unpaid</span>';

    return '<div class="res-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
        '<div><div class="res-guest">' + r.guest_name + '</div><div class="res-phone">' + (r.guest_phone || '—') + '</div></div>' +
        paidBadge +
      '</div>' +
      '<div class="res-meta">' +
        '<div class="res-meta-item"><div class="res-meta-label">Check in</div><div class="res-meta-value">' + r.check_in + '</div></div>' +
        '<div class="res-meta-item"><div class="res-meta-label">Check out</div><div class="res-meta-value">' + r.check_out + '</div></div>' +
        '<div class="res-meta-item"><div class="res-meta-label">Nights</div><div class="res-meta-value">' + nights + '</div></div>' +
      '</div>' +
      '<div class="res-type">🛏 ' + (r.room_types?.name || '—') + (r.rooms?.number ? ' · Room ' + r.rooms.number : '') + '</div>' +
      (!r.paid ? '<form method="POST" action="/history/' + r.id + '/mark-paid" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
        '<input type="number" name="amount_paid" placeholder="Amount (MKD)" class="form-input" style="flex:1;min-width:120px;padding:8px 12px;font-size:13px;" required/>' +
        '<select name="payment_method" class="form-input" style="flex:1;min-width:100px;padding:8px 12px;font-size:13px;" required>' +
          '<option value="cash">Cash</option>' +
          '<option value="card">Card</option>' +
        '</select>' +
        '<button class="btn btn-success" type="submit" style="width:auto;padding:8px 16px;font-size:13px;">Mark Paid</button>' +
      '</form>' : '') +
    '</div>';
  }).join('');

  const pageBody = '<div class="page-title">💰 Payments & History</div>' +
    '<div class="page-sub">Track paid and unpaid checkouts</div>' +
    '<div class="card" style="margin-bottom:20px;">' +
      '<form method="GET" action="/history">' +
        '<div class="form-row">' +
          '<div class="form-group"><label class="form-label">From</label><input class="form-input" type="date" name="from" value="' + fromDate + '" required/></div>' +
          '<div class="form-group"><label class="form-label">To</label><input class="form-input" type="date" name="to" value="' + toDate + '" required/></div>' +
        '</div>' +
        '<button class="btn btn-primary" type="submit">View History</button>' +
      '</form>' +
    '</div>' +
    (searched ? (
      '<div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;">' +
        '<div class="stat-card"><div class="stat-num" style="color:#1a7a4a;">' + totalRevenue.toLocaleString() + '</div><div class="stat-label">MKD Collected</div></div>' +
        '<div class="stat-card"><div class="stat-num" style="color:#dc2626;">' + unpaidCount + '</div><div class="stat-label">Unpaid</div></div>' +
        '<div class="stat-card"><div class="stat-num" style="color:#534AB7;">' + reservations.length + '</div><div class="stat-label">Total Stays</div></div>' +
      '</div>' +
      (reservations.length === 0
        ? '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No checkouts in this range</div></div>'
        : rows)
    ) : '<div class="empty"><div class="empty-icon">📅</div><div class="empty-text">Select a date range to view history</div></div>');

  res.send(layout({ title: 'History', user: req.user, body: pageBody }));
});

router.post('/:id/mark-paid', requireAdmin, async (req, res) => {
  const { amount_paid, payment_method } = req.body;
  await supabase.from('reservations').update({
    paid: true,
    amount_paid: parseFloat(amount_paid) || 0,
    payment_method
  }).eq('id', req.params.id);

  res.redirect(req.get('Referrer') || '/history');
});

module.exports = router;
