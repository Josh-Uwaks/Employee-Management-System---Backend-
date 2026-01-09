const mongoose = require('mongoose');

const dailyActivitySchema = new mongoose.Schema(
  {
    // ===========================
    // Ownership
    // ===========================
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },

    // ===========================
    // Activity details
    // ===========================
    date: {
      type: Date,
      default: () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      },
      index: true,
      validate: {
        validator: function(date) {
          return date <= new Date();
        },
        message: 'Activity date cannot be in the future'
      }
    },

    timeInterval: {
      type: String,
      required: [true, 'Time interval is required'],
      validate: {
        validator: function(interval) {
          // Validate format "HH:MM - HH:MM"
          const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s*-\s*([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!regex.test(interval)) return false;
          
          // Validate start time is before end time
          const [start, end] = interval.split('-').map(t => t.trim());
          return start < end;
        },
        message: 'Time interval must be in format "HH:MM - HH:MM" with start time before end time'
      }
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [3, 'Description must be at least 3 characters'],
      maxlength: [500, 'Description cannot exceed 500 characters']
    },

    status: {
      type: String,
      enum: {
        values: ['pending', 'ongoing', 'completed'],
        message: 'Status must be either "pending", "ongoing", or "completed"'
      },
      default: 'pending'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound index for better query performance
dailyActivitySchema.index({ user: 1, date: 1 });
dailyActivitySchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('DailyActivity', dailyActivitySchema);