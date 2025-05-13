// backend/controllers/topic/registerTopic.js

const express = require("express");
const router = express.Router();
const Topic = require("../../models/Topic");
const User = require("../../models/User");
const authMiddleware = require("../../middlewares/authMiddleware");

router.post("/register", authMiddleware, async (req, res) => {
  try {
    const { topicName, topicDescription, supervisor, teamMembers } = req.body;
    const studentId = req.user._id; // ID của sinh viên đăng ký

    // Kiểm tra giảng viên hướng dẫn (dùng name thay vì username)
    const teacher = await User.findOne({ name: supervisor, role: "teacher" });
    if (!teacher) {
      return res.status(400).json({ message: "Giảng viên hướng dẫn không hợp lệ!" });
    }

    // Kiểm tra từng thành viên nhóm nếu có (từ name -> _id)
    let validMembers = [studentId]; // Mặc định thêm sinh viên đăng ký vào nhóm
    if (teamMembers) {
      const members = teamMembers.split(",").map((name) => name.trim());

      for (const member of members) {
        const student = await User.findOne({ name: member, role: "student" });

        if (!student) {
          return res.status(400).json({ message: `Thành viên nhóm ${member} không hợp lệ!` });
        }

        if (!validMembers.includes(student._id)) {
          validMembers.push(student._id);
        }
      }
    }

    // Kiểm tra số lượng thành viên (tối đa 3 người)
    if (validMembers.length > 3) {
      return res.status(400).json({ message: "Nhóm không được vượt quá 3 thành viên!" });
    }

    // Lưu đề tài vào database với trạng thái 'pending'
    const newTopic = new Topic({
      topicName,
      topicDescription,
      supervisor: teacher._id,
      teamMembers: validMembers,
      status: "pending-teacher", // Mặc định chờ gv xét duyệt
    });

    await newTopic.save();
    res.status(201).json({ message: "Đề tài đang chờ giảng viên xét duyệt!", topic: newTopic });
  } catch (error) {
    res.status(500).json({ message: "Lỗi máy chủ: " + error.message });
  }
});

module.exports = router;
