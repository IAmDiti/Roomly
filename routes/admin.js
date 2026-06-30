const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware/auth');
const { layout } = require('../lib/layout');

// GET /admin — main dashboard
router.get('/', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;

  const [
    { data: rooms },
    { data: reservations },
    { data: roomTypes },
    { data: cleaningTasks },
    { data: hotel }
  ] = await Promise.all([
    supabase.from('rooms').select('*, room_types(name)').eq('hotel_id', hotelId),
    supabase.from('reservations').select('*, room_types(name)').eq('hotel_id', hotelId).in('status', ['pending', 'checked_in']),
    supabase.from('room_types').select('*').eq('hotel_id', hotelId),
    supabase.from('cleaning_tasks').select('*, rooms(number)').eq('hotel_id', hotelId).eq('status', 'pending'),
    supabase.from('hotels').select('*').eq('id', hotelId).single()
  ]);

  const totalRooms = (rooms || []).length;
  const occupied = (rooms || []).filter(r => r.status === 'occupied').length;
  const available = (rooms || []).filter(r => r.status === 'available').length;
  const cleaning = (rooms || []).filter(r => r.status === 'cleaning').length;
  const occupancyRate = totalRooms ? Math.round((occupied / totalRooms) * 100) : 0;

  res.send(layout({
    title: 'Admin',
    user: req.user,
    body: `
    <div class="page-title">Admin Dashboard</div>
    <div class="page-sub">${hotel?.name || 'Your Hotel'}</div>

    <!-- STATS -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
      <div class="card" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#1a7a4a;">${available}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Available</div>
      </div>
      <div class="card" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#dc2626;">${occupied}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Occupied</div>
      </div>
      <div class="card" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#b07a00;">${cleaning}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Cleaning</div>
      </div>
      <div class="card" style="text-align:center;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#534AB7;">${occupancyRate}%</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Occupancy</div>
      </div>
    </div>

    <!-- SECTIONS -->
    <div style="display:flex;flex-direction:column;gap:10px;">
      <a href="/admin/rooms" class="admin-section-link">
        <div class="admin-section-card">
          <div class="admin-section-icon">🛏</div>
          <div>
            <div class="admin-section-title">Manage Rooms</div>
            <div class="admin-section-sub">Add, edit, delete rooms · ${totalRooms} rooms</div>
          </div>
          <div class="admin-section-arrow">›</div>
        </div>
      </a>
      <a href="/admin/room-types" class="admin-section-link">
        <div class="admin-section-card">
          <div class="admin-section-icon">🏷</div>
          <div>
            <div class="admin-section-title">Room Types & Pricing</div>
            <div class="admin-section-sub">Edit types, base prices · ${(roomTypes||[]).length} types</div>
          </div>
          <div class="admin-section-arrow">›</div>
        </div>
      </a>
      <a href="/admin/reservations" class="admin-section-link">
        <div class="admin-section-card">
          <div class="admin-section-icon">📋</div>
          <div>
            <div class="admin-section-title">All Reservations</div>
            <div class="admin-section-sub">View, edit, cancel · ${(reservations||[]).length} active</div>
          </div>
          <div class="admin-section-arrow">›</div>
        </div>
      </a>
      <a href="/admin/cleaning" class="admin-section-link">
        <div class="admin-section-card">
          <div class="admin-section-icon">🧹</div>
          <div>
            <div class="admin-section-title">Cleaning Tasks</div>
            <div class="admin-section-sub">${(cleaningTasks||[]).length} pending tasks</div>
          </div>
          <div class="admin-section-arrow">›</div>
        </div>
      </a>
      <a href="/admin/hotel" class="admin-section-link">
        <div class="admin-section-card">
          <div class="admin-section-icon">⚙️</div>
          <div>
            <div class="admin-section-title">Hotel Settings</div>
            <div class="admin-section-sub">Name, checkout time, cleaners</div>
          </div>
          <div class="admin-section-arrow">›</div>
        </div>
      </a>
    </div>`
  }));
});

// GET /admin/rooms
router.get('/rooms', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { data: rooms } = await supabase
    .from('rooms').select('*, room_types(name)').eq('hotel_id', hotelId).order('number');
  const { data: roomTypes } = await supabase
    .from('room_types').select('*').eq('hotel_id', hotelId);

  const roomTypeOptions = (roomTypes || []).map(rt =>
    `<option value="${rt.id}">${rt.name}</option>`).join('');

  const rows = (rooms || []).map(r => `
    <div class="admin-row">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:15px;">Room ${r.number}</div>
        <div style="font-size:12px;color:#888;">${r.room_types?.name || '—'} · ${r.status}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="openEditRoom('${r.id}','${r.number}','${r.room_type_id}','${r.status}','${r.floor||''}')" class="btn-sm btn-edit">Edit</button>
        <form method="POST" action="/admin/rooms/${r.id}/delete" onsubmit="return confirm('Delete room ${r.number}?')">
          <button class="btn-sm btn-del" type="submit">Delete</button>
        </form>
      </div>
    </div>`).join('');

  res.send(layout({
    title: 'Manage Rooms',
    user: req.user,
    body: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <a href="/admin" style="color:#888;text-decoration:none;font-size:20px;">←</a>
      <div class="page-title">Rooms</div>
    </div>
    <div class="page-sub">${(rooms||[]).length} rooms total</div>

    <!-- ADD ROOM -->
    <div class="card" style="margin-bottom:20px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;">+ Add Room</div>
      <form method="POST" action="/admin/rooms/add">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Room Number</label>
            <input class="form-input" type="text" name="number" placeholder="101" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Floor</label>
            <input class="form-input" type="number" name="floor" placeholder="1"/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Room Type</label>
          <select class="form-input" name="room_type_id" required>
            <option value="">Select type</option>
            ${roomTypeOptions}
          </select>
        </div>
        <button class="btn btn-primary" type="submit">Add Room</button>
      </form>
    </div>

    <!-- ROOM LIST -->
    <div>${rows || '<div class="empty"><div class="empty-icon">🛏</div><div class="empty-text">No rooms yet</div></div>'}</div>

    <!-- EDIT MODAL -->
    <div id="edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;align-items:flex-end;justify-content:center;">
      <div style="background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px;">Edit Room</div>
        <form method="POST" id="edit-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Room Number</label>
              <input class="form-input" type="text" name="number" id="edit-number" required/>
            </div>
            <div class="form-group">
              <label class="form-label">Floor</label>
              <input class="form-input" type="number" name="floor" id="edit-floor"/>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Room Type</label>
            <select class="form-input" name="room_type_id" id="edit-type">
              ${roomTypeOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-input" name="status" id="edit-status">
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="cleaning">Cleaning</option>
              <option value="ready">Ready</option>
            </select>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" type="submit" style="flex:1;">Save</button>
            <button type="button" onclick="closeEditRoom()" class="btn btn-ghost" style="flex:1;">Cancel</button>
          </div>
        </form>
      </div>
    </div>

    <script>
      function openEditRoom(id, number, typeId, status, floor) {
        document.getElementById('edit-number').value = number;
        document.getElementById('edit-floor').value = floor;
        document.getElementById('edit-type').value = typeId;
        document.getElementById('edit-status').value = status;
        document.getElementById('edit-form').action = '/admin/rooms/' + id + '/edit';
        document.getElementById('edit-modal').style.display = 'flex';
      }
      function closeEditRoom() {
        document.getElementById('edit-modal').style.display = 'none';
      }
    </script>`
  }));
});

// POST /admin/rooms/add
router.post('/rooms/add', requireAdmin, async (req, res) => {
  const { number, floor, room_type_id } = req.body;
  await supabase.from('rooms').insert({
    hotel_id: req.hotelId, number, floor: floor || null,
    room_type_id, status: 'available'
  });
  res.redirect('/admin/rooms');
});

// POST /admin/rooms/:id/edit
router.post('/rooms/:id/edit', requireAdmin, async (req, res) => {
  const { number, floor, room_type_id, status } = req.body;
  await supabase.from('rooms').update({ number, floor: floor || null, room_type_id, status })
    .eq('id', req.params.id).eq('hotel_id', req.hotelId);
  res.redirect('/admin/rooms');
});

// POST /admin/rooms/:id/delete
router.post('/rooms/:id/delete', requireAdmin, async (req, res) => {
  await supabase.from('rooms').delete().eq('id', req.params.id).eq('hotel_id', req.hotelId);
  res.redirect('/admin/rooms');
});

// GET /admin/room-types
router.get('/room-types', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { data: roomTypes } = await supabase
    .from('room_types').select('*').eq('hotel_id', hotelId);

  const rows = (roomTypes || []).map(rt => `
    <div class="admin-row">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:15px;">${rt.name}</div>
        <div style="font-size:12px;color:#888;">Capacity: ${rt.capacity} · Base: ${rt.base_price} MKD/night</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="openEditType('${rt.id}','${rt.name}','${rt.capacity}','${rt.base_price}')" class="btn-sm btn-edit">Edit</button>
        <form method="POST" action="/admin/room-types/${rt.id}/delete" onsubmit="return confirm('Delete ${rt.name}?')">
          <button class="btn-sm btn-del" type="submit">Delete</button>
        </form>
      </div>
    </div>`).join('');

  res.send(layout({
    title: 'Room Types',
    user: req.user,
    body: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <a href="/admin" style="color:#888;text-decoration:none;font-size:20px;">←</a>
      <div class="page-title">Room Types</div>
    </div>
    <div class="page-sub">Pricing & capacity per type</div>

    <div class="card" style="margin-bottom:20px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;">+ Add Room Type</div>
      <form method="POST" action="/admin/room-types/add">
        <div class="form-group">
          <label class="form-label">Type Name</label>
          <input class="form-input" type="text" name="name" placeholder="e.g. Deluxe Double" required/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Capacity</label>
            <input class="form-input" type="number" name="capacity" placeholder="2" min="1" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Base Price (MKD)</label>
            <input class="form-input" type="number" name="base_price" placeholder="2500" min="0" required/>
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Add Type</button>
      </form>
    </div>

    <div>${rows || '<div class="empty"><div class="empty-icon">🏷</div><div class="empty-text">No room types yet</div></div>'}</div>

    <div id="edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;align-items:flex-end;justify-content:center;">
      <div style="background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:480px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px;">Edit Room Type</div>
        <form method="POST" id="edit-form">
          <div class="form-group">
            <label class="form-label">Type Name</label>
            <input class="form-input" type="text" name="name" id="edit-name" required/>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Capacity</label>
              <input class="form-input" type="number" name="capacity" id="edit-capacity" min="1" required/>
            </div>
            <div class="form-group">
              <label class="form-label">Base Price (MKD)</label>
              <input class="form-input" type="number" name="base_price" id="edit-price" min="0" required/>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" type="submit" style="flex:1;">Save</button>
            <button type="button" onclick="closeEdit()" class="btn btn-ghost" style="flex:1;">Cancel</button>
          </div>
        </form>
      </div>
    </div>
    <script>
      function openEditType(id, name, capacity, price) {
        document.getElementById('edit-name').value = name;
        document.getElementById('edit-capacity').value = capacity;
        document.getElementById('edit-price').value = price;
        document.getElementById('edit-form').action = '/admin/room-types/' + id + '/edit';
        document.getElementById('edit-modal').style.display = 'flex';
      }
      function closeEdit() { document.getElementById('edit-modal').style.display = 'none'; }
    </script>`
  }));
});

// POST /admin/room-types/add
router.post('/room-types/add', requireAdmin, async (req, res) => {
  const { name, capacity, base_price } = req.body;
  await supabase.from('room_types').insert({ hotel_id: req.hotelId, name, capacity, base_price });
  res.redirect('/admin/room-types');
});

// POST /admin/room-types/:id/edit
router.post('/room-types/:id/edit', requireAdmin, async (req, res) => {
  const { name, capacity, base_price } = req.body;
  await supabase.from('room_types').update({ name, capacity, base_price })
    .eq('id', req.params.id).eq('hotel_id', req.hotelId);
  res.redirect('/admin/room-types');
});

// POST /admin/room-types/:id/delete
router.post('/room-types/:id/delete', requireAdmin, async (req, res) => {
  await supabase.from('room_types').delete().eq('id', req.params.id).eq('hotel_id', req.hotelId);
  res.redirect('/admin/room-types');
});

// GET /admin/reservations
router.get('/reservations', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { data: reservations } = await supabase
    .from('reservations')
    .select('*, room_types(name), rooms(number)')
    .eq('hotel_id', hotelId)
    .order('check_in', { ascending: false });

  const rows = (reservations || []).map(r => {
    const nights = Math.round((new Date(r.check_out) - new Date(r.check_in)) / 86400000);
    return `
    <div class="res-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="res-guest">${r.guest_name}</div>
          <div class="res-phone">${r.guest_phone || '—'}</div>
        </div>
        <span class="badge badge-${r.status}">${r.status.replace('_',' ')}</span>
      </div>
      <div class="res-meta">
        <div class="res-meta-item"><div class="res-meta-label">Check in</div><div class="res-meta-value">${r.check_in}</div></div>
        <div class="res-meta-item"><div class="res-meta-label">Check out</div><div class="res-meta-value">${r.check_out}</div></div>
        <div class="res-meta-item"><div class="res-meta-label">Nights</div><div class="res-meta-value">${nights}</div></div>
      </div>
      <div class="res-type">🛏 ${r.room_types?.name || '—'}${r.rooms?.number ? ' · Room ' + r.rooms.number : ''}</div>
      ${r.notes ? `<div class="res-notes">📝 ${r.notes}</div>` : ''}
      ${['pending','checked_in'].includes(r.status) ? `
      <div class="res-actions">
        <form method="POST" action="/reservations/${r.id}/checkout" onsubmit="return confirm('Cancel/checkout?')" style="flex:1;">
          <button class="btn btn-ghost" type="submit" style="font-size:13px;padding:9px;">Cancel / Check out</button>
        </form>
      </div>` : ''}
    </div>`;
  }).join('');

  res.send(layout({
    title: 'All Reservations',
    user: req.user,
    body: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <a href="/admin" style="color:#888;text-decoration:none;font-size:20px;">←</a>
      <div class="page-title">All Reservations</div>
    </div>
    <div class="page-sub">${(reservations||[]).length} total</div>
    ${rows || '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No reservations</div></div>'}`
  }));
});

// GET /admin/cleaning
router.get('/cleaning', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const { data: tasks } = await supabase
    .from('cleaning_tasks')
    .select('*, rooms(number, room_types(name))')
    .eq('hotel_id', hotelId)
    .order('triggered_at', { ascending: false });

  const rows = (tasks || []).map(t => `
    <div class="admin-row">
      <div style="flex:1;">
        <div style="font-weight:700;">Room ${t.rooms?.number || '?'}</div>
        <div style="font-size:12px;color:#888;">${t.rooms?.room_types?.name || ''} · ${t.status}</div>
        <div style="font-size:11px;color:#aaa;">${new Date(t.triggered_at).toLocaleString()}</div>
      </div>
      ${t.status !== 'done' ? `
      <form method="POST" action="/cleaner/${t.id}/done">
        <button class="btn-sm btn-edit" type="submit">✓ Done</button>
      </form>` : '<span style="font-size:12px;color:#1a7a4a;font-weight:600;">✓ Done</span>'}
    </div>`).join('');

  res.send(layout({
    title: 'Cleaning',
    user: req.user,
    body: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <a href="/admin" style="color:#888;text-decoration:none;font-size:20px;">←</a>
      <div class="page-title">Cleaning Tasks</div>
    </div>
    <div class="page-sub">${(tasks||[]).filter(t=>t.status!=='done').length} pending</div>
    ${rows || '<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">All clean!</div></div>'}`
  }));
});

// GET /admin/hotel
router.get('/hotel', requireAdmin, async (req, res) => {
  const { data: hotel } = await supabase
    .from('hotels').select('*').eq('id', req.hotelId).single();
  const { data: cleaners } = await supabase
    .from('users').select('*').eq('hotel_id', req.hotelId).eq('role', 'cleaner');

  const cleanerRows = (cleaners || []).map(c => `
    <div class="admin-row">
      <div style="flex:1;">
        <div style="font-weight:700;">${c.name}</div>
        <div style="font-size:12px;color:#888;">PIN: ${c.pin || '—'}</div>
      </div>
      <form method="POST" action="/admin/hotel/cleaners/${c.id}/delete" onsubmit="return confirm('Remove ${c.name}?')">
        <button class="btn-sm btn-del" type="submit">Remove</button>
      </form>
    </div>`).join('');

  res.send(layout({
    title: 'Hotel Settings',
    user: req.user,
    body: `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
      <a href="/admin" style="color:#888;text-decoration:none;font-size:20px;">←</a>
      <div class="page-title">Hotel Settings</div>
    </div>
    <div class="page-sub">${hotel?.name}</div>

    <!-- HOTEL INFO -->
    <div class="card" style="margin-bottom:16px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;">Hotel Info</div>
      <form method="POST" action="/admin/hotel/update">
        <div class="form-group">
          <label class="form-label">Hotel Name</label>
          <input class="form-input" type="text" name="name" value="${hotel?.name || ''}" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Auto-Checkout Time</label>
          <input class="form-input" type="time" name="checkout_time" value="${hotel?.checkout_time?.slice(0,5) || '11:00'}"/>
        </div>
        <button class="btn btn-primary" type="submit">Save Settings</button>
      </form>
    </div>

    <!-- CLEANERS -->
    <div class="card">
      <div style="font-size:15px;font-weight:700;margin-bottom:14px;">🧹 Cleaners</div>
      ${cleanerRows || '<div style="color:#aaa;font-size:13px;margin-bottom:14px;">No cleaners added yet</div>'}
      <form method="POST" action="/admin/hotel/cleaners/add" style="margin-top:14px;">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input class="form-input" type="text" name="name" placeholder="Maria" required/>
          </div>
          <div class="form-group">
            <label class="form-label">PIN (4 digits)</label>
            <input class="form-input" type="text" name="pin" placeholder="1234" maxlength="4" pattern="[0-9]{4}" required/>
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Add Cleaner</button>
      </form>
    </div>`
  }));
});

// POST /admin/hotel/update
router.post('/hotel/update', requireAdmin, async (req, res) => {
  const { name, checkout_time } = req.body;
  await supabase.from('hotels').update({ name, checkout_time }).eq('id', req.hotelId);
  res.redirect('/admin/hotel');
});

// POST /admin/hotel/cleaners/add
router.post('/hotel/cleaners/add', requireAdmin, async (req, res) => {
  const { name, pin } = req.body;
  await supabase.from('users').insert({
    hotel_id: req.hotelId, name, pin, role: 'cleaner'
  });
  res.redirect('/admin/hotel');
});

// POST /admin/hotel/cleaners/:id/delete
router.post('/hotel/cleaners/:id/delete', requireAdmin, async (req, res) => {
  await supabase.from('users').delete()
    .eq('id', req.params.id).eq('hotel_id', req.hotelId).eq('role', 'cleaner');
  res.redirect('/admin/hotel');
});

module.exports = router;
