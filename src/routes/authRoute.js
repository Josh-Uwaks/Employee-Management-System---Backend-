
const express = require('express');
const router = express.Router();
const {
  loginUser, 
  registerUser, 
  verifyOtp, 
  resendOtp, 
  checkOtpStatus, 
  getLockedAccounts, 
  unlockAccount, 
  lockAccount
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth.middleware');
const { 
  isSuperAdmin, 
  isLineManager, 
  isAdmin, 
  selfManagerOrSuperAdmin,
  lineManagerOrSuperAdmin 
} = require('../middleware/role.middleware');

// ===========================
// PUBLIC ROUTES (No authentication required)
// ===========================

// Login - public access
router.post('/login', loginUser);

// OTP verification - public access
router.post('/verify-otp', verifyOtp);

// Resend OTP - public access
router.post('/resend-otp', resendOtp);

// Check OTP status - public access
router.post('/check-otp-status', checkOtpStatus);

// ===========================
// PROTECTED ROUTES (Authentication required)
// ===========================

// Register new user - SUPER_ADMIN only
router.post('/register', authMiddleware, isSuperAdmin, registerUser);

// ===========================
// ACCOUNT MANAGEMENT ROUTES
// ===========================

// Get all locked accounts - LINE_MANAGER or SUPER_ADMIN
router.get('/locked-accounts', authMiddleware, lineManagerOrSuperAdmin, getLockedAccounts);

// Lock a specific account - LINE_MANAGER or SUPER_ADMIN
// Note: Authorization checks in controller for LINE_MANAGER can only lock their own staff
router.post('/lock-account', authMiddleware, lineManagerOrSuperAdmin, lockAccount);

// Unlock a specific account - LINE_MANAGER or SUPER_ADMIN
// Note: Authorization checks in controller for who can unlock based on role hierarchy
router.post('/unlock-account', authMiddleware, lineManagerOrSuperAdmin, unlockAccount);

// ===========================
// ADDITIONAL PROTECTED ROUTES (Example)
// ===========================

// Get my own profile (self)
// router.get('/profile/me', authMiddleware, (req, res, next) => {
//   // This would redirect to user profile or return current user data
//   res.json({
//     success: true,
//     user: req.user
//   });
// });

// // Change my password (self)
// router.post('/change-password', authMiddleware, async (req, res) => {
//   // This would be implemented in authController
//   res.json({
//     success: true,
//     message: 'Change password endpoint - implement in controller'
//   });
// });

// // Request password reset (public)
// router.post('/forgot-password', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Forgot password endpoint - implement in controller'
//   });
// });

// // Reset password with token (public)
// router.post('/reset-password', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Reset password endpoint - implement in controller'
//   });
// });


module.exports = router
