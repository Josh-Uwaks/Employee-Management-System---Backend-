
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
  lockAccount,
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  changePassword
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth.middleware');
const { 
  isSuperAdmin, 
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

// Request password reset (public)
router.post('/forgot-password', requestPasswordReset);

// Verify reset token (public)
router.post('/verify-reset-token', verifyResetToken);

// Reset password with token (public)
router.post('/reset-password', resetPassword);

// Change password (authenticated user)
router.post('/change-password', authMiddleware, changePassword);

module.exports = router
