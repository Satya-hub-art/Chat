require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const msgRef = db.ref('messages');

app.use(express.static('public'));
app.use(express.json());

// Socket.io logic...
// ...same as your current server.js


// Users database (you can add more)
const users = {
  Devi: { password: 'D12345678', online: false, lastSeen: null },
  Satya: { password: 'D12345678', online: false, lastSeen: null }
};

// -------------------- SOCKET.IO --------------------
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // LOGIN
  socket.on('login', ({ username, password, auto }) => {
    console.log('Login attempt:', username, password, auto);

    if (users[username] && (users[username].password === password || auto)) {
      users[username].online = true;
      users[username].lastSeen = 'Online';
      socket.username = username;

      // Load messages from Firebase
      msgRef.once("value", (snapshot) => {
        const messages = snapshot.val() ? Object.values(snapshot.val()) : [];
        socket.emit('loginSuccess', { username, users, messages });
        io.emit('userUpdate', users);
        console.log(`Login success: ${username}`);
      });
    } else {
      socket.emit('loginFailed', 'Invalid username or password');
      console.log(`Login failed: ${username}`);
    }
  });

  // CHAT MESSAGE
  socket.on('chat message', (msg) => {
    msg.status = 'sent';
    msgRef.push(msg);
    io.emit('chat message', msg);
  });

  // MESSAGE SEEN
  socket.on('messageSeen', (data) => {
    msgRef.once("value", snapshot => {
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

  // TYPING
  socket.on('typing', data => socket.broadcast.emit('typing', data));

  // DELETE MESSAGE
  socket.on('deleteMessage', data => {
    msgRef.once("value", snapshot => {
      let msgs = snapshot.val() || {};
      Object.keys(msgs).forEach(key => {
        if (msgs[key].time === data.time && msgs[key].name === data.name) {
          msgRef.child(key).remove();
        }
      });
      io.emit('deleteMessage', data);
    });
  });

  // LOCATION (Devi → Satya)
  socket.on('locationUpdate', loc => {
    if (socket.username === 'Devi') {
      const satyaSockets = Array.from(io.sockets.sockets.values())
        .filter(s => s.username === 'Satya');
      satyaSockets.forEach(s => s.emit('locationUpdate', loc));
    }
  });

  // LOGOUT
  socket.on('logout', () => {
    if (socket.username && users[socket.username]) {
      users[socket.username].online = false;
      users[socket.username].lastSeen = new Date().toLocaleTimeString();
      io.emit('userUpdate', users);
      console.log(`${socket.username} logged out`);
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    if (socket.username && users[socket.username]) {
      users[socket.username].online = false;
      users[socket.username].lastSeen = new Date().toLocaleTimeString();
      io.emit('userUpdate', users);
      console.log(`${socket.username} disconnected`);
    }
  });
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
