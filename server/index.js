const express = require('express');
const path = require('path');
const os = require('os');
const { initDB } = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/character', require('./routes/character'));
app.use('/api/behavior', require('./routes/behavior'));
app.use('/api/items', require('./routes/item'));
app.use('/api/wishes', require('./routes/wish'));
app.use('/api/battle', require('./routes/boss'));
app.use('/api/rewards', require('./routes/reward'));
app.use('/api/family', require('./routes/family'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/behavior-goal', require('./routes/behaviorGoal'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize database and start server
initDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n修仙日常 服务已启动\n`);
  console.log(`本机访问: http://localhost:${PORT}`);

  // Show LAN IP for other devices
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`局域网访问: http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('');
});
