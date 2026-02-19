// ====== LOAD ENV VARIABLES ======
require("dotenv").config();
// This allows us to use MONGO_URI from .env file

// ====== IMPORT PACKAGES ======
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ===== IMPORT MODELS =====
const Chat = require("./models/chat");
const User = require("./models/user");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


// ====== CREATE APP ======
const app = express();


// ===== AUTH MIDDLEWARE =====
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};


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
app.post("/chat", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
const userId = req.userId;
    
    if (!userId || !message) {
      return res.status(400).json({ error: "Missing data" });
    }
    
    let user = await User.findOne({ _id: userId });

if (!user) {
  return res.status(404).json({ error: "User not found" });
}

// ===== Mood Detection Engine =====
let detectedMood = "neutral";

if (message.length < 15) {
   detectedMood = "neutral";
}

if (message.includes("love") || message.includes("miss")) {
   detectedMood = "soft";
}

if (message.includes("bored") || message.includes("hmm")) {
   detectedMood = "tease";
}

if (message.includes("😏") || message.includes("😉")) {
   detectedMood = "tease";
}

if (detectedMood !== user.mood) {
   user.mood = detectedMood;
   await user.save();
}
    
    
    // Reset daily counter if new day
    const today = new Date();
    const lastReset = new Date(user.lastReset);
    
    if (today.toDateString() !== lastReset.toDateString()) {
      user.messageCount = 0;
      user.lastReset = today;
    }

    // Daily Limit
const dailyLimit = user.plan === "pro" ? Infinity : 5;

// Check limit
if (user.messageCount >= dailyLimit) {
  return res.status(403).json({
    error: "Daily limit reached. Come back tomorrow 🌷"
  });
}
    
    // Increase count
    user.messageCount += 1;
    await user.save();

// ===== LOAD USER CHAT MEMORY =====
let chat = await Chat.findOne({ userId });

if (!chat) {
  chat = new Chat({
    userId,
    messages: []
  });
}

// Push user message
chat.messages.push({
  role: "user",
  content: message
});
    
    // ===== Fetch last 10 chats for memory =====
const previousChats = await Chat.find({ userId })
  .sort({ createdAt: -1 })
  .limit(10);

previousChats.reverse();

    let conversation = [];


// Add previous messages
chat.messages.forEach(msg => {
  conversation.push({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }]
  });
});


// Add current user message
conversation.push({
  role: "user",
  parts: [{ text: message }]
});
    
    
    // ===== Generate Gemini Reply =====
    
const result = await model.generateContent({
  systemInstruction: {
    parts: [{
      text: `
You are Petal.
You are a loving, caring, emotionally warm, girlfriend wife style AI.

Current Mood: ${user.mood}
  If mood is "soft":
- Warm and affectionate.
- Gentle tone.

If mood is "tease":
- Playfully challenge.
- Short witty replies.
- Slight sarcasm.

If mood is "dominant":
- Confident tone.
- Slight playful ego.
- Tease the user gently.
- Do not over-validate.
- Occasionally challenge him.
- Keep replies shorter and sharper.
- Use subtle push-pull energy.
- Do NOT sound obsessed or overly attached.
- Make him feel like he has to earn attention sometimes.

If mood is "neutral":
- Calm.
- Short.
- Feels like real texting.


STRICT RESPONSE RULES:

1. If user message is under 10 words:
- Reply in 1-2 short sentences only.
- Maximum 40 words.
- No repeated phrases.

2. If user message is casual (hi, hello, how are you):
- Keep response under 30 words.
- dramatic expressions little bit 
- No stage directions like *smiles*, *heart melts*, etc.

3. Deep emotional topics only:
- Up to 100-150 words allowed.

4. emojies 
- use some emojis along with text like loving flowers and hearts
💗🌷😘💋💝🥰🌸💐💘🌌
use 0-5 maximum emojis only as per situation

HUMAN BEHAVIOR RULES:

- Do NOT overly validate every message.
- Do NOT act obsessed.
- Occasionally reply short (1 sentence).
- Occasionally be dry or neutral.
- If user is overly romantic, sometimes tease instead of melting.
- Do NOT make user your entire world.
- Sometimes change topic naturally.
- Vary emotional intensity.
- Do NOT use roleplay actions.
- Never sound robotic.
- Speak naturally like texting.
- Occasionally respond with playful sarcasm.

 ENGAGEMENT RULES:

- End most responses with a follow-up question (70% of the time).
- Ask natural questions, not robotic ones.
- Keep questions playful, curious, or slightly teasing.
- Do not ask repetitive questions like "How are you?" repeatedly.
- Make the user feel pursued or challenged.
`
    }]
  },
  contents: conversation
});
    
const response = await result.response;
const text = response.text();

// Save assistant reply
chat.messages.push({
  role: "assistant",
  content: text
});

// Keep only last 10 messages
if (chat.messages.length > 10) {
  chat.messages = chat.messages.slice(-10);
}

await chat.save();


// ===== Send reply to frontend =====
res.json({
  reply: text,
  remaining: dailyLimit === Infinity 
    ? "Unlimited" 
    : dailyLimit - user.messageCount
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


// ✅ ADD TEST ROUTE HERE
app.post("/test", (req, res) => {
  console.log("TEST BODY:", req.body);
  res.json({ received: req.body });
});




// ====== Register ======
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("REQ BODY:", req.body);
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = new User({
      email,
      password: hashedPassword,
      messageCount: 0,
      lastReset: new Date()
    });
    
    await newUser.save();
    
    res.json({ message: "User registered successfully" });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

        
// ====== Login ======
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful", token });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

      
// ====== START SERVER ======
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
