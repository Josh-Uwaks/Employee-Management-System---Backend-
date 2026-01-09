const mongoose = require('mongoose');
const User = require('../models/staff');
const Department = require('../models/department');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');
const { generateOTP } = require('../utils/otp');
const { sendOtpEmail } = require('../services/otpEmail.service');
const { 
  sendAccountLockedNotification, 
  sendAccountUnlockedNotification 
} = require('../services/adminNotification');

// ===========================
// HTTP Status Codes
// ===========================
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  INTERNAL_SERVER_ERROR: 500
};

// ===========================
// Success Messages
// ===========================
const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  REGISTRATION_SUCCESS: 'User registered successfully',
  OTP_VERIFIED: 'Account verified successfully',
  OTP_RESENT: 'New verification code sent',
  ACCOUNT_UNLOCKED: 'Account unlocked successfully',
  ACCOUNT_LOCKED: 'Account locked successfully',
  LOCKED_ACCOUNTS_FETCHED: 'Locked accounts retrieved successfully',
  OTP_STATUS_CHECKED: 'OTP status checked successfully'
};

// ===========================
// Error Messages
// ===========================
const ERROR_MESSAGES = {
  // Authentication Errors
  CREDENTIALS_REQUIRED: 'ID card and password are required',
  INVALID_ID_FORMAT: 'ID Card must follow format KE175',
  INVALID_CREDENTIALS: 'Invalid ID card or password',
  ACCOUNT_LOCKED: 'Account is locked',
  ACCOUNT_NOT_LOCKED: 'Account is not locked',
  ACCOUNT_ALREADY_LOCKED: 'Account is already locked',
  UNAUTHORIZED: 'Unauthorized',
  ADMIN_ACCESS_REQUIRED: 'Admin access required',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  
  // Registration Errors
  USER_EXISTS: 'User with same ID card or email already exists',
  INVALID_DEPARTMENT: 'Invalid or inactive department',
  STAFF_MANAGER_REQUIRED: 'Staff must be assigned to a line manager',
  INVALID_MANAGER: 'Invalid line manager',
  
  // OTP Errors
  OTP_REQUIRED: 'ID card and OTP are required',
  INVALID_OTP_FORMAT: 'OTP must be a 6-digit number',
  INVALID_EXPIRED_OTP: 'Invalid or expired OTP',
  ACCOUNT_ALREADY_VERIFIED: 'Account is already verified',
  
  // System Errors
  AUTH_FAILED: 'Authentication failed',
  REGISTRATION_FAILED: 'Registration failed',
  OTP_VERIFICATION_FAILED: 'OTP verification failed',
  OTP_RESEND_FAILED: 'Failed to resend verification code',
  UNLOCK_FAILED: 'Failed to unlock account',
  LOCK_FAILED: 'Failed to lock account',
  RETRIEVAL_FAILED: 'Failed to retrieve locked accounts',
  NOTIFICATION_FAILED: 'Failed to send notifications',
  SERVER_ERROR: 'An internal server error occurred'
};

// ===========================
// Helper Functions
// ===========================

/**
 * Get notification recipients based on user role
 */
const getNotificationRecipients = async (lockedUser) => {
  try {
    const recipients = [];
    
    console.log(`[NOTIFICATION] Determining recipients for: ${lockedUser.id_card} (${lockedUser.role})`);
    
    // 1. If user reports to someone (STAFF), notify their manager
    if (lockedUser.role === 'STAFF' && lockedUser.reportsTo && lockedUser.reportsTo.email) {
      recipients.push({
        email: lockedUser.reportsTo.email,
        type: 'MANAGER',
        name: `${lockedUser.reportsTo.first_name} ${lockedUser.reportsTo.last_name}`,
        role: lockedUser.reportsTo.role
      });
      console.log(`[NOTIFICATION] Adding manager: ${lockedUser.reportsTo.email}`);
    }
    
    // 2. Always notify SUPER_ADMINs for oversight
    const superAdmins = await User.find({
      role: 'SUPER_ADMIN',
      is_active: true
    }).select('email first_name last_name').limit(5);
    
    superAdmins.forEach(admin => {
      const exists = recipients.some(r => r.email === admin.email);
      if (!exists) {
        recipients.push({
          email: admin.email,
          type: 'SUPER_ADMIN',
          name: `${admin.first_name} ${admin.last_name}`,
          role: 'SUPER_ADMIN'
        });
        console.log(`[NOTIFICATION] Adding super admin: ${admin.email}`);
      }
    });
    
    console.log(`[NOTIFICATION] Total recipients: ${recipients.length}`);
    return recipients;
    
  } catch (error) {
    console.error('[NOTIFICATION] Failed to get recipients:', error.message);
    return [];
  }
};

/**
 * Check if admin can manage target user based on roles
 */
const canAdminManageUser = (adminUser, targetUser) => {
  // SUPER_ADMIN can manage anyone
  if (adminUser.role === 'SUPER_ADMIN') {
    return true;
  }
  
  // LINE_MANAGER can only manage their direct reports
  if (adminUser.role === 'LINE_MANAGER') {
    return targetUser.role === 'STAFF' && 
           targetUser.reportsTo && 
           targetUser.reportsTo.toString() === adminUser.id;
  }
  
  return false;
};

// ===========================
// Authentication Controllers
// ===========================

/**
 * Login user
 */
const loginUser = async (req, res) => {
  try {
    const { id_card, password } = req.body;

    // Validate required fields
    if (!id_card || !password) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.CREDENTIALS_REQUIRED
      });
    }

    // Validate ID card format
    if (!/^KE\d{3}$/.test(id_card)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID_FORMAT
      });
    }

    // CRITICAL FIX: Populate reportsTo for proper authorization
    const user = await User.findOne({ id_card })
      .populate('department reportsTo', 'id_card first_name last_name email role');

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (user.isLocked) {
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: ERROR_MESSAGES.ACCOUNT_LOCKED,
        locked: true,
        lockedAt: user.lockedAt,
        lockedReason: user.lockedReason
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      const lockedUser = await User.failedLogin(id_card);

      if (lockedUser) {
        console.log('[SECURITY] Account locked, sending notifications for:', lockedUser.id_card);
        
        try {
          const recipients = await getNotificationRecipients(lockedUser);
          const notificationEmails = recipients.map(r => r.email);
          
          if (notificationEmails.length > 0) {
            await sendAccountLockedNotification(lockedUser, notificationEmails, {
              lockedBy: 'System (auto-lock)',
              lockedByRole: 'SYSTEM',
              reason: '3 consecutive failed login attempts'
            });
            console.log(`[NOTIFICATION] Sent to ${notificationEmails.length} recipient(s)`);
          } else {
            console.log('[NOTIFICATION] No recipients found for notification');
          }
        } catch (notificationError) {
          console.error('[NOTIFICATION] Failed to send:', notificationError.message);
        }

        return res.status(HTTP_STATUS.LOCKED).json({
          success: false,
          status: HTTP_STATUS.LOCKED,
          message: 'Account locked due to multiple failed login attempts',
          locked: true,
          lockedAt: lockedUser.lockedAt,
          lockedReason: lockedUser.lockedReason
        });
      }

      const updatedUser = await User.findOne({ id_card });
      const attemptsRemaining = 3 - updatedUser.loginAttempts;
      
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        message: `Invalid ID card or password. ${attemptsRemaining} attempt(s) remaining before account lock.`,
        attemptsRemaining
      });
    }

    await User.successfulLogin(id_card);

    if (!user.isVerified) {
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
      await user.save();

      await sendOtpEmail({
        email: user.email,
        first_name: user.first_name,
        otp
      });

      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Account not verified. OTP sent to email.',
        requiresVerification: true,
        userInfo: {
          id_card: user.id_card,
          email: user.email,
          first_name: user.first_name
        }
      });
    }

    const token = signToken({
      id: user._id,
      id_card: user.id_card,
      role: user.role,
      isAdmin: user.isAdmin
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      token,
      user: {
        _id: user._id,
        id_card: user.id_card,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        department: user.department,
        position: user.position,
        reportsTo: user.reportsTo,
        region: user.region,
        branch: user.branch,
        isAdmin: user.isAdmin,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('[AUTH] Login error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.AUTH_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Register new user
 */
const registerUser = async (req, res) => {
  try {
    // Check authorization - Only SUPER_ADMIN can register users
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Only SUPER_ADMIN can register new users'
      });
    }

    const {
      id_card,
      email,
      password,
      first_name,
      last_name,
      region,
      branch,
      department,
      position,
      role = 'STAFF',
      reportsTo
    } = req.body;

    // Validate ID card format
    if (!/^KE\d{3}$/.test(id_card)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID_FORMAT
      });
    }

    // Check for existing user
    const exists = await User.findOne({ $or: [{ id_card }, { email }] });
    if (exists) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES.USER_EXISTS
      });
    }

    // Validate department
    const dept = await Department.findOne({ _id: department, isActive: true });
    if (!dept) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_DEPARTMENT
      });
    }

    // Role-based reporting rules
    let finalReportsTo = null;
    let isAdmin = false;

    if (role === 'STAFF') {
      if (!reportsTo) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.STAFF_MANAGER_REQUIRED
        });
      }

      const manager = await User.findOne({
        _id: reportsTo,
        role: 'LINE_MANAGER',
        is_active: true
      });

      if (!manager) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.INVALID_MANAGER
        });
      }

      finalReportsTo = manager._id;
    }

    if (role === 'LINE_MANAGER' || role === 'SUPER_ADMIN') {
      isAdmin = true;
      // SUPER_ADMIN cannot report to anyone
      finalReportsTo = null;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      id_card,
      email,
      password: hashedPassword,
      first_name,
      last_name,
      region,
      branch,
      department,
      position,
      role,
      reportsTo: finalReportsTo,
      isAdmin,
      // Admin-registered users should still verify via OTP
      isVerified: false
    });

    // Generate and send OTP for email verification
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendOtpEmail({
      email: user.email,
      first_name: user.first_name,
      otp
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      status: HTTP_STATUS.CREATED,
      message: 'User registered successfully. Verification email sent.',
      user: {
        id_card: user.id_card,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        department: dept.name,
        position: user.position,
        reportsTo: user.reportsTo
      }
    });

  } catch (error) {
    console.error('[ADMIN] Registration error:', error.message);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: `${field} already exists`
      });
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.REGISTRATION_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ===========================
// OTP Management Controllers
// ===========================

/**
 * Verify OTP
 */
const verifyOtp = async (req, res) => {
  try {
    const { id_card, otp } = req.body;

    // Validate required fields
    if (!id_card || !otp) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.OTP_REQUIRED
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (user.isLocked) {
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: ERROR_MESSAGES.ACCOUNT_LOCKED,
        locked: true
      });
    }

    if (user.isVerified) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.ACCOUNT_ALREADY_VERIFIED
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_OTP_FORMAT
      });
    }

    if (user.otp !== otp || !user.otpExpiresAt || user.otpExpiresAt < Date.now()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_EXPIRED_OTP
      });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.OTP_VERIFIED
    });

  } catch (error) {
    console.error('[AUTH] OTP verification error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.OTP_VERIFICATION_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Resend OTP
 */
const resendOtp = async (req, res) => {
  try {
    const { id_card } = req.body;
    
    // Validate required field
    if (!id_card) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card is required'
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (user.isLocked) {
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: ERROR_MESSAGES.ACCOUNT_LOCKED,
        locked: true
      });
    }

    if (user.isVerified) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.ACCOUNT_ALREADY_VERIFIED
      });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    await user.save();
    
    await sendOtpEmail({
      email: user.email,
      first_name: user.first_name,
      otp
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.OTP_RESENT,
      expiresAt: user.otpExpiresAt,
      email: user.email
    });

  } catch (error) {
    console.error('[AUTH] Resend OTP error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.OTP_RESEND_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check OTP status
 */
const checkOtpStatus = async (req, res) => {
  try {
    const { id_card } = req.body;
    
    if (!id_card) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card is required'
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.OTP_STATUS_CHECKED,
      data: {
        isVerified: user.isVerified,
        hasOtp: !!user.otp,
        otpExpiresAt: user.otpExpiresAt,
        email: user.email,
        isLocked: user.isLocked,
        lockedAt: user.lockedAt,
        lockedReason: user.lockedReason
      }
    });
  } catch (error) {
    console.error('[AUTH] Check OTP status error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ===========================
// Admin Account Management
// ===========================

/**
 * Unlock user account
 */
const unlockAccount = async (req, res) => {
  try {
    const { id_card } = req.body;
    
    // Check authorization
    if (!req.user.isAdmin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED
      });
    }

    const targetUser = await User.findOne({ id_card });
    if (!targetUser) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    // Check if admin can manage this user
    if (!canAdminManageUser(req.user, targetUser) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Pass admin role for authorization check
    const user = await User.unlockAccount(id_card, req.user.id_card, req.user.role);

    // Send notification
    await sendAccountUnlockedNotification(
      user,
      `${req.user.first_name} ${req.user.last_name} (${req.user.role})`
    );

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.ACCOUNT_UNLOCKED,
      unlockedBy: {
        id_card: req.user.id_card,
        name: `${req.user.first_name} ${req.user.last_name}`,
        role: req.user.role
      },
      user: {
        id_card: user.id_card,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });

  } catch (error) {
    console.error('[ADMIN] Unlock account error:', error.message);
    
    if (error.message === 'User not found') {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }
    
    if (error.message === 'Account is not locked') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.ACCOUNT_NOT_LOCKED
      });
    }
    
    if (error.message.includes('Unauthorized')) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: error.message,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.UNLOCK_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all locked accounts
 */
const getLockedAccounts = async (req, res) => {
  try {
    // Check authorization
    if (!req.user.isAdmin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED
      });
    }

    const lockedAccounts = await User.getLockedAccounts();
    
    // Filter based on user's role
    let filteredAccounts = lockedAccounts;
    
      if (req.user.role === 'LINE_MANAGER') {
    filteredAccounts = lockedAccounts.filter(account => {
      // Only show STAFF that report to this LINE_MANAGER
      return account.role === 'STAFF' && 
            account.reportsTo && 
            account.reportsTo._id.toString() === req.user._id.toString();
    });
  }
    
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.LOCKED_ACCOUNTS_FETCHED,
      data: {
        count: filteredAccounts.length,
        totalCount: lockedAccounts.length,
        userRole: req.user.role,
        accounts: filteredAccounts
      }
    });
  } catch (error) {
    console.error('[ADMIN] Get locked accounts error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.RETRIEVAL_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Manually lock user account
 */
const lockAccount = async (req, res) => {
  try {
    const { id_card, reason } = req.body;
    
    // Check authorization
    if (!req.user.isAdmin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED
      });
    }

    const targetUser = await User.findOne({ id_card }).populate('reportsTo');
    if (!targetUser) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }
    
    // CRITICAL: Prevent users from locking their own accounts
    if (targetUser._id.toString() === req.user.id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'You cannot lock your own account',
        error: 'SELF_LOCK_NOT_ALLOWED'
      });
    }
    
    // CRITICAL: Prevent locking other SUPER_ADMIN accounts (unless you're also SUPER_ADMIN)
    if (targetUser.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Only SUPER_ADMIN can lock other SUPER_ADMIN accounts',
        error: 'INSUFFICIENT_PRIVILEGES'
      });
    }
    
    // Check if admin can manage this user
    if (!canAdminManageUser(req.user, targetUser) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const user = await User.lockAccount(
      id_card,
      req.user.id_card,
      reason || 'Manually locked by administrator'
    );

    // Send notifications
    const recipients = await getNotificationRecipients(user);
    const notificationEmails = recipients.map(r => r.email);
    
    if (notificationEmails.length) {
      await sendAccountLockedNotification(user, notificationEmails, {
        lockedBy: `${req.user.first_name} ${req.user.last_name}`,
        lockedByRole: req.user.role,
        reason: reason || 'Manually locked by administrator'
      });
      console.log(`[ADMIN] Manual lock notification sent to ${notificationEmails.length} recipient(s)`);
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.ACCOUNT_LOCKED,
      lockedBy: {
        id_card: req.user.id_card,
        name: `${req.user.first_name} ${req.user.last_name}`,
        role: req.user.role
      },
      user: {
        id_card: user.id_card,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        lockedAt: user.lockedAt,
        lockedReason: user.lockedReason
      }
    });

  } catch (error) {
    console.error('[ADMIN] Lock account error:', error.message);
    
    if (error.message === 'User not found') {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }
    
    if (error.message === 'Account is already locked') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.ACCOUNT_ALREADY_LOCKED
      });
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.LOCK_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ===========================
// Export Controllers
// ===========================
module.exports = {
  loginUser,
  registerUser,
  verifyOtp,
  resendOtp,
  checkOtpStatus,
  unlockAccount,
  getLockedAccounts,
  lockAccount
};