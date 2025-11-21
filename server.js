// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const admin = require('firebase-admin');

// -------------------- FIREBASE --------------------
const serviceAccount = {
  "type": process.env.FIREBASE_TYPE,
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": process.env.FIREBASE_AUTH_URI,
  "token_uri": process.env.FIREBASE_TOKEN_URI,
  "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();
const msgRef = db.ref("messages");
// --------------------------------------------------

const PORT = process.env.PORT || 3000;

// Users database (simple for demo)
const users = {
  Devi: { password: 'D12345678', online: false, lastSeen: null },
  Satya: { password: 'D12345678', online: false, lastSeen: null }
};

// Serve static files
app.use(express.static('public'));

// -------------------- SOCKET.IO --------------------
io.on('connection', (socket) => {

  // Login
  socket.on('login', ({ username, password, auto }) => {
    if (users[username] && (users[username].password === password || auto)) {
      users[username].online = true;
      users[username].lastSeen = 'Online';
      socket.username = username;

      // Load messages from Firebase
      msgRef.once("value", (snapshot) => {
        const messages = snapshot.val() ? Object.values(snapshot.val()) : [];
        socket.emit('loginSuccess', { username, users, messages });
        io.emit('userUpdate', users);
      });
    } else {
      socket.emit('loginFailed', 'Invalid username or password');
    }
  });

  // Chat message
  socket.on('chat message', (msg) => {
    msg.status = 'sent';
    msgRef.push(msg);
    io.emit('chat message', msg);
  });

  // Message seen
  socket.on('messageSeen', (data) => {
    msgRef.once("value", (snapshot) => {
      let msgs = snapshot.val() || {};
      Object.keys(msgs).forEach(key => {
        if (msgs[key].time === data.time && msgs[key].name === data.from) {
          msgs[key].status = "seen";
        }
      });
      msgRef.set(msgs);
      io.emit('messageSeen', data);
    });
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });

  // Delete message for everyone
  socket.on('deleteMessage', (data) => {
    msgRef.once("value", (snapshot) => {
      let msgs = snapshot.val() || {};
      Object.keys(msgs).forEach(key => {
        if (msgs[key].time === data.time && msgs[key].name === data.name) {
          msgRef.child(key).remove();
        }
      });
      io.emit('deleteMessage', data);
    });
  });

  // Devi sends location to Satya only
  socket.on('locationUpdate', (loc) => {
    if (socket.username === 'Devi') {
      const satyaSockets = Array.from(io.sockets.sockets.values())
        .filter(s => s.username === 'Satya');
      satyaSockets.forEach(s => s.emit('locationUpdate', loc));
    }
  });

  // Logout
  socket.on('logout', () => {
    if (socket.username && users[socket.username]) {
      users[socket.username].online = false;
      users[socket.username].lastSeen = new Date().toLocaleTimeString();
      io.emit('userUpdate', users);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.username && users[socket.username]) {
      users[socket.username].online = false;
      users[socket.username].lastSeen = new Date().toLocaleTimeString();
      io.emit('userUpdate', users);
    }
  });
});

// -------------------- START SERVER --------------------
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
