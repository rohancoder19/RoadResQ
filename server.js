require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Gemini API Key for Emergency Chatbot
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ========================================================
// Email & OTP Utility Setup
// ========================================================
const pendingOTPs = new Map(); // email (lowercase) -> { otp, expiresAt, resendAvailableAt }

let mailTransporter = null;

// Initialize mail transporter
async function initMailTransporter() {
  if (process.env.SMTP_SERVICE || process.env.SMTP_HOST) {
    console.log('[Email] Configuring SMTP Transporter with environment variables...');
    const transportConfig = {
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };
    if (process.env.SMTP_SERVICE) {
      transportConfig.service = process.env.SMTP_SERVICE;
    } else {
      transportConfig.host = process.env.SMTP_HOST;
      transportConfig.port = parseInt(process.env.SMTP_PORT || '587');
      transportConfig.secure = process.env.SMTP_SECURE === 'true';
    }
    mailTransporter = nodemailer.createTransport(transportConfig);
  } else {
    console.log('[Email] No SMTP environment variables found. Attempting Ethereal Mail setup...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`[Email] Ethereal Mail Test Account generated: User: ${testAccount.user}`);
      mailTransporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (err) {
      console.error('[Email] Failed to create Ethereal Mail test account. Falling back to console-only logging.', err.message);
    }
  }
}
initMailTransporter();

// HTML Email Templates
function getWelcomeEmailHtml(name, role, phone) {
  return `
    <div style="font-family: 'Outfit', 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px;">
        <h2 style="color: #1e3a8a; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">RoadsideRescue</h2>
        <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0;">Active Status Hub & Assistance Portal</p>
      </div>
      <div style="padding: 10px 0;">
        <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Welcome, ${name}!</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Thank you for signing up for RoadsideRescue. Your account has been successfully created with the following details:
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 35%;">Account Role:</td>
              <td style="padding: 6px 0; color: #1e3a8a; font-weight: 700; text-transform: capitalize;">${role}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Phone Number:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${phone}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Status:</td>
              <td style="padding: 6px 0; color: #10b981; font-weight: 700;">Verified & Active</td>
            </tr>
          </table>
        </div>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          You can now log in to your dashboard to either request help in an emergency (if you are a Customer) or receive breakdown alerts nearby (if you are a Mechanic).
        </p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Please remember to keep your GPS location services enabled for real-time tracking during dispatch operations.
        </p>
      </div>
      <div style="text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px; font-size: 11px; color: #94a3b8; line-height: 1.4;">
        This email was sent by RoadsideRescue Security. If you did not create this account, please ignore this email or contact support.
        <br>&copy; 2026 RoadsideRescue. All rights reserved.
      </div>
    </div>
  `;
}

function getOTPEmailHtml(name, otp) {
  return `
    <div style="font-family: 'Outfit', 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px;">
        <h2 style="color: #1e3a8a; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">RoadsideRescue</h2>
        <p style="color: #64748b; font-size: 12px; margin: 5px 0 0 0;">Active Status Hub & Assistance Portal</p>
      </div>
      <div style="padding: 10px 0; text-align: center;">
        <h3 style="color: #0f172a; margin-top: 0; font-size: 18px; text-align: left;">Security Verification</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6; text-align: left;">
          Hello ${name},
        </p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6; text-align: left;">
          To complete your login and access your RoadsideRescue dashboard, please use the following one-time passcode (OTP):
        </p>
        
        <div style="margin: 30px 0; padding: 20px; background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 16px; display: inline-block;">
          <span style="font-family: monospace; font-size: 36px; font-weight: 700; color: #f97316; letter-spacing: 6px;">${otp}</span>
        </div>
        
        <p style="color: #ef4444; font-size: 12px; font-weight: 600; margin-bottom: 20px; text-align: left;">
          ⚠️ This passcode is valid for 5 minutes. Do not share this code with anyone, including RoadsideRescue agents.
        </p>
        
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 15px; text-align: left; margin-top: 20px;">
          <h4 style="color: #1e3a8a; margin: 0 0 5px 0; font-size: 13px; font-weight: 700;">Safety Tips:</h4>
          <ul style="color: #1e40af; font-size: 12px; margin: 0; padding-left: 20px; line-height: 1.5;">
            <li>Always confirm the mechanic's details (name and vehicle type) on your dashboard before getting into or allowing access to a vehicle.</li>
            <li>Use the SOS Share button in your dashboard to send your live location coordinates to family or emergency contacts if you feel unsafe.</li>
            <li>If you are stranded on a highway, stay behind the safety barrier at all times.</li>
          </ul>
        </div>
      </div>
      <div style="text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px; font-size: 11px; color: #94a3b8; line-height: 1.4;">
        This email was sent by RoadsideRescue Security. If you did not request this login code, please reset your password immediately.
        <br>&copy; 2026 RoadsideRescue. All rights reserved.
      </div>
    </div>
  `;
}

// Mail Sending Wrapper
async function sendMail({ to, subject, html, text }) {
  const fromName = 'RoadsideRescue Security';
  const fromEmail = process.env.SMTP_FROM || 'security@roadresq.com';
  
  console.log(`\n====================================================`);
  console.log(`[OUTGOING EMAIL]`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body (Text preview): ${text}`);
  console.log(`====================================================\n`);

  if (!mailTransporter) {
    console.log('[Email] Transporter not ready or disabled. Email logged to console.');
    return { success: true, loggedToConsole: true };
  }

  try {
    const info = await mailTransporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html
    });

    console.log(`[Email] Mail sent successfully. Message ID: ${info.messageId}`);
    
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Email] Preview sent email at: ${previewUrl}`);
      return { success: true, previewUrl };
    }
    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send email via transporter:', error.message);
    return { success: false, error: error.message };
  }
}

// Enable JSON body parsing for REST routes
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
const RAW_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/RoadResQ';

function sanitizeMongoDBURI(uri) {
  if (!uri) return uri;
  try {
    const protocolMatch = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/);
    if (!protocolMatch) return uri;
    const protocol = protocolMatch[1];
    const rest = protocolMatch[2];
    
    const lastAtIndex = rest.lastIndexOf('@');
    if (lastAtIndex === -1) return uri;
    
    const credentials = rest.substring(0, lastAtIndex);
    const host = rest.substring(lastAtIndex + 1);
    
    const colonIndex = credentials.indexOf(':');
    if (colonIndex === -1) return uri;
    
    const username = credentials.substring(0, colonIndex);
    const password = credentials.substring(colonIndex + 1);
    
    // Decode first to prevent double-encoding
    const decodedUsername = decodeURIComponent(username);
    const decodedPassword = decodeURIComponent(password);
    
    const encodedUsername = encodeURIComponent(decodedUsername);
    const encodedPassword = encodeURIComponent(decodedPassword);
    
    return `${protocol}${encodedUsername}:${encodedPassword}@${host}`;
  } catch (e) {
    console.error('[DB] Error sanitizing MongoDB URI:', e.message);
    return uri;
  }
}

const MONGODB_URI = sanitizeMongoDBURI(RAW_MONGODB_URI);
let isConnecting = false;
let dbConnected = false;

async function connectToDatabase() {
  if (dbConnected) return;
  if (mongoose.connection.readyState === 1) {
    dbConnected = true;
    return;
  }
  if (isConnecting) {
    while (mongoose.connection.readyState === 2) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (mongoose.connection.readyState === 1) {
      dbConnected = true;
      return;
    }
  }

  isConnecting = true;
  console.log(`[DB] Connecting to MongoDB at ${MONGODB_URI}...`);
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    dbConnected = true;
    console.log('[DB] Successfully connected to MongoDB.');
    await seedMockAccounts();
    await loadActiveRequests();
  } catch (err) {
    console.error('[DB] Connection error:', err.message);
    throw err;
  } finally {
    isConnecting = false;
  }
}

// In local environment or non-serverless, we connect immediately
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  connectToDatabase().catch(() => {});
}

// MongoDB Schemas & Models
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  role: { type: String, required: true, enum: ['customer', 'mechanic'] },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const rescueRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  vehicleType: { type: String, default: 'Car' },
  description: { type: String, default: 'Roadside Emergency' },
  status: { type: String, default: 'pending', enum: ['pending', 'accepted', 'completed', 'cancelled'] },
  mechanicName: { type: String },
  mechanicEmail: { type: String },
  mechanicPhone: { type: String },
  mechanicLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  createdAt: { type: Date, default: Date.now }
});

const RescueRequest = mongoose.model('RescueRequest', rescueRequestSchema);

// Seeding Mock Accounts
async function seedMockAccounts() {
  try {
    const customerExists = await User.findOne({ email: 'customer@resq.com' });
    if (!customerExists) {
      await User.create({
        name: 'Alice Customer',
        email: 'customer@resq.com',
        password: 'password123',
        phone: '+1 (555) 019-2834',
        role: 'customer',
        isVerified: true
      });
      console.log('[DB] Seeded Alice Customer mock account.');
    } else if (!customerExists.isVerified) {
      customerExists.isVerified = true;
      await customerExists.save();
      console.log('[DB] Updated Alice Customer mock account to verified.');
    }
    const mechanicExists = await User.findOne({ email: 'mechanic@resq.com' });
    if (!mechanicExists) {
      await User.create({
        name: 'Bob Mechanic',
        email: 'mechanic@resq.com',
        password: 'password123',
        phone: '+1 (555) 014-9988',
        role: 'mechanic',
        isVerified: true
      });
      console.log('[DB] Seeded Bob Mechanic mock account.');
    } else if (!mechanicExists.isVerified) {
      mechanicExists.isVerified = true;
      await mechanicExists.save();
      console.log('[DB] Updated Bob Mechanic mock account to verified.');
    }
  } catch (err) {
    console.error('[DB] Seeding mock accounts failed:', err.message);
  }
}

// In-memory runtime session maps
const activeRequests = new Map(); // requestId -> RequestObject
const onlineMechanics = new Map(); // socketId -> MechanicObject
const connectedUsers = new Map(); // socketId -> UserSessionObject { name, email, role, phone, socketId, location }

// Load unfinished requests on startup
async function loadActiveRequests() {
  try {
    const requests = await RescueRequest.find({ status: { $in: ['pending', 'accepted'] } });
    requests.forEach(req => {
      activeRequests.set(req.requestId, {
        id: req.requestId,
        customerSocketId: null,
        customerName: req.customerName,
        customerEmail: req.customerEmail,
        customerPhone: req.customerPhone,
        vehicleType: req.vehicleType,
        description: req.description,
        location: req.location,
        status: req.status,
        mechanicSocketId: null,
        mechanicName: req.mechanicName,
        mechanicEmail: req.mechanicEmail,
        mechanicPhone: req.mechanicPhone,
        mechanicLocation: req.mechanicLocation,
        timestamp: req.createdAt ? req.createdAt.getTime() : Date.now()
      });
    });
    console.log(`[DB] Restored ${activeRequests.size} active requests from database into memory.`);
  } catch (err) {
    console.error('[DB] Failed to restore active requests:', err.message);
  }
}

// Helper: Haversine formula to calculate distance in km
function getDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Helper: Get nearby mechanics for a specific location
function getNearbyMechanics(location, radiusKm = 50) {
  const nearbyMechs = [];
  onlineMechanics.forEach((mech) => {
    if ((mech.status === 'available' || mech.status === 'busy') && mech.location) {
      const distance = getDistance(location.lat, location.lng, mech.location.lat, mech.location.lng);
      if (distance !== null && distance <= radiusKm) {
        nearbyMechs.push({
          socketId: mech.socketId,
          name: mech.name,
          phone: mech.phone || 'Not Provided',
          location: mech.location,
          status: mech.status,
          distance: distance
        });
      }
    }
  });
  return nearbyMechs;
}

// Helper: Broadcast online/active mechanics list to all connected customers
function broadcastOnlineMechanics() {
  connectedUsers.forEach((user, socketId) => {
    if (user.role === 'customer') {
      if (user.location) {
        const nearbyMechs = getNearbyMechanics(user.location);
        io.to(socketId).emit('nearby_mechanics_list', nearbyMechs);
      } else {
        io.to(socketId).emit('nearby_mechanics_list', []);
      }
    }
  });
}

// Helper: Send latest available jobs to a specific mechanic socket
function sendAvailableJobsToSocket(socket, mechanic) {
  if (!socket || !mechanic) return;
  const pendingJobs = [];
  activeRequests.forEach((req, id) => {
    if (req.status === 'pending') {
      let distance = null;
      if (mechanic.location && req.location) {
        distance = getDistance(mechanic.location.lat, mechanic.location.lng, req.location.lat, req.location.lng);
      }
      pendingJobs.push({ ...req, distance });
    }
  });
  socket.emit('available_jobs', pendingJobs);
}

// ========================================================
// REST API Endpoints
// ========================================================

// 1. User Registration
app.post('/api/register', async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  
  if (!name || !email || !password || !role || !phone) {
    return res.status(400).json({ error: 'All registration fields (including phone) are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    await connectToDatabase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    if (role !== 'customer' && role !== 'mechanic') {
      return res.status(400).json({ error: 'Invalid user role selected.' });
    }

    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password, // Stored as plain text for simple prototype
      role,
      phone: phone.trim()
    });

    await newUser.save();
    console.log(`[User Registered] Name: ${newUser.name}, Email: ${newUser.email}, Phone: ${newUser.phone}, Role: ${newUser.role}`);
    
    // Send welcome email asynchronously
    sendMail({
      to: newUser.email,
      subject: 'Welcome to RoadsideRescue!',
      text: `Hello ${newUser.name}, welcome to RoadsideRescue! Your account has been registered as a ${newUser.role}. Please enable location services to use the portal.`,
      html: getWelcomeEmailHtml(newUser.name, newUser.role, newUser.phone)
    }).catch(err => {
      console.error(`[Email Error] Failed to send welcome email to ${newUser.email}:`, err.message);
    });
    
    return res.status(201).json({
      message: 'Registration successful!',
      user: { name: newUser.name, email: newUser.email, role: newUser.role }
    });
  } catch (err) {
    console.error('Registration API error:', err.message);
    return res.status(500).json({ error: 'Internal server error occurred.' });
  }
});

// 2. User Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    await connectToDatabase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password credentials.' });
    }

    console.log(`[Login Attempt] Credentials verified for Name: ${user.name}, Email: ${user.email}`);

    // Mark the user as verified if they aren't already
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
    }

    return res.json({
      status: 'success',
      message: 'Login successful!',
      user: { name: user.name, email: user.email, role: user.role, phone: user.phone }
    });
  } catch (err) {
    console.error('Login API error:', err.message);
    return res.status(500).json({ error: 'Internal server error occurred.' });
  }
});

// 2a. Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cachedOtpData = pendingOTPs.get(normalizedEmail);

  if (!cachedOtpData) {
    return res.status(400).json({ error: 'No active OTP verification session found. Please request a new code.' });
  }

  if (Date.now() > cachedOtpData.expiresAt) {
    pendingOTPs.delete(normalizedEmail);
    return res.status(400).json({ error: 'Passcode expired. Please request a new code.' });
  }

  if (cachedOtpData.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid verification passcode.' });
  }

  try {
    await connectToDatabase();
    // OTP is correct! Fetch the registered user data
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Mark the user as verified on successful first-time OTP verification
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
      console.log(`[User Verified] Marked ${user.email} as verified in database.`);
    }

    // Remove the OTP from cache
    pendingOTPs.delete(normalizedEmail);

    console.log(`[OTP Verified] Successful login for: ${user.name} (${user.email})`);

    return res.json({
      message: 'OTP verification successful!',
      user: { name: user.name, email: user.email, role: user.role, phone: user.phone }
    });
  } catch (err) {
    console.error('Verify OTP API error:', err.message);
    return res.status(500).json({ error: 'Internal server error occurred.' });
  }
});

// 2b. Resend OTP
app.post('/api/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    await connectToDatabase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const cachedOtpData = pendingOTPs.get(normalizedEmail);
    if (cachedOtpData && Date.now() < cachedOtpData.resendAvailableAt) {
      const waitTimeSec = Math.ceil((cachedOtpData.resendAvailableAt - Date.now()) / 1000);
      return res.status(429).json({ error: `Please wait ${waitTimeSec} seconds before requesting a new code.` });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const resendAvailableAt = Date.now() + 30 * 1000; // 30 seconds cooldown

    pendingOTPs.set(normalizedEmail, { otp, expiresAt, resendAvailableAt });

    console.log(`[OTP Resent] Email: ${normalizedEmail}, OTP: ${otp}`);

    // Send new OTP email
    let mailResult = null;
    try {
      mailResult = await sendMail({
        to: user.email,
        subject: `Your New RoadsideRescue Login Code: ${otp}`,
        text: `Hello ${user.name}, your new security verification passcode is ${otp}. It will expire in 5 minutes.`,
        html: getOTPEmailHtml(user.name, otp)
      });
    } catch (err) {
      console.error(`[Email Error] Failed to resend login OTP to ${user.email}:`, err.message);
    }

    const responseData = {
      message: 'A new security passcode has been sent to your email.'
    };

    // Expose OTP and mock preview link in local dev/demo mode
    if (!process.env.SMTP_HOST) {
      responseData.otp = otp;
      if (mailResult && mailResult.previewUrl) {
        responseData.previewUrl = mailResult.previewUrl;
      }
    }

    return res.json(responseData);
  } catch (err) {
    console.error('Resend OTP API error:', err.message);
    return res.status(500).json({ error: 'Internal server error occurred.' });
  }
});

// 3. Gemini Chatbot Proxy Endpoint
app.post('/api/chatbot', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const systemPrompt = "You are RescueAssistant, a helpful emergency assistant for RoadsideRescue. Your goal is to guide drivers who are stranded or experiencing vehicle issues safely. Provide clear, short, step-by-step instructions. Keep safety first. Keep responses brief, friendly, and formatted with bullet points for readability. If the driver is on a highway/high-speed road, remind them to stay behind the barrier.";

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\nUser Question: ${message}`
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errText}`);
      return res.status(response.status).json({ error: `Gemini API returned status ${response.status}` });
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      return res.json({ text: data.candidates[0].content.parts[0].text });
    }
    return res.json({ text: "I received your question but couldn't construct a safety recommendation. Please stay safe and contact emergency services if needed." });
  } catch (error) {
    console.error("Gemini API proxy error:", error);
    return res.status(500).json({ error: "Failed to connect to the AI model." });
  }
});

// 4. Configuration Endpoint
app.get('/api/config', (req, res) => {
  return res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
  });
});



// ========================================================
// Socket.io Real-Time Communications
// ========================================================
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. Register Socket Session (After client logs in)
  socket.on('register_user', async (data) => {
    const { name, role, email } = data;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    let phone = 'Not Provided';
    try {
      await connectToDatabase();
      const regUser = await User.findOne({ email: normalizedEmail });
      if (regUser) {
        phone = regUser.phone || 'Not Provided';
      }
    } catch (err) {
      console.error('[Socket] Failed to fetch user phone for socket registration:', err.message);
    }

    const user = {
      socketId: socket.id,
      name: name || 'Anonymous',
      email: normalizedEmail,
      role: role || 'customer',
      phone: phone,
      location: data.location || null
    };
    connectedUsers.set(socket.id, user);
    console.log(`[Socket Registered] ${user.name} (${user.role}) joined.`);

    // Join isolated room based on role
    if (user.role === 'customer') {
      socket.join(`customer_${normalizedEmail}`);
      console.log(`[Room Segregation] Customer socket ${socket.id} joined private room customer_${normalizedEmail}`);
    }

    // If role is mechanic, add to online list
    if (role === 'mechanic') {
      onlineMechanics.set(socket.id, {
        socketId: socket.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        status: 'offline' // 'offline', 'available', 'busy'
      });
    }

    socket.emit('register_success', { socketId: socket.id });

    // --- SESSION RECOVERY LOGIC ---
    if (user.role === 'customer') {
      // Find if this customer has an active request in progress
      let activeReq = null;
      activeRequests.forEach((req) => {
        if (req.customerEmail === normalizedEmail && (req.status === 'pending' || req.status === 'accepted')) {
          activeReq = req;
        }
      });

      if (activeReq) {
        console.log(`[Session Recovery] Restoring active request ${activeReq.id} for Customer: ${user.name}`);
        activeReq.customerSocketId = socket.id;
        socket.emit('active_request_restored', activeReq);
      }
    } else if (user.role === 'mechanic') {
      // Find if this mechanic was busy with an active job
      let activeJob = null;
      activeRequests.forEach((req) => {
        if (req.mechanicEmail === normalizedEmail && req.status === 'accepted') {
          activeJob = req;
        }
      });

      if (activeJob) {
        console.log(`[Session Recovery] Restoring active job ${activeJob.id} for Mechanic: ${user.name}`);
        activeJob.mechanicSocketId = socket.id;
        
        const mech = onlineMechanics.get(socket.id);
        if (mech) {
          mech.status = 'busy';
          mech.location = activeJob.mechanicLocation;
        }
        socket.leave("mechanics_room"); // Ensure busy mechanic is not in available room
        socket.emit('active_job_restored', activeJob);
      }
    }

    // Send latest mechanics list to this user if they are a customer
    if (user.role === 'customer') {
      if (user.location) {
        const nearbyMechs = getNearbyMechanics(user.location);
        socket.emit('nearby_mechanics_list', nearbyMechs);
      } else {
        socket.emit('nearby_mechanics_list', []);
      }
    }
  });

  // 2. Update Location
  socket.on('update_location', (location) => {
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return;

    const user = connectedUsers.get(socket.id);
    if (!user) return;

    user.location = location;
    
    // If mechanic is online, update their location
    if (user.role === 'mechanic') {
      const mechanic = onlineMechanics.get(socket.id);
      if (mechanic) {
        mechanic.location = location;
        
        // Notify customers of the moving mechanic marker
        broadcastOnlineMechanics();
        
        // If mechanic is busy, find their active request and notify customer of the updated location
        if (mechanic.status === 'busy') {
          for (const [reqId, req] of activeRequests.entries()) {
            if (req.mechanicSocketId === socket.id && req.status === 'accepted') {
              req.mechanicLocation = location;
              io.to(`customer_${req.customerEmail}`).emit('mechanic_location_updated', location);
              break;
            }
          }
        }
      }
    } else {
      // If customer has an active request, update the request location
      for (const [reqId, req] of activeRequests.entries()) {
        if (req.customerSocketId === socket.id && (req.status === 'pending' || req.status === 'accepted')) {
          req.location = location;
          // If accepted, notify the mechanic of the customer's moving location
          if (req.status === 'accepted' && req.mechanicSocketId) {
            io.to(req.mechanicSocketId).emit('customer_location_updated', location);
          } else if (req.status === 'pending') {
            // Broadcast location update to all available mechanics
            io.to("mechanics_room").emit('pending_job_location_updated', { requestId: reqId, location });
          }
          break;
        }
      }
      
      const nearbyMechs = getNearbyMechanics(location);
      socket.emit('nearby_mechanics_list', nearbyMechs);
    }
  });

  socket.on('get_nearby_mechanics', (location) => {
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return;
    const nearbyMechs = getNearbyMechanics(location);
    socket.emit('nearby_mechanics_list', nearbyMechs);
  });

  // 3. Toggle Mechanic Status (Online/Offline)
  socket.on('toggle_mechanic_status', (data) => {
    const { isOnline } = data;
    const mechanic = onlineMechanics.get(socket.id);
    if (!mechanic) return;

    if (mechanic.status === 'busy') {
      // If busy, do not override status (e.g. on socket reconnect sync)
      return;
    }

    mechanic.status = isOnline ? 'available' : 'offline';
    console.log(`[Mechanic Status Toggle] ${mechanic.name} is now ${mechanic.status}`);

    if (mechanic.status === 'available') {
      socket.join("mechanics_room");
      console.log(`[Room Segregation] Mechanic socket ${socket.id} joined mechanics_room`);
    } else {
      socket.leave("mechanics_room");
      console.log(`[Room Segregation] Mechanic socket ${socket.id} left mechanics_room`);
    }

    socket.emit('mechanic_status_updated', { status: mechanic.status });

    // Update list for customers
    broadcastOnlineMechanics();

    // If mechanic just went online, send them all currently pending requests
    if (mechanic.status === 'available') {
      sendAvailableJobsToSocket(socket, mechanic);
    }
  });

  // 4. Request Help (Customer Flow)
  socket.on('request_help', async (data) => {
    const { vehicleType, description, location } = data;
    const customer = connectedUsers.get(socket.id);
    if (!customer) return;

    // Check if user already has a pending or active request
    let existingRequest = null;
    activeRequests.forEach((req) => {
      if ((req.customerSocketId === socket.id || (customer.email && req.customerEmail === customer.email)) && (req.status === 'pending' || req.status === 'accepted')) {
        existingRequest = req;
      }
    });

    if (existingRequest) {
      socket.emit('request_error', { message: 'You already have an active help request!' });
      return;
    }

    const requestId = 'REQ_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const requestLocation = location || customer.location;

    try {
      const dbRequest = new RescueRequest({
        requestId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        location: requestLocation,
        vehicleType: vehicleType || 'Car',
        description: description || 'Roadside Emergency',
        status: 'pending'
      });

      await dbRequest.save();

      const newRequest = {
        id: requestId,
        customerSocketId: socket.id,
        customerName: customer.name,
        customerEmail: customer.email,
        vehicleType: vehicleType || 'Car',
        description: description || 'Roadside Emergency',
        location: requestLocation,
        status: 'pending',
        timestamp: Date.now()
      };

      activeRequests.set(requestId, newRequest);
      console.log(`[Help Request Created & Saved] ID: ${requestId} by Customer: ${customer.name}`);

      // Broadcast request ONLY to the mechanics room (fully isolated)
      io.to("mechanics_room").emit("new_breakdown_request", newRequest);

      // Confirm request creation back to the customer's isolated room
      io.to(`customer_${customer.email}`).emit('request_created', newRequest);
    } catch (err) {
      console.error('[Socket] Failed to create help request:', err.message);
      socket.emit('request_error', { message: 'Failed to create request in database.' });
    }
  });

  // 5. Accept Job (Mechanic Flow)
  socket.on('accept_job', async (data) => {
    const { requestId } = data;
    const mechanic = onlineMechanics.get(socket.id);
    if (!mechanic || mechanic.status !== 'available') {
      socket.emit('accept_error', { message: 'You are not available to accept jobs.' });
      return;
    }

    const request = activeRequests.get(requestId);
    if (!request) {
      socket.emit('accept_error', { message: 'Request not found.' });
      return;
    }

    if (request.status !== 'pending') {
      socket.emit('accept_error', { message: 'This job has already been taken by another mechanic.' });
      return;
    }

    try {
      await RescueRequest.updateOne({ requestId }, {
        status: 'accepted',
        mechanicName: mechanic.name,
        mechanicEmail: mechanic.email,
        mechanicPhone: mechanic.phone || 'Not Provided',
        mechanicLocation: mechanic.location
      });

      // Assign job to this mechanic
      request.status = 'accepted';
      request.mechanicSocketId = socket.id;
      request.mechanicName = mechanic.name;
      request.mechanicEmail = mechanic.email;
    request.mechanicLocation = mechanic.location;
    
    mechanic.status = 'busy';
    socket.leave("mechanics_room"); // No longer available for other requests

    console.log(`[Job Accepted] Request ID: ${requestId} by Mechanic: ${mechanic.name}`);

    // Update availability list for customers
    broadcastOnlineMechanics();

    // Notify customer on their private isolated channel
    io.to(`customer_${request.customerEmail}`).emit('mechanic_assigned', {
      requestId: request.id,
      mechanicName: mechanic.name,
      mechanicPhone: mechanic.phone || 'Not Provided',
      mechanicLocation: mechanic.location,
      mechanicSocketId: socket.id
    });

    // Notify this mechanic of successful assignment
    socket.emit('job_assigned', request);

    // Broadcast to other mechanics that the job is taken/no longer pending
    io.to("mechanics_room").emit('job_taken', { requestId });
  } catch (err) {
    console.error('[Socket] Failed to accept job in database:', err.message);
    socket.emit('accept_error', { message: 'Internal error accepting job.' });
  }
});

  // 6. Complete Job
  socket.on('complete_job', async (data) => {
    const { requestId } = data;
    const request = activeRequests.get(requestId);
    if (!request) return;

    try {
      await RescueRequest.updateOne({ requestId }, { status: 'completed' });

      request.status = 'completed';
      console.log(`[Job Completed & Saved] Request ID: ${requestId}`);

      // Release mechanic
      if (request.mechanicSocketId) {
        const mechanic = onlineMechanics.get(request.mechanicSocketId);
        if (mechanic) {
          mechanic.status = 'available';
          io.to(request.mechanicSocketId).emit('job_completed', { requestId });
          
          // Rejoin mechanics_room since they are available again
          const mechSocket = io.sockets.sockets.get(request.mechanicSocketId);
          if (mechSocket) {
            mechSocket.join("mechanics_room");
            sendAvailableJobsToSocket(mechSocket, mechanic);
          }
        }
      }

      // Notify customer on their isolated room
      io.to(`customer_${request.customerEmail}`).emit('job_completed', { requestId });

      // Clean up request from active listing
      activeRequests.delete(requestId);

      // Refresh lists for customers
      broadcastOnlineMechanics();
    } catch (err) {
      console.error('[Socket] Failed to complete job in database:', err.message);
    }
  });

  // 7. Cancel Job (Customer or Mechanic)
  socket.on('cancel_job', async (data) => {
    const { requestId } = data;
    const request = activeRequests.get(requestId);
    if (!request) return;

    const user = connectedUsers.get(socket.id);
    const userEmail = user ? user.email : '';

    const requestOwner = request.customerSocketId === socket.id || (userEmail && request.customerEmail === userEmail);
    const requestAssignedMech = request.mechanicSocketId === socket.id || (userEmail && request.mechanicEmail === userEmail);

    console.log(`[Job Cancelled] Request ID: ${requestId} by ${requestOwner ? 'Customer' : 'Mechanic'}`);

    try {
      if (requestOwner) {
        // Customer cancelled the request
        await RescueRequest.updateOne({ requestId }, { status: 'cancelled' });
        request.status = 'cancelled';
        
        // Notify assigned mechanic (if any)
        if (request.mechanicSocketId) {
          const mechanic = onlineMechanics.get(request.mechanicSocketId);
          if (mechanic) {
            mechanic.status = 'available';
            io.to(request.mechanicSocketId).emit('job_cancelled_by_customer', { requestId });
            
            // Rejoin mechanics_room
            const mechSocket = io.sockets.sockets.get(request.mechanicSocketId);
            if (mechSocket) {
              mechSocket.join("mechanics_room");
              sendAvailableJobsToSocket(mechSocket, mechanic);
            }
          }
        }

        // Notify all available mechanics in mechanics_room to remove this card
        io.to("mechanics_room").emit('job_taken', { requestId: requestId });

        io.to(`customer_${request.customerEmail}`).emit('job_cancelled_ack', { requestId });
        activeRequests.delete(requestId);
        
        // Update mechanic list to customers
        broadcastOnlineMechanics();
      } else if (requestAssignedMech) {
        // Mechanic backed out of the request. Put request back to pending.
        await RescueRequest.updateOne({ requestId }, {
          status: 'pending',
          mechanicName: null,
          mechanicEmail: null,
          mechanicPhone: null,
          mechanicLocation: null
        });

        request.status = 'pending';
        request.mechanicSocketId = null;
        request.mechanicName = null;
        request.mechanicLocation = null;
        request.mechanicEmail = null;
        request.mechanicPhone = null;

        // Make mechanic available again
        const mechanic = onlineMechanics.get(socket.id);
        if (mechanic) {
          mechanic.status = 'available';
          socket.join("mechanics_room"); // Rejoin availability room
          socket.emit('job_cancelled_ack', { requestId });
          sendAvailableJobsToSocket(socket, mechanic);
        }

        // Notify customer that mechanic cancelled, request is back to searching
        io.to(`customer_${request.customerEmail}`).emit('mechanic_cancelled', { requestId });

        // Re-broadcast to all available online mechanics
        io.to("mechanics_room").emit('new_breakdown_request', request);

        // Update mechanic list to customers
        broadcastOnlineMechanics();
      }
    } catch (err) {
      console.error('[Socket] Failed to cancel job in database:', err.message);
    }
  });

  // 8. Disconnect Cleanup
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    const user = connectedUsers.get(socket.id);

    if (user) {
      if (user.role === 'mechanic') {
        const mechanic = onlineMechanics.get(socket.id);
        if (mechanic) {
          console.log(`[Offline Cleanup] Mechanic: ${mechanic.name} disconnected. Leaving room.`);
          socket.leave("mechanics_room");
          onlineMechanics.delete(socket.id);
          broadcastOnlineMechanics();

          // Grace period for mechanic reconnection
          setTimeout(() => {
            let reconnected = false;
            connectedUsers.forEach((u) => {
              if (u.email === user.email && u.role === 'mechanic') {
                reconnected = true;
              }
            });

            if (!reconnected) {
              console.log(`[Offline Timeout] Mechanic: ${user.name} failed to reconnect. Reverting active jobs.`);
              activeRequests.forEach(async (req, reqId) => {
                if (req.mechanicEmail === user.email && req.status === 'accepted') {
                  try {
                    await RescueRequest.updateOne({ requestId: reqId }, {
                      status: 'pending',
                      mechanicName: null,
                      mechanicEmail: null,
                      mechanicPhone: null,
                      mechanicLocation: null
                    });
                  } catch (err) {
                    console.error('[Socket] Disconnect cleanup error reverting request:', err.message);
                  }

                  req.status = 'pending';
                  req.mechanicSocketId = null;
                  req.mechanicName = null;
                  req.mechanicLocation = null;
                  req.mechanicEmail = null;

                  // Notify customer
                  io.to(`customer_${req.customerEmail}`).emit('mechanic_cancelled', { requestId: reqId });

                  // Re-broadcast request to mechanics room
                  io.to("mechanics_room").emit('new_breakdown_request', req);
                }
              });
            }
          }, 60000); // 60 seconds grace period
        }
      } else {
        // Customer disconnected
        console.log(`[Offline Cleanup] Customer: ${user.name} disconnected. Starting grace periods...`);

        // Grace period for pending customer requests
        setTimeout(() => {
          let reconnected = false;
          connectedUsers.forEach((u) => {
            if (u.email === user.email && u.role === 'customer') {
              reconnected = true;
            }
          });

          if (!reconnected) {
            console.log(`[Offline Timeout] Customer: ${user.name} failed to reconnect. Cleaning up pending requests.`);
            activeRequests.forEach(async (req, reqId) => {
              if (req.customerEmail === user.email && req.status === 'pending') {
                try {
                  await RescueRequest.updateOne({ requestId: reqId }, { status: 'cancelled' });
                } catch (err) {
                  console.error('[Socket] Disconnect cleanup error cancelling pending:', err.message);
                }

                // Remove card from all mechanics
                io.to("mechanics_room").emit('job_taken', { requestId: reqId });
                activeRequests.delete(reqId);
              }
            });
          }
        }, 60000); // 60 seconds grace period

        // Grace period for accepted customer requests (long timeout)
        setTimeout(() => {
          let reconnected = false;
          connectedUsers.forEach((u) => {
            if (u.email === user.email && u.role === 'customer') {
              reconnected = true;
            }
          });

          if (!reconnected) {
            console.log(`[Offline Timeout] Customer: ${user.name} failed to reconnect. Cancelling accepted rescue.`);
            activeRequests.forEach(async (req, reqId) => {
              if (req.customerEmail === user.email && req.status === 'accepted') {
                try {
                  await RescueRequest.updateOne({ requestId: reqId }, { status: 'cancelled' });
                } catch (err) {
                  console.error('[Socket] Disconnect cleanup error cancelling accepted:', err.message);
                }

                if (req.mechanicSocketId) {
                  const mechanic = onlineMechanics.get(req.mechanicSocketId);
                  if (mechanic) {
                    mechanic.status = 'available';
                    io.to(req.mechanicSocketId).emit('job_cancelled_by_customer', { requestId: reqId });
                    
                    // Rejoin mechanics_room
                    const mechSocket = io.sockets.sockets.get(req.mechanicSocketId);
                    if (mechSocket) {
                      mechSocket.join("mechanics_room");
                    }
                  }
                }
                activeRequests.delete(reqId);
              }
            });
          }
        }, 180000); // 3 minutes grace period for accepted jobs
      }
      
      connectedUsers.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  RoadsideRescue Server successfully started!`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Access platform at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
