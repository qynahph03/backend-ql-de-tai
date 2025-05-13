//backend/models/Council.js

const mongoose = require('mongoose');

const CouncilSchema = new mongoose.Schema({
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
  },
  chairman: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  secretary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  scores: [{
    score: {
      type: Number,
      required: true
    },
    comment: {
      type: String,
      default: ''
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    scoredAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['pending-creation', 'pending-uniadmin', 'uniadmin-approved', 'uniadmin-rejected', 'completed'],
    default: 'pending-creation',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvalDocument: {
    type: Object,
  },
  rejectReason: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  approvalHistory: [{
    uniadmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      enum: ['approved', 'rejected'],
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
});

module.exports = mongoose.model('Council', CouncilSchema);