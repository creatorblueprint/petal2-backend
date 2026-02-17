const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true
  },
  messages: [
    {
      role: String,
      content: String
    }
  ]
});

module.exports = mongoose.model("Chat", chatSchema);
