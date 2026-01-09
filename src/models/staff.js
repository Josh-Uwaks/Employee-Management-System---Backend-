const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // ===========================
    // Identity
    // ===========================
    id_card: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      trim: true,
      match: /^KE\d{3}$/ // KE175 format
    },
    email: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    first_name: {
      type: String,
      required: true,
      trim: true
    },
    last_name: {
      type: String,
      required: true,
      trim: true
    },

    // ===========================
    // Location
    // ===========================
    region: {
      type: String,
      enum: ['Lagos', 'Delta', 'Osun'],
      default: 'Lagos'
    },
    branch: {
      type: String,
      default: 'HQ'
    },

    // ===========================
    // Staff Information
    // ===========================
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true
    },
    position: {
      type: String,
      required: true,
      trim: true
    },

    // ===========================
    // Role & Reporting Structure
    // ===========================
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'LINE_MANAGER', 'STAFF'],
      default: 'STAFF',
      index: true
    },
    reportsTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },

    // ===========================
    // OTP / Verification
    // ===========================
    otp: String,
    otpExpiresAt: Date,
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpiresAt: Date,

    // ===========================
    // Login Security
    // ===========================
    loginAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    isLocked: {
      type: Boolean,
      default: false
    },
    lockedAt: Date,
    lockedReason: String,
    lastFailedLoginAt: Date,

    // ===========================
    // Last Check-in
    // ===========================
    lastCheckinAt: Date,
    lastCheckinRegion: String,
    lastCheckinBranch: String,

    // ===========================
    // Status Flags
    // ===========================
    isAdmin: {
      type: Boolean,
      default: false
    },
    is_staff: {
      type: Boolean,
      default: true
    },
    is_active: {
      type: Boolean,
      default: true
    },

    // ===========================
    // Password Reset
    // ===========================
    resetPasswordToken: String,
    resetPasswordExpiresAt: Date
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.loginAttempts;
        delete ret.lastFailedLoginAt;
        return ret;
      }
    }
  }
);

//
// ===========================
// STATIC METHODS
// ===========================
//

// Failed login handler
userSchema.statics.failedLogin = async function (id_card) {
  const user = await this.findOne({ id_card }).populate('reportsTo', 'email first_name last_name role');
  if (!user) return;

  if (user.isLocked) return user;

  user.loginAttempts += 1;
  user.lastFailedLoginAt = new Date();

  if (user.loginAttempts >= 3) {
    user.isLocked = true;
    user.lockedAt = new Date();
    user.lockedReason = '3 consecutive failed login attempts';
    user.loginAttempts = 0;

    console.log(`[SECURITY] Account permanently locked: ${id_card}`);
    await user.save();
    
    // Return populated user for notifications
    return this.findOne({ id_card }).populate('reportsTo', 'email first_name last_name role');
  }

  await user.save();
  return null;
};

// Successful login handler
userSchema.statics.successfulLogin = async function (id_card) {
  const user = await this.findOne({ id_card });
  if (!user) return;

  if (!user.isLocked) {
    user.loginAttempts = 0;
    user.lastFailedLoginAt = null;
    await user.save();
  }
};

// Unlock account (admin) with authorization check
userSchema.statics.unlockAccount = async function (id_card, adminId, adminRole) {
  const user = await this.findOne({ id_card }).populate('reportsTo', 'email first_name last_name role');
  if (!user) throw new Error('User not found');
  if (!user.isLocked) throw new Error('Account is not locked');

  // Check authorization based on user role
  if (user.role === 'STAFF') {
    // For STAFF: Only their LINE_MANAGER or SUPER_ADMIN can unlock
    const adminUser = await this.findOne({ id_card: adminId });
    if (!adminUser) throw new Error('Admin user not found');
    
    const isAuthorized = 
      adminUser.role === 'SUPER_ADMIN' || 
      (adminUser.role === 'LINE_MANAGER' && 
       user.reportsTo && 
       user.reportsTo._id.toString() === adminUser._id.toString());
    
    if (!isAuthorized) {
      throw new Error('Unauthorized: Only assigned line manager or super admin can unlock this account');
    }
  } 
  else if (user.role === 'LINE_MANAGER') {
    // For LINE_MANAGER: Only SUPER_ADMIN can unlock
    const adminUser = await this.findOne({ id_card: adminId });
    if (!adminUser) throw new Error('Admin user not found');
    
    if (adminUser.role !== 'SUPER_ADMIN') {
      throw new Error('Unauthorized: Only super admin can unlock manager accounts');
    }
  }
  else if (user.role === 'SUPER_ADMIN') {
    // For SUPER_ADMIN: Only other SUPER_ADMIN can unlock
    const adminUser = await this.findOne({ id_card: adminId });
    if (!adminUser) throw new Error('Admin user not found');
    
    if (adminUser.role !== 'SUPER_ADMIN') {
      throw new Error('Unauthorized: Only super admin can unlock super admin accounts');
    }
  }

  user.isLocked = false;
  user.lockedAt = null;
  user.lockedReason = null;
  user.loginAttempts = 0;
  user.lastFailedLoginAt = null;

  await user.save();
  console.log(`[ADMIN] Account unlocked by ${adminId} (${adminRole}): ${id_card}`);

  return user;
};

// Get locked accounts
userSchema.statics.getLockedAccounts = async function () {
  return this.find({ isLocked: true })
    .populate('department', 'name code')
    .populate('reportsTo', 'first_name last_name email role')
    .select(
      'id_card email first_name last_name role region branch department reportsTo lockedAt lockedReason'
    )
    .sort({ lockedAt: -1 });
};

// Manually lock account (admin)
userSchema.statics.lockAccount = async function (
  id_card,
  adminId,
  reason = 'Manually locked by administrator'
) {
  const user = await this.findOne({ id_card }).populate('reportsTo', 'email first_name last_name role');
  if (!user) throw new Error('User not found');
  if (user.isLocked) throw new Error('Account is already locked');

  // CRITICAL: Prevent admin from locking their own account
  const adminUser = await this.findOne({ id_card: adminId });
  if (!adminUser) throw new Error('Admin user not found');
  
  if (adminUser._id.toString() === user._id.toString()) {
    throw new Error('Cannot lock your own account');
  }

  // Additional security: Prevent non-SUPER_ADMIN from locking SUPER_ADMIN accounts
  if (user.role === 'SUPER_ADMIN' && adminUser.role !== 'SUPER_ADMIN') {
    throw new Error('Only SUPER_ADMIN can lock other SUPER_ADMIN accounts');
  }

  user.isLocked = true;
  user.lockedAt = new Date();
  user.lockedReason = reason;
  user.loginAttempts = 0;
  user.lastFailedLoginAt = null;
  // Optional: Track who locked the account
  user.lockedBy = adminId;

  await user.save();
  console.log(
    `[ADMIN] Account manually locked by ${adminId} (${adminUser.role}): ${id_card} - Reason: ${reason}`
  );

  return user;
};

module.exports = mongoose.model('User', userSchema);