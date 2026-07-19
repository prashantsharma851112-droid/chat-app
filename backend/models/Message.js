const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // type tells us whether this is a 1-on-1 message or a group message.
  // Only ONE of "recipient" / "room" will be filled in, depending on type.
  type: {
    type: String,
    enum: ['private', 'group'],
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  content: {
    type: String,
    required: [true, 'Message content cannot be empty'],
    trim: true
  },
  // For PRIVATE messages: simple true/false, like WhatsApp's blue tick.
  seen: {
    type: Boolean,
    default: false
  },
  // For GROUP messages: track WHICH members have seen it (a message can be
  // "seen" by some members and not others in a group).
  seenBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Speeds up fetching conversation history
messageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
messageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
