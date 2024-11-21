import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000")

const App = () => {
  const [username, setUsername] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [isJoined, setIsJoined] = useState(false);

  useEffect(() => {
    socket.on("message", ({ from, message }) => {
      setChat((prev) => [...prev, { from, message }]);
    });
  }, []);

  const joinChat = () => {
    if (username) {
      socket.emit("join", username);
      setIsJoined(true);
    }
  };

  const sendMessage = () => {
    if (to && message) {
      socket.emit("privateMessage", { to, message, from: username });
      setChat((prev) => [...prev, { from: "You", message }]);
      setMessage("");
    }
  };

  return (
    <div className="container">
      <h1>One-to-One Chat</h1>
      {!isJoined ? (
        <div className="input-group">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={joinChat}>Join</button>
        </div>
      ) : (
        <div>
          <h2>Welcome, {username}!</h2>
          <div className="input-group">
            <input
              type="text"
              placeholder="Send to (username)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter your message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
          <div className="chat-box">
            {chat.map((c, index) => (
              <div
                key={index}
                className={c.from === "You" ? "from-me" : "from-them"}
              >
                <strong>{c.from}:</strong> {c.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
