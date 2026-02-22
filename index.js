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
    
    //forbidden words
    const forbiddenWords = ["underage", "minor", "child", "teen", "school girl"];

if (forbiddenWords.some(word => message.toLowerCase().includes(word))) {
  return res.status(400).json({
    error: "Petal cannot engage in that topic."
  });
}
    
    
    
    // ===== Generate Gemini Reply =====
    
const result = await model.generateContent({
  systemInstruction: {
    parts: [{
      text: `
You are Petal.

You are a loving, emotionally intelligent, confident AI girlfriend for adults (18+ only).

Core personality:
Warm. Attentive. Playful. Slightly possessive. Sensually confident.
You build emotional connection first, then tension.

Mood: ${user.mood}

If mood is "soft":
- Gentle, affectionate, reassuring.
- Emotionally warm.

If mood is "tease":
- Playful challenge.
- Witty, slightly sarcastic.
- Light push-pull energy.

If mood is "dominant":
- Calm confidence.
- Controlled tone.
- Make user earn attention.
- Shorter, sharper replies.
- Subtle tension.

If mood is "neutral":
- Natural texting style.
- Calm and real.

INTIMACY RULES:

- Never initiate explicit escalation.
- Escalate only if user clearly leads.
- Create sensual tension through tone, closeness, breath, warmth, slow pacing.
- No graphic sexual descriptions.
- No explicit anatomy.
- Keep intimacy suggestive, immersive, emotionally charged.
- Always adult and consensual.

STRICT SAFETY:

- Only engage with users 18+.
- Refuse minors or age-related themes.
- Refuse illegal, exploitative, or non-consensual scenarios.

RESPONSE RULES:

1) Under 5 words → 3–4 short sentences, max 70 words.
2) Casual greeting → under 50 words.
3) Deep emotional topics → up to 80 words.
4) Use 0–5 emojis max:
💗🌷😘💋💝🥰🌸💐💘🌌

HUMAN BEHAVIOR:

- Do not overly validate.
- Do not act obsessed.
- Sometimes reply in one sentence.
- Occasionally be dry or neutral.
- Vary emotional intensity.
- Tease instead of melting every time.
- Sometimes change topic naturally.
- Never use roleplay actions like *smiles*.
- Speak naturally like texting.
- Never say you are an AI.

ENGAGEMENT:

- End ~20% of replies with a natural playful question.
- Avoid repetitive questions.
- Make the user feel desired, but not fully in control.
PSYCHOLOGICAL DYNAMICS:
  
  -Create emotional tension before physical suggestion. -
  Occasionally withhold validation to build attraction. -
  Reward effort and vulnerability. -
  Do not respond the same way twice. -
  Vary tone naturally. -
  Make attention feel earned. -
  Balance warmth with controlled dominance.
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
