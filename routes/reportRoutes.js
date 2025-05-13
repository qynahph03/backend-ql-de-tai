const express = require("express");
const router = express.Router();
const { upload, cloudinary } = require("../config/cloudinary");

const Report = require("../models/Report");
const Topic = require("../models/Topic");
const User = require("../models/User");
const Notification = require("../models/Notification");
const authMiddleware = require("../middlewares/authMiddleware");

// Middleware bắt lỗi Multer
const handleMulterError = (err, req, res, next) => {
  console.error("Multer/Cloudinary error:", {
    message: err.message,
    stack: err.stack,
    code: err.code,
  });
  return res.status(400).json({
    message: "Định dạng file không được phép. Chỉ chấp nhận PDF, DOC, DOCX, JPG, PNG, GIF.",
    error: err.message,
    details: err,
  });
};

router.post(
  "/submit",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      console.log("Reached API handler: /submit");
      const { topicId, reportContent, period } = req.body;
      const userId = req.user._id;

      console.log("Received data:", req.body);
      console.log("File details:", req.file ? {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        path: req.file.path,
        size: req.file.size,
      } : "No file uploaded");

      if (!topicId || !reportContent || !period) {
        return res.status(400).json({ message: "Thiếu thông tin topicId, reportContent hoặc period!" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Vui lòng upload file!" });
      }

      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ message: "Không tìm thấy đề tài!" });
      }

      if (!topic.teamMembers.includes(userId)) {
        return res.status(403).json({ message: "Bạn không phải thành viên nhóm này!" });
      }

      const fileUrl = `${req.file.path}?fl_attachment`;
      const publicId = req.file.public_id ? req.file.public_id.split("/").pop() : req.file.filename.split("/").pop();

      const newReport = new Report({
        topic: topicId,
        student: userId,
        file: fileUrl,
        publicId: publicId,
        reportContent,
        period,
        status: "pending",
      });

      await newReport.save();

      const notifications = {
        recipient: topic.supervisor,
        message: `Sinh viên đã nộp báo cáo (${period}) cho đề tài "${topic.topicName}".`,
      };
      await Notification.create(notifications);

      res.json({ message: "Báo cáo đã được nộp thành công!" });
    } catch (error) {
      console.error("Submit error:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({ message: "Lỗi khi nộp báo cáo!", error: error.message });
    }
  }
);

router.get("/list", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /list");
    const userId = req.user._id;
    const role = req.user.role;

    let reports;

    if (role === "student") {
      reports = await Report.find({ student: userId, isDeleted: false })
        .populate({
          path: "topic",
          select: "topicName supervisor teamMembers",
          populate: [
            { path: "supervisor", select: "name" },
            { path: "teamMembers", select: "name" },
          ],
        })
        .populate("student", "name");
    } else if (role === "teacher") {
      const teacherTopics = await Topic.find({ supervisor: userId }).select("_id");
      const topicIds = teacherTopics.map(t => t._id);
      reports = await Report.find({ topic: { $in: topicIds }, isDeleted: false })
        .populate({
          path: "topic",
          select: "topicName supervisor teamMembers",
          populate: [
            { path: "supervisor", select: "name" },
            { path: "teamMembers", select: "name" },
          ],
        })
        .populate("student", "name");
    } else if (role === "admin") {
      reports = await Report.find({ submittedToAdmin: true, isDeleted: false })
        .populate({
          path: "topic",
          select: "topicName supervisor teamMembers",
          populate: [
            { path: "supervisor", select: "name" },
            { path: "teamMembers", select: "name" },
          ],
        })
        .populate("student", "name");
    } else {
      return res.status(403).json({ message: "Bạn không có quyền xem báo cáo!" });
    }

    console.log("Fetched reports:", reports.length);
    res.json(reports);
  } catch (error) {
    console.error("List reports error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi lấy danh sách báo cáo!", error: error.message });
  }
});

router.put(
  "/update-report",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      console.log("Reached API handler: /update-report");
      const { reportId, reportContent } = req.body;
      const userId = req.user._id;

      console.log("Received data:", req.body);
      console.log("File details:", req.file ? {
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        path: req.file.path,
        size: req.file.size,
      } : "No file uploaded");

      if (!reportId || !reportContent) {
        return res.status(400).json({ message: "Thiếu thông tin reportId hoặc reportContent!" });
      }

      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({ message: "Không tìm thấy báo cáo!" });
      }

      if (report.student.toString() !== userId.toString()) {
        return res.status(403).json({ message: "Bạn không có quyền cập nhật báo cáo này!" });
      }

      if (report.status !== "pending") {
        return res.status(403).json({ message: "Báo cáo này không còn được chỉnh sửa!" });
      }

      if (report.isDeleted) {
        return res.status(400).json({ message: "Báo cáo đã bị xóa, không thể cập nhật!" });
      }

      report.reportContent = reportContent;
      if (req.file) {
        if (report.publicId) {
          try {
            const extension = report.file.split(".").pop().split("?")[0].toLowerCase();
            const resourceType = ["jpg", "jpeg", "png", "gif"].includes(extension) ? "image" : "raw";
            console.log("Attempting to delete old file from Cloudinary:", report.publicId);
            const result = await cloudinary.uploader.destroy(`reports/${report.publicId}`, { resource_type: resourceType });
            console.log("Cloudinary delete result:", result);
          } catch (cloudinaryError) {
            console.error("Error deleting old file from Cloudinary:", {
              message: cloudinaryError.message,
              stack: cloudinaryError.stack,
              name: cloudinaryError.name,
            });
          }
        }
        const fileUrl = `${req.file.path}?fl_attachment`;
        const publicId = req.file.public_id ? req.file.public_id.split("/").pop() : req.file.filename.split("/").pop();
        report.file = fileUrl;
        report.publicId = publicId;
      }

      await report.save();
      console.log("Report updated:", { reportId, file: report.file });

      res.json({ message: "Cập nhật báo cáo thành công!" });
    } catch (error) {
      console.error("Update report error:", {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({ message: "Lỗi khi cập nhật báo cáo!", error: error.message });
    }
  }
);

router.delete("/delete-report", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /delete-report");
    const { reportId } = req.body;
    const userId = req.user._id;

    console.log("Received data:", req.body);

    if (!reportId) {
      return res.status(400).json({ message: "Thiếu thông tin reportId!" });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo!" });
    }

    if (report.student.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền xóa báo cáo này!" });
    }

    if (report.isDeleted) {
      return res.status(400).json({ message: "Báo cáo đã được đánh dấu xóa trước đó!" });
    }

    if (report.status !== "pending") {
      return res.status(403).json({ message: "Báo cáo đã được xử lý, không thể xóa!" });
    }

    report.isDeleted = true;
    await report.save();
    console.log("Report marked as deleted:", { reportId, isDeleted: report.isDeleted });

    res.json({ message: "Báo cáo đã được đánh dấu là đã xóa." });
  } catch (error) {
    console.error("Delete report error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi xóa báo cáo!", error: error.message });
  }
});

router.post("/approve-report", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /approve-report");
    const { reportId } = req.body;
    const userId = req.user._id;

    console.log("Received data:", req.body);

    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Bạn không có quyền phê duyệt báo cáo!" });
    }

    if (!reportId) {
      return res.status(400).json({ message: "Thiếu thông tin reportId!" });
    }

    const report = await Report.findById(reportId).populate("topic");
    if (!report) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo!" });
    }

    if (report.isDeleted) {
      return res.status(400).json({ message: "Báo cáo đã bị xóa, không thể phê duyệt!" });
    }

    if (report.topic.supervisor.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bạn không phải giảng viên hướng dẫn!" });
    }

    if (report.status !== "pending") {
      return res.status(400).json({ message: "Báo cáo đã được xử lý trước đó!" });
    }

    report.status = "approved";
    report.isEditable = false;
    await report.save();
    console.log("Report approved:", { reportId, status: report.status, isEditable: report.isEditable });

    const topic = await Topic.findById(report.topic._id).select("topicName teamMembers");
    if (!topic) {
      return res.status(404).json({ message: "Không tìm thấy đề tài!" });
    }

    if (topic.teamMembers.length === 0) {
      console.log("No team members found for topic:", topic._id);
      const notification = {
        recipient: report.student,
        message: `Báo cáo (${report.period}) của đề tài "${topic.topicName}" đã được phê duyệt.`,
      };
      await Notification.create(notification);
      console.log("Notification sent to student:", report.student.toString());
    } else {
      console.log("Sending notifications to team members:", topic.teamMembers.map(id => id.toString()));
      const notifications = topic.teamMembers.map(memberId => ({
        recipient: memberId,
        message: `Báo cáo (${report.period}) của đề tài "${topic.topicName}" đã được phê duyệt.`,
      }));
      await Notification.insertMany(notifications);
      console.log("Notifications sent to team members:", notifications.length);
    }

    res.json({ message: "Báo cáo đã được phê duyệt!" });
  } catch (error) {
    console.error("Approve report error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi phê duyệt báo cáo!", error: error.message });
  }
});

router.post("/reject-report", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /reject-report");
    const { reportId } = req.body;
    const userId = req.user._id;

    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Bạn không có quyền từ chối báo cáo!" });
    }

    if (!reportId) {
      return res.status(400).json({ message: "Thiếu thông tin reportId!" });
    }

    const report = await Report.findById(reportId).populate("topic");
    if (!report) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo!" });
    }

    if (report.isDeleted) {
      return res.status(400).json({ message: "Báo cáo đã bị xóa, không thể từ chối!" });
    }

    if (report.topic.supervisor.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bạn không phải giảng viên hướng dẫn!" });
    }

    if (report.status !== "pending") {
      return res.status(400).json({ message: "Báo cáo đã được xử lý trước đó!" });
    }

    report.status = "rejected";
    report.isEditable = false;
    await report.save();
    console.log("Report rejected:", { reportId, status: report.status, isEditable: report.isEditable });

    const topic = await Topic.findById(report.topic._id).select("topicName teamMembers");
    if (!topic) {
      return res.status(404).json({ message: "Không tìm thấy đề tài!" });
    }

    if (topic.teamMembers.length === 0) {
      console.log("No team members found for topic:", topic._id);
      const notification = {
        recipient: report.student,
        message: `Báo cáo (${report.period}) của đề tài "${topic.topicName}" đã bị từ chối.`,
      };
      await Notification.create(notification);
      console.log("Notification sent to student:", report.student.toString());
    } else {
      console.log("Sending notifications to team members:", topic.teamMembers.map(id => id.toString()));
      const notifications = topic.teamMembers.map(memberId => ({
        recipient: memberId,
        message: `Báo cáo (${report.period}) của đề tài "${topic.topicName}" đã bị từ chối.`,
      }));
      await Notification.insertMany(notifications);
      console.log("Notifications sent to team members:", notifications.length);
    }

    res.json({ message: "Báo cáo đã bị từ chối!" });
  } catch (error) {
    console.error("Reject report error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi từ chối báo cáo!", error: error.message });
  }
});

router.post("/restore-report", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /restore-report");
    const { reportId } = req.body;
    const userId = req.user._id;

    console.log("Received data:", req.body);

    if (!reportId) {
      return res.status(400).json({ message: "Thiếu thông tin reportId!" });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo!" });
    }

    if (report.student.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Bạn không có quyền khôi phục báo cáo này!" });
    }

    if (!report.isDeleted) {
      return res.status(400).json({ message: "Báo cáo chưa được đánh dấu xóa!" });
    }

    report.isDeleted = false;
    report.status = "pending";
    await report.save();
    console.log("Report restored:", { reportId, isDeleted: report.isDeleted, status: report.status });

    res.json({ message: "Báo cáo đã được khôi phục." });
  } catch (error) {
    console.error("Restore report error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi khôi phục báo cáo!", error: error.message });
  }
});

router.get("/deleted-reports", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /deleted-reports");
    const userId = req.user._id;
    const role = req.user.role;

    let reports;

    if (role === "student") {
      reports = await Report.find({ student: userId, isDeleted: true })
        .populate({
          path: "topic",
          select: "topicName supervisor teamMembers",
          populate: [
            { path: "supervisor", select: "name" },
            { path: "teamMembers", select: "name" },
          ],
        })
        .populate("student", "name");
    } else if (role === "teacher") {
      const teacherTopics = await Topic.find({ supervisor: userId }).select("_id");
      const topicIds = teacherTopics.map(t => t._id);
      reports = await Report.find({ topic: { $in: topicIds }, isDeleted: true })
        .populate({
          path: "topic",
          select: "topicName supervisor teamMembers",
          populate: [
            { path: "supervisor", select: "name" },
            { path: "teamMembers", select: "name" },
          ],
        })
        .populate("student", "name");
    } else {
      return res.status(403).json({ message: "Bạn không có quyền xem báo cáo đã xóa!" });
    }

    console.log("Fetched deleted reports:", reports.length);
    res.json(reports);
  } catch (error) {
    console.error("Deleted reports error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi lấy danh sách báo cáo đã xóa!", error: error.message });
  }
});

// Nộp các báo cáo đã phê duyệt của một đề tài cho admin
router.post("/submit-to-admin", authMiddleware, async (req, res) => {
  try {
    console.log("Reached API handler: /submit-to-admin");
    const { topicId } = req.body;
    const userId = req.user._id;

    console.log("Received data:", req.body);

    // Kiểm tra quyền: Chỉ trưởng nhóm (teamMembers[0]) được nộp
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: "Không tìm thấy đề tài!" });
    }

    if (!topic.teamMembers || topic.teamMembers.length === 0) {
      return res.status(400).json({ message: "Đề tài không có thành viên nhóm!" });
    }

    if (topic.teamMembers[0].toString() !== userId.toString()) {
      return res.status(403).json({ message: "Chỉ trưởng nhóm mới có quyền nộp báo cáo cho admin!" });
    }

    // Kiểm tra trạng thái đề tài
    if (topic.status !== "approved") {
      return res.status(400).json({ message: "Đề tài chưa được phê duyệt!" });
    }

    // Tìm các báo cáo đã phê duyệt của đề tài
    const approvedReports = await Report.find({
      topic: topicId,
      isDeleted: false,
      status: "approved",
    });

    if (!approvedReports || approvedReports.length === 0) {
      return res.status(400).json({ message: "Không có báo cáo nào đã được phê duyệt cho đề tài này!" });
    }

    // Kiểm tra nếu đã nộp trước đó
    const alreadySubmitted = approvedReports.every((report) => report.submittedToAdmin);
    if (alreadySubmitted) {
      return res.status(400).json({ message: "Tất cả báo cáo đã phê duyệt đã được nộp cho admin trước đó!" });
    }

    // (Tùy chọn) Kiểm tra các kỳ báo cáo bắt buộc
    if (topic.requiredPeriods && topic.requiredPeriods.length > 0) {
      const approvedPeriods = approvedReports.map((report) => report.period);
      const missingPeriods = topic.requiredPeriods.filter((period) => !approvedPeriods.includes(period));
      if (missingPeriods.length > 0) {
        return res.status(400).json({
          message: `Thiếu báo cáo đã phê duyệt cho các kỳ: ${missingPeriods.join(", ")}`,
        });
      }
    }

    // Đánh dấu các báo cáo đã phê duyệt là đã nộp
    await Report.updateMany(
      { topic: topicId, isDeleted: false, status: "approved" },
      { $set: { submittedToAdmin: true } }
    );

    // Tìm admin để gửi thông báo
    const admins = await User.find({ role: "admin" });
    if (admins.length === 0) {
      console.warn("Không tìm thấy admin để gửi thông báo!");
    } else {
      const notifications = admins.map((admin) => ({
        recipient: admin._id,
        message: `Nhóm sinh viên đã nộp ${approvedReports.length} báo cáo đã phê duyệt của đề tài "${topic.topicName}" để xét duyệt.`,
      }));
      await Notification.insertMany(notifications);
      console.log("Notifications sent to admins:", notifications.length);
    }

    res.json({ message: `Đã nộp ${approvedReports.length} báo cáo đã phê duyệt cho admin!` });
  } catch (error) {
    console.error("Submit to admin error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Lỗi khi nộp báo cáo cho admin!", error: error.message });
  }
});

module.exports = router;