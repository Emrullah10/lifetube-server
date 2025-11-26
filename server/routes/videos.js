import express from 'express';
import multer from 'multer';
import {
  uploadVideo,
  getAllVideos,
  getVideoById,
  incrementViews,
  likeVideo,
  deleteVideo,
  getTrendingVideos
} from '../controllers/videoController.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// Configure multer for multiple files
const upload = multer({
  dest: 'uploads/temp',
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// Public routes
router.get('/', getAllVideos);
router.get('/trending', getTrendingVideos);
router.get('/:id', getVideoById);
router.post('/:id/view', incrementViews);

// Protected routes
router.post(
  '/upload',
  authenticateToken,
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  uploadVideo
);
router.post('/:id/like', authenticateToken, likeVideo);
router.delete('/:id', authenticateToken, deleteVideo);

export default router;
