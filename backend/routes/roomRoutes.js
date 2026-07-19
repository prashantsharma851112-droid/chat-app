const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const protect = require('../middleware/authMiddleware');

router.use(protect);

// GET all group rooms the logged-in user is a member of
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.userId })
      .populate('members', 'name email')
      .sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a new group room
// body: { name: "Group name", memberIds: ["userId1", "userId2", ...] }
router.post('/', async (req, res) => {
  try {
    const { name, memberIds } = req.body;

    if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'Group name and at least one member are required' });
    }

    // Always include the creator as a member too
    const allMembers = Array.from(new Set([req.userId, ...memberIds]));

    const room = await Room.create({
      name,
      members: allMembers,
      createdBy: req.userId
    });

    const populatedRoom = await room.populate('members', 'name email');
    res.status(201).json(populatedRoom);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
