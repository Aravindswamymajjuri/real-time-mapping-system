// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/location-tracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// User Schema
const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  password: String
});

const User = mongoose.model('User', userSchema);

// JWT secret
const JWT_SECRET = 'real-time-mapping-system';

// Authentication middleware
const authenticateToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

// Store connected users and their locations
const connectedUsers = new Map();

// Socket.IO connection handling
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const user = authenticateToken(token);
  if (!user) {
    return next(new Error('Authentication error'));
  }
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.id);

  // Add user to connected users
  connectedUsers.set(socket.user.id, {
    username: socket.user.username,
    latitude: 0,
    longitude: 0
  });

  // Broadcast updated locations to all clients
  const broadcastLocations = () => {
    io.emit('locations', Object.fromEntries(connectedUsers));
  };

  // Handle location updates
  socket.on('updateLocation', ({ latitude, longitude }) => {
    if (connectedUsers.has(socket.user.id)) {
      connectedUsers.set(socket.user.id, {
        ...connectedUsers.get(socket.user.id),
        latitude,
        longitude
      });
      broadcastLocations();
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    connectedUsers.delete(socket.user.id);
    broadcastLocations();
    console.log('User disconnected:', socket.user.id);
  });

  // Send initial locations to newly connected user
  broadcastLocations();
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      id: user._id,
      username: user.username
    });
  } catch (err) {
    res.status(400).json({ error: 'Login failed' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});