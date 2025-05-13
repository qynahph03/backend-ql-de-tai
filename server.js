// backend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const topicRoutes = require("./routes/topicRoutes");
const userRoutes = require("./routes/userRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const discussionRoutes = require("./routes/discussionRoutes");
const reportRoutes = require("./routes/reportRoutes");
const councilRoutes = require("./routes/councilRoutes");
const teaDashboardRoutes = require("./routes/teadashboardRoutes");
const adDashboardRoutes = require("./routes/addashboardRoutes");

const app = express();

// Kết nối MongoDB
connectDB().then(() => {
    console.log("📌 Đang kết nối database:", mongoose.connection.name);
}).catch(err => {
    console.error("❌ Lỗi kết nối database:", err);
});

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/auth', authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/topic", topicRoutes);
app.use("/api/notification", notificationRoutes);
app.use("/api/discussion", discussionRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/council", councilRoutes);
app.use("/api/teadashboard", teaDashboardRoutes);
app.use("/api/addashboard", adDashboardRoutes);


// Xử lý lỗi toàn cục
app.use((err, req, res, next) => {
    console.error("Chi tiết lỗi:", err);
    res.status(500).json({ message: "Đã xảy ra lỗi server!", error: err.message  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
