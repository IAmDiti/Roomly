const cron = require('node-cron');
const supabase = require('../supabase');

function startAutoCron() {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('[cron] Running auto-checkout check...');
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Get all hotels and their checkout times
      const { data: hotels } = await supabase
        .from('hotels').select('id, checkout_time');

      for (const hotel of (hotels || [])) {
        const checkoutTime = (hotel.checkout_time || '11:00').slice(0, 5);
        if (currentTime < checkoutTime) continue;

        // Find reservations due for checkout today
        const { data: reservations } = await supabase
          .from('reservations')
          .select('*')
          .eq('hotel_id', hotel.id)
          .eq('check_out', today)
          .eq('status', 'checked_in');

        for (const res of (reservations || [])) {
          console.log(`[cron] Auto-checking out reservation ${res.id}`);

          await supabase.from('reservations')
            .update({ status: 'checked_out' }).eq('id', res.id);

          if (res.room_id) {
            await supabase.from('rooms')
              .update({ status: 'cleaning' }).eq('id', res.room_id);

            await supabase.from('cleaning_tasks').insert({
              hotel_id: hotel.id,
              room_id: res.room_id,
              status: 'pending'
            });
          }
        }
      }
    } catch (err) {
      console.error('[cron] Error:', err.message);
    }
  });

  console.log('[cron] Auto-checkout cron started');
}

module.exports = { startAutoCron };
