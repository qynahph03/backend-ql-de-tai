//backend/models/Notification.js

const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Người nhận
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false } // Đánh dấu đã đọc hay chưa
});

const Notification = mongoose.model("Notification", NotificationSchema);
module.exports = Notification;
