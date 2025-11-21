// ---------------------------------------------------------
// IMPORTS
// ---------------------------------------------------------
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");

// ---------------------------------------------------------
// FIREBASE INIT
// ---------------------------------------------------------
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
  databaseURL: "https://chatapp-b5d7d-default-rtdb.asia-southeast1.firebasedatabase.app"  // <-- Paste your URL
});

const db = admin.database();

// ---------------------------------------------------------
// EXPRESS + SOCKET.IO SETUP
// ---------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// ---------------------------------------------------------
// SOCKET.IO EVENTS
// ---------------------------------------------------------
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  let userId = null;

  // -----------------------------------------------------
  // USER ONLINE
  // -----------------------------------------------------
  socket.on("user_online", (uid) => {
    userId = uid;

    const ref = db.ref(`status/${userId}`);

    // Mark ONLINE
    ref.set({
      state: "online",
      last_changed: admin.database.ServerValue.TIMESTAMP
    });

    // Auto OFFLINE when disconnect
    ref.onDisconnect().set({
      state: "offline",
      last_changed: admin.database.ServerValue.TIMESTAMP
    });

    console.log(`${userId} is online`);
  });

  // -----------------------------------------------------
  // RECEIVE AND STORE MESSAGE
  // -----------------------------------------------------
  socket.on("send_message", async (msg) => {
    /*
      msg = {
        from: "user1",
        to: "user2",
        text: "Hello"
      }
    */

    const newMsg = {
      ...msg,
      timestamp: admin.database.ServerValue.TIMESTAMP
    };

    const messageRef = db.ref("messages").push();
    await messageRef.set(newMsg);

    io.emit("new_message", { id: messageRef.key, ...newMsg });
  });

  // -----------------------------------------------------
  // USER DISCONNECT
  // -----------------------------------------------------
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    if (userId) {
      const ref = db.ref(`status/${userId}`);

      ref.set({
        state: "offline",
        last_changed: admin.database.ServerValue.TIMESTAMP
      });
    }
  });
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------
server.listen(3000, () => {
  console.log("Server running on port 3000");
});
