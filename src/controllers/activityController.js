const DailyActivity = require('../models/dailyActivities');
const User = require('../models/staff');


const createDailyActivity = async (req, res) => {
    try {
        const {timeInterval, description, status} = req.body;

        if(!timeInterval || !description) {
            return res.status(400).json({message: 'Time interval and description are required.'});
        }

        const activity = await DailyActivity.create({
            user: req.user._id,
            timeInterval,
            description,
            status
        });

        res.status(201).json({
            message: 'Daily activity created successfully',
            data: activity
        })
    } catch (error) {
        console.error('Create Activity Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

const getTodayActivities = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0,0,0,0);

        const activities = await DailyActivity.find({
            user: req.user._id,
            date: today,
        }).sort({createdAt: 1})

        res.status(200).json({
            count: activities.length,
            data: activities
        })
    } catch (error) {
        console.error('Get Today Activities Error:', error);
    res.status(500).json({ message: 'Server error' });
    }
}

const getActivitiesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'Start date and end date are required.'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const filter = {
      user: req.user._id,
      date: { $gte: start, $lte: end }
    };

    const activities = await DailyActivity
      .find(filter)
      .sort({ date: 1, createdAt: 1 });

    res.status(200).json({
      count: activities.length,
      data: activities
    });

  } catch (error) {
    console.error('Get Activities By Date Range Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateDailyAcitivty = async (req, res) => {
    try {
        const {id} = req.params;
        const {timeInterval, description, status} = req.body;

        const activity = await DailyActivity.findOne({_id: id, user: req.user._id});
        if(!activity) {
            return res.status(404).json({message: 'Activity not found.'});
        }

        Object.assign(activity, {timeInterval, description, status});
        
        await activity.save();
        res.status(200).json({
            message: 'Activity updated successfully',
            data: activity
        });
    } catch (error) {
        console.error('Update Activity Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

// Admin only

const getAllActivities = async (req, res) => {
  try {
    const { date, status, region, branch } = req.query;

    const filter = {};

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      filter.date = d;
    }

    if (status) filter.status = status;

    let userFilter = {};

    if (region) userFilter.region = region;
    if (branch) userFilter.branch = branch;

    const users = Object.keys(userFilter).length
      ? await User.find(userFilter).select('_id')
      : null;

    if (users) {
      filter.user = { $in: users.map(u => u._id) };
    }

    const activities = await DailyActivity.find(filter)
      .populate('user', 'id_card first_name last_name region branch')
      .sort({ date: -1, createdAt: 1 });

    res.status(200).json({
      count: activities.length,
      data: activities
    });
  } catch (error) {
    console.error('Admin Get All Activities Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getActivitiesByUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, status } = req.query;

    const filter = { user: id };

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      filter.date = d;
    }

    if (status) filter.status = status;

    const activities = await DailyActivity.find(filter)
      .populate('user', 'id_card first_name last_name region branch')
      .sort({ date: -1, createdAt: 1 });

    res.status(200).json({
      count: activities.length,
      data: activities
    });
  } catch (error) {
    console.error('Admin Get Activities By User Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


module.exports = {
    createDailyActivity,
    getTodayActivities,
    getActivitiesByDateRange,
    updateDailyAcitivty,
    getAllActivities,
    getActivitiesByUser
};