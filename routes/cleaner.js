const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { requireCleaner } = require('../middleware/auth');
const { layout } = require('../lib/layout');

// GET /cleaner
router.get('/', requireCleaner, async (req, res) => {
  const hotelId = req.hotelId;

  const { data: tasks } = await supabase
    .from('cleaning_tasks')
    .select('*, rooms(number, room_types(name))')
    .eq('hotel_id', hotelId)
    .in('status', ['pending', 'in_progress'])
    .order('triggered_at', { ascending: true });

  const items = (tasks || []).map(t => `
    <div class="clean-item">
      <div>
        <div class="clean-room-num">Room ${t.rooms?.number || '?'}</div>
        <div class="clean-room-type">${t.rooms?.room_types?.name || ''}</div>
        <div style="font-size:11px;color:#aaa;margin-top:4px;">Since ${new Date(t.triggered_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <form method="POST" action="/cleaner/${t.id}/done">
        <button class="clean-done-btn" type="submit">✓ Done</button>
      </form>
    </div>
  `).join('');

  res.send(layout({
    title: 'Cleaner',
    user: req.user,
    body: `
    <div class="page-title">🧹 Clean List</div>
    <div class="page-sub">Tap Done when room is ready</div>

    ${(tasks || []).length === 0
      ? `<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">All rooms clean!</div></div>`
      : items
    }

    <div style="margin-top:32px;">
      <div style="font-size:13px;color:#aaa;text-align:center;margin-bottom:12px;">Recently completed</div>
      <div id="done-list"></div>
    </div>

    <script>
      // Auto-refresh every 30 seconds
      setTimeout(() => location.reload(), 30000);
    </script>`
  }));
});

// POST /cleaner/:id/done
router.post('/:id/done', requireCleaner, async (req, res) => {
  const { data: task } = await supabase
    .from('cleaning_tasks').select('*').eq('id', req.params.id).single();

  if (task) {
    await supabase.from('cleaning_tasks').update({
      status: 'done',
      completed_at: new Date().toISOString()
    }).eq('id', req.params.id);

    if (task.room_id) {
      await supabase.from('rooms').update({ status: 'ready' }).eq('id', task.room_id);
    }
  }

  res.redirect('/cleaner');
});

module.exports = router;
