const express = require('express');
const router = express.Router();
const {
  createDailyActivity,
  getTodayActivities,
  getActivitiesByDateRange,
  updateDailyAcitivty,
  getAllActivities,
  getActivitiesByUser
} = require('../controllers/activityController');
const { authMiddleware } = require('../middleware/auth.middleware');
const { 
  isAdmin, 
  isSuperAdmin, 
  isLineManager, 
  selfOrAdmin,
  selfManagerOrSuperAdmin 
} = require('../middleware/role.middleware');

// Apply authentication to all routes
router.use(authMiddleware);

// ===========================
// PERSONAL ACTIVITY ROUTES (Self)
// ===========================

// POST create daily activity (Self only)
router.post('/', createDailyActivity);

// GET today's activities (Self only)
router.get('/today', getTodayActivities);

// GET activities by date range (Self only)
router.get('/', getActivitiesByDateRange);

// PUT update daily activity (Self only - own activities)
router.put('/:id', updateDailyAcitivty);

// ===========================
// ADMIN ACTIVITY ROUTES
// ===========================

// GET all activities (Admin only - with filters)
router.get('/all', isAdmin, getAllActivities);

// GET activities by user (Admin only - for specific users)
// Authorization: Self, Manager of staff, or SUPER_ADMIN
router.get('/user/:id', selfManagerOrSuperAdmin, getActivitiesByUser);

// ===========================
// MANAGER-SPECIFIC ROUTES
// ===========================

// GET activities for staff under manager (LINE_MANAGER only)
// router.get('/manager/staff-activities', isLineManager, async (req, res) => {
//   try {
//     // Get staff members who report to this manager
//     const staffMembers = await User.find({ 
//       reportsTo: req.user._id,
//       is_active: true 
//     }).select('_id id_card first_name last_name');
    
//     const staffIds = staffMembers.map(staff => staff._id);
    
//     // Get activities for these staff members
//     const activities = await DailyActivity.find({
//       user: { $in: staffIds },
//       date: { 
//         $gte: new Date(new Date().setDate(new Date().getDate() - 7)), // Last 7 days
//         $lte: new Date()
//       }
//     })
//     .populate('user', 'id_card first_name last_name')
//     .sort({ date: -1, createdAt: 1 });
    
//     res.json({
//       success: true,
//       count: activities.length,
//       staffCount: staffMembers.length,
//       data: {
//         staffMembers,
//         activities
//       }
//     });
//   } catch (error) {
//     console.error('Manager staff activities error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// // GET team activity summary (LINE_MANAGER or SUPER_ADMIN)
// router.get('/team/summary', isAdmin, async (req, res) => {
//   try {
//     const { startDate, endDate } = req.query;
    
//     let dateFilter = {};
//     if (startDate && endDate) {
//       const start = new Date(startDate);
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       dateFilter.date = { $gte: start, $lte: end };
//     } else {
//       // Default: last 30 days
//       const start = new Date();
//       start.setDate(start.getDate() - 30);
//       dateFilter.date = { $gte: start, $lte: new Date() };
//     }
    
//     // Get user IDs based on role
//     let userIds = [];
    
//     if (req.user.role === 'LINE_MANAGER') {
//       // Get staff who report to this manager
//       const staff = await User.find({ 
//         reportsTo: req.user._id,
//         is_active: true 
//       }).select('_id');
//       userIds = staff.map(user => user._id);
//     } else if (req.user.role === 'SUPER_ADMIN') {
//       // Get all active users
//       const users = await User.find({ is_active: true }).select('_id');
//       userIds = users.map(user => user._id);
//     }
    
//     if (userIds.length === 0) {
//       return res.json({
//         success: true,
//         count: 0,
//         summary: {
//           totalActivities: 0,
//           completed: 0,
//           pending: 0,
//           inProgress: 0,
//           byUser: []
//         }
//       });
//     }
    
//     dateFilter.user = { $in: userIds };
    
//     const activities = await DailyActivity.find(dateFilter)
//       .populate('user', 'id_card first_name last_name role')
//       .select('user status date');
    
//     // Calculate summary
//     const summary = {
//       totalActivities: activities.length,
//       completed: activities.filter(a => a.status === 'completed').length,
//       pending: activities.filter(a => a.status === 'pending').length,
//       inProgress: activities.filter(a => a.status === 'in-progress').length,
//       byUser: []
//     };
    
//     // Group by user
//     const userMap = new Map();
//     activities.forEach(activity => {
//       const userId = activity.user._id.toString();
//       if (!userMap.has(userId)) {
//         userMap.set(userId, {
//           user: {
//             id: activity.user._id,
//             id_card: activity.user.id_card,
//             name: `${activity.user.first_name} ${activity.user.last_name}`,
//             role: activity.user.role
//           },
//           total: 0,
//           completed: 0,
//           pending: 0,
//           inProgress: 0
//         });
//       }
      
//       const userStats = userMap.get(userId);
//       userStats.total++;
//       if (activity.status === 'completed') userStats.completed++;
//       if (activity.status === 'pending') userStats.pending++;
//       if (activity.status === 'in-progress') userStats.inProgress++;
//     });
    
//     summary.byUser = Array.from(userMap.values());
    
//     res.json({
//       success: true,
//       summary
//     });
//   } catch (error) {
//     console.error('Team activity summary error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

module.exports = router;