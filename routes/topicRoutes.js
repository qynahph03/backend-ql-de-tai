//backend/routes/topicRoutes.js

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Topic = require("../models/Topic");
const Notification = require("../models/Notification");
const authMiddleware = require("../middlewares/authMiddleware");
const Council = require("../models/Council");
const { default: mongoose } = require("mongoose");

// API lấy danh sách đề tài
router.get("/list", authMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Người dùng chưa được xác thực" });
    }

    const userId = new mongoose.Types.ObjectId(req.user._id); // Ép kiểu ObjectId
    console.log("📌 userId từ token:", req.user._id);
    console.log("📌 userId sau khi ép kiểu:", userId);

    let topics;

    if (req.user.role === "admin") {
      // Admin xem tất cả đề tài
      topics = await Topic.find({})
        .populate("supervisor", "name")
        .populate("teamMembers", "name");
    } else if (req.user.role === "teacher") {
      // Giảng viên xem các đề tài họ hướng dẫn
      topics = await Topic.find({ supervisor: userId })
        .populate("supervisor", "name")
        .populate("teamMembers", "name");
    } else {
      // Sinh viên xem các đề tài họ tham gia
      topics = await Topic.find({ teamMembers: userId })
        .populate("supervisor", "name")
        .populate("teamMembers", "name");
    }

    console.log("📌 Danh sách đề tài:", topics);
    res.json(topics);
  } catch (error) {
    console.error("❌ Lỗi lấy danh sách đề tài:", error);
    res.status(500).json({ message: "Lỗi khi lấy danh sách đề tài", error: error.message });
  }
});

// API đăng ký đề tài
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

    // Kiểm tra nếu bất kỳ thành viên nào đã tham gia đề tài đang thực hiện
    const existingTopic = await Topic.findOne({
      teamMembers: { $in: validMembers },
      status: { $in: ["pending-teacher", "teacher-approve", "pending", "approved"] }
    });

    if (existingTopic) {
      return res.status(400).json({ message: "Nhóm có thành viên đang thực hiện đề tài khác!" });
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

// API giảng viên xét duyệt đề tài
router.post("/teacher-approve", authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== "teacher") {
        return res.status(403).json({ message: "Bạn không có quyền xét duyệt đề tài!" });
      }
  
      const { topicId } = req.body;
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ message: "Không tìm thấy đề tài!" });
      }
  
      if (topic.supervisor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Bạn không phải giảng viên hướng dẫn đề tài này!" });
      }
  
      topic.status = "teacher-approve"; // Chờ admin duyệt
      await topic.save();
  
      // Thông báo cho sinh viên
      const notifications = topic.teamMembers.map(member => ({
        recipient: member._id,
        message: `Giảng viên đã chấp nhận đề tài "${topic.topicName}". Đang chờ admin xét duyệt!`
      }));
      await Notification.insertMany(notifications);
  
      res.json({ message: "Bạn đã chấp nhận đề tài. Đang chờ admin xét duyệt!" });
  
    } catch (error) {
      res.status(500).json({ message: "Lỗi khi xét duyệt đề tài!", error: error.message });
    }
  });
  
  router.post("/teacher-reject", authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== "teacher") {
        return res.status(403).json({ message: "Bạn không có quyền xét duyệt đề tài!" });
      }
  
      const { topicId } = req.body;
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ message: "Không tìm thấy đề tài!" });
      }
  
      if (topic.supervisor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Bạn không phải giảng viên hướng dẫn đề tài này!" });
      }
  
      topic.status = "teacher-reject"; // Từ chối đề tài
      await topic.save();
  
      // Thông báo cho sinh viên
      const notifications = topic.teamMembers.map(member => ({
        recipient: member._id,
        message: `Giảng viên đã từ chối đề tài "${topic.topicName}".`
      }));
      await Notification.insertMany(notifications);
  
      res.json({ message: "Bạn đã từ chối đề tài!" });
  
    } catch (error) {
      res.status(500).json({ message: "Lỗi khi xét duyệt đề tài!", error: error.message });
    }
  });
  

// API admin phê duyệt đề tài
router.post("/approve", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền phê duyệt đề tài!" });
    }

    const { topicId } = req.body;
    const topic = await Topic.findById(topicId);
    if (!topic || topic.status !== "teacher-approve") {
      return res.status(404).json({ message: "Đề tài không hợp lệ hoặc chưa qua giảng viên xét duyệt!" });
    }

    topic.status = "approved";
    await topic.save();

    // Tạo thông báo cho sinh viên và giảng viên
    const notifications = [
      { recipient: topic.supervisor._id, message: `Đề tài "${topic.topicName}" đã được phê duyệt!` },
      ...topic.teamMembers.map(member => 
      ({ recipient: member, message: `Đề tài "${topic.topicName}" đã được quản trị viên phê duyệt!` }))
    ];
    await Notification.insertMany(notifications);

    res.json({ message: "Đề tài đã được phê duyệt!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi phê duyệt đề tài!", error: error.message });
  }
});

// API admin từ chối đề tài
router.post("/reject", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền từ chối đề tài!" });
    }

    const { topicId } = req.body;
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: "Không tìm thấy đề tài!" });
    }

    topic.status = "rejected";
    await topic.save();

    // Tạo thông báo cho giảng viên và sinh viên
    const notifications = [
      { recipient: topic.supervisor._id, message: `Đề tài "${topic.topicName}" đã bị từ chối!` },
      ...topic.teamMembers.map(member => 
      ({ recipient: member._id, message: `Đề tài "${topic.topicName}" đã bị từ chối!` }))
    ];
    await Notification.insertMany(notifications);

    res.json({ message: "Đề tài đã bị từ chối!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi từ chối đề tài!", error: error.message });
  }
});

// API sinh viên xin hủy đề tài
router.post("/student-cancel", authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== "student") {
        return res.status(403).json({ message: "Bạn không có quyền xin hủy đề tài!" });
      }
  
      const { topicId } = req.body;
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ message: "Không tìm thấy đề tài!" });
      }
  
      // Kiểm tra nếu người đăng ký là nhóm trưởng (sinh viên đầu tiên)
    if (topic.teamMembers[0].toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Chỉ nhóm trưởng mới có quyền hủy đề tài!" });
      }
  
      // Kiểm tra trạng thái của đề tài (chỉ hủy khi chưa phê duyệt)
      if (topic.status !== "pending-teacher") {
        return res.status(400).json({ message: "Đề tài không thể hủy khi đã được xét duyệt!" });
      }
  
      topic.status = "canceled";
      await topic.save();
  
      res.json({ message: "Đề tài đã bị hủy!" });
    } catch (error) {
      res.status(500).json({ message: "Lỗi khi hủy đề tài!", error: error.message });
    }
  });

  // API cho phép sinh viên yêu cầu dừng đề tài
router.post("/stop-performing", authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== "student") {
        return res.status(403).json({ message: "Bạn không có quyền xin dừng thực hiện đề tài!" });
      }
      const { topicId } = req.body;
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ message: "Không tìm thấy đề tài!" });
      }
  
      // Kiểm tra nếu người đăng ký là một trong các thành viên nhóm
      if (!topic.teamMembers.includes(req.user._id)) {
        return res.status(403).json({ message: "Bạn không phải thành viên nhóm này!" });
      }
  
      // Kiểm tra xem người yêu cầu có phải là nhóm trưởng (thành viên đầu tiên trong nhóm)
      if (topic.teamMembers[0].toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Chỉ nhóm trưởng mới có thể yêu cầu dừng đề tài!" });
      }
  
      // Kiểm tra trạng thái của đề tài (chỉ yêu cầu dừng khi đã phê duyệt)
      if (topic.status !== "approved") {
        return res.status(400).json({ message: "Đề tài chưa được phê duyệt không thể yêu cầu dừng!" });
      }
  
      // Đánh dấu đề tài xin dừng
      topic.status = "stop-performing"; 
      await topic.save();
  
      // Log trước khi tạo thông báo
      console.log("📌 Gửi thông báo yêu cầu dừng cho admin");
  
      // Tạo thông báo cho admin
      const admin = await User.findOne({ role: "admin" });
      if (!admin) {
        console.error("❌ Không tìm thấy admin");
        return res.status(500).json({ message: "Không tìm thấy admin!" });
      }
      console.log("📌 Admin found:", admin._id);
  
      console.log("📌 Tạo thông báo...");
      const notifications = {
        recipient: admin._id,
        message: `Đề tài "${topic.topicName}" yêu cầu dừng thực hiện!`
      };
  
      try {
        console.log("📌 Thông báo gửi thành công");
      } catch (error) {
        console.error("❌ Lỗi khi tạo thông báo:", error);
        return res.status(500).json({ message: "Lỗi khi tạo thông báo!", error: error.message });
      }
      await Notification.insertMany(notifications);
  
      res.json({ message: "Đề tài đã được gửi yêu cầu dừng cho admin!" });
    } catch (error) {
      console.error("❌ Lỗi khi yêu cầu dừng đề tài:", error.message);
      res.status(500).json({ message: "Lỗi khi yêu cầu dừng đề tài!", error: error.message });
    }
  });  
  

  // API cho phép admin phê duyệt yêu cầu dừng đề tài
router.post("/approve-stop", authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Bạn không có quyền phê duyệt yêu cầu dừng đề tài!" });
      }
  
      const { topicId } = req.body;
      const topic = await Topic.findById(topicId);
      if (!topic || topic.status !== "stop-performing") {
        return res.status(404).json({ message: "Đề tài không hợp lệ hoặc không có yêu cầu dừng!" });
      }
  
      topic.status = "stopped";
      await topic.save();
  
      // Thông báo cho sinh viên và giảng viên
      const notifications = [
        { recipient: topic.supervisor._id, message: `Đề tài "${topic.topicName}" đã bị dừng thực hiện!` },
        ...topic.teamMembers.map(member => 
        ({ recipient: member._id, message: `Đề tài "${topic.topicName}" đã bị dừng thực hiện!` }))
      ];
      await Notification.insertMany(notifications);
  
      res.json({ message: "Yêu cầu dừng đề tài đã được phê duyệt!" });
    } catch (error) {
      res.status(500).json({ message: "Lỗi khi phê duyệt dừng đề tài!", error: error.message });
    }
  });

// API lấy thông tin hội đồng chấm điểm của một đề tài
router.get("/council/list", authMiddleware, async (req, res) => {
  try {
    const { topicId } = req.query;
    if (!topicId) {
      return res.status(400).json({ message: "Thiếu topicId trong query!" });
    }
    const council = await Council.findOne({ topic: topicId })
      .populate("chairman", "_id name")
      .populate("secretary", "_id name")
      .populate("members", "_id name");
    if (!council) {
      return res.status(404).json({ message: "Không tìm thấy hội đồng!" });
    }
    res.json(council);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin hội đồng:", error.message);
    res.status(500).json({ message: "Lỗi khi lấy thông tin hội đồng!", error: error.message });
  }
});

module.exports = router;
