const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Room = require('../models/Room');

// Keeps track of which user IDs are currently connected (for online/offline status)
const onlineUsers = new Set();

function setupChatSocket(io) {
  // This runs ONCE for every new socket connection, BEFORE any events are handled.
  // It's the socket equivalent of our Express "protect" middleware - it checks
  // the JWT the client sends and rejects the connection if it's missing/invalid.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: user ${socket.userId}`);

    // Every user automatically joins a "personal room" named after their own ID.
    // This lets us send a private message to a user with io.to(userId).emit(...)
    // without needing to track which exact socket ID belongs to them.
    socket.join(socket.userId);

    onlineUsers.add(socket.userId);
    io.emit('online-users', Array.from(onlineUsers));

    // --- Join a group room ---
    socket.on('join-room', (roomId) => {
      socket.join(roomId);
    });

    // --- Send a 1-on-1 private message ---
    socket.on('private-message', async ({ to, content }) => {
      try {
        const message = await Message.create({
          sender: socket.userId,
          type: 'private',
          recipient: to,
          content
        });
        const populated = await message.populate('sender', 'name');

        // Send to the recipient (if they're online) AND echo back to the
        // sender, so it appears instantly on both ends / all of the sender's tabs.
        io.to(to).emit('private-message', populated);
        io.to(socket.userId).emit('private-message', populated);
      } catch (err) {
        socket.emit('error-message', 'Could not send message');
      }
    });

    // --- Send a group message ---
    socket.on('room-message', async ({ roomId, content }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room || !room.members.some(m => m.toString() === socket.userId)) {
          return socket.emit('error-message', 'You are not a member of this room');
        }

        const message = await Message.create({
          sender: socket.userId,
          type: 'group',
          room: roomId,
          content
        });
        const populated = await message.populate('sender', 'name');

        io.to(roomId).emit('room-message', populated);
      } catch (err) {
        socket.emit('error-message', 'Could not send message');
      }
    });

    // --- Typing indicator (bonus feature) ---
    socket.on('typing', ({ to, roomId }) => {
      if (to) io.to(to).emit('typing', { from: socket.userId });
      if (roomId) socket.to(roomId).emit('typing', { from: socket.userId, roomId });
    });

    // --- Mark private messages as seen ---
    // Client calls this when it opens a chat with `otherUserId`.
    // We mark every message THEY sent TO ME as seen, then tell them
    // (if they're online) so their tick marks update in real time.
    socket.on('mark-seen', async ({ otherUserId }) => {
      try {
        await Message.updateMany(
          { type: 'private', sender: otherUserId, recipient: socket.userId, seen: false },
          { $set: { seen: true } }
        );
        io.to(otherUserId).emit('messages-seen', { by: socket.userId });
      } catch (err) {
        // fail silently - seen status is not critical enough to break the chat
      }
    });

    // --- Mark group messages as seen by me ---
    socket.on('mark-seen-room', async ({ roomId }) => {
      try {
        await Message.updateMany(
          { type: 'group', room: roomId, seenBy: { $ne: socket.userId } },
          { $addToSet: { seenBy: socket.userId } }
        );
        io.to(roomId).emit('room-messages-seen', { roomId, by: socket.userId });
      } catch (err) {
        // fail silently
      }
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.userId);
      io.emit('online-users', Array.from(onlineUsers));
      console.log(`Socket disconnected: user ${socket.userId}`);
    });
  });
}

module.exports = setupChatSocket;
