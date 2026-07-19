const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const protect = require('../middleware/authMiddleware');

router.use(protect);

// GET my own profile
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('name username email avatar');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE my avatar (body: { avatar: "data:image/png;base64,...." })
router.put('/me/avatar', async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: 'No image provided' });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { avatar },
      { new: true }
    ).select('name username email avatar');

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// SEARCH users by name OR username (only returns results when a query is given -
// we deliberately do NOT return "all users" here, per your request)
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const regex = new RegExp(q, 'i'); // case-insensitive partial match

    const users = await User.find({
      _id: { $ne: req.userId },
      $or: [{ name: regex }, { username: regex }]
    })
      .select('name username avatar')
      .limit(20);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RECENT conversations - people you've already exchanged private messages with.
// This is what populates the "Direct" tab by default, instead of listing everyone.
router.get('/recent', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const myId = new mongoose.Types.ObjectId(req.userId);

    const messages = await Message.find({
      type: 'private',
      $or: [{ sender: myId }, { recipient: myId }]
    }).sort({ createdAt: -1 });

    // Walk through messages newest-first and collect the unique "other person"
    // from each conversation, preserving most-recent-first order.
    const seenIds = new Set();
    const otherIds = [];
    for (const msg of messages) {
      const otherId = msg.sender.toString() === req.userId
        ? msg.recipient?.toString()
        : msg.sender.toString();
      if (otherId && !seenIds.has(otherId)) {
        seenIds.add(otherId);
        otherIds.push(otherId);
      }
    }

    const users = await User.find({ _id: { $in: otherIds } }).select('name username avatar');
    // Preserve the recency order from above (Mongo's $in doesn't guarantee order)
    const usersById = Object.fromEntries(users.map(u => [u._id.toString(), u]));
    const ordered = otherIds.map(id => usersById[id]).filter(Boolean);

    res.json(ordered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
