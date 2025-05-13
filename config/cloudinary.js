//backend/config/cloudinary.js

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Log cấu hình
console.log("Cloudinary config:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? "****" : "missing",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "****" : "missing",
});

// Cấu hình CloudinaryStorage
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    console.log("Processing file in CloudinaryStorage:", {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
    try {
      const extension = file.originalname.split(".").pop().toLowerCase();
      const isImage = ["jpg", "jpeg", "png", "gif"].includes(extension);
      const params = {
        folder: "reports",
        resource_type: isImage ? "image" : "raw",
        upload_preset: "ml_default", 
        format: extension,
      };
      if (isImage) {
        params.transformation = [{ quality: "auto" }];
      }
      console.log("Cloudinary upload params:", params);
      return params;
    } catch (error) {
      console.error("Error in CloudinaryStorage params:", {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },
});

// Cấu hình Multer
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    console.log("File received in fileFilter:", {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer ? `Buffer present: ${file.buffer.length} bytes` : "No buffer",
      encoding: file.encoding,
      fieldname: file.fieldname,
    });
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/x-msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/gif",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      console.log("File accepted:", file.mimetype);
      cb(null, true);
    } else {
      console.log("File rejected:", file.mimetype);
      cb(new Error(`File format not allowed: ${file.mimetype}`), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
});

module.exports = {
  cloudinary,
  storage,
  upload,
};