//backend/config/db.js

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);

        console.log(`✅ Đã kết nối MongoDB: ${conn.connection.name}`);
    } catch (error) {
        console.error(`❌ Lỗi kết nối database`, error);
        process.exit(1);
    }
};

module.exports = connectDB;
