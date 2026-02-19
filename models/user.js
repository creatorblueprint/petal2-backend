const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  messageCount: {
    type: Number,
    default: 0
  },
  lastReset: {
    type: Date,
    default: Date.now
  },
  plan: {
  type: String,
  default: "free"
},
  mood: {
  type: String,
  default: "soft"
}
});

module.exports = mongoose.model("User", userSchema);
