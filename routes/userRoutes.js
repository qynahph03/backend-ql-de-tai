const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền xem danh sách người dùng!" });
    }
    const { role } = req.query;
    const query = role ? { role } : {};
    const users = await User.find(query).select("_id name role");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi lấy danh sách người dùng!", error: error.message });
  }
});

// API kiểm tra người dùng theo tên
router.get("/check", authMiddleware, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ message: "Thiếu tham số 'name'" });
    }
    const user = await User.findOne({ name: name }).select("_id name role");
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }
    res.status(200).json({ message: "Người dùng hợp lệ", user });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server: " + error.message });
  }
});

// API lấy danh sách giảng viên
router.get("/teachers", authMiddleware, async (req, res) => {
  try {
    // Kiểm tra quyền admin
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin có quyền xem danh sách giảng viên!" });
    }

    // Lấy danh sách giảng viên (role: teacher)
    const teachers = await User.find({ role: "teacher" }).select("_id name");
    res.json(teachers);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách giảng viên:", error.message);
    res.status(500).json({ message: "Lỗi khi lấy danh sách giảng viên!", error: error.message });
  }
});

module.exports = router;
