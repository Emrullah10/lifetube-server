import express from 'express';
import {
  addComment,
  getComments,
  deleteComment
} from '../controllers/commentController.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/video/:videoId', getComments);

// Protected routes
router.post('/', authenticateToken, addComment);
router.delete('/:id', authenticateToken, deleteComment);

export default router;
