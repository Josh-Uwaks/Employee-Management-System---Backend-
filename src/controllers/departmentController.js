const Department = require('../models/department');

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
  INTERNAL_SERVER_ERROR: 500
};

// ===========================
// Success Messages
// ===========================
const SUCCESS_MESSAGES = {
  DEPARTMENT_CREATED: 'Department created successfully',
  DEPARTMENTS_FETCHED: 'Departments retrieved successfully',
  DEPARTMENT_FETCHED: 'Department retrieved successfully',
  DEPARTMENT_UPDATED: 'Department updated successfully',
  DEPARTMENT_DELETED: 'Department deleted successfully',
  DEPARTMENT_ACTIVATED: 'Department activated successfully',
  DEPARTMENT_DEACTIVATED: 'Department deactivated successfully'
};

// ===========================
// Error Messages
// ===========================
const ERROR_MESSAGES = {
  // Validation Errors
  NAME_REQUIRED: 'Department name is required',
  NAME_EXISTS: 'Department with this name already exists',
  CODE_EXISTS: 'Department code already exists',
  INVALID_ID: 'Invalid department ID',
  
  // Not Found Errors
  DEPARTMENT_NOT_FOUND: 'Department not found',
  DEPARTMENTS_NOT_FOUND: 'No departments found',
  
  // Authorization Errors
  UNAUTHORIZED: 'Unauthorized access',
  ADMIN_REQUIRED: 'Admin access required',
  SUPER_ADMIN_REQUIRED: 'Super Admin access required',
  
  // System Errors
  CREATION_FAILED: 'Failed to create department',
  UPDATE_FAILED: 'Failed to update department',
  DELETION_FAILED: 'Failed to delete department',
  RETRIEVAL_FAILED: 'Failed to retrieve departments',
  SERVER_ERROR: 'An internal server error occurred'
};

/**
 * Create a new department (Admin only)
 */
const createDepartment = async (req, res) => {
  try {
    // Check if user is SUPER_ADMIN
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.SUPER_ADMIN_REQUIRED
      });
    }

    const { name, code, description } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.NAME_REQUIRED
      });
    }

    // Check if department with same name or code exists
    const existingDepartment = await Department.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } },
        { code: code ? { $regex: new RegExp(`^${code.trim()}$`, 'i') } : null }
      ]
    });

    if (existingDepartment) {
      const field = existingDepartment.name.toLowerCase() === name.toLowerCase().trim() 
        ? 'name' 
        : 'code';
      
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES[`${field.toUpperCase()}_EXISTS`]
      });
    }

    const department = await Department.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : null,
      description: description ? description.trim() : null,
      createdBy: req.user._id
    });

    // Convert to plain object for JSON serialization
    const departmentObj = department.toObject ? department.toObject() : department;
    
    // Ensure consistent field names
    if (departmentObj._id) {
      departmentObj._id = departmentObj._id.toString();
    }
    
    // Remove mongoose-specific fields
    delete departmentObj.__v;
    
    console.log('[DEPARTMENT] Created department object:', departmentObj);

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      status: HTTP_STATUS.CREATED,
      message: SUCCESS_MESSAGES.DEPARTMENT_CREATED,
      data: departmentObj
    });

  } catch (error) {
    console.error('[DEPARTMENT] Creation error:', error.message);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES[`${field.toUpperCase()}_EXISTS`]
      });
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.CREATION_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all departments
 */
const getDepartments = async (req, res) => {
  try {
    const { activeOnly = 'true' } = req.query;
    
    let query = {};
    
    // Filter by active status if requested
    if (activeOnly === 'true') {
      query.isActive = true;
    }
    
    const departments = await Department.find(query).sort({ name: 1 });

    if (!departments || departments.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.DEPARTMENTS_NOT_FOUND,
        data: []
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.DEPARTMENTS_FETCHED,
      count: departments.length,
      data: departments
    });

  } catch (error) {
    console.error('[DEPARTMENT] Retrieval error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.RETRIEVAL_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single department by ID
 */
const getDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID
      });
    }

    const department = await Department.findById(id);

    if (!department) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.DEPARTMENT_NOT_FOUND
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.DEPARTMENT_FETCHED,
      data: department
    });

  } catch (error) {
    console.error('[DEPARTMENT] Get department error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.RETRIEVAL_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update department (Admin only)
 */
const updateDepartment = async (req, res) => {
  try {
    // Check if user is SUPER_ADMIN
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.SUPER_ADMIN_REQUIRED
      });
    }

    const { id } = req.params;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID
      });
    }

    const department = await Department.findById(id);

    if (!department) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.DEPARTMENT_NOT_FOUND
      });
    }

    // Check for duplicate name or code
    if (req.body.name || req.body.code) {
      const duplicateQuery = {
        _id: { $ne: id },
        $or: []
      };

      if (req.body.name) {
        duplicateQuery.$or.push({ 
          name: { $regex: new RegExp(`^${req.body.name.trim()}$`, 'i') } 
        });
      }

      if (req.body.code) {
        duplicateQuery.$or.push({ 
          code: { $regex: new RegExp(`^${req.body.code.trim()}$`, 'i') } 
        });
      }

      const duplicate = await Department.findOne(duplicateQuery);
      
      if (duplicate) {
        const field = duplicate.name.toLowerCase() === req.body.name.toLowerCase().trim() 
          ? 'name' 
          : 'code';
        
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          status: HTTP_STATUS.CONFLICT,
          message: ERROR_MESSAGES[`${field.toUpperCase()}_EXISTS`]
        });
      }
    }

    // Update fields
    const updatableFields = ['name', 'code', 'description', 'isActive'];
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] === 'string') {
          department[field] = req.body[field].trim();
          if (field === 'code') {
            department[field] = department[field].toUpperCase();
          }
        } else {
          department[field] = req.body[field];
        }
      }
    });

    department.updatedBy = req.user._id;
    department.updatedAt = new Date();
    
    await department.save();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.DEPARTMENT_UPDATED,
      data: department,
      updatedBy: {
        id_card: req.user.id_card,
        name: `${req.user.first_name} ${req.user.last_name}`,
        role: req.user.role
      }
    });

  } catch (error) {
    console.error('[DEPARTMENT] Update error:', error.message);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: ERROR_MESSAGES[`${field.toUpperCase()}_EXISTS`]
      });
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.UPDATE_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete department (Admin only)
 */
const deleteDepartment = async (req, res) => {
  try {
    // Check if user is SUPER_ADMIN
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.SUPER_ADMIN_REQUIRED
      });
    }

    const { id } = req.params;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID
      });
    }

    const department = await Department.findById(id);

    if (!department) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.DEPARTMENT_NOT_FOUND
      });
    }

    // Check if department has active users
    const User = require('../models/staff');
    const userCount = await User.countDocuments({ 
      department: id,
      is_active: true 
    });

    if (userCount > 0) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        status: HTTP_STATUS.CONFLICT,
        message: `Cannot delete department with ${userCount} active user(s). Reassign users first.`
      });
    }

    await department.deleteOne();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message: SUCCESS_MESSAGES.DEPARTMENT_DELETED,
      data: {
        id: department._id,
        name: department.name,
        code: department.code
      },
      deletedBy: {
        id_card: req.user.id_card,
        name: `${req.user.first_name} ${req.user.last_name}`,
        role: req.user.role
      }
    });

  } catch (error) {
    console.error('[DEPARTMENT] Delete error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.DELETION_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Toggle department active status (Admin only)
 */
const toggleDepartmentStatus = async (req, res) => {
  try {
    // Check if user is admin (SUPER_ADMIN or LINE_MANAGER)
    if (!req.user.isAdmin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: ERROR_MESSAGES.ADMIN_REQUIRED
      });
    }

    // Only SUPER_ADMIN can deactivate departments
    if (req.body.isActive === false && req.user.role !== 'SUPER_ADMIN') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        status: HTTP_STATUS.FORBIDDEN,
        message: 'Only SUPER_ADMIN can deactivate departments'
      });
    }

    const { id } = req.params;

    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        status: HTTP_STATUS.BAD_REQUEST,
        message: ERROR_MESSAGES.INVALID_ID
      });
    }

    const department = await Department.findById(id);

    if (!department) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        status: HTTP_STATUS.NOT_FOUND,
        message: ERROR_MESSAGES.DEPARTMENT_NOT_FOUND
      });
    }

    // If setting to inactive, check for active users
    if (req.body.isActive === false) {
      const User = require('../models/staff');
      const userCount = await User.countDocuments({ 
        department: id,
        is_active: true 
      });

      if (userCount > 0) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          status: HTTP_STATUS.CONFLICT,
          message: `Cannot deactivate department with ${userCount} active user(s). Reassign users first.`
        });
      }
    }

    department.isActive = req.body.isActive !== undefined ? req.body.isActive : !department.isActive;
    department.updatedBy = req.user._id;
    department.updatedAt = new Date();
    
    await department.save();

    const message = department.isActive 
      ? SUCCESS_MESSAGES.DEPARTMENT_ACTIVATED 
      : SUCCESS_MESSAGES.DEPARTMENT_DEACTIVATED;

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      status: HTTP_STATUS.OK,
      message,
      data: department,
      updatedBy: {
        id_card: req.user.id_card,
        name: `${req.user.first_name} ${req.user.last_name}`,
        role: req.user.role
      }
    });

  } catch (error) {
    console.error('[DEPARTMENT] Toggle status error:', error.message);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.UPDATE_FAILED,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createDepartment,
  getDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
  toggleDepartmentStatus
};