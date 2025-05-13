//backend/controllers/authController.js

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Đăng ký người dùng
const registerUser = async (req, res) => {
    try {
        const { name, username, password, role } = req.body;  // ✅ Lấy thêm role từ req.body

        // Kiểm tra role hợp lệ
        if (!["student", "teacher", "admin", "uniadmin"].includes(role)) {
            return res.status(400).json({ message: 'Vai trò không hợp lệ!' });
        }

        // Kiểm tra username đã tồn tại chưa
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ message: 'Tên đăng nhập đã được sử dụng!' });
        }

        // Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Tạo người dùng mới
        const newUser = await User.create({
            name,
            username,
            password: hashedPassword,
            role,
        });

        res.status(201).json({ message: 'Đăng ký thành công!', user: newUser });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server!', error: error.message });
    }
};

// Đăng nhập người dùng
const loginUser = async (req, res) => {
    const { username, password } = req.body;

    try {
        // Tìm người dùng theo username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: "Sai tên đăng nhập hoặc mật khẩu!" });
        }

        // So sánh mật khẩu đã mã hóa
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Sai tên đăng nhập hoặc mật khẩu!" });
        }

        // Tạo token với role chính xác từ database
        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: "5h" }
        );

        res.json({
            token,
            role: user.role,
            username: user.username,
            _id: user._id,
          });          
    } catch (error) {
        res.status(500).json({ message: "Lỗi server!", error: error.message });
    }
};

module.exports = { registerUser, loginUser };
