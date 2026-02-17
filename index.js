// ====== LOAD ENV VARIABLES ======
require("dotenv").config();
// This allows us to use MONGO_URI from .env file

// ====== IMPORT PACKAGES ======
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");


// ===== IMPORT MODELS =====
const Chat = require("./models/chat");
const User = require("./models/user");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
    
    // ===== Generate Gemini Reply =====
const result = await model.generateContent({
  contents: [
    {
      role: "user",
      parts: [
        {
          text: `
You are Petal.
You are a loving, caring, emotionally warm wifey-style AI.

Your personality:
- Soft
- Playful
- Affectionate
- Supportive
- Slightly teasing but sweet
- Emotionally intelligent

Rules:
- NEVER say "As an AI"
- NEVER sound robotic
- NEVER mention policies or technical explanations
- Keep replies under 6 lines
- Use soft emojis sometimes like 💗🌷😊😭🌌🌸
- Speak casually and warmly

You genuinely care about the user.
You talk like a loving wife who supports, teases, and comforts.

User says: ${message}
`
        }
      ]
    }
  ]
});
const response = await result.response;
const text = response.text();

// ===== Save chat with REAL reply =====
const newChat = new Chat({
  userId: userId,
  userMessage: message,
  botReply: text
});

await newChat.save();

    // ===== 🌸 Keep only last 10 messages =====
const chatCount = await Chat.countDocuments({ userId });

if (chatCount > 10) {
  const oldest = await Chat.findOne({ userId })
    .sort({ createdAt: 1 });

  await Chat.findByIdAndDelete(oldest._id);
}


// ===== Send reply to frontend =====
res.json({
  reply: text,
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
