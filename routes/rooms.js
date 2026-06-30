const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware/auth');
const { layout } = require('../lib/layout');

router.get('/', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const filterDate = req.query.date || new Date().toISOString().split('T')[0];

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*, room_types(name, base_price)')
    .eq('hotel_id', hotelId)
    .order('number');

  const { data: activeRes } = await supabase
    .from('reservations')
    .select('id, room_id, guest_name, check_in, check_out')
    .eq('hotel_id', hotelId)
    .in('status', ['checked_in', 'pending'])
    .lte('check_in', filterDate)
    .gte('check_out', filterDate);

  const occupiedRoomIds = new Set((activeRes || []).map(r => r.room_id).filter(Boolean));
  const resByRoom = {};
  (activeRes || []).forEach(r => { if (r.room_id) resByRoom[r.room_id] = r; });

  const statusIcon = { available: '🟢', occupied: '🔴', cleaning: '🟡', ready: '✅' };
  const statusLabel = { available: 'Available', occupied: 'Occupied', cleaning: 'Cleaning', ready: 'Ready' };
  const statusOrder = { occupied: 0, cleaning: 1, ready: 2, available: 3 };

  // Sort: occupied first, then cleaning, ready, available
  const sorted = [...(rooms || [])].sort((a, b) => {
    const statusA = occupiedRoomIds.has(a.id) ? 'occupied' : a.status;
    const statusB = occupiedRoomIds.has(b.id) ? 'occupied' : b.status;
    return (statusOrder[statusA] ?? 9) - (statusOrder[statusB] ?? 9);
  });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const tiles = sorted.map(r => {
    const effectiveStatus = occupiedRoomIds.has(r.id) ? 'occupied' : r.status;
    const res = resByRoom[r.id];
    const isOccupied = effectiveStatus === 'occupied';
    const isAvailable = effectiveStatus === 'available' || effectiveStatus === 'ready';

    return `
    <div class="room-tile ${effectiveStatus}" style="${isOccupied ? 'position:relative;' : isAvailable ? 'cursor:pointer;' : ''}">
      ${isAvailable ? `<div onclick="openBooking('${r.id}','${r.number}','${r.room_types?.name || ''}','${r.room_type_id}','${r.room_types?.base_price || 0}')" style="text-align:center;">` : '<div style="text-align:center;">'}
        <div class="room-tile-icon">${statusIcon[effectiveStatus] || '⚪'}</div>
        <div class="room-tile-num">${r.number}</div>
        <div class="room-tile-type">${r.room_types?.name || ''}</div>
        <div class="room-tile-status" style="color:${isOccupied ? '#dc2626' : effectiveStatus === 'cleaning' ? '#b07a00' : effectiveStatus === 'ready' ? '#1a7a4a' : '#888'}">
          ${statusLabel[effectiveStatus] || effectiveStatus}
        </div>
        ${res ? `<div style="font-size:10px;color:#888;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">${res.guest_name}</div>` : ''}
        ${res ? `<div onclick="event.stopPropagation();openExtend('${res.id}','${r.number}','${res.check_out}','${r.id}')" style="font-size:9px;color:#534AB7;margin-top:1px;font-weight:600;cursor:pointer;text-decoration:underline;">${res.check_out} ✎</div>` : ''}
        ${isAvailable ? `<div style="font-size:10px;color:#534AB7;margin-top:4px;font-weight:600;">+ Book</div>` : ''}
      </div>
      ${isOccupied && res ? `
        <button onclick="confirmCheckout('${res.id}', '${res.guest_name}', '${r.number}')"
          style="width:100%;margin-top:8px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;">
          Check out
        </button>` : ''}
    </div>`;
  }).join('');

  const summary = {
    available: sorted.filter(r => !occupiedRoomIds.has(r.id) && r.status === 'available').length,
    occupied: occupiedRoomIds.size,
    cleaning: sorted.filter(r => r.status === 'cleaning').length,
    ready: sorted.filter(r => r.status === 'ready').length,
  };

  res.send(layout({
    title: 'Rooms',
    user: req.user,
    body: `
    <div class="page-title">Room Board</div>
    <div class="page-sub">Occupied rooms shown first · Tap available to book</div>

    <form method="GET" action="/rooms" class="date-filter">
      <input type="date" name="date" value="${filterDate}"/>
      <button type="submit">View</button>
    </form>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;">
      <div class="card" style="text-align:center;padding:12px;">
        <div style="font-size:22px;font-weight:700;color:#dc2626;">${summary.occupied}</div>
        <div style="font-size:11px;color:#888;">Occupied</div>
      </div>
      <div class="card" style="text-align:center;padding:12px;">
        <div style="font-size:22px;font-weight:700;color:#1a7a4a;">${summary.available}</div>
        <div style="font-size:11px;color:#888;">Available</div>
      </div>
      <div class="card" style="text-align:center;padding:12px;">
        <div style="font-size:22px;font-weight:700;color:#b07a00;">${summary.cleaning}</div>
        <div style="font-size:11px;color:#888;">Cleaning</div>
      </div>
      <div class="card" style="text-align:center;padding:12px;">
        <div style="font-size:22px;font-weight:700;color:#1a7a4a;">${summary.ready}</div>
        <div style="font-size:11px;color:#888;">Ready</div>
      </div>
    </div>

    <div class="room-grid">${tiles || '<div style="color:#aaa;padding:20px;">No rooms found</div>'}</div>

    <!-- CHECKOUT CONFIRM FORM (hidden) -->
    <form method="POST" id="checkout-form" action="" style="display:none;">
    </form>

    <!-- EXTEND STAY MODAL -->
    <div id="extend-overlay" onclick="closeExtend()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;"></div>
    <div id="extend-modal" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;padding:24px;z-index:500;max-width:480px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div>
          <div style="font-size:18px;font-weight:800;">Change Check-out Date</div>
          <div style="font-size:13px;color:#888;margin-top:2px;" id="extend-sub"></div>
        </div>
        <button onclick="closeExtend()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#aaa;">×</button>
      </div>
      <div id="extend-error" style="display:none;background:#fee2e2;color:#dc2626;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:14px;font-weight:600;"></div>
      <div class="form-group">
        <label class="form-label">New Check-out Date</label>
        <input class="form-input" type="date" id="extend-new-date"/>
      </div>
      <button class="btn btn-primary" type="button" onclick="submitExtend()">Save New Date</button>
      <form method="POST" id="extend-form" action="" style="display:none;"></form>
    </div>

    <!-- QUICK BOOKING MODAL -->
    <div id="booking-overlay" onclick="closeBooking()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;"></div>
    <div id="booking-modal" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;padding:24px;z-index:500;max-width:480px;margin:0 auto;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
          <div style="font-size:18px;font-weight:800;" id="modal-title">Book Room</div>
          <div style="font-size:13px;color:#888;margin-top:2px;" id="modal-sub"></div>
        </div>
        <button onclick="closeBooking()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#aaa;">×</button>
      </div>
      <form method="POST" action="/reservations/add-direct">
        <input type="hidden" name="room_id" id="modal-room-id"/>
        <input type="hidden" name="room_type_id" id="modal-room-type-id"/>
        <div class="form-group">
          <label class="form-label">Guest Name</label>
          <input class="form-input" type="text" name="guest_name" placeholder="Full name" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" type="tel" name="guest_phone" placeholder="+389 ..."/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Check In</label>
            <input class="form-input" type="date" name="check_in" id="modal-checkin" value="${today}" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Check Out</label>
            <input class="form-input" type="date" name="check_out" id="modal-checkout" value="${tomorrow}" required/>
          </div>
        </div>
        <div id="modal-price-info" style="background:#f0f0ff;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#534AB7;font-weight:600;display:none;"></div>
        <div class="form-group">
          <label class="form-label">Notes (optional)</label>
          <input class="form-input" type="text" name="notes" placeholder="Early check-in, extra bed..."/>
        </div>
        <button class="btn btn-primary" type="submit">✓ Confirm Reservation</button>
      </form>
    </div>

    <script>
      let basePrice = 0;

      let currentExtendResId = '';
      let currentExtendRoomId = '';

      function openExtend(resId, roomNum, currentCheckout, roomId) {
        currentExtendResId = resId;
        currentExtendRoomId = roomId;
        document.getElementById('extend-sub').textContent = 'Room ' + roomNum + ' · Currently checks out ' + currentCheckout;
        document.getElementById('extend-new-date').value = currentCheckout;
        document.getElementById('extend-new-date').min = currentCheckout;
        document.getElementById('extend-error').style.display = 'none';
        document.getElementById('extend-overlay').style.display = 'block';
        document.getElementById('extend-modal').style.display = 'block';
      }

      function closeExtend() {
        document.getElementById('extend-overlay').style.display = 'none';
        document.getElementById('extend-modal').style.display = 'none';
      }

      async function submitExtend() {
        const newDate = document.getElementById('extend-new-date').value;
        const errorBox = document.getElementById('extend-error');
        errorBox.style.display = 'none';

        if (!newDate) return;

        const resp = await fetch('/reservations/' + currentExtendResId + '/extend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_check_out: newDate, room_id: currentExtendRoomId })
        });
        const result = await resp.json();

        if (result.success) {
          location.reload();
        } else {
          errorBox.textContent = result.error || 'Could not update date';
          errorBox.style.display = 'block';
        }
      }

      function confirmCheckout(resId, guestName, roomNum) {
        if (confirm('Check out ' + guestName + ' from Room ' + roomNum + '?')) {
          const form = document.getElementById('checkout-form');
          form.action = '/reservations/' + resId + '/checkout';
          form.submit();
        }
      }

      function openBooking(roomId, number, typeName, typeId, price) {
        basePrice = parseFloat(price) || 0;
        document.getElementById('modal-room-id').value = roomId;
        document.getElementById('modal-room-type-id').value = typeId;
        document.getElementById('modal-title').textContent = 'Book Room ' + number;
        document.getElementById('modal-sub').textContent = typeName + (price > 0 ? ' · ' + price + ' MKD/night' : '');
        document.getElementById('booking-overlay').style.display = 'block';
        document.getElementById('booking-modal').style.display = 'block';
        updatePrice();
      }

      function closeBooking() {
        document.getElementById('booking-overlay').style.display = 'none';
        document.getElementById('booking-modal').style.display = 'none';
      }

      function updatePrice() {
        const ci = document.getElementById('modal-checkin').value;
        const co = document.getElementById('modal-checkout').value;
        const info = document.getElementById('modal-price-info');
        if (ci && co && basePrice > 0) {
          const nights = Math.round((new Date(co) - new Date(ci)) / 86400000);
          if (nights > 0) {
            info.style.display = 'block';
            info.textContent = nights + ' night' + (nights > 1 ? 's' : '') + ' · ' + (nights * basePrice).toLocaleString() + ' MKD total';
          } else { info.style.display = 'none'; }
        }
      }

      document.getElementById('modal-checkin').addEventListener('change', updatePrice);
      document.getElementById('modal-checkout').addEventListener('change', updatePrice);
    </script>`
  }));
});

// POST /rooms/:id/status
router.post('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['available', 'occupied', 'cleaning', 'ready'];
  if (!validStatuses.includes(status)) return res.redirect('/rooms');
  await supabase.from('rooms').update({ status }).eq('id', req.params.id);
  res.redirect('/rooms');
});

module.exports = router;
