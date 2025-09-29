// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 5000;
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Database Connection ---
const MONGO_URI = process.env.MONGO_URI;
// --- JWT Secret ---
const JWT_SECRET = process.env.JWT_SECRET;

// --- Nodemailer Setup ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT == '465', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false // For corporate servers with self-signed certs
    }
});


// Test transporter configuration
transporter.verify(function (error, success) {
    if (error) {
        console.error('SMTP configuration error:', error);
    } else {
        console.log('SMTP server is ready to take our messages');
    }
});

// Store reset tokens temporarily (in production, use Redis or database)
const resetTokens = new Map();

// --- Email function ---
const sendResetEmail = async (email, resetToken) => {
    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    const subject = 'Password Reset Request - IT Asset Management';
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2C4B84;">Password Reset Request</h2>
            <p>Hello,</p>
            <p>You have requested to reset your password for the IT Asset Management system.</p>
            <p>Please click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" 
                   style="background-color: #296bd5; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold;
                          display: inline-block;">
                    Reset Password
                </a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetLink}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you did not request this password reset, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">
                This is an automated message from IT Asset Management System.
            </p>
        </div>
    `;

    // --- Try Microsoft Graph API ---
    try {
        const msalConfig = {
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
            }
        };
        const cca = new ConfidentialClientApplication(msalConfig);
        const authResponse = await cca.acquireTokenByClientCredential({
            scopes: ['https://graph.microsoft.com/.default'],
        });

        const graphClient = Client.init({
            authProvider: (done) => {
                done(null, authResponse.accessToken);
            }
        });

        await graphClient.api('/users/' + email + '/sendMail').post({
            message: {
                subject: subject,
                body: {
                    contentType: "HTML",
                    content: htmlContent
                },
                toRecipients: [
                    { emailAddress: { address: email } }
                ]
            }
        });

        console.log('Email sent via Microsoft Graph API to:', email);
        return { success: true };
    } catch (error) {
        console.error('Graph API failed, falling back to Nodemailer:', error.message);

        // --- Fallback to Nodemailer ---
        const mailOptions = {
            from: `"IT Asset Management" <${process.env.SENDGRID_FROM_EMAIL}>`,
            to: email,
            subject: subject,
            html: htmlContent,
        };

        try {
            const result = await transporter.sendMail(mailOptions);
            console.log('Email sent via Nodemailer:', result.messageId);
            return { success: true };
        } catch (err) {
            console.error('Nodemailer failed:', err.message);
            return { success: false, error: err.message };
        }
    }
};

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        minlength: 2,
        maxlength: 100
    },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['Admin', 'Editor', 'Viewer'], default: 'Viewer' },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

const EquipmentSchema = new mongoose.Schema({
    assetId: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    status: { type: String, required: true, enum: ['In Use', 'In Stock', 'Damaged', 'E-Waste', 'Removed'] },
    model: { type: String },
    serialNumber: { type: String, unique: true },
    warrantyInfo: { type: Date },
    location: { type: String },
    comment: { type: String },
    assigneeName: { type: String },
    position: { type: String },
    employeeEmail: { type: String },
    phoneNumber: { type: String },
    department: { type: String },
    damageDescription: { type: String },
    purchasePrice: { type: Number, default: 0 },
    isDeleted: {
        type: Boolean,
        default: false
    },
    client: {
  type: String,
  enum: ['Deloitte', 'Lionguard', 'Cognizant'],
  },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Equipment = mongoose.model('Equipment', EquipmentSchema);

// --- Function to Clean Up Duplicate Serial Numbers ---
const cleanupDuplicateSerialNumbers = async () => {
    try {
        console.log('Checking for duplicate serial numbers...');

        const pipeline = [
            {
                $match: {
                    serialNumber: { $ne: null, $ne: "" }
                }
            },
            {
                $group: {
                    _id: "$serialNumber",
                    ids: { $push: "$_id" },
                    count: { $sum: 1 }
                }
            },
            {
                $match: {
                    count: { $gt: 1 }
                }
            }
        ];

        const duplicates = await Equipment.aggregate(pipeline);

        if (duplicates.length === 0) {
            console.log('No duplicate serial numbers found.');
            return;
        }

        for (const duplicate of duplicates) {
            const idsToUpdate = duplicate.ids.slice(1);

            for (let i = 0; i < idsToUpdate.length; i++) {
                const newSerialNumber = `${duplicate._id}_DUPLICATE_${i + 1}`;
                await Equipment.findByIdAndUpdate(idsToUpdate[i], {
                    serialNumber: newSerialNumber
                });
                console.log(`Updated duplicate serial number for ID ${idsToUpdate[i]} to: ${newSerialNumber}`);
            }
        }

        console.log(`Fixed ${duplicates.length} duplicate serial number groups`);
    } catch (error) {
        console.error('Error cleaning up duplicates:', error);
    }
};

// --- Function to Ensure Indexes ---
const ensureIndexes = async () => {
    try {
        await Equipment.syncIndexes();
        console.log('Equipment indexes synchronized successfully');
    } catch (error) {
        console.error('Error synchronizing indexes:', error);

        if (error.code === 11000) {
            console.log('Duplicate key error detected. Attempting to clean up duplicates...');
            await cleanupDuplicateSerialNumbers();

            try {
                await Equipment.syncIndexes();
                console.log('Equipment indexes synchronized successfully after cleanup');
            } catch (retryError) {
                console.error('Failed to sync indexes even after cleanup:', retryError);
            }
        }
    }
};

// --- Function to Seed First Admin User ---
const seedAdminUser = async () => {
    const ADMIN_EMAIL = 'admin@example.com';
    try {
        const adminExists = await User.findOne({ email: ADMIN_EMAIL });
        if (!adminExists) {
            console.log(`No user found with email ${ADMIN_EMAIL}. Creating one...`);
            const admin = new User({
               name: 'Admin',
                email: ADMIN_EMAIL,
                password: 'password123',
                role: 'Admin'
            });
            const salt = await bcrypt.genSalt(10);
            admin.password = await bcrypt.hash(admin.password, salt);
            await admin.save();
            console.log('Admin user created successfully!');
        } else {
            console.log('Admin user already exists.');
        }
    } catch (error) {
        console.error('Error seeding admin user:', error);
    }
};

// --- Connect to DB and Seed Admin ---
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('MongoDB connected successfully.');
        await seedAdminUser();
        await ensureIndexes();
    })
    .catch(err => console.error('MongoDB connection error:', err));

// --- Authentication & Role Middleware ---
const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        console.log('Auth middleware: No token provided');
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (e) {
        console.log('Auth middleware: Invalid token', e.message);
        res.status(400).json({ msg: 'Token is not valid' });
    }
};

const requireRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        console.log(`Access denied for user ${req.user ? req.user.email : 'N/A'} (role: ${req.user ? req.user.role : 'N/A'}) to route needing roles: ${roles.join(', ')}`);
        return res.status(403).json({ msg: 'Access denied. Insufficient role.' });
    }
    next();
};

// --- API Endpoints ---

// --- SEND EMAIL ENDPOINT (Your email form functionality) ---
app.post("/send-email", async (req, res) => {
    const { to, subject, message } = req.body;
    
    try {
        await transporter.sendMail({
            from: `"IT Department" <${process.env.SENDGRID_FROM_EMAIL}>`,
            to,
            subject,
            text: message,
            html: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${message}</pre>`,
        });
        
        res.json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ message: "Failed to send email", error: error.message });
    }
});

// --- Test Email Endpoint (for debugging) ---
app.get('/test-email', async (req, res) => {
    try {
        const mailOptions = {
            from: `"IT Asset Management Test" <${process.env.SENDGRID_FROM_EMAIL}>`,
            to: 'anusha.k@cirruslabs.io', // Change this to your email
            subject: 'SMTP Test Email',
            text: 'If you receive this email, your SMTP configuration is working correctly!'
        };

        console.log('Testing SMTP with:');
        console.log('Host:', process.env.SMTP_HOST);
        console.log('Port:', process.env.SMTP_PORT);
        console.log('User:', process.env.SMTP_USER);
        console.log('To:', mailOptions.to);

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
        console.error('Test email failed:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- User Endpoints ---
app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
        const payload = { user: { id: user.id, role: user.role, email: user.email } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: payload.user });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// --- FORGOT PASSWORD ENDPOINT ---
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    console.log('Password reset requested for:', email);

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with that email address.'
            });
        }

        // Generate secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000; // 1 hour expiry

        // Store token with expiry
        resetTokens.set(resetToken, { email, expiry });

        // Send email with reset link
        const emailResult = await sendResetEmail(email, resetToken);

        if (emailResult.success) {
            res.json({
                success: true,
                message: 'Password reset link sent to your email successfully.'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to send reset email. Please try again later.'
            });
        }

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error occurred.'
        });
    }
});

// --- RESET PASSWORD ENDPOINT ---
app.post('/api/reset-password', async (req, res) => {
    const { email, token, newPassword } = req.body;
    console.log('Reset password request for:', email);

    try {
        // Verify token exists and hasn't expired
        const tokenData = resetTokens.get(token);
        
        if (!tokenData) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid or expired reset token" 
            });
        }

        if (tokenData.expiry < Date.now()) {
            resetTokens.delete(token);
            return res.status(400).json({ 
                success: false, 
                message: "Reset token has expired" 
            });
        }

        if (tokenData.email !== email) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid token for this email address" 
            });
        }

        // Find user and update password
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Hash new password and save
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Remove used token
        resetTokens.delete(token);

        res.json({
            success: true,
            message: 'Password reset successfully!'
        });

    } catch (err) {
        console.error('Reset password error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password.'
        });
    }
});

app.get('/api/users', [auth, requireRole(['Admin'])], async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

app.post('/api/users/create', [auth, requireRole(['Admin'])], async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User already exists' });
        user = new User({ name, email, password, role });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        res.json({ msg: 'User created successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

app.put('/api/users/:id', [auth, requireRole(['Admin'])], async (req, res) => {
    try {
        const { name, email, role, password } = req.body;

        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (email !== undefined) updateFields.email = email;
        if (role !== undefined) updateFields.role = role;
        if (password && password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            updateFields.password = await bcrypt.hash(password, salt);
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({ msg: 'User updated successfully', user: updatedUser });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Email already in use' });
        }
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

app.delete('/api/users/:id', [auth, requireRole(['Admin'])], async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ msg: 'Cannot delete your own account' });
        }
        const deletedUser = await User.findByIdAndDelete(req.params.id)
        if (!deletedUser) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json({ msg: 'User deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// --- Equipment Endpoints (keeping all your existing endpoints) ---

app.get('/api/equipment/summary', auth, async (req, res) => {
    try {
        const totalAssets = await Equipment.countDocuments({ isDeleted: { $ne: true } });
        const inUse = await Equipment.countDocuments({ status: 'In Use', isDeleted: { $ne: true } });
        const inStock = await Equipment.countDocuments({ status: 'In Stock', isDeleted: { $ne: true } });
        const damaged = await Equipment.countDocuments({ status: 'Damaged', isDeleted: { $ne: true } });
        const eWaste = await Equipment.countDocuments({ status: 'E-Waste', isDeleted: { $ne: true } });

        const removed = await Equipment.countDocuments({
            $or: [
                { status: 'E-Waste' },
                { isDeleted: true }
            ]
        });

        res.json({
            totalAssets,
            inUse,
            inStock,
            damaged,
            eWaste,
            removed,
        });
    } catch (err) {
        console.error('Error in /api/equipment/summary:', err.message);
        res.status(500).send('Server Error');
    }
});

app.get('/api/equipment/total-value', auth, async (req, res) => {
    try {
        const result = await Equipment.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$purchasePrice" }
                }
            }
        ]);

        const totalValue = result.length > 0 ? result[0].total : 0;
        res.json({ totalValue });
    } catch (err) {
        console.error('Error in /api/equipment/total-value:', err.message);
        res.status(500).send('Server Error');
    }
});

app.get('/api/equipment/expiring-warranty', auth, async (req, res) => {
    try {
        const thirtyDaysFromNow = moment().add(30, 'days').toDate();
        const now = new Date();

        const expiringItems = await Equipment.find({
            warrantyInfo: { $exists: true, $ne: null, $type: 9, $gte: now, $lte: thirtyDaysFromNow },
            status: { $nin: ['E-Waste', 'Damaged', 'Removed'] },
            isDeleted: { $ne: true }
        }).select('model serialNumber warrantyInfo status category assetId');

        console.log(`Found ${expiringItems.length} expiring items with status field`);
        if (expiringItems.length > 0) {
            console.log('Sample expiring item:', JSON.stringify(expiringItems[0], null, 2));
        }

        res.json(expiringItems);
    } catch (err) {
        console.error('Error in /api/equipment/expiring-warranty:', err.message);
        res.status(500).send('Server Error');
    }
});

app.get('/api/equipment/expiring-warranty/debug', auth, async (req, res) => {
    try {
        const thirtyDaysFromNow = moment().add(30, 'days').toDate();
        const now = new Date();

        const expiringItems = await Equipment.find({
            warrantyInfo: { $exists: true, $ne: null, $type: 9, $gte: now, $lte: thirtyDaysFromNow },
            status: { $nin: ['E-Waste', 'Damaged', 'Removed'] },
            isDeleted: { $ne: true }
        }).select('model serialNumber warrantyInfo status category assetId');

        console.log('Debug - Expiring items found:', expiringItems.length);
        if (expiringItems.length > 0) {
            console.log('First item structure:', JSON.stringify(expiringItems[0], null, 2));
        }

        res.json({
            count: expiringItems.length,
            items: expiringItems,
            sampleItem: expiringItems[0] || null,
            query: {
                warrantyRange: {
                    from: now,
                    to: thirtyDaysFromNow
                },
                excludedStatuses: ['E-Waste', 'Damaged', 'Removed']
            }
        });
    } catch (err) {
        console.error('Error in debug endpoint:', err.message);
        res.status(500).send('Server Error');
    }
});

app.get('/api/equipment/grouped-by-email', auth, async (req, res) => {
    try {
        const groupedData = await Equipment.aggregate([
            { $match: { status: "In Use", isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: "$employeeEmail",
                    assigneeName: { $first: "$assigneeName" },
                    position: { $first: "$position" },
                    phoneNumber: { $first: "$phoneNumber" },
                    department: { $first: "$department" },
                    assets: {
                        $push: {
                            _id: "$_id",
                            assetId: "$assetId",
                            category: "$category",
                            status: "$status",
                            model: "$model",
                            serialNumber: "$serialNumber",
                            warrantyInfo: "$warrantyInfo",
                            location: "$location",
                            comment: "$comment",
                            damageDescription: "$damageDescription",
                            purchasePrice: "$purchasePrice",
                            createdAt: "$createdAt",
                            updatedAt: "$updatedAt"
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    employeeEmail: "$_id",
                    assigneeName: 1,
                    position: 1,
                    phoneNumber: 1,
                    department: 1,
                    assets: 1,
                    count: 1
                }
            },
            {
                $sort: { employeeEmail: 1 }
            }
        ]);
        res.json(groupedData);
    } catch (error) {
        console.error("Error in grouped-by-email aggregation:", error);
        res.status(500).json({ message: "Server error" });
    }
});

app.get('/api/equipment/removed', auth, async (req, res) => {
    try {
        const removedAssets = await Equipment.find({
            status: 'Removed',
            isDeleted: { $ne: true }  // Exclude soft-deleted items
        })
        .sort({ updatedAt: -1 });

        res.json(removedAssets);
    } catch (err) {
        console.error('Error in /api/equipment/removed:', err.message);
        res.status(500).send('Server Error: Could not fetch removed assets.');
    }
});

app.get('/api/equipment/count/:category', auth, async (req, res) => {
    try {
        const count = await Equipment.countDocuments({
            category: req.params.category,
            isDeleted: { $ne: true }
        });
        res.json({ count });
    } catch (err) {
        console.error('Error in /api/equipment/count/:category:', err.message);
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/equipment', auth, async (req, res) => {
    try {
        const equipment = await Equipment.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
        res.json(equipment);
    } catch (err) {
        console.error('Error in /api/equipment (GET all):', err.message);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/equipment', [auth, requireRole(['Admin', 'Editor'])], async (req, res) => {
    const { assetId, category, status, model, serialNumber, warrantyInfo, location, comment,
            assigneeName, position, employeeEmail, phoneNumber, department, damageDescription, purchasePrice } = req.body;

    let parsedWarrantyInfo = null;
    if (warrantyInfo) {
        const mWarranty = moment(warrantyInfo);
        if (mWarranty.isValid()) {
            parsedWarrantyInfo = mWarranty.toDate();
        } else {
            console.warn(`POST request: Invalid warrantyInfo date string received: ${warrantyInfo}`);
        }
    }

    let parsedPurchaseDate = null;
    if (req.body.purchaseDate) {
        const mPurchaseDate = moment(req.body.purchaseDate);
        if (mPurchaseDate.isValid()) {
            parsedPurchaseDate = mPurchaseDate.toDate();
        } else {
            console.warn(`POST request: Invalid purchaseDate date string received: ${req.body.purchaseDate}`);
        }
    }

    const newEquipment = new Equipment({
        assetId, category, status, model, serialNumber,
        warrantyInfo: parsedWarrantyInfo,
        location, comment, assigneeName, position,
        employeeEmail, phoneNumber, department, damageDescription, purchasePrice,
        purchaseDate: parsedPurchaseDate,
        client: req.body.client
    });

    try {
        const savedEquipment = await newEquipment.save();
        res.status(201).json(savedEquipment);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join('. ') });
        }
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.serialNumber) {
                return res.status(400).json({ message: 'Serial Number already exists. Please use a unique serial number.' });
            } else if (err.keyPattern && err.keyPattern.assetId) {
                return res.status(400).json({ message: 'Asset ID already exists. Please use a unique asset ID.' });
            } else {
                return res.status(400).json({ message: 'Duplicate value. Please check your input.' });
            }
        }
        console.error('Error in /api/equipment (POST):', err);
        res.status(500).json({ message: 'Server error while creating equipment.' });
    }
});

app.put('/api/equipment/:id', [auth, requireRole(['Admin', 'Editor'])], async (req, res) => {
    const updateData = { ...req.body };

    if (updateData.warrantyInfo) {
        const mWarranty = moment(updateData.warrantyInfo);
        if (mWarranty.isValid()) {
            updateData.warrantyInfo = mWarranty.toDate();
        } else {
            updateData.warrantyInfo = null;
            console.warn(`PUT request for ${req.params.id}: Invalid warrantyInfo date string received: ${req.body.warrantyInfo}`);
        }
    } else {
        updateData.warrantyInfo = null;
    }

    if (updateData.purchaseDate) {
        const mPurchaseDate = moment(updateData.purchaseDate);
        if (mPurchaseDate.isValid()) {
            updateData.purchaseDate = mPurchaseDate.toDate();
        } else {
            updateData.purchaseDate = null;
            console.warn(`PUT request for ${req.params.id}: Invalid purchaseDate date string received: ${req.body.purchaseDate}`);
        }
    } else {
        updateData.purchaseDate = null;
    }

    if (req.body.status !== 'Damaged') {
        updateData.damageDescription = null;
    }

    if (updateData.comment === "null") {
        updateData.comment = null;
    }

    try {
        const updatedEquipment = await Equipment.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedEquipment) return res.status(404).json({ message: 'Equipment not found' });
        res.json(updatedEquipment);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join('. ') });
        }
        if (err.code === 11000) {
            if (err.keyPattern && err.keyPattern.serialNumber) {
                return res.status(400).json({ message: 'Serial Number already exists. Please use a unique serial number.' });
            } else if (err.keyPattern && err.keyPattern.assetId) {
                return res.status(400).json({ message: 'Asset ID already exists. Please use a unique asset ID.' });
            } else {
                return res.status(400).json({ message: 'Duplicate value. Please check your input.' });
            }
        }
        console.error('Error in /api/equipment/:id (PUT):', err.message, err);
        res.status(500).json({ message: 'Server error during equipment update.' });
    }
});

app.delete('/api/equipment/:id', [auth, requireRole(['Admin'])], async (req, res) => {
    try {
        const softDeletedEquipment = await Equipment.findByIdAndUpdate(
            req.params.id,
            { isDeleted: true },
            { new: true }
        );
        if (!softDeletedEquipment) {
            return res.status(404).json({ message: 'Equipment not found' });
        }
        res.json({ message: 'Equipment marked as deleted successfully' });
    } catch (err) {
        console.error('Error in /api/equipment/:id (DELETE):', err.message);
        res.status(500).json({ message: err.message });
    }
});

// --- Server Start ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));