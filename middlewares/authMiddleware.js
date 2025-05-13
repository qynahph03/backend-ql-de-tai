//backend/middlewares/authMiddleware.js

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header("Authorization").replace("Bearer ", "");
        if (!token) {
            return res.status(401).json({ message: "Không có token, từ chối truy cập" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("📌 Decoded Token:", decoded); // In token đã giải mã

        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "Người dùng không tồn tại" });
        }

        req.user = user; // Gán user vào request
        req.token = token; // Gán token vào request
        console.log("📌 User từ token:", req.user);

        next();
    } catch (error) {
        console.error("❌ Lỗi xác thực:", error.message);
        res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }
};

module.exports = authMiddleware;
