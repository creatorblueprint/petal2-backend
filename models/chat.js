const mongoose = require("mongoose");

// Chat Schema defines how chat data will look in database
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userMessage: { type: String, required: true },
  botReply: { type: String, required: true }
}, { timestamps: true });

// Export model
module.exports = mongoose.model("Chat", chatSchema);
