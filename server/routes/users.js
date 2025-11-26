import express from 'express';
import {
  getUserProfile,
  subscribe,
  getSubscriptions,
  getSubscriptionFeed,
  checkSubscription
} from '../controllers/userController.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/:id', getUserProfile);

// Protected routes
router.post('/subscribe', authenticateToken, subscribe);
router.get('/subscriptions/list', authenticateToken, getSubscriptions);
router.get('/subscriptions/feed', authenticateToken, getSubscriptionFeed);
router.get('/subscriptions/check/:channelId', authenticateToken, checkSubscription);

export default router;
