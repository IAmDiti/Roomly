const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://pywampqwadphtkiocpvk.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5d2FtcHF3YWRwaHRraW9jcHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjE3NjAsImV4cCI6MjA5MzAzNzc2MH0.6Agn5Tow2q7Tx19u_0Q28JmYSyDvOamZYAk0OOjDUFY',
  {
    realtime: {
      transport: ws
    },
    auth: {
      persistSession: false
    }
  }
);

module.exports = supabase;