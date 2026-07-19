const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Room = require('../models/Room');
const protect = require('../middleware/authMiddleware');

router.use(protect);

// GET message history between the logged-in user and one other user
router.get('/private/:userId', async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      type: 'private',
      $or: [
        { sender: req.userId, recipient: otherUserId },
        { sender: otherUserId, recipient: req.userId }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'name');

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET message history for a group room (only if the user is a member)
router.get('/room/:roomId', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.members.some(m => m.toString() === req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    const messages = await Message.find({ type: 'group', room: req.params.roomId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name');

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
