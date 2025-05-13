const mongoose = require("mongoose");
const express = require('express');
const router = express.Router();
const Discussion = require('../models/Discussion');
const Topic = require('../models/Topic');
const authMiddleware = require("../middlewares/authMiddleware");

// Tạo cuộc thảo luận mới
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { topicId } = req.body;

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: "Đề tài không tồn tại" });
    }

    // Chuyển req.user._id thành ObjectId để so sánh
    const userId = new mongoose.Types.ObjectId(req.user._id);

    // Kiểm tra quyền
    if (!topic.teamMembers.some(member => member.equals(userId)) && !topic.supervisor.equals(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền tạo cuộc thảo luận cho đề tài này" });
    }

    const newDiscussion = new Discussion({
      topicId: topic._id,
      messages: [],
    });

    await newDiscussion.save();
    res.status(201).json(newDiscussion);
  } catch (err) {
    console.error("❌ Lỗi tạo cuộc thảo luận:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi tạo cuộc thảo luận", error: err.message });
  }
});

// Lấy các tin nhắn trong các cuộc thảo luận của người dùng
router.get('/messages', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const role = req.user.role;
    const { page = 1, limit = 10 } = req.query;

    let relatedTopics;
    if (role === "teacher") {
      relatedTopics = await Topic.find({ supervisor: userId, status: "approved" }).select('_id');
    } else {
      relatedTopics = await Topic.find({ teamMembers: userId }).select('_id');
    }

    const topicIds = relatedTopics.map(topic => topic._id);

    const discussions = await Discussion.find({ topicId: { $in: topicIds } })
      .populate('messages.userId', 'name')
      .populate('topicId', 'topicName')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalDiscussions = await Discussion.countDocuments({ topicId: { $in: topicIds } });

    const result = discussions.map(d => ({
      discussionId: d._id,
      topicTitle: d.topicId.topicName,
      messages: d.messages.map(msg => ({
        _id: msg._id,
        message: msg.message,
        sender: msg.userId.name,
        senderId: msg.userId._id,
        createdAt: msg.createdAt
      }))
    }));

    res.status(200).json({
      discussions: result,
      totalPages: Math.ceil(totalDiscussions / limit),
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách tin nhắn thảo luận:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi lấy tin nhắn thảo luận", error: err.message });
  }
});

// Gửi tin nhắn vào cuộc thảo luận
router.post('/message', authMiddleware, async (req, res) => {
  const { discussionId, message } = req.body;

  if (!message || !discussionId) {
    return res.status(400).json({ message: "Thiếu discussionId hoặc message" });
  }

  try {
    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ message: "Cuộc thảo luận không tồn tại" });
    }

    // Chuyển req.user._id thành ObjectId để so sánh
    const userId = new mongoose.Types.ObjectId(req.user._id);

    // Kiểm tra quyền
    const topic = await Topic.findById(discussion.topicId);
    if (!topic.teamMembers.some(member => member.equals(userId)) && !topic.supervisor.equals(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền gửi tin nhắn vào cuộc thảo luận này" });
    }

    const newMessage = {
      userId: userId,
      message,
      createdAt: new Date()
    };

    discussion.messages.push(newMessage);
    await discussion.save();

    const lastMsg = discussion.messages[discussion.messages.length - 1];

    const populated = await Discussion.populate(lastMsg, {
      path: 'userId',
      select: 'name',
    });

    res.status(201).json({
      _id: populated._id,
      message: populated.message,
      sender: populated.userId.name,
      senderId: populated.userId._id,
      createdAt: populated.createdAt
    });
  } catch (err) {
    console.error("❌ Lỗi gửi tin nhắn vào cuộc thảo luận:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi gửi tin nhắn", error: err.message });
  }
});

// Xóa tin nhắn khỏi cuộc thảo luận
router.delete('/message', authMiddleware, async (req, res) => {
  const { discussionId, messageId } = req.body;

  if (!discussionId || !messageId) {
    return res.status(400).json({ message: "Thiếu discussionId hoặc messageId" });
  }

  try {
    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ message: "Cuộc thảo luận không tồn tại" });
    }

    // Chuyển req.user._id thành ObjectId để so sánh
    const userId = new mongoose.Types.ObjectId(req.user._id);

    // Kiểm tra quyền
    const topic = await Topic.findById(discussion.topicId);
    if (!topic.teamMembers.some(member => member.equals(userId)) && !topic.supervisor.equals(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền xóa tin nhắn trong cuộc thảo luận này" });
    }

    const messageIndex = discussion.messages.findIndex(msg => msg._id.toString() === messageId);
    if (messageIndex === -1) {
      return res.status(404).json({ message: "Tin nhắn không tồn tại" });
    }

    // Kiểm tra xem người dùng có phải là người gửi tin nhắn không
    const message = discussion.messages[messageIndex];
    if (!message.userId.equals(userId)) {
      return res.status(403).json({ message: "Bạn chỉ có thể xóa tin nhắn của chính mình" });
    }

    discussion.messages.splice(messageIndex, 1);
    await discussion.save();

    res.status(200).json({ message: "Tin nhắn đã được xóa" });
  } catch (err) {
    console.error("❌ Lỗi xóa tin nhắn:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi xóa tin nhắn", error: err.message });
  }
});

module.exports = router;