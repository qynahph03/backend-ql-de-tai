const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Topic = require("../models/Topic");
const Notification = require("../models/Notification");
const authMiddleware = require("../middlewares/authMiddleware");

// Lấy dữ liệu tổng quan cho dashboard
router.get("/overview", authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const role = req.user.role;

    // Kiểm tra quyền: Chỉ giáo viên được truy cập
    if (role !== "teacher") {
      return res.status(403).json({ message: "Bạn không có quyền truy cập dashboard này" });
    }

    // Số lượng đề tài đang hướng dẫn
    const topics = await Topic.find({ supervisor: userId, status: "approved" });
    const topicCount = topics.length;

    // Số lượng sinh viên
    const studentCount = topics.reduce((total, topic) => {
      return total + (topic.teamMembers?.length || 0);
    }, 0);

    // Số lượng thông báo chưa đọc
    const unreadNotifications = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.status(200).json({
      topicCount,
      studentCount,
      unreadNotifications,
    });
  } catch (err) {
    console.error("❌ Lỗi lấy dữ liệu tổng quan:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi lấy dữ liệu tổng quan", error: err.message });
  }
});

// Lấy danh sách đề tài của giáo viên
router.get("/topics", authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const role = req.user.role;
    const { page = 1, limit = 10 } = req.query;

    // Kiểm tra quyền: Chỉ giáo viên được truy cập
    if (role !== "teacher") {
      return res.status(403).json({ message: "Bạn không có quyền truy cập danh sách đề tài" });
    }

    const topics = await Topic.find({ supervisor: userId, status: "approved" })
      .populate("teamMembers", "username")
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalTopics = await Topic.countDocuments({ supervisor: userId, status: "approved" });

    const formattedTopics = topics.map((topic) => ({
      _id: topic._id,
      title: topic.topicName,
      teamMembers: topic.teamMembers?.map((member) => member.username) || [],
      progress: topic.progress || [],
      status: topic.status,
      discussionId: topic._id, // Giả định mỗi topic có một discussion liên quan
    }));

    res.status(200).json({
      topics: formattedTopics,
      totalPages: Math.ceil(totalTopics / limit),
      currentPage: parseInt(page),
    });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách đề tài:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi lấy danh sách đề tài", error: err.message });
  }
});

module.exports = router;