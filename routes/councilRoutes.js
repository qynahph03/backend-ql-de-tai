//backend/routes/councilRoutes.js

const express = require("express");
const router = express.Router();
const Council = require("../models/Council");
const Topic = require("../models/Topic");
const User = require("../models/User");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
const authMiddleware = require("../middlewares/authMiddleware");
const https = require("https");
const { cloudinary } = require("../config/cloudinary");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = require("docx");
const fs = require("fs");
const path = require("path");

// Admin gửi yêu cầu tạo hội đồng
router.post("/request-create", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin có quyền gửi yêu cầu tạo hội đồng!" });
    }

    const { topicId, chairmanId, secretaryId, memberIds } = req.body;

    if (!topicId || !chairmanId || !secretaryId) {
      return res.status(400).json({ message: "Thiếu thông tin topicId, chairmanId hoặc secretaryId!" });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: "Không tìm thấy đề tài!" });
    }
    if (topic.status !== "approved") {
      return res.status(400).json({ message: "Đề tài chưa được phê duyệt để tạo hội đồng!" });
    }

    const approvedReports = await Report.find({
      topic: topicId,
      status: "approved",
      submittedToAdmin: true,
      isDeleted: false,
    });
    if (!approvedReports || approvedReports.length === 0) {
      return res.status(400).json({
        message: "Đề tài chưa có báo cáo được phê duyệt và gửi lên admin để tạo hội đồng!",
      });
    }

    const chairman = await User.findOne({ _id: chairmanId, role: "teacher" });
    if (!chairman) {
      return res.status(400).json({ message: "Chủ nhiệm hội đồng không hợp lệ!" });
    }

    const secretary = await User.findOne({ _id: secretaryId, role: "teacher" });
    if (!secretary) {
      return res.status(400).json({ message: "Thư ký hội đồng không hợp lệ!" });
    }

    let validMembers = [];
    if (memberIds && Array.isArray(memberIds)) {
      const members = await User.find({ _id: { $in: memberIds }, role: "teacher" });
      if (members.length !== memberIds.length) {
        return res.status(400).json({ message: "Một hoặc nhiều thành viên hội đồng không hợp lệ!" });
      }
      validMembers = members.map((m) => m._id);
      if (validMembers.includes(chairmanId) || validMembers.includes(secretaryId)) {
        return res.status(400).json({ message: "Chủ nhiệm hoặc thư ký không được trùng với thành viên!" });
      }
      if (validMembers.length > 5) {
        return res.status(400).json({ message: "Hội đồng không được có quá 5 thành viên!" });
      }
    }

    const existingRequest = await Council.findOne({ topic: topicId, status: { $in: ['pending-creation', 'pending-uniadmin', 'uniadmin-approved'] } });
    if (existingRequest) {
      return res.status(400).json({ message: "Đề tài này đã có yêu cầu hoặc hội đồng đang chờ xử lý!" });
    }

    const councilRequest = new Council({
      topic: topicId,
      chairman: chairmanId,
      secretary: secretaryId,
      members: validMembers,
      status: "pending-creation",
      createdBy: req.user._id,
    });

    await councilRequest.save();

    const uniadmin = await User.findOne({ role: "uniadmin" });
    if (uniadmin) {
      const notification = new Notification({
        recipient: uniadmin._id,
        message: `Yêu cầu tạo hội đồng cho đề tài "${topic.topicName}" đã được gửi.`,
        type: 'council-request',
        relatedId: councilRequest._id,
      });
      await notification.save();
    }

    res.status(201).json({ message: "Yêu cầu tạo hội đồng đã được gửi!", request: councilRequest });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu tạo hội đồng:", error.message);
    res.status(500).json({ message: "Lỗi khi gửi yêu cầu tạo hội đồng!", error: error.message });
  }
});

// Uniadmin lấy danh sách yêu cầu tạo hội đồng
router.get("/pending-requests", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "uniadmin") {
      return res.status(403).json({ message: "Chỉ uniadmin có quyền xem danh sách yêu cầu!" });
    }

    const requests = await Council.find({ status: 'pending-creation' })
      .populate('topic', 'topicName')
      .populate('chairman', 'name')
      .populate('secretary', 'name')
      .populate('members', 'name')
      .populate('createdBy', 'name');
    res.status(200).json(requests);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu:", error.message);
    res.status(500).json({ message: "Lỗi khi lấy danh sách yêu cầu!", error: error.message });
  }
});

// Uniadmin phê duyệt yêu cầu tạo hội đồng
router.post("/uniadmin-approve-request", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "uniadmin") {
      return res.status(403).json({ message: "Chỉ uniadmin có quyền phê duyệt yêu cầu!" });
    }

    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ message: "Thiếu thông tin requestId!" });
    }

    const request = await Council.findById(requestId)
      .populate('topic', 'topicName')
      .populate('chairman', 'name')
      .populate('secretary', 'name')
      .populate('members', 'name');
    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu!" });
    }
    if (request.status !== "pending-creation") {
      return res.status(400).json({ message: "Yêu cầu không ở trạng thái chờ phê duyệt!" });
    }

    // Tạo file Word
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "QUYẾT ĐỊNH PHÊ DUYỆT HỘI ĐỒNG CHẤM ĐIỂM",
                  bold: true,
                  size: 28,
                  font: "Times New Roman",
                }),
              ],
              alignment: "center",
            }),
            new Paragraph({ children: [new TextRun(" ")] }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Đề tài: ${request.topic.topicName}`,
                  size: 24,
                  font: "Times New Roman",
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Ngày phê duyệt: ${new Date().toLocaleDateString("vi-VN")}`,
                  size: 24,
                  font: "Times New Roman",
                }),
              ],
            }),
            new Paragraph({ children: [new TextRun(" ")] }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Thành phần hội đồng:",
                  bold: true,
                  size: 24,
                  font: "Times New Roman",
                }),
              ],
            }),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph("Vị trí")],
                      width: { size: 20, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph("Họ và tên")],
                      width: { size: 80, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Chủ tịch")] }),
                    new TableCell({ children: [new Paragraph(request.chairman.name)] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Thư ký")] }),
                    new TableCell({ children: [new Paragraph(request.secretary.name)] }),
                  ],
                }),
                ...request.members.map((member, index) => new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(`Thành viên ${index + 1}`)] }),
                    new TableCell({ children: [new Paragraph(member.name)] }),
                  ],
                })),
              ],
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
            new Paragraph({ children: [new TextRun(" ")] }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Người phê duyệt: _________________________",
                  size: 24,
                  font: "Times New Roman",
                }),
              ],
              alignment: "right",
            }),
          ],
        },
      ],
    });

    const fileName = `council_approval_${requestId}_${Date.now()}.docx`;
    const tempPath = path.join(__dirname, "..", "temp", fileName);
    const buffer = await Packer.toBuffer(doc);
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, buffer);

    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: "council_approvals",
      resource_type: "raw",
    });

    fs.unlinkSync(tempPath);

    request.status = "uniadmin-approved";
    request.approvalDocument = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    };
    request.approvalHistory.push({
      uniadmin: req.user._id,
      action: "approved",
      timestamp: new Date(),
    });
    await request.save();

    const topic = await Topic.findById(request.topic);
    topic.council = request._id;
    await topic.save();

    const notifications = [
      {
        recipient: request.chairman,
        message: `Bạn được chỉ định làm chủ nhiệm hội đồng chấm điểm cho đề tài "${topic.topicName}".`,
      },
      {
        recipient: request.secretary,
        message: `Bạn được chỉ định làm thư ký hội đồng chấm điểm cho đề tài "${topic.topicName}".`,
      },
      ...request.members.map((id) => ({
        recipient: id,
        message: `Bạn được chỉ định làm thành viên hội đồng chấm điểm cho đề tài "${topic.topicName}".`,
      })),
      {
        recipient: request.createdBy,
        message: `Yêu cầu tạo hội đồng cho đề tài "${topic.topicName}" đã được uniadmin phê duyệt. Tài liệu phê duyệt: ${uploadResult.secure_url}`,
      },
    ];
    await Notification.insertMany(notifications);

    res.json({ message: "Yêu cầu tạo hội đồng đã được phê duyệt!", council: request });
  } catch (error) {
    console.error("Lỗi khi phê duyệt yêu cầu:", error.message);
    res.status(500).json({ message: "Lỗi khi phê duyệt yêu cầu!", error: error.message });
  }
});

// Uniadmin từ chối yêu cầu tạo hội đồng
router.post("/uniadmin-reject-request", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "uniadmin") {
      return res.status(403).json({ message: "Chỉ uniadmin có quyền từ chối yêu cầu!" });
    }

    const { requestId, reason } = req.body;
    if (!requestId || !reason) {
      return res.status(400).json({ message: "Thiếu thông tin requestId hoặc reason!" });
    }

    const request = await Council.findById(requestId).populate('topic', 'topicName');
    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu!" });
    }
    if (request.status !== "pending-creation") {
      return res.status(400).json({ message: "Yêu cầu không ở trạng thái chờ phê duyệt!" });
    }

    request.status = "uniadmin-rejected";
    request.rejectReason = reason;
    request.approvalHistory.push({
      uniadmin: req.user._id,
      action: "rejected",
      reason,
      timestamp: new Date(),
    });
    await request.save();

    const notification = new Notification({
      recipient: request.createdBy,
      message: `Yêu cầu tạo hội đồng cho đề tài "${request.topic.topicName}" đã bị từ chối. Lý do: ${reason}`,
      type: 'council-rejected',
      relatedId: request._id,
    });
    await notification.save();

    res.json({ message: "Yêu cầu tạo hội đồng đã bị từ chối!", request });
  } catch (error) {
    console.error("Lỗi khi từ chối yêu cầu:", error.message);
    res.status(500).json({ message: "Lỗi khi từ chối yêu cầu!", error: error.message });
  }
});

// Lấy danh sách hội đồng
router.get("/list", authMiddleware, async (req, res) => {
  try {
    let councils;
    if (req.user.role === "admin") {
      councils = await Council.find({ createdBy: req.user._id })
        .populate("topic", "topicName")
        .populate("chairman", "name")
        .populate("secretary", "name")
        .populate("members", "name")
        .populate({
          path: "scores.user",
          select: "name",
        });
    } else if (req.user.role === "uniadmin") {
      councils = await Council.find({})
        .populate("topic", "topicName")
        .populate("chairman", "name")
        .populate("secretary", "name")
        .populate("members", "name")
        .populate({
          path: "scores.user",
          select: "name",
        })
        .populate("createdBy", "name");
    } else if (req.user.role === "teacher") {
      councils = await Council.find({
        $or: [
          { chairman: req.user._id },
          { secretary: req.user._id },
          { members: req.user._id },
        ],
      })
        .populate("topic", "topicName")
        .populate("chairman", "name")
        .populate("secretary", "name")
        .populate("members", "name")
        .populate({
          path: "scores.user",
          select: "name",
        });
    } else {
      return res.status(403).json({ message: "Bạn không có quyền xem danh sách hội đồng!" });
    }

    // Xử lý scores để đảm bảo user hợp lệ
    councils = councils.map((council) => {
      council.scores = council.scores.map((score) => {
        if (!score.user || !score.user._id) {
          return { ...score._doc, user: score.user || null };
        }
        return score;
      });
      return council;
    });

    res.json(councils);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách hội đồng:", error.message);
    res.status(500).json({ message: "Lỗi khi lấy danh sách hội đồng!", error: error.message });
  }
});
// Cập nhật hội đồng
router.put("/update", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin có quyền cập nhật hội đồng!" });
    }

    const { councilId, chairmanId, secretaryId, memberIds, status } = req.body;

    if (!councilId) {
      return res.status(400).json({ message: "Thiếu thông tin councilId!" });
    }

    const council = await Council.findById(councilId);
    if (!council) {
      return res.status(404).json({ message: "Không tìm thấy hội đồng!" });
    }
    if (council.status === "uniadmin-approved" || council.status === "completed") {
      return res.status(400).json({ message: "Hội đồng đã được phê duyệt hoặc hoàn thành, không thể cập nhật!" });
    }

    if (chairmanId) {
      const chairman = await User.findOne({ _id: chairmanId, role: "teacher" });
      if (!chairman) {
        return res.status(400).json({ message: "Chủ nhiệm hội đồng không hợp lệ!" });
      }
      council.chairman = chairmanId;
    }

    if (secretaryId) {
      const secretary = await User.findOne({ _id: secretaryId, role: "teacher" });
      if (!secretary) {
        return res.status(400).json({ message: "Thư ký hội đồng không hợp lệ!" });
      }
      council.secretary = secretaryId;
    }

    if (memberIds && Array.isArray(memberIds)) {
      const members = await User.find({ _id: { $in: memberIds }, role: "teacher" });
      if (members.length !== memberIds.length) {
        return res.status(400).json({ message: "Một hoặc nhiều thành viên hội đồng không hợp lệ!" });
      }
      const validMembers = members.map((m) => m._id);
      if (validMembers.includes(council.chairman) || validMembers.includes(council.secretary)) {
        return res.status(400).json({ message: "Chủ nhiệm hoặc thư ký không được trùng với thành viên!" });
      }
      if (validMembers.length > 5) {
        return res.status(400).json({ message: "Hội đồng không được có quá 5 thành viên!" });
      }
      council.members = validMembers;
    }

    if (status === "pending-creation") {
      council.status = status;
    } else if (status) {
      return res.status(400).json({ message: "Chỉ có thể đặt trạng thái thành pending-creation khi cập nhật!" });
    }

    await council.save();

    if (chairmanId || secretaryId || memberIds || status) {
      const topic = await Topic.findById(council.topic);
      const notifications = [
        {
          recipient: council.chairman,
          message: `Yêu cầu tạo hội đồng cho đề tài "${topic.topicName}" đã được cập nhật.`,
        },
        {
          recipient: council.secretary,
          message: `Yêu cầu tạo hội đồng cho đề tài "${topic.topicName}" đã được cập nhật.`,
        },
        ...council.members.map((id) => ({
          recipient: id,
          message: `Yêu cầu tạo hội đồng cho đề tài "${topic.topicName}" đã được cập nhật.`,
        })),
      ];
      if (status === "pending-creation") {
        const uniadmin = await User.findOne({ role: "uniadmin" });
        if (uniadmin) {
          notifications.push({
            recipient: uniadmin._id,
            message: `Yêu cầu tạo hội đồng cho đề tài "${topic.topicName}" đã được cập nhật và đang chờ phê duyệt.`,
          });
        }
      }
      await Notification.insertMany(notifications);
    }

    res.json({ message: "Yêu cầu tạo hội đồng đã được cập nhật!", council });
  } catch (error) {
    console.error("Lỗi khi cập nhật hội đồng:", error.message);
    res.status(500).json({ message: "Lỗi khi cập nhật hội đồng!", error: error.message });
  }
});

// Chấm điểm hội đồng
router.post("/score", authMiddleware, async (req, res) => {
  try {
    const { councilId, score, comment } = req.body;
    const userId = req.user._id;

    if (req.user.role !== "teacher") {
      return res.status(403).json({ message: "Chỉ giảng viên trong hội đồng có quyền chấm điểm!" });
    }

    if (!councilId || !score) {
      return res.status(400).json({ message: "Thiếu thông tin councilId hoặc score!" });
    }

    if (typeof score !== "number" || score < 0 || score > 100) {
      return res.status(400).json({ message: "Điểm số phải từ 0 đến 100!" });
    }

    const council = await Council.findById(councilId);
    if (!council) {
      return res.status(404).json({ message: "Không tìm thấy hội đồng!" });
    }
    if (council.status !== "uniadmin-approved") {
      return res.status(400).json({ message: "Hội đồng không ở trạng thái cho phép chấm điểm!" });
    }

    const isMember = [
      council.chairman.toString(),
      council.secretary.toString(),
      ...council.members.map((id) => id.toString())
    ].includes(userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "Bạn không phải thành viên hội đồng này!" });
    }

    const existingScore = council.scores.find((s) => s.user.toString() === userId.toString());
    if (existingScore) {
      return res.status(400).json({ message: "Bạn đã chấm điểm cho đề tài này và không thể chỉnh sửa!" });
    }

    council.scores.push({
      user: userId,
      score,
      comment: comment || "",
      scoredAt: new Date()
    });

    // Kiểm tra số lượng điểm so với số thành viên hội đồng
    const totalMembers = 1 + 1 + council.members.length; // Chủ tịch + Thư ký + Thành viên
    if (council.scores.length === totalMembers) {
      council.status = "completed";
    }

    await council.save();

    const topic = await Topic.findById(council.topic);
    const notifications = [
      {
        recipient: topic.supervisor,
        message: `Đề tài "${topic.topicName}" đã được chấm điểm bởi ${req.user.name}.`,
      },
      ...topic.teamMembers.map((member) => ({
        recipient: member,
        message: `Đề tài "${topic.topicName}" đã được chấm điểm bởi ${req.user.name}.`,
      })),
    ];
    if (council.status === "completed") {
      notifications.push({
        recipient: council.createdBy,
        message: `Hội đồng chấm điểm cho đề tài "${topic.topicName}" đã hoàn thành.`,
      });
    }
    await Notification.insertMany(notifications);

    res.json({ message: "Chấm điểm thành công!", council });
  } catch (error) {
    console.error("Lỗi khi chấm điểm:", error.message);
    res.status(500).json({ message: "Lỗi khi chấm điểm!", error: error.message });
  }
});

// Xóa hội đồng
router.delete("/delete", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin có quyền xóa hội đồng!" });
    }

    const { councilId } = req.body;
    if (!councilId) {
      return res.status(400).json({ message: "Thiếu thông tin councilId!" });
    }

    const council = await Council.findById(councilId);
    if (!council) {
      return res.status(404).json({ message: "Không tìm thấy hội đồng!" });
    }

    council.status = "uniadmin-rejected"; // Đánh dấu xóa bằng trạng thái
    await council.save();

    const topic = await Topic.findById(council.topic);
    topic.council = null;
    await topic.save();

    const notifications = [
      {
        recipient: council.chairman,
        message: `Hội đồng chấm điểm cho đề tài "${topic.topicName}" đã bị xóa.`,
      },
      {
        recipient: council.secretary,
        message: `Hội đồng chấm điểm cho đề tài "${topic.topicName}" đã bị xóa.`,
      },
      ...council.members.map((id) => ({
        recipient: id,
        message: `Hội đồng chấm điểm cho đề tài "${topic.topicName}" đã bị xóa.`,
      })),
    ];
    await Notification.insertMany(notifications);

    res.json({ message: "Hội đồng đã được xóa thành công!" });
  } catch (error) {
    console.error("Lỗi khi xóa hội đồng:", error.message);
    res.status(500).json({ message: "Lỗi khi xóa hội đồng!", error: error.message });
  }
});

// Lấy danh sách hội đồng công khai
router.get("/public-list", authMiddleware, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Bạn không có quyền truy cập danh sách này!" });
  }
  try {
    const councils = await Council.find({ "scores.0": { $exists: true }, status: "completed" })
      .populate("topic", "topicName")
      .populate("chairman", "name")
      .populate({
        path: "scores.user",
        select: "name",
        match: { _id: { $exists: true } }
      })
      .lean();

    const filteredCouncils = await Promise.all(
      councils.map(async (c) => {
        const averageScore =
          c.scores.length > 0
            ? c.scores.reduce((sum, s) => sum + s.score, 0) / c.scores.length
            : 0;
        if (averageScore <= 80) return null;

        const reports = await Report.find({
          topic: c.topic._id,
          status: "approved",
          submittedToAdmin: true,
          isDeleted: false,
        }).select("file reportContent period _id publicId");

        return { ...c, averageScore, reports };
      })
    );

    res.json(filteredCouncils.filter((c) => c !== null));
  } catch (error) {
    console.error("Lỗi khi lấy danh sách đề tài công khai:", error.message);
    res.status(500).json({ message: "Lỗi khi lấy danh sách đề tài!", error: error.message });
  }
});

// Tải báo cáo
router.get("/report/:reportId/download", authMiddleware, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Bạn không có quyền tải tài liệu!" });
  }
  try {
    const report = await Report.findById(req.params.reportId);
    if (!report || report.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy báo cáo!" });
    }
    if (report.status !== "approved" || !report.submittedToAdmin) {
      return res.status(403).json({ message: "Báo cáo chưa được phê duyệt hoặc chưa gửi lên admin!" });
    }

    const fileUrl = report.file;
    const fileName = report.publicId || fileUrl.split("/").pop().split("?")[0];

    https.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        return res.status(404).json({ message: "Không thể tải file từ Cloudinary!" });
      }

      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
      response.pipe(res);
    }).on("error", (error) => {
      console.error("Lỗi khi tải file từ Cloudinary:", error.message);
      res.status(500).json({ message: "Lỗi khi tải file từ Cloudinary!", error: error.message });
    });
  } catch (error) {
    console.error("Lỗi khi tải báo cáo:", error.message);
    res.status(500).json({ message: "Lỗi khi tải báo cáo!", error: error.message });
  }
});

// Tải file phê duyệt
router.get("/approval-document/:councilId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "uniadmin") {
      return res.status(403).json({ message: "Chỉ admin hoặc uniadmin có quyền tải tài liệu phê duyệt!" });
    }

    const council = await Council.findById(req.params.councilId);
    if (!council) {
      return res.status(404).json({ message: "Không tìm thấy hội đồng!" });
    }
    if (!council.approvalDocument || !council.approvalDocument.url) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu phê duyệt!" });
    }

    const fileUrl = council.approvalDocument.url;
    const fileName = council.approvalDocument.publicId.split("/").pop();

    https.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        return res.status(404).json({ message: "Không thể tải file từ Cloudinary!" });
      }

      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      response.pipe(res);
    }).on("error", (error) => {
      console.error("Lỗi khi tải file từ Cloudinary:", error.message);
      res.status(500).json({ message: "Lỗi khi tải file từ Cloudinary!", error: error.message });
    });
  } catch (error) {
    console.error("Lỗi khi tải tài liệu phê duyệt:", error.message);
    res.status(500).json({ message: "Lỗi khi tải tài liệu phê duyệt!", error: error.message });
  }
});

module.exports = router;