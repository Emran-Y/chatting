require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store active users
const activeUsers = {};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining with a unique username
  socket.on("join", (username) => {
    activeUsers[username] = socket.id;
    console.log(`${username} joined with socket ID: ${socket.id}`);
  });

  // Handle private messages
  socket.on("privateMessage", ({ to, message, from }) => {
    const recipientSocketId = activeUsers[to];

    if (recipientSocketId) {
      // Emit the message to the recipient only
      io.to(recipientSocketId).emit("message", { from, message });
      console.log(`Message from ${from} to ${to}: ${message}`);
    } else {
      console.log(`User ${to} is not available.`);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    for (const username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        delete activeUsers[username];
        console.log(`${username} disconnected.`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});
