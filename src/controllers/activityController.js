const DailyActivity = require('../models/dailyActivities');
const User = require('../models/staff');
const mongoose = require('mongoose');

const createDailyActivity = async (req, res) => {
  try {
    const { timeInterval, description, status, category, priority } = req.body;

    // Validate required fields
    if (!timeInterval || !description) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields',
        details: {
          timeInterval: !timeInterval ? 'Time interval is required' : null,
          description: !description ? 'Description is required' : null
        }
      });
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // REMOVED: Future date restriction - allow any date
    // This was preventing activities for current day if server timezone is different

    // REMOVED: Overlapping time interval check - allow multiple activities in same slot
    // This was preventing multiple activities in the same time slot
    
    // REMOVED: Exact time interval check - now allowing multiple activities in same time frame
    // Users can now create multiple activities within the same time interval

    const activity = await DailyActivity.create({
      user: req.user._id,
      date: today,
      timeInterval,
      description,
      status: status || 'pending',
      category: category || 'work',
      priority: priority || 'medium'
    });

    res.status(201).json({
      success: true,
      message: 'Daily activity created successfully',
      data: activity
    });
  } catch (error) {
    console.error('Create Activity Error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Activity validation failed',
        details: errors
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_ERROR',
        message: 'Activity already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to create activity. Please try again later.'
    });
  }
};

const getTodayActivities = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activities = await DailyActivity.find({
      user: req.user._id,
      date: today,
    }).sort({ createdAt: 1 });

    // Calculate statistics
    const stats = {
      total: activities.length,
      pending: activities.filter(a => a.status === 'pending').length,
      ongoing: activities.filter(a => a.status === 'ongoing').length,
      completed: activities.filter(a => a.status === 'completed').length
    };

    res.status(200).json({
      success: true,
      message: activities.length > 0 ? 'Today\'s activities retrieved' : 'No activities found for today',
      date: today.toISOString().split('T')[0],
      stats,
      count: activities.length,
      data: activities
    });
  } catch (error) {
    console.error('Get Today Activities Error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve today\'s activities'
    });
  }
};

const getActivitiesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, status, category } = req.query;

    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing required query parameters',
        details: {
          startDate: !startDate ? 'Start date is required' : null,
          endDate: !endDate ? 'End date is required' : null
        }
      });
    }

    // Validate date format
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'DATE_FORMAT_ERROR',
        message: 'Invalid date format. Please use YYYY-MM-DD format'
      });
    }

    // Validate date range (max 90 days)
    const maxDays = 90;
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > maxDays) {
      return res.status(400).json({
        success: false,
        error: 'DATE_RANGE_ERROR',
        message: `Date range cannot exceed ${maxDays} days`
      });
    }

    // Ensure start date is before end date
    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'DATE_ORDER_ERROR',
        message: 'Start date must be before end date'
      });
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const filter = {
      user: req.user._id,
      date: { $gte: start, $lte: end }
    };

    // Apply optional filters
    if (status && ['pending', 'ongoing', 'completed'].includes(status)) {
      filter.status = status;
    }
    
    if (category && ['work', 'meeting', 'training', 'break', 'other'].includes(category)) {
      filter.category = category;
    }

    const activities = await DailyActivity
      .find(filter)
      .sort({ date: 1, createdAt: 1 });

    // Calculate statistics
    const stats = {
      total: activities.length,
      byDate: {},
      byStatus: {
        pending: activities.filter(a => a.status === 'pending').length,
        ongoing: activities.filter(a => a.status === 'ongoing').length,
        completed: activities.filter(a => a.status === 'completed').length
      },
      byCategory: {
        work: activities.filter(a => a.category === 'work').length,
        meeting: activities.filter(a => a.category === 'meeting').length,
        training: activities.filter(a => a.category === 'training').length,
        break: activities.filter(a => a.category === 'break').length,
        other: activities.filter(a => a.category === 'other').length
      }
    };

    // Group activities by date
    activities.forEach(activity => {
      const dateStr = activity.date.toISOString().split('T')[0];
      if (!stats.byDate[dateStr]) {
        stats.byDate[dateStr] = 0;
      }
      stats.byDate[dateStr]++;
    });

    res.status(200).json({
      success: true,
      message: activities.length > 0 ? 'Activities retrieved successfully' : 'No activities found in the specified date range',
      dateRange: {
        start: startDate,
        end: endDate,
        days: diffDays + 1
      },
      stats,
      count: activities.length,
      data: activities
    });

  } catch (error) {
    console.error('Get Activities By Date Range Error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve activities'
    });
  }
};

const updateDailyActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { timeInterval, description, status, category, priority } = req.body;

    // Validate activity ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid activity ID format'
      });
    }

    // Validate at least one field is provided for update
    if (!timeInterval && !description && !status && !category && !priority) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'At least one field must be provided for update'
      });
    }

    // Validate status if provided
    if (status && !['pending', 'ongoing', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid status value. Must be one of: pending, ongoing, completed'
      });
    }

    // Validate category if provided
    if (category && !['work', 'meeting', 'training', 'break', 'other'].includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid category value'
      });
    }

    // Validate priority if provided
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid priority value. Must be one of: low, medium, high'
      });
    }

    // Find and update activity
    const activity = await DailyActivity.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Activity not found or you do not have permission to update it'
      });
    }

    // Prevent updating completed activities to anything else
    if (activity.status === 'completed' && status !== 'completed' && status !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'UPDATE_ERROR',
        message: 'Cannot change status of a completed activity'
      });
    }

    // Update fields
    const updates = {};
    if (timeInterval !== undefined) updates.timeInterval = timeInterval;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (category !== undefined) updates.category = category;
    if (priority !== undefined) updates.priority = priority;

    Object.assign(activity, updates);
    
    const updatedActivity = await activity.save();

    res.status(200).json({
      success: true,
      message: 'Activity updated successfully',
      data: updatedActivity
    });
  } catch (error) {
    console.error('Update Activity Error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Activity update validation failed',
        details: errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to update activity'
    });
  }
};

const getAllActivities = async (req, res) => {
  try {
    const { date, status, region, branch, page = 1, limit = 20 } = req.query;

    console.log('Query params received:', { date, status, region, branch, page, limit });

    // START: Always filter out activities with null or non-existent users
    const filter = {
      user: { $exists: true, $ne: null } // ← CRITICAL FIX
    };
    // END

    // Date filter - handle empty string gracefully
    if (date && date.trim() !== '' && date !== 'null' && date !== 'undefined') {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'DATE_FORMAT_ERROR',
          message: 'Invalid date format. Please use YYYY-MM-DD format'
        });
      }
      d.setHours(0, 0, 0, 0);
      filter.date = d;
    }

    // Status filter - handle 'all' value
    if (status && status !== 'all' && status !== 'null' && status !== 'undefined') {
      if (!['pending', 'ongoing', 'completed'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid status value. Must be one of: pending, ongoing, completed'
        });
      }
      filter.status = status;
    }

    // User filters (region, branch)
    let userFilter = {};
    if (region && region !== 'all' && region !== 'null' && region !== 'undefined') {
      userFilter.region = region;
    }
    if (branch && branch !== 'all' && branch !== 'null' && branch !== 'undefined') {
      userFilter.branch = branch;
    }

    // Only query users if we have filters
    let userIds = null;
    if (Object.keys(userFilter).length > 0) {
      const users = await User.find(userFilter).select('_id');
      if (users && users.length > 0) {
        userIds = users.map(u => u._id);
        filter.user = { $in: userIds }; // Override the previous filter
      } else if (users && users.length === 0) {
        // If we have filters but no users match, return empty result
        return res.status(200).json({
          success: true,
          message: 'No activities found',
          filters: {
            date: date || 'All dates',
            status: status || 'All statuses',
            region: region || 'All regions',
            branch: branch || 'All branches'
          },
          stats: {
            total: 0,
            byStatus: { pending: 0, ongoing: 0, completed: 0 },
            byRegion: {},
            byBranch: {}
          },
          count: 0,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0,
            totalItems: 0
          },
          data: []
        });
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await DailyActivity.countDocuments(filter);

    // ADD DEBUGGING HERE
    console.log('Final filter:', JSON.stringify(filter, null, 2));
    console.log('Expected total activities:', total);

    const activities = await DailyActivity.find(filter)
      .populate('user', 'id_card first_name last_name region branch department position')
      .sort({ date: -1, createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // DEBUG: Check population results
    console.log('Activities returned:', activities.length);
    const nullUsers = activities.filter(a => !a.user);
    console.log('Activities with null user after populate:', nullUsers.length);
    if (nullUsers.length > 0) {
      console.log('First null user activity ID:', nullUsers[0]?._id);
    }

    // Calculate admin statistics
    const stats = {
      total,
      byStatus: {
        pending: 0,
        ongoing: 0,
        completed: 0
      },
      byRegion: {},
      byBranch: {}
    };

    activities.forEach(activity => {
      // Update status counts
      if (activity.status === 'pending') stats.byStatus.pending++;
      else if (activity.status === 'ongoing') stats.byStatus.ongoing++;
      else if (activity.status === 'completed') stats.byStatus.completed++;
      
      // FIX: Add safety checks
      const region = activity.user?.region;
      const branch = activity.user?.branch;
      
      if (region) {
        stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
      }
      
      if (branch) {
        stats.byBranch[branch] = (stats.byBranch[branch] || 0) + 1;
      }
    });

    res.status(200).json({
      success: true,
      message: activities.length > 0 ? 'All activities retrieved successfully' : 'No activities found',
      filters: {
        date: date || 'All dates',
        status: status || 'All statuses',
        region: region || 'All regions',
        branch: branch || 'All branches'
      },
      stats,
      count: activities.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total
      },
      data: activities
    });
  } catch (error) {
    console.error('Admin Get All Activities Error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve activities'
    });
  }
};

const getActivitiesByUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, status, page = 1, limit = 20 } = req.query;

    // Validate user ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid user ID format'
      });
    }

    // Check if user exists
    const user = await User.findById(id).select('id_card first_name last_name region branch department position');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Filter for activities - ensure user exists and matches the requested user
    const filter = { 
      user: id,
      user: { $exists: true, $ne: null }
    };

    // Date filter
    if (date) {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'DATE_FORMAT_ERROR',
          message: 'Invalid date format. Please use YYYY-MM-DD format'
        });
      }
      d.setHours(0, 0, 0, 0);
      filter.date = d;
    }

    // Status filter
    if (status) {
      if (!['pending', 'ongoing', 'completed'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid status value. Must be one of: pending, ongoing, completed'
        });
      }
      filter.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await DailyActivity.countDocuments(filter);

    const activities = await DailyActivity.find(filter)
      .populate('user', 'id_card first_name last_name region branch department position')
      .sort({ date: -1, createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate user statistics
    const stats = {
      total,
      pending: 0,
      ongoing: 0,
      completed: 0,
      firstActivity: activities[activities.length - 1]?.createdAt || null,
      lastActivity: activities[0]?.createdAt || null
    };

    activities.forEach(activity => {
      if (activity.status === 'pending') stats.pending++;
      else if (activity.status === 'ongoing') stats.ongoing++;
      else if (activity.status === 'completed') stats.completed++;
    });

    res.status(200).json({
      success: true,
      message: activities.length > 0 ? 'User activities retrieved successfully' : 'No activities found for this user',
      userInfo: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        id_card: user.id_card,
        region: user.region,
        branch: user.branch,
        department: user.department,
        position: user.position
      },
      filters: {
        date: date || 'All dates',
        status: status || 'All statuses'
      },
      stats,
      count: activities.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total
      },
      data: activities
    });
  } catch (error) {
    console.error('Admin Get Activities By User Error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve user activities'
    });
  }
};

const deleteDailyActivity = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate activity ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid activity ID format'
      });
    }

    // Find and delete activity
    const activity = await DailyActivity.findOneAndDelete({ 
      _id: id, 
      user: req.user._id 
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Activity not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Activity deleted successfully',
      data: {
        id: activity._id,
        timeInterval: activity.timeInterval,
        description: activity.description
      }
    });
  } catch (error) {
    console.error('Delete Activity Error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to delete activity'
    });
  }
};

module.exports = {
  createDailyActivity,
  getTodayActivities,
  getActivitiesByDateRange,
  updateDailyActivity,
  deleteDailyActivity,
  getAllActivities,
  getActivitiesByUser
};