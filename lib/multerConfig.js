// import multer from 'multer';
// import path from 'path';

// // Configure storage for videos
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'C:/Users/DELL/Desktop/uploads/'); // Directory to store videos
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     const fileExtension = path.extname(file.originalname); // Keep the original extension
//     cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
//   },
// });

// // File filter to allow only specific video types
// const fileFilter = (req, file, cb) => {
//   const allowedMimeTypes = ['video/mp4', 'video/mkv', 'video/webm', 'video/avi'];
//   if (allowedMimeTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error('Only video files are allowed!'), false);
//   }
// };

// // Multer instance
// export const upload = multer({
//   storage,
//   limits: { fileSize: 100 * 1024 * 1024 }, // 100MB size limit
//   fileFilter,
// });
