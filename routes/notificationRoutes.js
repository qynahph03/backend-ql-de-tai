// backend/routes/notificationRoutes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const Notification = require("../models/Notification");

// API lấy thông báo của người dùng
router.get("/list", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi lấy thông báo!", error: error.message });
  }
});

// API đánh dấu thông báo đã đọc
router.post("/mark-as-read", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id }, { isRead: true });
    res.json({ message: "Đã đánh dấu tất cả thông báo là đã đọc!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi cập nhật trạng thái thông báo!", error: error.message });
  }
});

module.exports = router;
