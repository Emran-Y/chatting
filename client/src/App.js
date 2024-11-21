import React, { useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const API_URL = "http://localhost:8000";
const socket = io(API_URL);

const App = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    socket.on("chat message", (messageData) => {
      setChatHistory((prev) => [...prev, messageData]);
    });

    return () => socket.off("chat message");
  }, []);

  const handleLogin = async () => {
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password });
      const { token } = response.data;
      setToken(token);
      setIsLoggedIn(true);
      socket.emit("join", username);
    } catch (error) {
      alert(error.response?.data?.message || "Login failed");
    }
  };

  const fetchChatHistory = async () => {
    if (!recipient) return;
    try {
      const response = await axios.get(`${API_URL}/chat/${username}/${recipient}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setChatHistory(response.data);
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!message || !recipient) return;
    const messageData = { sender: username, receiver: recipient, content: message };

    try {
      await axios.post(`${API_URL}/chat`, messageData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // setChatHistory((prev) => [...prev, { ...messageData, from: "You" }]);
      setMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div style={styles.container}>
      <h1>Private Chat App</h1>
      {!isLoggedIn ? (
        <div style={styles.loginForm}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleLogin} style={styles.button}>
            Login
          </button>
        </div>
      ) : (
        <div>
          <h2>Welcome, {username}!</h2>
          <div style={styles.inputGroup}>
            <input
              type="text"
              placeholder="Recipient's username"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              style={styles.input}
            />
            <button onClick={fetchChatHistory} style={styles.button}>
              Load Chat
            </button>
          </div>
          <div style={styles.inputGroup}>
            <input
              type="text"
              placeholder="Type a message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={styles.input}
            />
            <button onClick={handleSendMessage} style={styles.button}>
              Send
            </button>
          </div>
          <div style={styles.chatBox}>
            {chatHistory.map((chat, index) => (
              <div
                key={index}
                style={chat.sender === username ? styles.messageFromMe : styles.messageFromThem}
              >
                <strong>{chat.sender === username ? "You" : chat.sender}:</strong> {chat.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { maxWidth: "500px", margin: "0 auto", textAlign: "center", padding: "20px" },
  loginForm: { display: "flex", flexDirection: "column", alignItems: "center" },
  input: { margin: "10px 10px", padding: "10px", width: "80%", borderRadius: "5px", border: "1px solid #ccc" },
  button: { padding: "10px 20px", borderRadius: "5px", border: "none", backgroundColor: "#007bff", color: "white" },
  inputGroup: { margin: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  chatBox: { marginTop: "20px", padding: "10px", border: "1px solid #ccc", borderRadius: "5px", height: "300px", overflowY: "scroll" },
  messageFromMe: { textAlign: "right", color: "#007bff", margin: "5px 0" },
  messageFromThem: { textAlign: "left", color: "#333", margin: "5px 0" },
};

export default App;
