// backend/models/Report.js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Topic",
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  file: {
    type: String,
    required: true,
  },
  publicId: {
    type: String,
  },
  reportContent: {
    type: String,
    required: true,
  },
  period: {
    type: String,
    required: true,
  },
  isEditable: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  submittedToAdmin: {
    type: Boolean,
    default: false, 
  },
});

module.exports = mongoose.model("Report", reportSchema);