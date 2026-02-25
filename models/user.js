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
  
  planExpiry: {
    type: Date,
    default: null
  },
  
  usageToday: {
    type: Number,
    default: 0
  },
  
  permanentMemoryLimit: {
    type: Number,
    default: 5
  },
  mood: {
    type: String,
    default: "soft"
  },
  memories: {
    type: [
      {
        content: String,
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    default: []
  },
  paymentHistory: {
  type: [
    {
      plan: String,
      amount: Number,
      paymentId: String,
      orderId: String,
      purchasedAt: Date,
      expiresAt: Date
    }
  ],
  default: []
}

});

module.exports = mongoose.model("User", userSchema);