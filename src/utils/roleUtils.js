// utils/roleUtils.js
const mongoose = require('mongoose');

/**
 * Check if current user can update target user based on roles
 */
const canUpdateUser = async (currentUser, targetUserId, UserModel) => {
  const targetUser = await UserModel.findById(targetUserId);
  
  if (!targetUser) {
    return { canUpdate: false, reason: 'User not found' };
  }

  // SUPER_ADMIN can update anyone
  if (currentUser.role === 'SUPER_ADMIN') {
    return { canUpdate: true, level: 'super_admin', targetUser };
  }

  // Users can update themselves
  if (currentUser.id === targetUserId) {
    return { canUpdate: true, level: 'self', targetUser };
  }

  // LINE_MANAGER can update their direct reports
  if (currentUser.role === 'LINE_MANAGER') {
    if (targetUser.reportsTo && targetUser.reportsTo.toString() === currentUser.id) {
      return { canUpdate: true, level: 'manager', targetUser };
    }
  }

  return { canUpdate: false, reason: 'Insufficient permissions', targetUser };
};

/**
 * Get fields that a user can update based on their role and relationship
 */
const getAllowedUpdateFields = (currentUser, targetUser, updateLevel) => {
  const baseFields = ['email', 'first_name', 'last_name', 'region', 'branch'];
  
  switch (updateLevel) {
    case 'super_admin':
      return [
        ...baseFields,
        'id_card',
        'is_active',
        'is_staff',
        'isAdmin',
        'department',
        'position',
        'role',
        'reportsTo',
        'password'
      ];
    
    case 'manager':
      return [
        ...baseFields,
        'department',
        'position',
        'is_active'  // But with restrictions in controller
      ];
    
    case 'self':
      // Users CANNOT deactivate themselves
      return ['email', 'first_name', 'last_name', 'password'];
    
    default:
      return [];
  }
};

/**
 * Validate if user can update specific field
 */
const canUpdateField = (field, currentUserRole, targetUserRole, updateLevel) => {
  const adminOnlyFields = ['id_card', 'isAdmin', 'role', 'reportsTo'];
  const superAdminOnlyFields = ['role'];
  
  // Super admin can update anything
  if (updateLevel === 'super_admin') {
    return true;
  }
  
  // Check admin-only fields
  if (adminOnlyFields.includes(field) && currentUserRole !== 'SUPER_ADMIN') {
    return false;
  }
  
  // Check super-admin-only fields
  if (superAdminOnlyFields.includes(field) && currentUserRole !== 'SUPER_ADMIN') {
    return false;
  }
  
  return true;
};

/**
 * Check if user can view target user's data
 */
const canViewUser = (currentUser, targetUser) => {
  // Everyone can view themselves
  if (currentUser.id === targetUser.id) {
    return true;
  }

  // SUPER_ADMIN can view anyone
  if (currentUser.role === 'SUPER_ADMIN') {
    return true;
  }

  // LINE_MANAGER can view their direct reports
  if (currentUser.role === 'LINE_MANAGER') {
    return targetUser.reportsTo && 
           targetUser.reportsTo.toString() === currentUser.id;
  }

  return false;
};

/**
 * Check if user can delete target user
 */
const canDeleteUser = (currentUser, targetUser) => {
  // SUPER_ADMIN can delete anyone except themselves
  if (currentUser.role === 'SUPER_ADMIN' && currentUser.id !== targetUser.id) {
    return true;
  }

  return false;
};

/**
 * Check if admin can manage target user (for lock/unlock operations)
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
 * Get users that the current user can manage
 */
const getManageableUsers = async (currentUser, UserModel) => {
  if (currentUser.role === 'SUPER_ADMIN') {
    return await UserModel.find({ is_active: true }).select('-password');
  }
  
  if (currentUser.role === 'LINE_MANAGER') {
    return await UserModel.find({
      reportsTo: currentUser.id,
      is_active: true
    }).select('-password');
  }
  
  return [];
};

/**
 * Validate role hierarchy
 */
const isValidRoleHierarchy = (assignerRole, assigneeRole) => {
  const roleHierarchy = {
    'SUPER_ADMIN': ['SUPER_ADMIN', 'LINE_MANAGER', 'STAFF'],
    'LINE_MANAGER': ['STAFF'],
    'STAFF': []
  };

  return roleHierarchy[assignerRole]?.includes(assigneeRole) || false;
};

/**
 * Get role permissions matrix
 */
const getRolePermissions = () => {
  return {
    SUPER_ADMIN: {
      can: {
        manageUsers: true,
        manageDepartments: true,
        manageActivities: true,
        lockAccounts: true,
        unlockAccounts: true,
        assignRoles: true,
        viewAllData: true
      },
      cannot: {
        deleteSelf: true
      }
    },
    LINE_MANAGER: {
      can: {
        manageStaff: true,
        viewStaffActivities: true,
        lockStaffAccounts: true,
        unlockStaffAccounts: true,
        updateStaffDetails: true,
        viewOwnData: true
      },
      cannot: {
        manageManagers: true,
        assignSUPER_ADMIN: true,
        deleteUsers: true
      }
    },
    STAFF: {
      can: {
        viewOwnData: true,
        updateOwnProfile: true,
        manageOwnActivities: true
      },
      cannot: {
        manageUsers: true,
        viewOthersData: true,
        lockAccounts: true
      }
    }
  };
};

module.exports = {
  canUpdateUser,
  getAllowedUpdateFields,
  canUpdateField,
  canViewUser,
  canDeleteUser,
  canAdminManageUser,
  getManageableUsers,
  isValidRoleHierarchy,
  getRolePermissions
};