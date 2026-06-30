const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Landing page at root
app.get('/', (req, res) => {
  const token = req.cookies?.token;
  if (token) return res.redirect('/reservations');
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.use('/auth', require('./routes/auth'));
app.use('/reservations', require('./routes/reservations'));
app.use('/rooms', require('./routes/rooms'));
app.use('/availability', require('./routes/availability'));
app.use('/cleaner', require('./routes/cleaner'));
app.use('/admin', require('./routes/admin'));

const { startAutoCron } = require('./lib/cron');
startAutoCron();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Roomly running on http://localhost:${PORT}`);
});

module.exports = app;
