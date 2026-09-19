const { tunnel: cloudflaredTunnel } = require("cloudflared")
const cookieParser = require("cookie-parser")
const socketIO = require("socket.io")
const config = require("./config")
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. Credentials config (Aap yahan apni ID aur password badal sakte hain)
const AUTH_CREDENTIALS = {
  username: "admin",
  password: "password123"
};

// 2. Body Parser aur Session Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: 'location-tracker-auth-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // HTTPS par chalane par ise true karein
});

app.use(sessionMiddleware);

// Socket.io ke sath session attach karna
io.engine.use(sessionMiddleware);

// 3. Authentication Check Middleware
function checkAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
}

// 4. Routes
// Root route: Logged in hai toh dashboard, warna login page
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// Login Page Route (Inline UI fallback agar alag file na ho)
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login - Tracker</title>
      <style>
        body { font-family: Arial, sans-serif; background: #181818; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .box { background: #242424; padding: 25px; border-radius: 8px; width: 300px; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }
        input { width: 100%; padding: 10px; margin: 8px 0 16px; box-sizing: border-box; border-radius: 4px; border: 1px solid #444; background: #333; color: #fff; }
        button { width: 100%; padding: 10px; background: #007bff; border: none; color: white; border-radius: 4px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="box">
        <h3>Login to Live Tracker</h3>
        <form method="POST" action="/login">
          <label>User ID</label>
          <input type="text" name="username" placeholder="admin" required />
          <label>Password</label>
          <input type="password" name="password" placeholder="password123" required />
          <button type="submit">Log In</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Login Form Submit Check
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === AUTH_CREDENTIALS.username && password === AUTH_CREDENTIALS.password) {
    req.session.user = { username };
    return res.redirect('/dashboard');
  }
  return res.status(401).send('<h3>Invalid ID or Password.</h3><a href="/login" style="color: blue;">Try again</a>');
});

// Logout Route
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Protected static folder (Map / Tracking dashboard)
app.use('/dashboard', checkAuth, express.static(path.join(__dirname, 'public')));

// 5. Real-Time Tracking Sockets
io.on('connection', (socket) => {
  const session = socket.request.session;
  const username = session?.user?.username || 'Guest';

  console.log(`Client connected: ${username} (${socket.id})`);

  // Location tabhi aayegi jab user client side se allow karega
  socket.on('update-location', (coords) => {
    console.log(`Live location from ${username} (${socket.id}):`, coords);

    // Dashboard ko coordinates emit karo
    io.emit('client-location-feed', {
      clientId: socket.id,
      username: username,
      ...coords
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${username} (${socket.id})`);
    io.emit('client-disconnected', socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});