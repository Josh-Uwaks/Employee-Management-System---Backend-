const User = require('../models/staff');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { canUpdateUser, getAllowedUpdateFields, canUpdateField } = require('../utils/roleUtils');

// ADD THIS IMPORT
const Department = require('../models/department');

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

const SUCCESS_MESSAGES = {
  USERS_FETCHED: 'Users retrieved successfully',
  USER_FETCHED: 'User retrieved successfully',
  USER_UPDATED: 'User updated successfully',
  USER_DELETED: 'User deleted successfully',
  CHECKIN_SUCCESS: 'Check-in recorded successfully',
  USERS_BY_LOCATION: 'Users by location retrieved successfully'
};

const ERROR_MESSAGES = {
  USERS_NOT_FOUND: 'No users found',
  USER_NOT_FOUND: 'User not found',
  INVALID_ID_FORMAT: 'ID Card must follow format KE followed by 3 digits (e.g., KE001)',
  INVALID_DEPARTMENT: 'Invalid department ID',
  INVALID_REGION: 'Invalid region specified',
  INVALID_BRANCH: 'Invalid branch for the specified region',
  SERVER_ERROR: 'An internal server error occurred',
  VALIDATION_ERROR: 'Validation error',
  DUPLICATE_ENTRY: 'Duplicate entry found',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions to perform this action'
};

const getUsers = async (req, res) => {
  try {
    const currentUser = req.user;

    // Ensure the request is authenticated
    if (!currentUser) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        message: 'Authentication required'
      });
    }

    let query = {};

    // LINE_MANAGER only sees their direct reports
    if (currentUser.role === 'LINE_MANAGER') {
      query.reportsTo = currentUser._id;
      console.log(`[LINE_MANAGER] ${currentUser.id_card} viewing their direct reports`);
    }

    // STAFF can only see themselves
    if (currentUser.role === 'STAFF') {
      query._id = currentUser._id;
    }

    // SUPER_ADMIN sees everyone (no filter needed)

    const users = await User.find(query)
      .select('-password')
      .populate('department', 'name code isActive')
      .populate('reportsTo', 'first_name last_name email id_card role');

    if (!users || users.length === 0) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        status: HTTP_STATUS.OK,
        message: SUCCESS_MESSAGES.USERS_FETCHED,
        data: [],
        count: 0
      });
    }

    // Add access control info for debugging
    const userInfo = {
      role: currentUser.role,
      id_card: currentUser.id_card,
      totalUsers: users.length
    };

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.USERS_FETCHED,
      count: users.length,
      userInfo,
      data: users
    });
  } catch (error) {
    console.error('Get Users Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(id)
      .select('-password')
      .populate('department', 'name code')
      .populate('reportsTo', 'first_name last_name email role');
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.USER_NOT_FOUND
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.USER_FETCHED,
      data: user
    });
  } catch (error) {
    console.error('Get User Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid user ID format'
      });
    }

    // Check authorization using roleUtils
    const authorization = await canUpdateUser(currentUser, id, User);
    
    if (!authorization.canUpdate) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: authorization.reason || ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS
      });
    }

    const { targetUser, level } = authorization;
    
    // Log authorization details
    console.log(`[UPDATE] User ${currentUser.id_card} (${currentUser.role}) updating ${targetUser.id_card} (${targetUser.role}) - Level: ${level}`);
    
    // LINE_MANAGER trying to update non-direct report
    if (currentUser.role === 'LINE_MANAGER' && level !== 'manager') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'LINE_MANAGER can only update their direct reports',
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Get allowed fields for this update level
    const allowedFields = getAllowedUpdateFields(currentUser, targetUser, level);
    
    if (allowedFields.length === 0) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'No fields are allowed for this update operation'
      });
    }

    // Check for unauthorized fields
    const requestedFields = Object.keys(req.body);
    const unauthorizedFields = [];
    
    requestedFields.forEach(field => {
      if (!allowedFields.includes(field) && field !== 'password') {
        unauthorizedFields.push(field);
      }
    });
    
    if (unauthorizedFields.length > 0 && allowedFields[0] !== 'all') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: `Not authorized to update fields: ${unauthorizedFields.join(', ')}`,
        allowedFields,
        unauthorizedFields
      });
    }

    // ===========================
    // CRITICAL SECURITY CHECKS
    // ===========================
    
    // Prevent users from deactivating their own accounts
    if (req.body.is_active === false && targetUser._id.toString() === currentUser.id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'You cannot deactivate your own account',
        error: 'SELF_DEACTIVATION_NOT_ALLOWED'
      });
    }
    
    // Prevent SUPER_ADMIN from deactivating other SUPER_ADMIN accounts
    if (req.body.is_active === false && targetUser.role === 'SUPER_ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Only SUPER_ADMIN can deactivate other SUPER_ADMIN accounts',
        error: 'INSUFFICIENT_PRIVILEGES'
      });
    }
    
    // Prevent last active SUPER_ADMIN from being deactivated
    if (req.body.is_active === false && targetUser.role === 'SUPER_ADMIN') {
      const activeSuperAdmins = await User.countDocuments({
        role: 'SUPER_ADMIN',
        is_active: true,
        _id: { $ne: targetUser._id }
      });
      
      if (activeSuperAdmins === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: 'Cannot deactivate the last active SUPER_ADMIN account',
          error: 'LAST_SUPER_ADMIN'
        });
      }
    }

    // ===========================
    // Apply Validated Updates
    // ===========================
    
    // Handle ID card update (SUPER_ADMIN only)
    if (req.body.id_card !== undefined) {
      if (level !== 'super_admin') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          status: HTTP_STATUS.FORBIDDEN,
          message: 'Only SUPER_ADMIN can update ID card'
        });
      }
      
      if (!/^KE\d{3}$/.test(req.body.id_card)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.INVALID_ID_FORMAT,
          details: 'Expected format: KE followed by 3 digits (e.g., KE001, KE175)'
        });
      }
      targetUser.id_card = req.body.id_card;
    }

    // Handle department update - Track if department is changing
    let departmentChanged = false;
    let oldDepartmentId = targetUser.department ? targetUser.department.toString() : null;
    
    if (req.body.department !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(req.body.department)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.INVALID_DEPARTMENT,
          details: 'Department must be a valid MongoDB ObjectId'
        });
      }
      
      const newDepartmentId = req.body.department;
      
      // Check if department is actually changing
      if (!targetUser.department || targetUser.department.toString() !== newDepartmentId) {
        departmentChanged = true;
        console.log(`[DEPARTMENT CHANGE] User ${targetUser.id_card} department changing from ${oldDepartmentId} to ${newDepartmentId}`);
      }
      
      targetUser.department = newDepartmentId;
    }

    // Handle role changes (SUPER_ADMIN only with validation)
    if (req.body.role !== undefined && req.body.role !== targetUser.role) {
      if (level !== 'super_admin') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          status: HTTP_STATUS.FORBIDDEN,
          message: 'Only SUPER_ADMIN can change user roles'
        });
      }
      
      // Validate role transition
      const validRoles = ['STAFF', 'LINE_MANAGER', 'SUPER_ADMIN'];
      if (!validRoles.includes(req.body.role)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: 'Invalid role specified',
          validRoles
        });
      }
      
      targetUser.role = req.body.role;
      
      // Set admin flag based on role
      if (req.body.role === 'SUPER_ADMIN' || req.body.role === 'LINE_MANAGER') {
        targetUser.isAdmin = true;
      } else {
        targetUser.isAdmin = false;
      }
      
      // Handle reportsTo based on role
      if (req.body.role === 'STAFF') {
        if (!req.body.reportsTo && !targetUser.reportsTo) {
          // For STAFF, automatically assign to department line manager if available
          if (targetUser.department) {
            const department = await Department.findById(targetUser.department);
            
            if (department && department.lineManager) {
              targetUser.reportsTo = department.lineManager;
              console.log(`[AUTO-ASSIGN] STAFF ${targetUser.id_card} automatically assigned to department line manager: ${department.lineManager}`);
            } else {
              console.log(`[WARNING] STAFF ${targetUser.id_card} has no line manager assigned and department has no line manager`);
            }
          }
        }
      } else {
        // SUPER_ADMIN or LINE_MANAGER should not report to anyone
        targetUser.reportsTo = null;
      }
    }

    // Handle reportsTo update
    if (req.body.reportsTo !== undefined) {
      if (targetUser.role === 'SUPER_ADMIN') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: 'SUPER_ADMIN cannot have a manager'
        });
      }
      
      if (req.body.reportsTo === null || req.body.reportsTo === '') {
        if (targetUser.role === 'STAFF') {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            status: HTTP_STATUS.BAD_REQUEST,
            message: 'STAFF must have a line manager'
          });
        }
        targetUser.reportsTo = null;
      } else {
        // Validate reportsTo exists and is appropriate
        if (req.body.reportsTo) {
          const manager = await User.findById(req.body.reportsTo);
          if (!manager) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
              success: false,
              status: HTTP_STATUS.BAD_REQUEST,
              message: 'Specified manager not found'
            });
          }
          
          // Ensure new manager is LINE_MANAGER or SUPER_ADMIN
          if (manager.role !== 'LINE_MANAGER' && manager.role !== 'SUPER_ADMIN') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
              success: false,
              status: HTTP_STATUS.BAD_REQUEST,
              message: 'ReportsTo must be a LINE_MANAGER or SUPER_ADMIN'
            });
          }
          
          // Only SUPER_ADMIN can assign staff to a SUPER_ADMIN manager
          if (manager.role === 'SUPER_ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
              success: false,
              status: HTTP_STATUS.FORBIDDEN,
              message: 'Only SUPER_ADMIN can assign staff to SUPER_ADMIN'
            });
          }
          
          targetUser.reportsTo = req.body.reportsTo;
        }
      }
    }

    // ===========================================
    // AUTO-ASSIGN LINE MANAGER WHEN DEPARTMENT CHANGES
    // ===========================================
    if (departmentChanged && targetUser.role === 'STAFF') {
      console.log(`[AUTO-ASSIGN] Department changed for STAFF ${targetUser.id_card}, checking for department line manager...`);
      
      // Find the new department and its line manager
      const newDepartment = await Department.findById(targetUser.department);
      
      if (newDepartment && newDepartment.lineManager) {
        // Check if the line manager exists and is active
        const lineManager = await User.findById(newDepartment.lineManager);
        
        if (lineManager && lineManager.is_active && (lineManager.role === 'LINE_MANAGER' || lineManager.role === 'SUPER_ADMIN')) {
          // Auto-assign staff to the department's line manager
          targetUser.reportsTo = newDepartment.lineManager;
          console.log(`[AUTO-ASSIGN] Staff ${targetUser.id_card} automatically assigned to department line manager: ${lineManager.id_card} (${lineManager.first_name} ${lineManager.last_name})`);
        } else {
          console.log(`[WARNING] Department line manager (${newDepartment.lineManager}) is not active or not a valid manager`);
          
          // If line manager is invalid, find an active LINE_MANAGER in the same department
          const activeLineManager = await User.findOne({
            department: targetUser.department,
            role: 'LINE_MANAGER',
            is_active: true
          });
          
          if (activeLineManager) {
            targetUser.reportsTo = activeLineManager._id;
            console.log(`[AUTO-ASSIGN] Staff ${targetUser.id_card} assigned to active LINE_MANAGER in department: ${activeLineManager.id_card}`);
          } else {
            console.log(`[WARNING] No active LINE_MANAGER found in department ${targetUser.department}`);
          }
        }
      } else {
        console.log(`[WARNING] Department ${targetUser.department} has no assigned line manager`);
        
        // Try to find any LINE_MANAGER in the same department
        const departmentLineManager = await User.findOne({
          department: targetUser.department,
          role: 'LINE_MANAGER',
          is_active: true
        });
        
        if (departmentLineManager) {
          targetUser.reportsTo = departmentLineManager._id;
          console.log(`[AUTO-ASSIGN] Staff ${targetUser.id_card} assigned to LINE_MANAGER in department: ${departmentLineManager.id_card}`);
        }
      }
    }

    // Update password if provided
    if (req.body.password) {
      // Check if user can update password
      if (level !== 'self' && level !== 'super_admin') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          status: HTTP_STATUS.FORBIDDEN,
          message: 'Only users can update their own password or SUPER_ADMIN can update any password'
        });
      }
      
      const salt = await bcrypt.genSalt(10);
      targetUser.password = await bcrypt.hash(req.body.password, salt);
    }

    // Update other basic fields
    const basicFields = ['email', 'first_name', 'last_name', 'position', 'is_active'];
    basicFields.forEach(field => {
      if (req.body[field] !== undefined) {
        targetUser[field] = req.body[field];
      }
    });

    // Handle region and branch validation
    if (req.body.region || req.body.branch) {
      const region = req.body.region || targetUser.region;
      const branch = req.body.branch || targetUser.branch;

      const validRegions = ['Lagos', 'Delta', 'Osun'];
      const validBranches = {
        'Lagos': ['Alimosho', 'HQ'],
        'Delta': ['Warri'],
        'Osun': ['Osun']
      };

      if (!validRegions.includes(region)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.INVALID_REGION,
          validRegions
        });
      }

      if (!validBranches[region].includes(branch)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.INVALID_BRANCH,
          region,
          validBranches: validBranches[region]
        });
      }

      targetUser.region = region;
      targetUser.branch = branch;
    }

    const updatedUser = await targetUser.save();

    // Populate response data
    const populatedUser = await User.findById(updatedUser._id)
      .populate('department', 'name code')
      .populate('reportsTo', 'first_name last_name email role id_card')
      .select('-password');

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.USER_UPDATED,
      data: populatedUser,
      updatedBy: {
        id_card: currentUser.id_card,
        name: `${currentUser.first_name} ${currentUser.last_name}`,
        role: currentUser.role,
        updateLevel: level
      }
    });
  } catch (error) {
    console.error('Update User Error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
        field
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.VALIDATION_ERROR,
        details: error.message
      });
    }

    // Handle CastError
    if (error.name === 'CastError') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid ID format for reference field',
        details: error.message
      });
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid user ID format'
      });
    }

    // Only SUPER_ADMIN can delete users
    if (currentUser.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Only SUPER_ADMIN can delete users'
      });
    }

    const user = await User.findById(id);
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.USER_NOT_FOUND
      });
    }

    // Prevent SUPER_ADMIN from deleting themselves
    if (user._id.toString() === currentUser.id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Cannot delete your own account'
      });
    }

    // Prevent deleting other SUPER_ADMIN accounts
    if (user.role === 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Cannot delete another SUPER_ADMIN account'
      });
    }

    await user.deleteOne();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.USER_DELETED,
      data: {
        id: user._id,
        id_card: user.id_card,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      },
      deletedBy: {
        id_card: currentUser.id_card,
        name: `${currentUser.first_name} ${currentUser.last_name}`,
        role: currentUser.role
      }
    });
  } catch (error) {
    console.error('Delete User Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const checkinUser = async (req, res) => {
  try {
    const currentUser = req.user;
    const targetId = req.params.id || currentUser.id;
    
    // Validate ID format
    if (!targetId || !targetId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Invalid user ID format'
      });
    }

    // Check if user can check in for this target
    let canCheckin = false;
    
    if (targetId === currentUser.id) {
      canCheckin = true; // Self check-in
    } else if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'LINE_MANAGER') {
      // Admin can check in for others
      canCheckin = true;
    }
    
    if (!canCheckin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Not authorized to check in for this user'
      });
    }

    const user = await User.findById(targetId);
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.USER_NOT_FOUND
      });
    }

    const { region, branch } = req.body;

    // Validate required fields
    if (!region || !branch) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'Region and branch are required for check-in'
      });
    }

    const validRegions = ['Lagos', 'Delta', 'Osun'];
    const validBranches = {
      'Lagos': ['Alimosho', 'HQ'],
      'Delta': ['Warri'],
      'Osun': ['Osun']
    };

    if (!validRegions.includes(region)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_REGION,
        validRegions
      });
    }

    if (!validBranches[region]?.includes(branch)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_BRANCH,
        region,
        validBranches: validBranches[region] || []
      });
    }

    // Save check-in
    const checkinTime = new Date();
    user.lastCheckinAt = checkinTime;
    user.lastCheckinRegion = region;
    user.lastCheckinBranch = branch;

    await user.save();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.CHECKIN_SUCCESS,
      data: {
        checkin: {
          region,
          branch,
          time: checkinTime,
          timestamp: checkinTime.toISOString()
        },
        user: {
          _id: user._id,
          id_card: user.id_card,
          first_name: user.first_name,
          last_name: user.last_name,
          full_name: `${user.first_name} ${user.last_name}`
        },
        checkedInBy: {
          id_card: currentUser.id_card,
          name: `${currentUser.first_name} ${currentUser.last_name}`,
          role: currentUser.role,
          isSelf: targetId === currentUser.id
        }
      }
    });
  } catch (error) {
    console.error('Check-in Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getUsersByLocation = async (req, res) => {
  try {
    const currentUser = req.user;
    const { region, branch } = req.query;
    
    // Only admin can access this endpoint
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'LINE_MANAGER') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Admin access required'
      });
    }
    
    // Validate query parameters
    if (!region && !branch) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: 'At least one of region or branch must be provided'
      });
    }

    // Validate region if provided
    if (region) {
      const validRegions = ['Lagos', 'Delta', 'Osun'];
      if (!validRegions.includes(region)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          status: HTTP_STATUS.BAD_REQUEST,
          message: ERROR_MESSAGES.INVALID_REGION,
          validRegions
        });
      }
    }

    // Build query
    const query = {};
    if (region) query.region = region;
    if (branch) query.branch = branch;
    
    // If LINE_MANAGER, only show their staff
    if (currentUser.role === 'LINE_MANAGER') {
      query.reportsTo = currentUser.id;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('department', 'name code')
      .populate('reportsTo', 'first_name last_name id_card');

    if (!users || users.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.USERS_NOT_FOUND,
        filters: { region, branch },
        data: []
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.USERS_BY_LOCATION,
      count: users.length,
      filters: { region, branch },
      data: users
    });
  } catch (error) {
    console.error('Get Users By Location Error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  checkinUser,
  getUsersByLocation,
};