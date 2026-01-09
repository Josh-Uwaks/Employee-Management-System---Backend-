const express = require('express');
const router = express.Router();
const {
  getUser, 
  getUsers, 
  updateUser, 
  deleteUser,
  checkinUser,
  getUsersByLocation
} = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  isAdmin,
  isSuperAdmin,
  selfOrAdmin,
  selfManagerOrSuperAdmin
} = require('../middleware/role.middleware');

// Apply authentication to all routes
router.use(authMiddleware);

// ===========================
// USER MANAGEMENT ROUTES
// ===========================

// GET all users (Admin only)
router.get('/', isAdmin, getUsers);

// GET users by location (Admin only)
router.get('/location', isAdmin, getUsersByLocation);

// GET single user (Self or Admin)
router.get('/:id', selfOrAdmin, getUser);

// PUT update user (Self, Line Manager for their staff, or Super Admin)
router.put('/:id', selfManagerOrSuperAdmin, updateUser);

// POST checkin user (current user - self check-in)
router.post('/checkin', checkinUser);

// POST checkin user for other users (Admin only)
router.post('/:id/checkin', isAdmin, checkinUser);

// DELETE user (Super Admin only)
router.delete('/:id', isSuperAdmin, deleteUser);

module.exports = router;