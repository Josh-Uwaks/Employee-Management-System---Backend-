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
const { 
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
  sendPasswordChangeConfirmationEmail 
} = require('../services/passwordResetEmail.service');

// ===========================
// Development Mode Check
// ===========================
const isDevelopment = process.env.NODE_ENV === 'development';

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
  
  // Location Errors
  INVALID_REGION: 'Invalid region specified',
  INVALID_BRANCH: 'Invalid branch specified',
  INVALID_REGION_BRANCH_COMBO: 'Invalid region and branch combination',
  
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
    
    if (isDevelopment) {
      console.log('[DEV NOTIFICATION] Determining recipients for:', {
        id_card: lockedUser.id_card,
        role: lockedUser.role,
        name: `${lockedUser.first_name} ${lockedUser.last_name}`
      });
    }
    
    // 1. If user reports to someone (STAFF), notify their manager
    if (lockedUser.role === 'STAFF' && lockedUser.reportsTo && lockedUser.reportsTo.email) {
      recipients.push({
        email: lockedUser.reportsTo.email,
        type: 'MANAGER',
        name: `${lockedUser.reportsTo.first_name} ${lockedUser.reportsTo.last_name}`,
        role: lockedUser.reportsTo.role
      });
      if (isDevelopment) {
        console.log('[DEV NOTIFICATION] Adding manager:', lockedUser.reportsTo.email);
      }
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
        if (isDevelopment) {
          console.log('[DEV NOTIFICATION] Adding super admin:', admin.email);
        }
      }
    });
    
    if (isDevelopment) {
      console.log('[DEV NOTIFICATION] Total recipients:', recipients.length);
    }
    
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

/**
 * Validate region and branch combination
 */
const validateLocation = (region, branch) => {
  const validCombinations = {
    'Lagos': ['HQ', 'Alimosho'],
    'Delta': ['Warri'],
    'Osun': ['Osun']
  };

  if (!validCombinations[region]) {
    return { 
      valid: false, 
      message: ERROR_MESSAGES.INVALID_REGION
    };
  }

  if (!validCombinations[region].includes(branch)) {
    return { 
      valid: false, 
      message: ERROR_MESSAGES.INVALID_REGION_BRANCH_COMBO
    };
  }

  return { valid: true };
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

    if (isDevelopment) {
      console.log('[DEV LOGIN] Login attempt:', { id_card, hasPassword: !!password });
    }

    // Validate required fields
    if (!id_card || !password) {
      if (isDevelopment) {
        console.log('[DEV LOGIN] Missing required fields:', { id_card: !!id_card, password: !!password });
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.CREDENTIALS_REQUIRED
      });
    }

    // Validate ID card format
    if (!/^KE\d{3}$/.test(id_card)) {
      if (isDevelopment) {
        console.log('[DEV LOGIN] Invalid ID card format:', id_card);
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID_FORMAT
      });
    }

    // CRITICAL FIX: Populate reportsTo for proper authorization
    if (isDevelopment) {
      console.log('[DEV LOGIN] Looking up user:', id_card);
    }
    
    const user = await User.findOne({ id_card })
      .populate('department reportsTo', 'id_card first_name last_name email role');

    if (!user) {
      if (isDevelopment) {
        console.log('[DEV LOGIN] User not found:', id_card);
      }
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (isDevelopment) {
      console.log('[DEV LOGIN] User found:', {
        id: user._id,
        email: user.email,
        role: user.role,
        isLocked: user.isLocked,
        isVerified: user.isVerified,
        loginAttempts: user.loginAttempts
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV LOGIN] Account is locked:', {
          lockedAt: user.lockedAt,
          lockedReason: user.lockedReason
        });
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: ERROR_MESSAGES.ACCOUNT_LOCKED,
        locked: true,
        lockedAt: user.lockedAt,
        lockedReason: user.lockedReason
      });
    }

    if (isDevelopment) {
      console.log('[DEV LOGIN] Checking password...');
    }
    
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      if (isDevelopment) {
        console.log('[DEV LOGIN] Password mismatch');
      }
      
      const lockedUser = await User.failedLogin(id_card);

      if (lockedUser) {
        if (isDevelopment) {
          console.log('[DEV LOGIN] Account locked after failed attempts:', {
            loginAttempts: lockedUser.loginAttempts,
            lockedAt: lockedUser.lockedAt,
            lockedReason: lockedUser.lockedReason
          });
        }
        
        try {
          const recipients = await getNotificationRecipients(lockedUser);
          const notificationEmails = recipients.map(r => r.email);
          
          if (notificationEmails.length > 0) {
            if (isDevelopment) {
              console.log('[DEV NOTIFICATION] Sending lock notifications to:', notificationEmails);
            }
            await sendAccountLockedNotification(lockedUser, notificationEmails, {
              lockedBy: 'System (auto-lock)',
              lockedByRole: 'SYSTEM',
              reason: '3 consecutive failed login attempts'
            });
            if (isDevelopment) {
              console.log(`[DEV NOTIFICATION] Sent to ${notificationEmails.length} recipient(s)`);
            }
          } else {
            if (isDevelopment) {
              console.log('[DEV NOTIFICATION] No recipients found for notification');
            }
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
      
      if (isDevelopment) {
        console.log('[DEV LOGIN] Failed attempt, remaining:', attemptsRemaining);
      }
      
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        message: `Invalid ID card or password. ${attemptsRemaining} attempt(s) remaining before account lock.`,
        attemptsRemaining
      });
    }

    if (isDevelopment) {
      console.log('[DEV LOGIN] Password correct, logging successful login');
    }
    
    await User.successfulLogin(id_card);

    // Update last checkin location
    user.lastCheckinAt = new Date();
    user.lastCheckinRegion = user.region;
    user.lastCheckinBranch = user.branch;
    await user.save();

    if (!user.isVerified) {
      if (isDevelopment) {
        console.log('[DEV LOGIN] User not verified, generating OTP');
      }
      
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
      await user.save();

      await sendOtpEmail({
        email: user.email,
        first_name: user.first_name,
        otp,
        id_card: user.id_card,
        password: password
      });

      if (isDevelopment) {
        console.log('[DEV LOGIN] OTP sent to:', user.email);
      }

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

    if (isDevelopment) {
      console.log('[DEV LOGIN] Generating JWT token');
    }
    
    const token = signToken({
      id: user._id,
      id_card: user.id_card,
      role: user.role,
      isAdmin: user.isAdmin
    });

    if (isDevelopment) {
      console.log('[DEV LOGIN] Login successful for user:', {
        id: user._id,
        id_card: user.id_card,
        role: user.role
      });
    }

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
    
    if (isDevelopment) {
      console.error('[DEV LOGIN] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.AUTH_FAILED,
      error: isDevelopment ? error.message : undefined
    });
  }
};


/**
 * Register new user
 */
const registerUser = async (req, res) => {
  try {
    // Check authorization - Only SUPER_ADMIN can register users
    if (isDevelopment) {
      console.log('[DEV REGISTER] Registration attempt by:', {
        userId: req.user.id,
        role: req.user.role,
        id_card: req.user.id_card
      });
    }
    
    if (req.user.role !== 'SUPER_ADMIN') {
      if (isDevelopment) {
        console.log('[DEV REGISTER] Unauthorized - not SUPER_ADMIN');
      }
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
      region = 'Lagos',
      branch = 'HQ',
      department,
      position,
      role = 'STAFF',
      reportsTo
    } = req.body;

    if (isDevelopment) {
      console.log('[DEV REGISTER] Registration data:', {
        id_card,
        email,
        first_name,
        last_name,
        region,
        branch,
        department,
        position,
        role,
        reportsTo
      });
    }

    // Validate ID card format
    if (!/^KE\d{3}$/.test(id_card)) {
      if (isDevelopment) {
        console.log('[DEV REGISTER] Invalid ID card format:', id_card);
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID_FORMAT
      });
    }

    // Validate location combination
    const locationValidation = validateLocation(region, branch);
    if (!locationValidation.valid) {
      if (isDevelopment) {
        console.log('[DEV REGISTER] Invalid location:', { region, branch });
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: locationValidation.message
      });
    }

    // Check for existing user
    if (isDevelopment) {
      console.log('[DEV REGISTER] Checking for existing user...');
    }
    
    const exists = await User.findOne({ $or: [{ id_card }, { email }] });
    if (exists) {
      if (isDevelopment) {
        console.log('[DEV REGISTER] User already exists:', {
          existingIdCard: exists.id_card,
          existingEmail: exists.email
        });
      }
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES.USER_EXISTS
      });
    }

    // Validate department
    if (isDevelopment) {
      console.log('[DEV REGISTER] Validating department:', department);
    }
    
    const dept = await Department.findOne({ _id: department, isActive: true });
    if (!dept) {
      if (isDevelopment) {
        console.log('[DEV REGISTER] Invalid department:', department);
      }
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
        if (isDevelopment) {
          console.log('[DEV REGISTER] STAFF requires reportsTo');
        }
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.STAFF_MANAGER_REQUIRED
        });
      }

      // CHANGED: Allow STAFF to report to LINE_MANAGER or SUPER_ADMIN
      const manager = await User.findOne({
        _id: reportsTo,
        $or: [
          { role: 'LINE_MANAGER' },
          { role: 'SUPER_ADMIN' }
        ],
        is_active: true
      });

      if (!manager) {
        if (isDevelopment) {
          console.log('[DEV REGISTER] Invalid manager:', reportsTo);
        }
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: 'Manager must be either LINE_MANAGER or SUPER_ADMIN'
        });
      }

      finalReportsTo = manager._id;
    }

    if (role === 'LINE_MANAGER' || role === 'SUPER_ADMIN') {
      isAdmin = true;
      // SUPER_ADMIN cannot report to anyone
      // LINE_MANAGER cannot report to anyone either
      finalReportsTo = null;
    }

    if (isDevelopment) {
      console.log('[DEV REGISTER] Creating user with:', {
        role,
        isAdmin,
        reportsTo: finalReportsTo
      });
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
      isVerified: false
    });

    // Generate and send OTP for email verification
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
    await user.save();

    if (isDevelopment) {
      console.log('[DEV REGISTER] Generated OTP for user:', {
        id_card: user.id_card,
        email: user.email,
        otp
      });
    }

    // Send email with username and password
    await sendOtpEmail({
      email: user.email,
      first_name: user.first_name,
      otp,
      id_card: user.id_card,
      password: password
    });

    if (isDevelopment) {
      console.log('[DEV REGISTER] User registered and credentials sent:', {
        id_card: user.id_card,
        email: user.email,
        hashedPassword: '********'
      });
    }

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      status: HTTP_STATUS.CREATED,
      message: 'User registered successfully. Verification email with credentials sent.',
      user: {
        id_card: user.id_card,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        region: user.region,
        branch: user.branch,
        department: dept.name,
        position: user.position,
        reportsTo: user.reportsTo
      }
    });

  } catch (error) {
    console.error('[ADMIN] Registration error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV REGISTER] Full error:', error);
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      if (isDevelopment) {
        console.log('[DEV REGISTER] Duplicate key error:', field);
      }
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
      error: isDevelopment ? error.message : undefined
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

    if (isDevelopment) {
      console.log('[DEV OTP] Verify OTP attempt:', { id_card, otp });
    }

    // Validate required fields
    if (!id_card || !otp) {
      if (isDevelopment) {
        console.log('[DEV OTP] Missing required fields');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.OTP_REQUIRED
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV OTP] User not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV OTP] Account is locked');
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: ERROR_MESSAGES.ACCOUNT_LOCKED,
        locked: true
      });
    }

    if (user.isVerified) {
      if (isDevelopment) {
        console.log('[DEV OTP] Account already verified');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.ACCOUNT_ALREADY_VERIFIED
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      if (isDevelopment) {
        console.log('[DEV OTP] Invalid OTP format:', otp);
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_OTP_FORMAT
      });
    }

    if (isDevelopment) {
      console.log('[DEV OTP] Checking OTP:', {
        userOTP: user.otp,
        providedOTP: otp,
        expiresAt: user.otpExpiresAt,
        currentTime: Date.now()
      });
    }

    if (user.otp !== otp || !user.otpExpiresAt || user.otpExpiresAt < Date.now()) {
      if (isDevelopment) {
        console.log('[DEV OTP] Invalid or expired OTP');
      }
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

    if (isDevelopment) {
      console.log('[DEV OTP] OTP verified successfully for:', id_card);
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.OTP_VERIFIED
    });

  } catch (error) {
    console.error('[AUTH] OTP verification error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV OTP] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.OTP_VERIFICATION_FAILED,
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Resend OTP
 */
const resendOtp = async (req, res) => {
  try {
    const { id_card } = req.body;
    
    if (isDevelopment) {
      console.log('[DEV OTP] Resend OTP request:', { id_card });
    }

    // Validate required field
    if (!id_card) {
      if (isDevelopment) {
        console.log('[DEV OTP] ID card required');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card is required'
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV OTP] User not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV OTP] Account is locked');
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: ERROR_MESSAGES.ACCOUNT_LOCKED,
        locked: true
      });
    }

    if (user.isVerified) {
      if (isDevelopment) {
        console.log('[DEV OTP] Account already verified');
      }
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
    
    if (isDevelopment) {
      console.log('[DEV OTP] Generated new OTP:', {
        id_card: user.id_card,
        email: user.email,
        otp,
        expiresAt: user.otpExpiresAt
      });
    }

    await sendOtpEmail({
      email: user.email,
      first_name: user.first_name,
      otp,
    });

    if (isDevelopment) {
      console.log('[DEV OTP] OTP sent to:', user.email);
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.OTP_RESENT,
      expiresAt: user.otpExpiresAt,
      email: user.email
    });

  } catch (error) {
    console.error('[AUTH] Resend OTP error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV OTP] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.OTP_RESEND_FAILED,
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Check OTP status
 */
const checkOtpStatus = async (req, res) => {
  try {
    const { id_card } = req.body;
    
    if (isDevelopment) {
      console.log('[DEV OTP] Check OTP status request:', { id_card });
    }

    if (!id_card) {
      if (isDevelopment) {
        console.log('[DEV OTP] ID card required');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card is required'
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV OTP] User not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    if (isDevelopment) {
      console.log('[DEV OTP] OTP status:', {
        isVerified: user.isVerified,
        hasOtp: !!user.otp,
        otpExpiresAt: user.otpExpiresAt,
        isLocked: user.isLocked
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
    
    if (isDevelopment) {
      console.error('[DEV OTP] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: isDevelopment ? error.message : undefined
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
    
    if (isDevelopment) {
      console.log('[DEV ADMIN] Unlock account request:', {
        adminId: req.user.id,
        adminRole: req.user.role,
        targetIdCard: id_card
      });
    }

    // Check authorization
    if (!req.user.isAdmin) {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Unauthorized - not admin');
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED
      });
    }

    const targetUser = await User.findOne({ id_card });
    if (!targetUser) {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Target user not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }

    // Check if admin can manage this user
    if (!canAdminManageUser(req.user, targetUser) && req.user.role !== 'SUPER_ADMIN') {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Insufficient permissions:', {
          adminRole: req.user.role,
          targetRole: targetUser.role
        });
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Pass admin role for authorization check
    const user = await User.unlockAccount(id_card, req.user.id_card, req.user.role);

    if (isDevelopment) {
      console.log('[DEV ADMIN] Account unlocked:', {
        id_card: user.id_card,
        unlockedBy: req.user.id_card
      });
    }

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
    
    if (isDevelopment) {
      console.error('[DEV ADMIN] Full error:', error);
    }
    
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
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Get all locked accounts
 */
const getLockedAccounts = async (req, res) => {
  try {
    if (isDevelopment) {
      console.log('[DEV ADMIN] Get locked accounts request by:', {
        adminId: req.user.id,
        adminRole: req.user.role,
        adminIdCard: req.user.id_card
      });
    }

    // Check authorization
    if (!req.user.isAdmin) {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Unauthorized - not admin');
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED
      });
    }

    const lockedAccounts = await User.getLockedAccounts();
    
    if (isDevelopment) {
      console.log('[DEV ADMIN] All locked accounts:', lockedAccounts.length);
    }
    
    // Filter based on user's role
    let filteredAccounts = lockedAccounts;
    
    if (req.user.role === 'LINE_MANAGER') {
      filteredAccounts = lockedAccounts.filter(account => {
        // Only show STAFF that report to this LINE_MANAGER
        return account.role === 'STAFF' && 
              account.reportsTo && 
              account.reportsTo._id.toString() === req.user._id.toString();
      });
      
      if (isDevelopment) {
        console.log('[DEV ADMIN] Filtered for LINE_MANAGER:', filteredAccounts.length);
      }
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
    
    if (isDevelopment) {
      console.error('[DEV ADMIN] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.RETRIEVAL_FAILED,
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Manually lock user account
 */
const lockAccount = async (req, res) => {
  try {
    const { id_card, reason } = req.body;
    
    if (isDevelopment) {
      console.log('[DEV ADMIN] Lock account request:', {
        adminId: req.user.id,
        adminRole: req.user.role,
        adminIdCard: req.user.id_card,
        targetIdCard: id_card,
        reason
      });
    }

    // Check authorization
    if (!req.user.isAdmin) {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Unauthorized - not admin');
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_ACCESS_REQUIRED
      });
    }

    const targetUser = await User.findOne({ id_card }).populate('reportsTo');
    if (!targetUser) {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Target user not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS
      });
    }
    
    if (isDevelopment) {
      console.log('[DEV ADMIN] Target user found:', {
        id: targetUser._id,
        id_card: targetUser.id_card,
        role: targetUser.role,
        email: targetUser.email
      });
    }
    
    // CRITICAL: Prevent users from locking their own accounts
    if (targetUser._id.toString() === req.user.id) {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Self-lock attempt blocked');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'You cannot lock your own account',
        error: 'SELF_LOCK_NOT_ALLOWED'
      });
    }
    
    // CRITICAL: Prevent locking other SUPER_ADMIN accounts (unless you're also SUPER_ADMIN)
    if (targetUser.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Non-SUPER_ADMIN trying to lock SUPER_ADMIN');
      }
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Only SUPER_ADMIN can lock other SUPER_ADMIN accounts',
        error: 'INSUFFICIENT_PRIVILEGES'
      });
    }
    
    // Check if admin can manage this user
    if (!canAdminManageUser(req.user, targetUser) && req.user.role !== 'SUPER_ADMIN') {
      if (isDevelopment) {
        console.log('[DEV ADMIN] Insufficient permissions:', {
          adminRole: req.user.role,
          targetRole: targetUser.role,
          reportsTo: targetUser.reportsTo
        });
      }
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

    if (isDevelopment) {
      console.log('[DEV ADMIN] Account locked successfully:', {
        id_card: user.id_card,
        lockedAt: user.lockedAt,
        lockedReason: user.lockedReason
      });
    }

    // Send notifications
    const recipients = await getNotificationRecipients(user);
    const notificationEmails = recipients.map(r => r.email);
    
    if (notificationEmails.length) {
      if (isDevelopment) {
        console.log('[DEV NOTIFICATION] Sending lock notifications to:', notificationEmails);
      }
      await sendAccountLockedNotification(user, notificationEmails, {
        lockedBy: `${req.user.first_name} ${req.user.last_name}`,
        lockedByRole: req.user.role,
        reason: reason || 'Manually locked by administrator'
      });
      if (isDevelopment) {
        console.log(`[DEV NOTIFICATION] Sent to ${notificationEmails.length} recipient(s)`);
      }
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
        region: user.region,
        branch: user.branch,
        lockedAt: user.lockedAt,
        lockedReason: user.lockedReason
      }
    });

  } catch (error) {
    console.error('[ADMIN] Lock account error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV ADMIN] Full error:', error);
    }
    
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
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Request password reset
 */
const requestPasswordReset = async (req, res) => {
  try {
    const { id_card, email } = req.body;
    
    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Request:', { id_card, email });
    }

    // Validate required fields
    if (!id_card && !email) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] No credentials provided');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card or email is required'
      });
    }

    // Find user by id_card or email
    let user;
    if (id_card) {
      user = await User.findOne({ id_card });
    } else {
      user = await User.findOne({ email: email.toLowerCase() });
    }
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] User not found');
      }
      // Don't reveal if user exists for security
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        status: HTTP_STATUS.OK,
        message: 'If your account exists, a password reset email has been sent'
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Account is locked');
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: 'Account is locked. Please contact administrator to unlock before resetting password.',
        locked: true
      });
    }

    // Generate reset token (6-digit code)
    const resetToken = generateOTP();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    
    await user.save();

    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Generated token:', {
        id_card: user.id_card,
        email: user.email,
        resetToken,
        expiresAt: user.resetPasswordExpiresAt
      });
    }

    // Send password reset email
    await sendPasswordResetEmail({
      email: user.email,
      first_name: user.first_name,
      resetToken
    });

    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Reset email sent to:', user.email);
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: 'Password reset instructions sent to your email',
      email: user.email
    });

  } catch (error) {
    console.error('[AUTH] Password reset request error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV PASSWORD RESET] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: 'Failed to process password reset request',
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Verify password reset token
 */
const verifyResetToken = async (req, res) => {
  try {
    const { id_card, token } = req.body;
    
    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Verify token:', { id_card, token });
    }

    // Validate required fields
    if (!id_card || !token) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Missing required fields');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card and reset token are required'
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] User not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: 'Invalid ID card or reset token'
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Account is locked');
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: 'Account is locked. Please contact administrator.',
        locked: true
      });
    }

    // Validate token format
    if (!/^\d{6}$/.test(token)) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Invalid token format:', token);
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Reset token must be a 6-digit number'
      });
    }

    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Checking token:', {
        storedToken: user.resetPasswordToken,
        providedToken: token,
        expiresAt: user.resetPasswordExpiresAt,
        currentTime: Date.now()
      });
    }

    // Check if token matches and is not expired
    if (
      !user.resetPasswordToken ||
      user.resetPasswordToken !== token ||
      !user.resetPasswordExpiresAt ||
      user.resetPasswordExpiresAt < Date.now()
    ) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Invalid or expired token');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid or expired reset token'
      });
    }

    // Token is valid
    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Token verified successfully');
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: 'Reset token verified successfully',
      tokenValid: true,
      email: user.email
    });

  } catch (error) {
    console.error('[AUTH] Reset token verification error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV PASSWORD RESET] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: 'Failed to verify reset token',
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Reset password with token
 */
const resetPassword = async (req, res) => {
  try {
    const { id_card, token, newPassword } = req.body;
    
    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Reset password:', { id_card, hasToken: !!token, hasNewPassword: !!newPassword });
    }

    // Validate required fields
    if (!id_card || !token || !newPassword) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Missing required fields');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'ID card, reset token, and new password are required'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Password too short');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findOne({ id_card });
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] User not found:', id_card);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: 'Invalid ID card or reset token'
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Account is locked');
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: 'Account is locked. Please contact administrator.',
        locked: true
      });
    }

    // Validate token format
    if (!/^\d{6}$/.test(token)) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Invalid token format:', token);
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Reset token must be a 6-digit number'
      });
    }

    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Verifying token for password reset:', {
        storedToken: user.resetPasswordToken,
        providedToken: token,
        expiresAt: user.resetPasswordExpiresAt
      });
    }

    // Check if token matches and is not expired
    if (
      !user.resetPasswordToken ||
      user.resetPasswordToken !== token ||
      !user.resetPasswordExpiresAt ||
      user.resetPasswordExpiresAt < Date.now()
    ) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] Invalid or expired token');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      if (isDevelopment) {
        console.log('[DEV PASSWORD RESET] New password same as old password');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'New password cannot be the same as current password'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    user.loginAttempts = 0; // Reset login attempts on successful password reset
    user.lastFailedLoginAt = null;
    
    await user.save();

    if (isDevelopment) {
      console.log('[DEV PASSWORD RESET] Password reset successfully for:', id_card);
    }

    // Send confirmation email
    await sendPasswordResetConfirmationEmail({
      email: user.email,
      first_name: user.first_name
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: 'Password reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('[AUTH] Reset password error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV PASSWORD RESET] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: 'Failed to reset password',
      error: isDevelopment ? error.message : undefined
    });
  }
};

/**
 * Change password (authenticated user)
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (isDevelopment) {
      console.log('[DEV CHANGE PASSWORD] Request from user:', {
        userId: req.user.id,
        id_card: req.user.id_card,
        hasCurrentPassword: !!currentPassword,
        hasNewPassword: !!newPassword
      });
    }

    // Validate required fields
    if (!currentPassword || !newPassword) {
      if (isDevelopment) {
        console.log('[DEV CHANGE PASSWORD] Missing required fields');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Current password and new password are required'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      if (isDevelopment) {
        console.log('[DEV CHANGE PASSWORD] New password too short');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV CHANGE PASSWORD] User not found:', userId);
      }
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: 'User not found'
      });
    }

    if (user.isLocked) {
      if (isDevelopment) {
        console.log('[DEV CHANGE PASSWORD] Account is locked');
      }
      return res.status(HTTP_STATUS.LOCKED).json({
        success: false,
        status: HTTP_STATUS.LOCKED,
        message: 'Account is locked. Please contact administrator.',
        locked: true
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      if (isDevelopment) {
        console.log('[DEV CHANGE PASSWORD] Current password incorrect');
      }
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      if (isDevelopment) {
        console.log('[DEV CHANGE PASSWORD] New password same as current password');
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'New password cannot be the same as current password'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    user.password = hashedPassword;
    user.loginAttempts = 0; // Reset login attempts on successful password change
    user.lastFailedLoginAt = null;
    
    await user.save();

    if (isDevelopment) {
      console.log('[DEV CHANGE PASSWORD] Password changed successfully for:', user.id_card);
    }

    // Send confirmation email
    await sendPasswordChangeConfirmationEmail({
      email: user.email,
      first_name: user.first_name
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('[AUTH] Change password error:', error.message);
    
    if (isDevelopment) {
      console.error('[DEV CHANGE PASSWORD] Full error:', error);
    }
    
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: 'Failed to change password',
      error: isDevelopment ? error.message : undefined
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
  lockAccount,
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  changePassword
};