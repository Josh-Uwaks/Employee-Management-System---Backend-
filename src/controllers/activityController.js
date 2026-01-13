const DailyActivity = require('../models/dailyActivities');
const User = require('../models/staff');
const mongoose = require('mongoose');

const isDevelopment = process.env.NODE_ENV === 'development';

const createDailyActivity = async (req, res) => {
  try {
    const { timeInterval, description, status } = req.body;

    if (isDevelopment) {
      console.log('[DEV] createDailyActivity called with:', { 
        timeInterval, 
        description, 
        status,
        userId: req.user._id 
      });
    }

    // Validate required fields
    if (!timeInterval || !description) {
      if (isDevelopment) {
        console.log('[DEV] Validation failed - missing required fields');
      }
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
    
    const activity = await DailyActivity.create({
      user: req.user._id,
      date: today,
      timeInterval,
      description,
      status: status || 'pending'
    });

    if (isDevelopment) {
      console.log('[DEV] Activity created successfully:', {
        id: activity._id,
        date: activity.date,
        timeInterval: activity.timeInterval
      });
    }

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
      
      if (isDevelopment) {
        console.log('[DEV] Mongoose validation error:', errors);
      }
      
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Activity validation failed',
        details: errors
      });
    }

    if (error.code === 11000) {
      if (isDevelopment) {
        console.log('[DEV] Duplicate key error:', error.keyValue);
      }
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

    if (isDevelopment) {
      console.log('[DEV] getTodayActivities called for user:', req.user._id);
    }

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

    if (isDevelopment) {
      console.log('[DEV] Today activities found:', {
        count: activities.length,
        stats
      });
    }

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
    const { startDate, endDate, status } = req.query;

    if (isDevelopment) {
      console.log('[DEV] getActivitiesByDateRange called with:', { 
        startDate, 
        endDate, 
        status,
        userId: req.user._id 
      });
    }

    // Validate required parameters
    if (!startDate || !endDate) {
      if (isDevelopment) {
        console.log('[DEV] Missing startDate or endDate');
      }
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

    // Validate date format and create dates in UTC
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59.999Z');
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      if (isDevelopment) {
        console.log('[DEV] Invalid date format:', { startDate, endDate });
      }
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
      if (isDevelopment) {
        console.log('[DEV] Date range exceeds limit:', { diffDays, maxDays });
      }
      return res.status(400).json({
        success: false,
        error: 'DATE_RANGE_ERROR',
        message: `Date range cannot exceed ${maxDays} days`
      });
    }

    // Ensure start date is before end date
    if (start > end) {
      if (isDevelopment) {
        console.log('[DEV] Start date after end date:', { start, end });
      }
      return res.status(400).json({
        success: false,
        error: 'DATE_ORDER_ERROR',
        message: 'Start date must be before end date'
      });
    }

    if (isDevelopment) {
      console.log('[DEV] Date range in UTC:', {
        start: start.toISOString(),
        end: end.toISOString()
      });
    }

    const filter = {
      user: req.user._id,
      date: { $gte: start, $lte: end }
    };

    // Apply status filter if provided
    if (status && ['pending', 'ongoing', 'completed'].includes(status)) {
      filter.status = status;
    }

    if (isDevelopment) {
      console.log('[DEV] Database filter:', JSON.stringify(filter, null, 2));
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
      }
    };

    // Group activities by date (using local date for display)
    activities.forEach(activity => {
      const localDate = new Date(activity.date);
      localDate.setMinutes(localDate.getMinutes() + localDate.getTimezoneOffset());
      const dateStr = localDate.toISOString().split('T')[0];
      
      if (!stats.byDate[dateStr]) {
        stats.byDate[dateStr] = 0;
      }
      stats.byDate[dateStr]++;
    });

    if (isDevelopment) {
      console.log('[DEV] Activities found:', {
        count: activities.length,
        dateRange: { start, end },
        stats
      });
    }

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
    const { timeInterval, description, status } = req.body;

    if (isDevelopment) {
      console.log('[DEV] updateDailyActivity called with:', { 
        activityId: id,
        updates: { timeInterval, description, status },
        userId: req.user._id 
      });
    }

    // Validate activity ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      if (isDevelopment) {
        console.log('[DEV] Invalid activity ID:', id);
      }
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid activity ID format'
      });
    }

    // Validate at least one field is provided for update
    if (!timeInterval && !description && !status) {
      if (isDevelopment) {
        console.log('[DEV] No update fields provided');
      }
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'At least one field must be provided for update'
      });
    }

    // Validate status if provided
    if (status && !['pending', 'ongoing', 'completed'].includes(status)) {
      if (isDevelopment) {
        console.log('[DEV] Invalid status value:', status);
      }
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid status value. Must be one of: pending, ongoing, completed'
      });
    }

    // Find and update activity
    const activity = await DailyActivity.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!activity) {
      if (isDevelopment) {
        console.log('[DEV] Activity not found or permission denied:', id);
      }
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Activity not found or you do not have permission to update it'
      });
    }

    // Prevent updating completed activities to anything else
    if (activity.status === 'completed' && status !== 'completed' && status !== undefined) {
      if (isDevelopment) {
        console.log('[DEV] Cannot update completed activity:', {
          currentStatus: activity.status,
          requestedStatus: status
        });
      }
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

    Object.assign(activity, updates);
    
    const updatedActivity = await activity.save();

    if (isDevelopment) {
      console.log('[DEV] Activity updated successfully:', {
        id: updatedActivity._id,
        updates
      });
    }

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
      
      if (isDevelopment) {
        console.log('[DEV] Update validation error:', errors);
      }
      
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

// In your activityController.js - Update getAllActivities function
const getAllActivities = async (req, res) => {
  try {
    const { date, status, region, branch, user, page = 1, limit = 20 } = req.query; // ADD 'user' parameter

    if (isDevelopment) {
      console.log('[DEV] getAllActivities called with query params:', { 
        date, 
        status, 
        region, 
        branch, 
        user,  // ADDED
        page, 
        limit 
      });
      console.log('[DEV] User role:', req.user.role, 'User ID:', req.user._id);
    }

    // Always filter out activities with null or non-existent users
    const filter = {
      user: { $exists: true, $ne: null }
    };

    // ================================================
    // LINE_MANAGER RESTRICTION: Only direct reports
    // ================================================
    if (req.user.role === 'LINE_MANAGER') {
      // Get all STAFF that report to this LINE_MANAGER
      const directReports = await User.find({ 
        reportsTo: req.user._id,
        role: 'STAFF'
      }).select('_id');
      
      if (isDevelopment) {
        console.log('[DEV] LINE_MANAGER direct reports:', directReports.length);
        console.log('[DEV] Direct report IDs:', directReports.map(r => r._id));
      }
      
      if (directReports.length === 0) {
        // No direct reports, return empty result
        return res.status(200).json({
          success: true,
          message: 'No activities found (no direct reports)',
          filters: {
            date: date || 'All dates',
            status: status || 'All statuses',
            region: region || 'All regions',
            branch: branch || 'All branches',
            user: user || 'All users'  // ADDED
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
      
      // Only include activities from direct reports
      const directReportIds = directReports.map(report => report._id);
      filter.user = { $in: directReportIds };
      
    } else if (req.user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can see all users
      // No restriction needed
    }

    // ================================================
    // USER FILTER: Filter by specific user
    // ================================================
    if (user && user.trim() !== '' && user !== 'all' && user !== 'null' && user !== 'undefined') {
      // Validate user ID format
      if (!mongoose.Types.ObjectId.isValid(user)) {
        if (isDevelopment) {
          console.log('[DEV] Invalid user ID in filter:', user);
        }
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid user ID format in user filter'
        });
      }
      
      // Check if user exists
      const targetUser = await User.findById(user).select('_id role reportsTo');
      
      if (!targetUser) {
        if (isDevelopment) {
          console.log('[DEV] User not found for filter:', user);
        }
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User specified in filter not found'
        });
      }
      
      // For LINE_MANAGER: Ensure they can only filter by their direct reports
      if (req.user.role === 'LINE_MANAGER') {
        const isDirectReport = targetUser.role === 'STAFF' && 
                              targetUser.reportsTo && 
                              targetUser.reportsTo.toString() === req.user._id.toString();
        
        if (!isDirectReport) {
          if (isDevelopment) {
            console.log('[DEV] LINE_MANAGER tried to filter by non-direct report:', {
              targetUserId: user,
              targetUserRole: targetUser.role,
              targetReportsTo: targetUser.reportsTo,
              managerId: req.user._id
            });
          }
          return res.status(403).json({
            success: false,
            error: 'ACCESS_DENIED',
            message: 'You can only filter by your direct reports',
            details: {
              requestedUserId: user,
              requestedUserName: `${targetUser.first_name || ''} ${targetUser.last_name || ''}`.trim()
            }
          });
        }
      }
      
      // Apply user filter
      filter.user = user;
    }

    // ================================================
    // OTHER FILTERS
    // ================================================
    
    // Date filter - handle empty string gracefully
    if (date && date.trim() !== '' && date !== 'null' && date !== 'undefined') {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        if (isDevelopment) {
          console.log('[DEV] Invalid date format:', date);
        }
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
        if (isDevelopment) {
          console.log('[DEV] Invalid status value:', status);
        }
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid status value. Must be one of: pending, ongoing, completed'
        });
      }
      filter.status = status;
    }

    // Region/Branch filters - only apply if user filter not set
    // (When filtering by user, region/branch are derived from the user)
    if (!user || user === 'all' || user === '' || user === 'null' || user === 'undefined') {
      let userFilter = {};
      
      if (region && region !== 'all' && region !== 'null' && region !== 'undefined') {
        userFilter.region = region;
      }
      if (branch && branch !== 'all' && branch !== 'null' && branch !== 'undefined') {
        userFilter.branch = branch;
      }

      // Apply region/branch filters
      if (Object.keys(userFilter).length > 0) {
        // For LINE_MANAGER: Combine with direct reports filter
        if (req.user.role === 'LINE_MANAGER') {
          // Get direct reports that match region/branch filter
          const directReports = await User.find({ 
            reportsTo: req.user._id,
            role: 'STAFF',
            ...userFilter
          }).select('_id');
          
          const directReportIds = directReports.map(report => report._id);
          if (directReportIds.length > 0) {
            filter.user = { $in: directReportIds };
          } else {
            // No direct reports match the region/branch filter
            return res.status(200).json({
              success: true,
              message: 'No activities found for the specified filters',
              filters: {
                date: date || 'All dates',
                status: status || 'All statuses',
                region: region || 'All regions',
                branch: branch || 'All branches',
                user: user || 'All users'
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
        } else if (req.user.role === 'SUPER_ADMIN') {
          // SUPER_ADMIN: Find users matching region/branch
          const users = await User.find(userFilter).select('_id');
          if (users && users.length > 0) {
            const userIds = users.map(u => u._id);
            filter.user = { $in: userIds };
          } else {
            // No users match the region/branch filter
            return res.status(200).json({
              success: true,
              message: 'No activities found for the specified filters',
              filters: {
                date: date || 'All dates',
                status: status || 'All statuses',
                region: region || 'All regions',
                branch: branch || 'All branches',
                user: user || 'All users'
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
      }
    }

    if (isDevelopment) {
      console.log('[DEV] Final database filter:', JSON.stringify(filter, null, 2));
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await DailyActivity.countDocuments(filter);

    if (isDevelopment) {
      console.log('[DEV] Expected total activities:', total);
      console.log('[DEV] Pagination:', { page, limit, skip });
    }

    const activities = await DailyActivity.find(filter)
      .populate({
        path: 'user',
        select: 'id_card first_name last_name region branch department position role reportsTo',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'reportsTo', select: 'id_card first_name last_name role' }
        ]
      })
      .sort({ date: -1, createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Additional security check for LINE_MANAGER
    let filteredActivities = activities;
    if (req.user.role === 'LINE_MANAGER') {
      filteredActivities = activities.filter(activity => {
        if (!activity.user || !activity.user.reportsTo) return false;
        
        // Check if the user reports to this LINE_MANAGER
        const reportsToId = activity.user.reportsTo._id || activity.user.reportsTo;
        return reportsToId.toString() === req.user._id.toString();
      });
      
      if (isDevelopment) {
        console.log('[DEV] LINE_MANAGER post-filter:', {
          before: activities.length,
          after: filteredActivities.length
        });
      }
    }

    // Calculate admin statistics
    const stats = {
      total: req.user.role === 'LINE_MANAGER' ? filteredActivities.length : total,
      byStatus: {
        pending: 0,
        ongoing: 0,
        completed: 0
      },
      byRegion: {},
      byBranch: {}
    };

    filteredActivities.forEach(activity => {
      // Update status counts
      if (activity.status === 'pending') stats.byStatus.pending++;
      else if (activity.status === 'ongoing') stats.byStatus.ongoing++;
      else if (activity.status === 'completed') stats.byStatus.completed++;
      
      const region = activity.user?.region;
      const branch = activity.user?.branch;
      
      if (region) {
        stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
      }
      
      if (branch) {
        stats.byBranch[branch] = (stats.byBranch[branch] || 0) + 1;
      }
    });

    if (isDevelopment) {
      console.log('[DEV] Calculated stats:', stats);
    }

    res.status(200).json({
      success: true,
      message: filteredActivities.length > 0 ? 'Activities retrieved successfully' : 'No activities found',
      role: req.user.role,
      filters: {
        date: date || 'All dates',
        status: status || 'All statuses',
        region: region || 'All regions',
        branch: branch || 'All branches',
        user: user || 'All users'  // ADDED
      },
      stats,
      count: filteredActivities.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total
      },
      data: filteredActivities
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

    if (isDevelopment) {
      console.log('[DEV] getActivitiesByUser called with:', {
        userId: id,
        date: date,
        status: status,
        page: page,
        limit: limit,
        requesterRole: req.user.role,
        requesterId: req.user._id
      });
    }

    // Validate user ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      if (isDevelopment) {
        console.log('[DEV] Invalid user ID format:', id);
      }
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid user ID format'
      });
    }

    // Check if user exists
    const user = await User.findById(id)
      .select('id_card first_name last_name region branch department position role reportsTo')
      .populate('reportsTo', 'id_card first_name last_name role');
    
    if (!user) {
      if (isDevelopment) {
        console.log('[DEV] User not found:', id);
      }
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // ================================================
    // LINE_MANAGER AUTHORIZATION CHECK
    // ================================================
    if (req.user.role === 'LINE_MANAGER') {
      // Check if the requested user is a direct report of this LINE_MANAGER
      const isDirectReport = user.role === 'STAFF' && 
                            user.reportsTo && 
                            user.reportsTo._id.toString() === req.user._id.toString();
      
      if (!isDirectReport) {
        if (isDevelopment) {
          console.log('[DEV] LINE_MANAGER access denied:', {
            requestedUserRole: user.role,
            requestedUserReportsTo: user.reportsTo?._id,
            managerId: req.user._id,
            isDirectReport
          });
        }
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: 'You can only view activities of staff that report directly to you',
          details: {
            userRole: user.role,
            reportsTo: user.reportsTo ? {
              id: user.reportsTo._id,
              name: `${user.reportsTo.first_name} ${user.reportsTo.last_name}`
            } : null
          }
        });
      }
    }
    
    // STAFF can only access their own activities
    if (req.user.role === 'STAFF' && id !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You can only view your own activities'
      });
    }

    // Filter for activities
    const filter = { 
      user: id,
      user: { $exists: true, $ne: null }
    };

    if (isDevelopment) {
      console.log('[DEV] Base filter:', filter);
    }

    // Date filter - handle empty/undefined/null values gracefully
    if (date && date.trim() !== '' && date !== 'null' && date !== 'undefined') {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        if (isDevelopment) {
          console.log('[DEV] Invalid date format:', date);
        }
        return res.status(400).json({
          success: false,
          error: 'DATE_FORMAT_ERROR',
          message: 'Invalid date format. Please use YYYY-MM-DD format'
        });
      }
      d.setHours(0, 0, 0, 0);
      filter.date = d;
      
      if (isDevelopment) {
        console.log('[DEV] Adding date filter:', d);
      }
    } else if (isDevelopment && date) {
      console.log('[DEV] Skipping date filter (empty or invalid):', date);
    }

    // Status filter - handle empty/undefined/null values gracefully
    if (status && status.trim() !== '' && status !== 'null' && status !== 'undefined') {
      if (!['pending', 'ongoing', 'completed'].includes(status)) {
        if (isDevelopment) {
          console.log('[DEV] Invalid status value:', status);
        }
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid status value. Must be one of: pending, ongoing, completed'
        });
      }
      filter.status = status;
      
      if (isDevelopment) {
        console.log('[DEV] Adding status filter:', status);
      }
    } else if (isDevelopment && status) {
      console.log('[DEV] Skipping status filter (empty or invalid):', status);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await DailyActivity.countDocuments(filter);

    if (isDevelopment) {
      console.log('[DEV] Final filter:', JSON.stringify(filter, null, 2));
      console.log('[DEV] Total activities:', total);
      console.log('[DEV] Pagination:', { page, limit, skip });
    }

    const activities = await DailyActivity.find(filter)
      .populate({
        path: 'user',
        select: 'id_card first_name last_name region branch department position role reportsTo',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'reportsTo', select: 'id_card first_name last_name role' }
        ]
      })
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

    if (isDevelopment) {
      console.log('[DEV] Activities found:', activities.length);
      console.log('[DEV] Calculated stats:', stats);
    }

    res.status(200).json({
      success: true,
      message: activities.length > 0 ? 'User activities retrieved successfully' : 'No activities found for this user',
      authorization: {
        requesterRole: req.user.role,
        isDirectReport: req.user.role === 'LINE_MANAGER' ? true : null,
        canView: true
      },
      userInfo: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        id_card: user.id_card,
        region: user.region,
        branch: user.branch,
        department: user.department,
        position: user.position,
        role: user.role,
        reportsTo: user.reportsTo ? {
          id: user.reportsTo._id,
          name: `${user.reportsTo.first_name} ${user.reportsTo.last_name}`,
          role: user.reportsTo.role
        } : null
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
    
    if (isDevelopment) {
      console.log('[DEV] Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
    }
    
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

    if (isDevelopment) {
      console.log('[DEV] deleteDailyActivity called for:', { 
        activityId: id,
        userId: req.user._id 
      });
    }

    // Validate activity ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      if (isDevelopment) {
        console.log('[DEV] Invalid activity ID:', id);
      }
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
      if (isDevelopment) {
        console.log('[DEV] Activity not found or permission denied:', id);
      }
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Activity not found or you do not have permission to delete it'
      });
    }

    if (isDevelopment) {
      console.log('[DEV] Activity deleted successfully:', {
        id: activity._id,
        timeInterval: activity.timeInterval
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