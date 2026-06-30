const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware/auth');
const { layout } = require('../lib/layout');

router.get('/', requireAdmin, async (req, res) => {
  const hotelId = req.hotelId;
  const checkIn = req.query.check_in || '';
  const checkOut = req.query.check_out || '';
  const searched = checkIn && checkOut;

  let available = [], booked = [], bookedMap = {}, byType = {};
  let nights = 0;

  if (searched) {
    nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);

    const { data: rooms } = await supabase
      .from('rooms')
      .select('*, room_types(id, name, base_price, capacity)')
      .eq('hotel_id', hotelId)
      .order('number');

    const { data: overlapping } = await supabase
      .from('reservations')
      .select('room_id, guest_name, check_in, check_out')
      .eq('hotel_id', hotelId)
      .in('status', ['pending', 'checked_in'])
      .lt('check_in', checkOut)
      .gt('check_out', checkIn);

    (overlapping || []).forEach(r => { if (r.room_id) bookedMap[r.room_id] = r; });

    available = (rooms || []).filter(r => !bookedMap[r.id]);
    booked = (rooms || []).filter(r => bookedMap[r.id]);

    available.forEach(r => {
      const typeName = r.room_types?.name || 'Unknown';
      if (!byType[typeName]) {
        byType[typeName] = {
          name: typeName,
          price: r.room_types?.base_price || 0,
          capacity: r.room_types?.capacity || 0,
          type_id: r.room_types?.id,
          rooms: []
        };
      }
      byType[typeName].rooms.push(r);
    });
  }

  const typeCards = Object.values(byType).map(t => `
    <div style="background:#fff;border:2px solid #86efac;border-radius:14px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:17px;font-weight:700;color:#1a1a2e;">🛏 ${t.name}</div>
          <div style="font-size:12px;color:#888;margin-top:2px;">Up to ${t.capacity} guests</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px;font-weight:700;color:#1a7a4a;">${t.price > 0 ? t.price + ' MKD' : '—'}</div>
          <div style="font-size:11px;color:#888;">per night</div>
          ${nights > 0 && t.price > 0 ? `<div style="font-size:12px;color:#534AB7;font-weight:600;margin-top:2px;">${t.price * nights} MKD total</div>` : ''}
        </div>
      </div>
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;">
        ${t.rooms.map(r => `
          <span onclick="openBooking('${r.id}','${r.number}','${t.name}','${r.room_type_id}','${t.price}','${checkIn}','${checkOut}')"
            style="background:#e6f7ef;color:#1a7a4a;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;cursor:pointer;transition:all 0.15s;"
            onmouseover="this.style.background='#1a7a4a';this.style.color='#fff'"
            onmouseout="this.style.background='#e6f7ef';this.style.color='#1a7a4a'">
            Room ${r.number} + Book
          </span>
        `).join('')}
      </div>
      <div style="font-size:12px;color:#1a7a4a;margin-top:8px;">✅ ${t.rooms.length} room${t.rooms.length > 1 ? 's' : ''} available</div>
    </div>`).join('');

  const bookedCards = booked.map(r => `
    <div style="background:#fff;border:1.5px solid #fca5a5;border-radius:12px;padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:20px;">🔴</div>
      <div style="flex:1;">
        <div style="font-weight:700;">Room ${r.number}</div>
        <div style="font-size:12px;color:#888;">${r.room_types?.name || '—'}</div>
        <div style="font-size:11px;color:#dc2626;margin-top:2px;">
          👤 ${bookedMap[r.id]?.guest_name || '?'} · ${bookedMap[r.id]?.check_in} → ${bookedMap[r.id]?.check_out}
        </div>
      </div>
    </div>`).join('');

  res.send(layout({
    title: 'Availability',
    user: req.user,
    body: `
    <div class="page-title">📅 Room Availability</div>
    <div class="page-sub">Tap any available room to book instantly</div>

    <div class="card" style="margin-bottom:20px;">
      <form method="GET" action="/availability">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Check In</label>
            <input class="form-input" type="date" name="check_in" value="${checkIn}" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Check Out</label>
            <input class="form-input" type="date" name="check_out" value="${checkOut}" required/>
          </div>
        </div>
        ${nights > 0 ? `<div style="font-size:13px;color:#534AB7;font-weight:600;margin-bottom:12px;">🌙 ${nights} night${nights > 1 ? 's' : ''}</div>` : ''}
        <button class="btn btn-primary" type="submit">Check Availability</button>
      </form>
    </div>

    ${searched ? `
      ${available.length === 0 && booked.length === 0
        ? '<div class="empty"><div class="empty-icon">🏨</div><div class="empty-text">No rooms found</div></div>'
        : ''}

      ${available.length > 0 ? `
        <div style="font-size:14px;font-weight:700;color:#1a7a4a;margin-bottom:12px;">
          ✅ ${available.length} room${available.length > 1 ? 's' : ''} available
        </div>
        ${typeCards}
      ` : `
        <div class="card" style="text-align:center;padding:24px;border:2px solid #fca5a5;">
          <div style="font-size:32px;">😔</div>
          <div style="font-size:15px;font-weight:700;margin-top:8px;color:#dc2626;">No rooms available for these dates</div>
        </div>`}

      ${booked.length > 0 ? `
        <div style="font-size:13px;font-weight:600;color:#dc2626;margin:20px 0 8px;">❌ Booked (${booked.length})</div>
        ${bookedCards}
      ` : ''}
    ` : `
      <div class="empty">
        <div class="empty-icon">📅</div>
        <div class="empty-text">Enter check-in and check-out dates above</div>
      </div>
    `}

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
            <input class="form-input" type="date" name="check_in" id="modal-checkin" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Check Out</label>
            <input class="form-input" type="date" name="check_out" id="modal-checkout" required/>
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

      function openBooking(roomId, number, typeName, typeId, price, checkIn, checkOut) {
        basePrice = parseFloat(price) || 0;
        document.getElementById('modal-room-id').value = roomId;
        document.getElementById('modal-room-type-id').value = typeId;
        document.getElementById('modal-title').textContent = 'Book Room ' + number;
        document.getElementById('modal-sub').textContent = typeName + (price > 0 ? ' · ' + price + ' MKD/night' : '');
        document.getElementById('modal-checkin').value = checkIn || '';
        document.getElementById('modal-checkout').value = checkOut || '';
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

module.exports = router;
