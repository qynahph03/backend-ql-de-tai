// backend/routes/addashboardRoutes.js

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Topic = require("../models/Topic");
const Report = require("../models/Report");
const Council = require("../models/Council");
const Notification = require("../models/Notification");
const authMiddleware = require("../middlewares/authMiddleware");

// Lấy dữ liệu tổng quan cho dashboard admin
router.get("/overview", authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const role = req.user.role;

    // Kiểm tra quyền: Chỉ admin được truy cập
    if (role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền truy cập dashboard này" });
    }

    // Số lượng đề tài (tất cả trạng thái)
    const topicCount = await Topic.countDocuments({});

    // Số lượng báo cáo đã nộp lên admin
    const reportCount = await Report.countDocuments({ submittedToAdmin: true, isDeleted: false });

    // Số lượng hội đồng
    const councilCount = await Council.countDocuments({ isDeleted: false });

    // Số lượng thông báo chưa đọc
    const unreadNotifications = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    // Số lượng đề tài chờ phê duyệt (teacher-approve) và yêu cầu dừng (stop-performing)
    const pendingTopics = await Topic.countDocuments({ status: "teacher-approve" });
    const stopPerformingTopics = await Topic.countDocuments({ status: "stop-performing" });

    res.status(200).json({
      topicCount,
      reportCount,
      councilCount,
      unreadNotifications,
      pendingTopics,
      stopPerformingTopics,
    });
  } catch (err) {
    console.error("❌ Lỗi lấy dữ liệu tổng quan:", err.message, err.stack);
    res.status(500).json({ message: "Lỗi khi lấy dữ liệu tổng quan", error: err.message });
  }
});

module.exports = router;