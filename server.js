const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://chatapp-b5d7d-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Keep track of online users
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  let username = null;

  // -------- LOGIN --------
  socket.on("login", async ({ username: name, password, auto }) => {
    // For now, simple "any password" login
    if (!name) return socket.emit("loginFailed", "Username required");

    username = name;
    onlineUsers[username] = { socketId: socket.id, online: true, lastSeen: new Date().toISOString() };
    
    // Send success + list of online users + all messages
    const messagesSnap = await db.ref("messages").once("value");
    const messages = messagesSnap.val() ? Object.values(messagesSnap.val()) : [];
    
    socket.emit("loginSuccess", { username, users: onlineUsers, messages });

    // Broadcast user status update
    io.emit("userUpdate", onlineUsers);
  });

  // -------- LOGOUT --------
  socket.on("logout", () => {
    if (!username) return;
    onlineUsers[username].online = false;
    onlineUsers[username].lastSeen = new Date().toISOString();
    io.emit("userUpdate", onlineUsers);
  });

  // -------- CHAT MESSAGE --------
  socket.on("chat message", async (msg) => {
    const messageRef = db.ref("messages").push();
    await messageRef.set(msg);
    io.emit("chat message", msg);
  });

  // -------- TYPING --------
  socket.on("typing", ({ from }) => {
    socket.broadcast.emit("typing", { from });
  });

  // -------- MESSAGE SEEN --------
  socket.on("messageSeen", (data) => {
    socket.broadcast.emit("messageSeen", data);
  });

  // -------- DELETE MESSAGE --------
  socket.on("deleteMessage", (data) => {
    socket.broadcast.emit("deleteMessage", data);
  });

  // -------- LOCATION --------
  socket.on("locationUpdate", (loc) => {
    socket.broadcast.emit("locationUpdate", loc);
  });

  socket.on("disconnect", () => {
    if (!username) return;
    onlineUsers[username].online = false;
    onlineUsers[username].lastSeen = new Date().toISOString();
    io.emit("userUpdate", onlineUsers);
    console.log("User disconnected:", username);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
