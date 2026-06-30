const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware/auth');
const { layout } = require('../lib/layout');

// GET /reservations
router.get('/', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const filterDate = req.query.date || '';

  let query = supabase
    .from('reservations')
    .select('*, room_types(name), rooms(number)')
    .eq('hotel_id', hotelId)
    .in('status', ['pending', 'checked_in'])
    .order('booking_group_id', { ascending: true })
    .order('check_in', { ascending: true });

  if (filterDate) {
    query = query.lte('check_in', filterDate).gte('check_out', filterDate);
  }

  const { data: reservations } = await query;
  const { data: roomTypes } = await supabase
    .from('room_types').select('*').eq('hotel_id', hotelId);

  const today = new Date().toISOString().split('T')[0];
  const hotelName = req.user.hotel_name || 'Your Hotel';

  // Group reservations by booking_group_id
  const groups = {};
  const ungrouped = [];
  (reservations || []).forEach(r => {
    if (r.booking_group_id) {
      if (!groups[r.booking_group_id]) groups[r.booking_group_id] = [];
      groups[r.booking_group_id].push(r);
    } else {
      ungrouped.push(r);
    }
  });

  function renderReservation(r) {
    const nights = Math.round((new Date(r.check_out) - new Date(r.check_in)) / 86400000);
    const isCheckedIn = r.status === 'checked_in';
    return `
    <div class="res-card" style="${r.booking_group_id ? 'border-left:3px solid #534AB7;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="res-guest">${r.guest_name}</div>
          <div class="res-phone">${r.guest_phone || '—'}</div>
        </div>
        <span class="badge badge-${r.status}">${isCheckedIn ? '✓ Checked in' : '⏳ Pending'}</span>
      </div>
      <div class="res-meta">
        <div class="res-meta-item"><div class="res-meta-label">Check in</div><div class="res-meta-value">${r.check_in}</div></div>
        <div class="res-meta-item"><div class="res-meta-label">Check out</div><div class="res-meta-value">${r.check_out}</div></div>
        <div class="res-meta-item"><div class="res-meta-label">Nights</div><div class="res-meta-value">${nights}</div></div>
      </div>
      <div class="res-type">🛏 ${r.room_types?.name || '—'}${r.rooms?.number ? ' · Room ' + r.rooms.number : ''}</div>
      ${r.notes ? `<div class="res-notes">📝 ${r.notes}</div>` : ''}
      <div class="res-actions">
        ${!isCheckedIn ? `
        <form method="POST" action="/reservations/${r.id}/checkin-name" style="flex:1;">
          <input type="hidden" name="guest_name" value="${r.guest_name}"/>
          <button class="btn btn-success" type="submit" onclick="return promptName(this)">Check in</button>
        </form>` : ''}
        <form method="POST" action="/reservations/${r.id}/checkout" onsubmit="return confirm('Check out ${r.guest_name}?')" style="flex:1;">
          <button class="btn btn-ghost" type="submit">Check out</button>
        </form>
      </div>
    </div>`;
  }

  let resCards = '';

  // Render grouped bookings together
  Object.entries(groups).forEach(([groupId, items]) => {
    const bookerName = items[0].booker_name || items[0].guest_name;
    resCards += `
    <div style="margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#534AB7;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
        👥 Group booking: ${bookerName} · ${items.length} rooms
      </div>
      ${items.map(renderReservation).join('')}
    </div>`;
  });

  // Render single bookings
  resCards += ungrouped.map(renderReservation).join('');

  const roomTypeOptions = (roomTypes || []).map(rt =>
    `<option value="${rt.id}" data-name="${rt.name}">${rt.name}</option>`
  ).join('');

  res.send(layout({
    title: 'Reservations',
    user: req.user,
    body: `
    <div class="page-title">Reservations</div>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;">+ New Reservation</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#534AB7;font-weight:600;cursor:pointer;">
          <input type="checkbox" id="multi-room-toggle" onchange="toggleMultiRoom()"/>
          Multiple rooms
        </label>
      </div>

      <form method="POST" action="/reservations/add" id="reservation-form">
        <div class="form-group">
          <label class="form-label" id="name-label">Guest Name</label>
          <input class="form-input" type="text" name="guest_name" id="booker-name" placeholder="Full name" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-input" type="tel" name="guest_phone" placeholder="+389 ..."/>
        </div>

        <!-- SINGLE ROOM TYPE SELECT -->
        <div class="form-group" id="single-room-group">
          <label class="form-label">Room Type</label>
          <select class="form-input" name="room_type_id" id="single-room-type">
            <option value="">Select type</option>
            ${roomTypeOptions}
          </select>
        </div>

        <!-- MULTI ROOM CHECKBOXES -->
        <div class="form-group" id="multi-room-group" style="display:none;">
          <label class="form-label">Select Room Types (one per room needed)</label>
          <div id="multi-room-list" style="display:flex;flex-direction:column;gap:8px;"></div>
          <button type="button" onclick="addRoomRow()" style="margin-top:8px;background:#f0f0ff;color:#534AB7;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">+ Add Room</button>
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
    </div>

    <script>
      const roomTypeOptionsHTML = \`<option value="">Select type</option>${roomTypeOptions}\`;
      let roomRowCount = 0;

      function toggleMultiRoom() {
        const isMulti = document.getElementById('multi-room-toggle').checked;
        document.getElementById('single-room-group').style.display = isMulti ? 'none' : 'block';
        document.getElementById('multi-room-group').style.display = isMulti ? 'block' : 'none';
        document.getElementById('name-label').textContent = isMulti ? 'Booker Name (main contact)' : 'Guest Name';
        document.getElementById('single-room-type').required = !isMulti;

        if (isMulti && roomRowCount === 0) {
          addRoomRow();
          addRoomRow();
        }
      }

      function addRoomRow() {
        roomRowCount++;
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:8px;align-items:center;';
        div.innerHTML = \`
          <select class="form-input" name="multi_room_types[]" required style="flex:1;">\${roomTypeOptionsHTML}</select>
          <button type="button" onclick="this.parentElement.remove()" style="background:#fee2e2;color:#dc2626;border:none;width:36px;height:42px;border-radius:8px;cursor:pointer;font-weight:700;">×</button>
        \`;
        document.getElementById('multi-room-list').appendChild(div);
      }

      function promptName(btn) {
        const form = btn.closest('form');
        const current = form.querySelector('input[name="guest_name"]').value;
        const newName = prompt('Confirm guest name for check-in:', current);
        if (newName === null) return false;
        form.querySelector('input[name="guest_name"]').value = newName;
        return true;
      }
    </script>`
  }));
});

// POST /reservations/add — handles both single and multi-room
router.post('/add', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { guest_name, guest_phone, check_in, check_out, room_type_id, notes, multi_room_types } = req.body;

  const roomTypes = Array.isArray(multi_room_types)
    ? multi_room_types
    : (multi_room_types ? [multi_room_types] : []);

  if (roomTypes.length > 1) {
    // MULTI-ROOM BOOKING
    const groupId = require('crypto').randomUUID();
    const inserts = roomTypes.map(typeId => ({
      hotel_id: hotelId,
      guest_name: guest_name.trim(),
      booker_name: guest_name.trim(),
      guest_phone: guest_phone?.trim() || null,
      check_in,
      check_out,
      room_type_id: typeId,
      notes: notes?.trim() || null,
      status: 'pending',
      source: 'call',
      booking_group_id: groupId
    }));

    await supabase.from('reservations').insert(inserts);
  } else {
    // SINGLE ROOM BOOKING
    await supabase.from('reservations').insert({
      hotel_id: hotelId,
      guest_name: guest_name.trim(),
      guest_phone: guest_phone?.trim() || null,
      check_in,
      check_out,
      room_type_id: room_type_id || (roomTypes[0] || null),
      notes: notes?.trim() || null,
      status: 'pending',
      source: 'call'
    });
  }

  res.redirect('/reservations');
});

// POST /reservations/add-direct
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

// POST /reservations/:id/checkin-name — check in with possibly edited guest name per room
router.post('/:id/checkin-name', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { guest_name } = req.body;

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
      guest_name: guest_name?.trim() || reservation.guest_name,
      room_id: availableRoom?.id || null
    }).eq('id', req.params.id);

    if (availableRoom) {
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', availableRoom.id);
    }
  }

  res.redirect('/reservations');
});

// POST /reservations/:id/checkin (legacy, kept for compatibility)
router.post('/:id/checkin', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
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
