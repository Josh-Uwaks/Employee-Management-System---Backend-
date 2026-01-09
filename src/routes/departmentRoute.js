const express = require('express');
const router = express.Router();
const {
  createDepartment,
  getDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
  toggleDepartmentStatus
} = require('../controllers/departmentController');
const { authMiddleware } = require('../middleware/auth.middleware');
const { 
  isSuperAdmin, 
  isAdmin, 
  selfOrAdmin 
} = require('../middleware/role.middleware');

// Apply authentication to all routes
router.use(authMiddleware);

// ===========================
// DEPARTMENT ROUTES
// ===========================

// GET all departments (Public - authenticated users can view)
router.get('/', getDepartments);

// GET single department by ID (Public - authenticated users can view)
router.get('/:id', getDepartment);

// POST create new department (SUPER_ADMIN only)
router.post('/', isSuperAdmin, createDepartment);

// PUT update department (SUPER_ADMIN only)
router.put('/:id', isSuperAdmin, updateDepartment);

// DELETE department (SUPER_ADMIN only - permanent deletion)
router.delete('/:id', isSuperAdmin, deleteDepartment);

// PATCH toggle department status (Admin only - SUPER_ADMIN or LINE_MANAGER)
router.patch('/:id/toggle-status', isAdmin, toggleDepartmentStatus);

// ===========================
// ADDITIONAL DEPARTMENT ROUTES
// ===========================

// GET departments with statistics (Admin only)
// router.get('/stats/overview', isAdmin, async (req, res) => {
//   try {
//     // This would be implemented in departmentController
//     res.json({
//       success: true,
//       message: 'Department statistics endpoint - implement in controller'
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// // GET inactive departments (Admin only)
// router.get('/inactive/list', isAdmin, async (req, res) => {
//   try {
//     const inactiveDepartments = await Department.find({ isActive: false });
//     res.json({
//       success: true,
//       count: inactiveDepartments.length,
//       data: inactiveDepartments
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

module.exports = router;