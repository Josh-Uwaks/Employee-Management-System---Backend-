const mongoose = require('mongoose');

const dailyActivitySchema = new mongoose.Schema(
  {
    // ===========================
    // Ownership
    // ===========================
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      index: true
    },

    timeInterval: {
      type: String,
      required: true // e.g. "09:00 - 10:30"
    },

    description: {
      type: String,
      required: true,
      trim: true
    },

    status: {
      type: String,
      enum: ['pending', 'ongoing', 'completed'],
      default: 'pending'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model('DailyActivity', dailyActivitySchema);
