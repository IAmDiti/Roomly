const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware/auth');
const { layout } = require('../lib/layout');

// GET /reservations — dashboard
router.get('/', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const filterDate = req.query.date || '';

  let query = supabase
    .from('reservations')
    .select('*, room_types(name), rooms(number)')
    .eq('hotel_id', hotelId)
    .in('status', ['pending', 'checked_in'])
    .order('check_in', { ascending: true });

  if (filterDate) {
    query = query.lte('check_in', filterDate).gte('check_out', filterDate);
  }

  const { data: reservations } = await query;
  const { data: roomTypes } = await supabase
    .from('room_types').select('*').eq('hotel_id', hotelId);

  const today = new Date().toISOString().split('T')[0];
  const hotelName = req.user.hotel_name || 'Your Hotel';

  const resCards = (reservations || []).map(r => {
    const nights = Math.round((new Date(r.check_out) - new Date(r.check_in)) / 86400000);
    const isCheckedIn = r.status === 'checked_in';
    return `
    <div class="res-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="res-guest">${r.guest_name}</div>
          <div class="res-phone">${r.guest_phone || '—'}</div>
        </div>
        <span class="badge badge-${r.status}">${isCheckedIn ? '✓ Checked in' : '⏳ Pending'}</span>
      </div>
      <div class="res-meta">
        <div class="res-meta-item">
          <div class="res-meta-label">Check in</div>
          <div class="res-meta-value">${r.check_in}</div>
        </div>
        <div class="res-meta-item">
          <div class="res-meta-label">Check out</div>
          <div class="res-meta-value">${r.check_out}</div>
        </div>
        <div class="res-meta-item">
          <div class="res-meta-label">Nights</div>
          <div class="res-meta-value">${nights}</div>
        </div>
      </div>
      <div class="res-type">🛏 ${r.room_types?.name || '—'}${r.rooms?.number ? ' · Room ' + r.rooms.number : ''}</div>
      ${r.notes ? `<div class="res-notes">📝 ${r.notes}</div>` : ''}
      <div class="res-actions">
        ${!isCheckedIn ? `<form method="POST" action="/reservations/${r.id}/checkin" style="flex:1;"><button class="btn btn-success" type="submit">Check in</button></form>` : ''}
        <form method="POST" action="/reservations/${r.id}/checkout" onsubmit="return confirm('Check out ${r.guest_name}?')" style="flex:1;">
          <button class="btn btn-ghost" type="submit">Check out</button>
        </form>
      </div>
    </div>`;
  }).join('');

  const roomTypeOptions = (roomTypes || []).map(rt =>
    `<option value="${rt.id}">${rt.name}</option>`
  ).join('');

  res.send(layout({
    title: 'Reservations',
    user: req.user,
    body: `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <div class="page-title">Reservations</div>
    </div>
    <div class="page-sub">${hotelName}</div>

    <form method="GET" action="/reservations" class="date-filter">
      <input type="date" name="date" value="${filterDate}" placeholder="Filter by date"/>
      <button type="submit">Filter</button>
      ${filterDate ? `<a href="/reservations" style="padding:10px;color:#888;font-size:13px;">Clear</a>` : ''}
    </form>

    ${(reservations || []).length === 0
      ? `<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No active reservations</div></div>`
      : resCards
    }

    <!-- ADD RESERVATION FORM -->
    <div class="card" style="margin-top:24px;">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px;">+ New Reservation</div>
      <form method="POST" action="/reservations/add">
        <div class="form-group">
          <label class="form-label">Guest Name</label>
          <input class="form-input" type="text" name="guest_name" placeholder="Full name" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-input" type="tel" name="guest_phone" placeholder="+389 ..."/>
        </div>
        <div class="form-group">
          <label class="form-label">Room Type</label>
          <select class="form-input" name="room_type_id" required>
            <option value="">Select type</option>
            ${roomTypeOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Check In</label>
            <input class="form-input" type="date" name="check_in" value="${today}" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Check Out</label>
            <input class="form-input" type="date" name="check_out" required/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <input class="form-input" type="text" name="notes" placeholder="Early check-in, extra bed..."/>
        </div>
        <button class="btn btn-primary" type="submit">Save Reservation</button>
      </form>
    </div>`
  }));
});

// POST /reservations/add
router.post('/add', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { guest_name, guest_phone, check_in, check_out, room_type_id, notes } = req.body;

  await supabase.from('reservations').insert({
    hotel_id: hotelId,
    guest_name: guest_name.trim(),
    guest_phone: guest_phone?.trim() || null,
    check_in,
    check_out,
    room_type_id: room_type_id || null,
    notes: notes?.trim() || null,
    status: 'pending',
    source: 'call'
  });

  res.redirect('/reservations');
});

// POST /reservations/:id/checkin
router.post('/:id/checkin', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;

  // Find an available room of the right type
  const { data: reservation } = await supabase
    .from('reservations').select('*').eq('id', req.params.id).single();

  if (reservation) {
    const { data: availableRoom } = await supabase
      .from('rooms')
      .select('*')
      .eq('hotel_id', hotelId)
      .eq('room_type_id', reservation.room_type_id)
      .eq('status', 'available')
      .limit(1)
      .single();

    await supabase.from('reservations').update({
      status: 'checked_in',
      room_id: availableRoom?.id || null
    }).eq('id', req.params.id);

    if (availableRoom) {
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', availableRoom.id);
    }
  }

  res.redirect('/reservations');
});

// POST /reservations/:id/checkout
router.post('/:id/checkout', requireAdmin, async (req, res) => {
  const { data: reservation } = await supabase
    .from('reservations').select('*').eq('id', req.params.id).single();

  if (reservation) {
    await supabase.from('reservations').update({ status: 'checked_out' }).eq('id', req.params.id);

    if (reservation.room_id) {
      await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', reservation.room_id);
      await supabase.from('cleaning_tasks').insert({
        hotel_id: reservation.hotel_id,
        room_id: reservation.room_id,
        status: 'pending'
      });
    }
  }

  res.redirect('/reservations');
});

module.exports = router;

// POST /reservations/add-direct — book a specific room from room board or availability
router.post('/add-direct', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { room_id, room_type_id, guest_name, guest_phone, check_in, check_out, notes } = req.body;

  await supabase.from('reservations').insert({
    hotel_id: hotelId,
    guest_name: guest_name.trim(),
    guest_phone: guest_phone?.trim() || null,
    room_id: room_id || null,
    room_type_id: room_type_id || null,
    check_in,
    check_out,
    notes: notes?.trim() || null,
    status: 'checked_in',
    source: 'walk_in'
  });

  if (room_id) {
    await supabase.from('rooms').update({ status: 'occupied' }).eq('id', room_id);
  }

  res.redirect('/rooms');
});
