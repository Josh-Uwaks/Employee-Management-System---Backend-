// role.middleware.js
const HTTP_STATUS = {
  FORBIDDEN: 403,
  UNAUTHORIZED: 401
};

/**
 * Check if user has at least one of the required roles
 */
const checkRoles = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (requiredRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: `Access Denied. Required role(s): ${requiredRoles.join(', ')}`,
      userRole: req.user.role
    });
  };
};

/**
 * Check if user has admin access (SUPER_ADMIN or LINE_MANAGER)
 */
const isAdmin = checkRoles(['SUPER_ADMIN', 'LINE_MANAGER']);

/**
 * SUPER_ADMIN only
 */
const isSuperAdmin = checkRoles(['SUPER_ADMIN']);

/**
 * LINE_MANAGER only
 */
const isLineManager = checkRoles(['LINE_MANAGER']);

/**
 * STAFF only
 */
const isStaff = checkRoles(['STAFF']);

/**
 * Self or Admin (for accessing/modifying own data or admin accessing others)
 */
const selfOrAdmin = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const targetId = req.params.id || req.body.userId || req.query.userId;
  
  // Allow if user is accessing their own data
  if (targetId && targetId === req.user.id) {
    return next();
  }

  // Allow if user is an admin
  const adminRoles = ['SUPER_ADMIN', 'LINE_MANAGER'];
  if (adminRoles.includes(req.user.role)) {
    return next();
  }

  return res.status(HTTP_STATUS.FORBIDDEN).json({
    success: false,
    message: 'Access denied. You can only access your own data unless you are an admin.',
    userRole: req.user.role
  });
};

/**
 * Self, Manager of staff, or SUPER_ADMIN
 */
const selfManagerOrSuperAdmin = (req, res, next) => {
  const adminRoles = ['SUPER_ADMIN', 'LINE_MANAGER'];
  
  if (!req.user || !req.user.role) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const targetId = req.params.id || req.body.userId || req.query.userId;
  
  // Allow if user is accessing their own data
  if (targetId && targetId === req.user.id) {
    return next();
  }

  // Allow if user is an admin (detailed authorization happens in controller)
  if (adminRoles.includes(req.user.role)) {
    return next();
  }

  return res.status(HTTP_STATUS.FORBIDDEN).json({
    success: false,
    message: 'Access denied',
    userRole: req.user.role
  });
};

/**
 * LINE_MANAGER or SUPER_ADMIN (for managing staff)
 */
const lineManagerOrSuperAdmin = checkRoles(['LINE_MANAGER', 'SUPER_ADMIN']);

/**
 * LINE_MANAGER can access their own staff or SUPER_ADMIN can access anyone.
 * STAFF may access only themselves.
 * This middleware defers detailed staff-membership checks to the controller.
 */
const lineManagerOwnStaffOrSuperAdmin = (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // SUPER_ADMIN can access anyone
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  const targetId = req.params.id || req.body.userId || req.query.userId;
  
  // LINE_MANAGER can only access their own staff
  if (req.user.role === 'LINE_MANAGER') {
    // Detailed check (e.g., ensure target reportsTo = manager) should happen in the controller
    return next();
  }

  // STAFF can only access themselves
  if (req.user.role === 'STAFF' && targetId === req.user.id) {
    return next();
  }

  return res.status(HTTP_STATUS.FORBIDDEN).json({
    success: false,
    message: 'Access denied',
    userRole: req.user.role
  });
};

module.exports = {
  checkRoles,
  isAdmin,
  isSuperAdmin,
  isLineManager,
  isStaff,
  selfOrAdmin,
  selfManagerOrSuperAdmin,
  lineManagerOrSuperAdmin,
  lineManagerOwnStaffOrSuperAdmin
};