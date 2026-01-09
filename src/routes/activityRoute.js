const express = require('express');
const router = express.Router();
const {
  createDailyActivity,
  getTodayActivities,
  getActivitiesByDateRange,
  updateDailyActivity,
  deleteDailyActivity,
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

// Validation middleware
const validate = require('../middleware/validate.middleware');
const { body, query, param } = require('express-validator');

// Validation rules
const createActivityRules = [
  body('timeInterval')
    .trim()
    .notEmpty().withMessage('Time interval is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*-\s*([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Time interval must be in format "HH:MM - HH:MM"'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 3, max: 500 }).withMessage('Description must be between 3 and 500 characters'),
  body('status')
    .optional()
    .isIn(['pending', 'ongoing', 'completed']).withMessage('Status must be pending, ongoing, or completed'),
  body('category')
    .optional()
    .isIn(['work', 'meeting', 'training', 'break', 'other']).withMessage('Invalid category'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high']).withMessage('Priority must be low, medium, or high')
];

const updateActivityRules = [
  param('id')
    .isMongoId().withMessage('Invalid activity ID format'),
  body('timeInterval')
    .optional()
    .trim()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*-\s*([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Time interval must be in format "HH:MM - HH:MM"'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 3, max: 500 }).withMessage('Description must be between 3 and 500 characters'),
  body('status')
    .optional()
    .isIn(['pending', 'ongoing', 'completed']).withMessage('Status must be pending, ongoing, or completed'),
  body('category')
    .optional()
    .isIn(['work', 'meeting', 'training', 'break', 'other']).withMessage('Invalid category'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high']).withMessage('Priority must be low, medium, or high')
];

const dateRangeRules = [
  query('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Start date must be in valid ISO8601 format (YYYY-MM-DD)'),
  query('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('End date must be in valid ISO8601 format (YYYY-MM-DD)'),
  query('status')
    .optional()
    .isIn(['pending', 'ongoing', 'completed']).withMessage('Status must be pending, ongoing, or completed'),
  query('category')
    .optional()
    .isIn(['work', 'meeting', 'training', 'break', 'other']).withMessage('Invalid category')
];

const adminFiltersRules = [
  query('date')
    .optional()
    .custom((value) => {
      // Allow empty string or null
      if (!value || value.trim() === '' || value === 'null' || value === 'undefined') {
        return true;
      }
      // If value is provided, validate ISO8601 format
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!iso8601Regex.test(value)) {
        throw new Error('Date must be in valid ISO8601 format (YYYY-MM-DD)');
      }
      return true;
    }),
  query('status')
    .optional()
    .custom((value) => {
      // Allow empty string, 'all', or null
      if (!value || value.trim() === '' || value === 'all' || value === 'null' || value === 'undefined') {
        return true;
      }
      // If value is provided, validate it's one of the allowed values
      const allowedValues = ['pending', 'ongoing', 'completed'];
      if (!allowedValues.includes(value)) {
        throw new Error('Status must be pending, ongoing, or completed');
      }
      return true;
    }),
  query('region')
    .optional()
    .custom((value) => {
      // Allow empty string, 'all', or null
      if (!value || value.trim() === '' || value === 'all' || value === 'null' || value === 'undefined') {
        return true;
      }
      // If value is provided, validate length
      if (value.length < 2 || value.length > 50) {
        throw new Error('Region must be between 2 and 50 characters');
      }
      return true;
    }),
  query('branch')
    .optional()
    .custom((value) => {
      // Allow empty string, 'all', or null
      if (!value || value.trim() === '' || value === 'all' || value === 'null' || value === 'undefined') {
        return true;
      }
      // If value is provided, validate length
      if (value.length < 2 || value.length > 50) {
        throw new Error('Branch must be between 2 and 50 characters');
      }
      return true;
    }),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];
const userActivitiesRules = [
  param('id')
    .isMongoId().withMessage('Invalid user ID format'),
  query('date')
    .optional()
    .isISO8601().withMessage('Date must be in valid ISO8601 format (YYYY-MM-DD)'),
  query('status')
    .optional()
    .isIn(['pending', 'ongoing', 'completed']).withMessage('Status must be pending, ongoing, or completed'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// Apply authentication to all routes
router.use(authMiddleware);

// ===========================
// PERSONAL ACTIVITY ROUTES (Self)
// ===========================

// POST create daily activity (Self only)
router.post('/', createActivityRules, validate, createDailyActivity);

// GET today's activities (Self only)
router.get('/today', getTodayActivities);

// GET activities by date range (Self only)
router.get('/', dateRangeRules, validate, getActivitiesByDateRange);

// PUT update daily activity (Self only - own activities)
router.put('/:id', updateActivityRules, validate, updateDailyActivity);

// DELETE activity (Self only - own activities)
router.delete('/:id', deleteDailyActivity);

// ===========================
// ADMIN ACTIVITY ROUTES
// ===========================

// GET all activities (Admin only - with filters)
router.get('/all', isAdmin, adminFiltersRules, validate, getAllActivities);

// GET activities by user (Admin only - for specific users)
router.get('/user/:id', selfManagerOrSuperAdmin, userActivitiesRules, validate, getActivitiesByUser);

module.exports = router;