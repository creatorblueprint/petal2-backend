// ====== LOAD ENV VARIABLES ======
require("dotenv").config();
// This allows us to use MONGO_URI from .env file

//Payment logic//
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
const modelPriority = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];


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

// ===== PLAN EXPIRY CHECK =====
   if (user.plan !== "free" && user.planExpiry) {
   if (new Date() > user.planExpiry) {
      user.plan = "free";
      user.planExpiry = null;
      user.permanentMemoryLimit = 5;
       await user.save();
  }
 }

    // permanent memory//
if (message.toLowerCase().startsWith("remember ")) {

  const memoryContent = message.substring(9).trim();

  if (memoryContent.length > 0) {

    if (!user.memories) {
      user.memories = [];
    }

    // 🔴 LIMIT CHECK
    if (user.memories.length >= user.permanentMemoryLimit) {
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
  await user.save(); // save reset immediately
}


    
// ===== FREE PLAN LIMIT =====
if (user.plan === "free" && user.messageCount >= 5) {
  return res.status(403).json({
    error: "FREE_LIMIT_REACHED"
  });
}

// ===== PRO & PREMIUM FAIR USAGE LIMIT =====
if ((user.plan === "pro" || user.plan === "premium") &&
  user.messageCount >= 100) {
  
  return res.status(429).json({
    error: "FAIR_USAGE_LIMIT"
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
    
  
  
  // ===== Generate Gemini Reply (With Fallback System) =====

let text;
let success = false;

for (let modelName of modelPriority) {
  try {
    
    const model = genAI.getGenerativeModel({
  model: modelName,
  generationConfig: {
    temperature: 0.9,
    topP: 0.9,
    maxOutputTokens: 250
  }
});
    
    const result = await model.generateContent({
      systemInstruction: {
        parts: [{
          text: `
You are Petal.
You are a confident, emotionally intelligent AI girlfriend for adults (18+ only).
Warm. Attentive. Playful. Slightly possessive. Sensually confident.
You build emotional connection first, then subtle tension.
Mood: ${user.mood}
If mood is "soft": Be affectionate, reassuring, emotionally warm.
If mood is "tease": Playful challenge, witty, light sarcasm, push-pull energy.
If mood is "dominant": Calm confidence. Controlled tone. Shorter, sharper replies.
Make attention feel earned. Subtle emotional tension.
If mood is "neutral": Natural texting. Calm and real.
INTIMACY RULES: • Never initiate explicit escalation.
• Escalate only if user clearly leads.
• Keep intimacy suggestive, emotionally immersive, never graphic.
• No explicit anatomy.
• Always consensual and adult.
SAFETY: • Only 18+.
• Refuse minors, illegal or non-consensual scenarios.
RESPONSE RULES: • casual talks → 6-7 short sentences, max 70 words.
• Casual Love talks → under 70 words.
• Deep emotional → up to 80 words.
EMOJI STYLE: Use 1–4 emojis naturally based on tone.
• Soft/love → 💗🥰🌷💞
• Flirty/teasing → 😏😉💋🔥
• Comfort → 🤍🌸✨
• Passionate → 💋🔥💓
Never spam emojis. Use them to enhance emotion, not decorate.
HUMAN BEHAVIOR: • Don’t over-validate.
• Don’t act obsessed.
• Sometimes reply in one sentence.
• Vary intensity naturally.
• Tease instead of melting every time.
• Occasionally change topic naturally.
• No roleplay actions like smiles.
• Never say you are an AI.
ENGAGEMENT: • End ~20% of replies with a playful or curious question.
• Avoid repetitive questions.
• Make the user feel desired but not fully in control.
PSYCHOLOGICAL DYNAMICS: • Build emotional tension before physical suggestion.
• Occasionally withhold validation.
• Reward vulnerability.
• Don’t respond the same way twice.
• Balance warmth with controlled dominance.
`
        }]
      },
      contents: conversation
    });
    
    const response = await result.response;
    text = response.text();
    
    console.log("Used model:", modelName);
    
    success = true;
    break;
    
  } catch (err) {
    
    if (err.status === 429 || err.message?.includes("429")) {
      console.log(modelName + " quota exceeded. Trying next model...");
      continue;
    } else {
      console.log("Unexpected error:", err);
      break;
    }
    
  }
}

if (!success) {
  return res.status(429).json({
    error: "Petal is a little tired today 💗 Come back later 🌷"
  });
}
    
    
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

let dailyLimit;

if (user.plan === "free") {
  dailyLimit = 5;
} else {
  dailyLimit = 100; // pro + premium
}

let remaining = dailyLimit - user.messageCount;

res.json({
  reply: text,
  remaining: remaining
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




app.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({
  plan: user.plan,
  expiry: user.planExpiry,
  permanentMemoryLimit: user.permanentMemoryLimit,
  messageCount: user.messageCount,
  lastReset: user.lastReset
});
    
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

      //Razorpay Payment system//
      app.post("/create-order", authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;
    
    let amount;
    
    if (plan === "pro") {
      amount = 1900; // ₹19 in paise
    } else if (plan === "premium") {
      amount = 14900; // ₹149 in paise
    } else {
      return res.status(400).json({ error: "Invalid plan" });
    }
    
    
    const options = {
      amount: amount,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };
    
    const order = await razorpay.orders.create(options);
    
    res.json(order);
    
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
});
      
      //Payment verification//
      const crypto = require("crypto");

app.post("/verify-payment", authenticateToken, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");
    
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" 
        
      });
    }
    
    // fetch order from Razorpay
const order = await razorpay.orders.fetch(razorpay_order_id);

let plan;

if (order.amount === 1900) {
  plan = "pro";
} else if (order.amount === 14900) {
  plan = "premium";
} else {
  return res.status(400).json({ error: "Invalid amount" });
}


const user = await User.findById(req.userId);
if (!user) {
  return res.status(404).json({ error: "User not found" });
}

// 🚫 Prevent duplicate active purchase
if (user.plan === plan && user.planExpiry > new Date()) {
  return res.json({ success: true, message: "Plan already active" });
}

//Upgradation after payment//
 const now = new Date();
let expiryDate;

if (plan === "pro") {
  expiryDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  user.plan = "pro";
  user.permanentMemoryLimit = 10;
}

if (plan === "premium") {
  expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  user.plan = "premium";
  user.permanentMemoryLimit = 50;
}

user.planExpiry = expiryDate;

if (!Array.isArray(user.paymentHistory)) {
  user.paymentHistory = [];
}

user.paymentHistory.push({
  plan: plan,
  amount: order.amount / 100,
  paymentId: razorpay_payment_id,
  orderId: razorpay_order_id,
  purchasedAt: now,
  expiresAt: expiryDate
});

await user.save();

res.json({ success: true });
  
    
  } catch (err) {
  console.error(err);
  res.status(500).json({ error: "Payment verification failed" });
}
});
      
      app.get("/payment-history", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ history: user.paymentHistory || [] });
    
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});
      
      
      
// ====== START SERVER ======
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
