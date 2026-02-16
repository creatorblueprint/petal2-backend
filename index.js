// ====== LOAD ENV VARIABLES ======
import dotenv from "dotenv";
dotenv.config();
// This allows us to use MONGO_URI from .env file

// ====== IMPORT PACKAGES ======
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");


// ===== IMPORT MODELS =====
const Chat = require("./models/chat");
const User = require("./models/user");


// ====== CREATE APP ======
const app = express();

// ====== MIDDLEWARE ======
app.use(cors());
// Allows frontend (GitHub site) to talk to backend

app.use(express.json());
// Allows backend to read JSON data from frontend

// ====== CONNECT TO MONGODB ======
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🌸 MongoDB Connected"))
  .catch(err => console.log("Mongo Error:", err));


// ===== CHAT ROUTE WITH DAILY LIMIT =====
app.post("/chat", async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: "Missing data" });
    }
    
    let user = await User.findOne({ userId });
    
    // If new user, create one
    if (!user) {
      user = new User({ userId });
      await user.save();
    }
    
    // Reset daily counter if new day
    const today = new Date();
    const lastReset = new Date(user.lastReset);
    
    if (today.toDateString() !== lastReset.toDateString()) {
      user.messageCount = 0;
      user.lastReset = today;
    }
    
    // Check limit
    if (user.messageCount >= 5) {
      return res.status(403).json({
        error: "Daily limit reached. Come back tomorrow 🌷"
      });
    }
    
    // Increase count
    user.messageCount += 1;
    await user.save();
    
    // Save chat message
    const newChat = new Chat({
      userId,
      message
    });
    
    await newChat.save();
    
    res.json({
      reply: "Petal will respond here 🌷",
      remaining: 5 - user.messageCount
    });
    
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ====== BASIC TEST ROUTE ======
app.get("/", (req, res) => {
  res.send("Petal Backend is running 🌷");
});

// ====== START SERVER ======
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
