// File: backend/models/Topic.js

const mongoose = require("mongoose");
const Discussion = require("./Discussion");

const topicSchema = new mongoose.Schema({
  topicName: {
    type: String,
    required: true,
  },
  topicDescription: {
    type: String,
  },
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  teamMembers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  status: {
    type: String,
    enum: [
      "pending-teacher",
      "teacher-approve",
      "teacher-reject",
      "pending",
      "approved",
      "rejected",
      "canceled",
      "stop-performing",
      "stopped",
    ],
    default: "pending-teacher",
  },
  council: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Council",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware để cập nhật updatedAt
topicSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware tự động tạo Discussion khi status là "approved"
topicSchema.pre("save", async function (next) {
  if (this.isModified("status") && this.status === "approved") {
    try {
      const existingDiscussion = await Discussion.findOne({ topicId: this._id });
      if (!existingDiscussion) {
        const newDiscussion = new Discussion({
          topicId: this._id,
          messages: [],
        });
        await newDiscussion.save();
      }
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// Index để tối ưu truy vấn
topicSchema.index({ supervisor: 1 });
topicSchema.index({ teamMembers: 1 });
topicSchema.index({ council: 1 });

module.exports = mongoose.model("Topic", topicSchema);