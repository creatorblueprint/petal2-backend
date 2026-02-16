const mongoose = require("mongoose");

// User Schema defines user tracking system
const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastReset: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", userSchema);