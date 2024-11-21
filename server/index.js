require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = require('http').createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err));

// Middlewares
app.use(cors());
app.use(express.json());

// User schema (inline)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

// Chat schema (inline)
const chatSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

const Chat = mongoose.model('Chat', chatSchema);

// Authentication middleware
const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Routes

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    let user = await User.findOne({ username });

    // If user doesn't exist, create a new one
    if (!user) {
      user = new User({ username, password });
      await user.save();
      console.log(`New user created: ${username}`);
    } else {
      // If user exists, verify the password
      const match = await user.comparePassword(password);
      if (!match) return res.status(400).json({ message: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Chat routes

// Get messages between sender and receiver
app.get('/chat/:sender/:receiver', authenticate, async (req, res) => {
  const { sender, receiver } = req.params;
  try {
    const messages = await Chat.find({
      $or: [{ sender, receiver }, { sender: receiver, receiver: sender }],
    }).sort('createdAt');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Send a new message
app.post('/chat', authenticate, async (req, res) => {
  const { sender, receiver, content } = req.body;
  try {
    const newMessage = new Chat({ sender, receiver, content });
    await newMessage.save();
    // Emit message to receiver if they're online
    io.emit('chat message', { sender, receiver, content, createdAt: newMessage.createdAt });
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ message: 'Error sending message' });
  }
});

// Real-time chat with Socket.IO
let activeUsers = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Store active users in memory
  socket.on('join', (username) => {
    activeUsers[username] = socket.id;
    console.log(`${username} joined with socket ID: ${socket.id}`);
  });

  // Handle new messages
  socket.on('chat message', async ({ sender, receiver, content }) => {
    const newMessage = new Chat({ sender, receiver, content });
    await newMessage.save();

    // Emit message to receiver if they're online
    const recipientSocketId = activeUsers[receiver];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('chat message', { sender, content });
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    for (const username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        delete activeUsers[username];
        console.log(`${username} disconnected.`);
        break;
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
