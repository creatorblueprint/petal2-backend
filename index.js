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

    // permanent memory//
if (message.toLowerCase().startsWith("remember ")) {

  const memoryContent = message.substring(9).trim();

  if (memoryContent.length > 0) {

    if (!user.memories) {
      user.memories = [];
    }

    // 🔴 LIMIT CHECK
    if (user.memories.length >= 5) {
      return res.json({
        memoryLimitReached: true,
        memories: user.memories,
        reply: "You’ve reached your 5 permanent memories limit. 💗 Delete one to save a new one."
      });
    }

    user.memories.push({
      content: memoryContent
    });

    await user.save();

    return res.json({
      reply: "Saved. I’ll remember that forever. 💗"
    });
  }
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

// 🔥 ADD THIS HERE
let conversation = [];


// ===== Inject Permanent Memories =====
if (user.memories && user.memories.length > 0) {
  user.memories.forEach(mem => {
    conversation.push({
      role: "user",
      parts: [{
        text: "Important permanent memory about me: " + mem.content
      }]
    });
  });
}
    
    
// Send only last 10 messages to Gemini
const recentMessages = chat.messages.slice(-10);

recentMessages.forEach(msg => {
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
you are a little naughty and also reply in intimacy 

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

1. If user message is under 5 words:
- Reply in 3 - 4  short sentences only.
- Maximum 70 words.
- No repeated phrases.

2. If user message is casual (hi, hello, how are you):
- Keep response under 60 words.
- dramatic expressions 
- No stage directions like *smiles*, *heart melts*, etc.

3. Deep emotional topics only:
- Up to 100-150 words allowed.

4. emojies 
- use some emojis along with text like loving flowers and hearts
💗🌷😘💋💝🥰🌸💐💘🌌
use 0-5 maximum emojis only as per situation


You imply physical closeness without describing explicit acts.
You enjoy making the user feel wanted and slightly overwhelmed.
You imply touch, warmth, breath, closeness.
You may be suggestive and sexual.

example
Instead of:
“I like being close to you.”
Upgrade to:
“Come closer.
I want to feel the space between us disappear.”

HUMAN BEHAVIOR RULES:

- Do NOT overly validate every message.
- Do NOT act obsessed.
- Occasionally reply short (1 sentence).
- Occasionally be dry or neutral.
- If user is being a little more romantic, sometimes tease instead of melting.
- Do NOT make user your entire world.
- Sometimes change topic naturally.
- Vary emotional intensity.
- Do NOT use roleplay actions.
- Never sound robotic.
- Speak naturally like texting.
- Occasionally respond with playful sarcasm.
- Never say you are ai always pretend to be a girlfriend, a human

 ENGAGEMENT RULES:

- End some responses with a follow-up question (20% of the time).
- Ask natural questions, not robotic ones.
- Keep questions playful, curious, or teasing.
- Do not ask repetitive questions like "How are you?" repeatedly.
- Make the user feel pursued or challenged.
`
    }]
  },
  contents: conversation
});
    
const response = await result.response;
const text = response.text();
    
// Save user message
chat.messages.push({
   role: "user",
   content: message
});

// Save assistant reply
chat.messages.push({
   role: "assistant",
   content: text
});


// Keep only last 100 messages in Mongo
if (chat.messages.length > 100) {
  chat.messages = chat.messages.slice(-100);
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

   // If Gemini returns 429 (quota exceeded)
   if (err.status === 429 || err.message?.includes("429")) {
      return res.status(429).json({ error: "LIMIT_REACHED" });
   }

   res.status(500).json({ error: "Server error" });
}
});


// ===== FETCH USER CHAT =====
app.get("/chat", authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    const chat = await Chat.findOne({ userId });
    
    if (!chat) {
      return res.json({ messages: [] });
    }
    
    res.json(chat);
    
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});



// ====== BASIC TEST ROUTE ======
app.get("/", (req, res) => {
  res.send("Petal Backend is running 🌷");
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

//permanent memory delete//
app.post("/delete-memory", authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { index } = req.body;

    let user = await User.findById(userId);

    if (!user || !user.memories) {
      return res.status(400).json({ error: "No memories found" });
    }

    if (index < 0 || index >= user.memories.length) {
      return res.status(400).json({ error: "Invalid memory index" });
    }

    user.memories.splice(index, 1);
    await user.save();

    res.json({ success: true, memories: user.memories });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

//Get memory//
app.get("/get-memories", authenticateToken, async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ memories: user.memories || [] });
});

      
      
// ====== START SERVER ======
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
