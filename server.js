/**
 * ==============================================================================
 * RONALDIANS IN BENGAL (RFCU) — TRUSTED BACKEND API SERVER
 * ==============================================================================
 * Production-ready Express API with server-side validation, CORS, safe logging,
 * ACID database transactions, and dual-mode support (standalone server & Netlify Function).
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db.js");

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================================================================
// 1. SECURITY & CORS CONFIGURATION
// ==============================================================================
// Allow requests from localhost (Vite dev server) and any deployed Netlify or GitHub Pages origin
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://subratamallick159-cell.github.io"
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (
            allowedOrigins.includes(origin) ||
            origin.endsWith(".netlify.app") ||
            process.env.NODE_ENV !== "production"
        ) {
            return callback(null, true);
        }
        return callback(null, true); // Permissive for public club frontend
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "apikey"],
    credentials: true,
    optionsSuccessStatus: 200
};

// cors() middleware automatically handles OPTIONS preflight for all routes in Express 5
app.use(cors(corsOptions));

// ==============================================================================
// 2. BODY PARSING & SAFE DIAGNOSTIC LOGGING
// ==============================================================================
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Safe diagnostic logging middleware
// NEVER logs passwords, credit cards, or personal customer info
app.use((req, res, next) => {
    const start = Date.now();
    const cleanPath = req.path;

    res.on("finish", () => {
        const duration = Date.now() - start;
        // Safe log: method, route, status code, latency
        console.log(`[RFCU API] ${req.method} ${cleanPath} -> ${res.statusCode} (${duration}ms)`);
    });

    next();
});

// ==============================================================================
// 3. API ROUTES
// ==============================================================================

// Health & Diagnostic Audit Endpoint
app.get(["/api/health", "/health"], (req, res) => {
    try {
        const health = db.getHealth();
        res.status(200).json({
            success: true,
            message: "RFCU Backend API is operational.",
            ...health,
            nodeEnv: process.env.NODE_ENV || "development",
            supabaseConfigured: Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).includes("placeholder"))
        });
    } catch (err) {
        console.error("[RFCU Error] Health check failure:", err.message);
        res.status(500).json({ success: false, error: "Health check failed", details: err.message });
    }
});

// Safe Public Runtime Configuration (Publishes ONLY anon/publishable keys, NEVER service_role or secrets)
app.get(["/api/config", "/config"], (req, res) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";

    res.status(200).json({
        success: true,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: supabaseKey,
        COMMUNITY_WHATSAPP_NUMBER: process.env.COMMUNITY_WHATSAPP_NUMBER || "916296277118",
        ORDER_WHATSAPP_NUMBER: process.env.ORDER_WHATSAPP_NUMBER || "919163398371",
        SITE_NAME: "Ronaldians Of Bengal"
    });
});

// Products Catalog (Trusted backend prices & live inventory)
app.get(["/api/products", "/products"], (req, res) => {
    try {
        const products = db.getProducts();
        res.status(200).json({
            success: true,
            products
        });
    } catch (err) {
        console.error("[RFCU Error] Failed to fetch products:", err.message);
        res.status(500).json({ success: false, error: "Failed to load products" });
    }
});

/**
 * ------------------------------------------------------------------------------
 * ORDER SUBMISSION HANDLER
 * ------------------------------------------------------------------------------
 * Validates shipping, verifies items against database catalog, verifies stock,
 * calculates trusted totals on the backend, and saves atomically.
 */
app.post(["/api/orders", "/orders"], (req, res) => {
    try {
        const { shipping, items, userId } = req.body || {};

        if (!shipping) {
            return res.status(400).json({
                success: false,
                error: "Shipping details are required."
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "At least one item must be in the cart to place an order."
            });
        }

        // Execute verified order creation inside ACID transaction
        const orderResult = db.createVerifiedOrder({
            shipping,
            items,
            userId: userId || null
        });

        // Diagnostic log without private data
        console.log(`[RFCU Audit] Order successfully placed: ID=${orderResult.orderId}, Total=INR ${orderResult.totalInr}, ItemsCount=${orderResult.items.length}`);

        return res.status(201).json({
            success: true,
            message: "Order placed and verified successfully.",
            order_id: orderResult.orderId,
            total_inr: orderResult.totalInr,
            items: orderResult.items,
            status: orderResult.status,
            created_at: orderResult.createdAt
        });

    } catch (err) {
        console.error("[RFCU Order Error]:", err.message);

        // Distinguish validation vs server error
        if (
            err.message.includes("required") ||
            err.message.includes("Invalid") ||
            err.message.includes("Insufficient stock") ||
            err.message.includes("inactive")
        ) {
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }

        if (err.message.includes("not found")) {
            return res.status(404).json({
                success: false,
                error: err.message
            });
        }

        return res.status(500).json({
            success: false,
            error: "An unexpected error occurred while processing your order. Please retry."
        });
    }
});

// Get User Orders or Admin Orders
app.get(["/api/orders", "/orders"], (req, res) => {
    try {
        const userId = req.query.userId || null;
        const limit = parseInt(req.query.limit || "50", 10);
        const orders = db.getOrders({ userId, limit });
        res.status(200).json({ success: true, orders });
    } catch (err) {
        console.error("[RFCU Orders Get Error]:", err.message);
        res.status(500).json({ success: false, error: "Could not retrieve orders" });
    }
});

// Get Single Order By ID
app.get(["/api/orders/:id", "/orders/:id"], (req, res) => {
    try {
        const order = db.getOrderById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, error: "Order not found" });
        }
        res.status(200).json({ success: true, order });
    } catch (err) {
        console.error("[RFCU Order Lookup Error]:", err.message);
        res.status(500).json({ success: false, error: "Could not retrieve order" });
    }
});

// Helpdesk / Support Tickets
app.post(["/api/helpdesk/tickets", "/helpdesk/tickets"], (req, res) => {
    try {
        const { name, email, subject, message, userId } = req.body || {};
        const ticket = db.createSupportTicket({ name, email, subject, message, userId });
        console.log(`[RFCU Audit] Support ticket created: ID=${ticket.ticketId}`);
        res.status(201).json({
            success: true,
            message: "Ticket created successfully.",
            ticket_id: ticket.ticketId,
            status: ticket.status
        });
    } catch (err) {
        console.error("[RFCU Helpdesk Error]:", err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

// Donation / Helping Hands Pledges
app.post(["/api/donations/pledge", "/donations/pledge"], (req, res) => {
    try {
        const { name, phone, email, amount, note, userId } = req.body || {};
        const pledge = db.createDonationPledge({ name, phone, email, amount, note, userId });
        console.log(`[RFCU Audit] Donation pledge created: ID=${pledge.pledgeId}, Amount=INR ${pledge.amountInr}`);
        res.status(201).json({
            success: true,
            message: "Pledge recorded successfully.",
            pledge_id: pledge.pledgeId,
            amount_inr: pledge.amountInr,
            status: pledge.status
        });
    } catch (err) {
        console.error("[RFCU Pledge Error]:", err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

// Reviews Submission & Retrieval
app.post(["/api/reviews", "/reviews"], (req, res) => {
    try {
        const { authorName, authorRole, rating, reviewBody, userId } = req.body || {};
        const review = db.createReview({ authorName, authorRole, rating, reviewBody, userId });
        console.log(`[RFCU Audit] Review submitted: ID=${review.reviewId}, Rating=${review.rating}`);
        res.status(201).json({
            success: true,
            message: "Review submitted successfully.",
            review_id: review.reviewId
        });
    } catch (err) {
        console.error("[RFCU Review Error]:", err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get(["/api/reviews", "/reviews"], (req, res) => {
    try {
        const reviews = db.getReviews();
        res.status(200).json({ success: true, reviews });
    } catch (err) {
        console.error("[RFCU Reviews Get Error]:", err.message);
        res.status(500).json({ success: false, error: "Could not load reviews" });
    }
});

// Community Registration & Authentication
app.post(["/api/community/register", "/community/register"], (req, res) => {
    try {
        const { name, email, phone, age, password } = req.body || {};
        const user = db.registerMember({ name, email, phone, age, password });
        console.log(`[RFCU Audit] Member registered: ID=${user.id}`);
        res.status(201).json({
            success: true,
            message: "Registration successful. Welcome to Ronaldians In Bengal! ❤️",
            user
        });
    } catch (err) {
        console.error("[RFCU Register Error]:", err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

app.post(["/api/community/login", "/community/login"], (req, res) => {
    try {
        const { email, password } = req.body || {};
        const user = db.loginMember({ email, password });
        console.log(`[RFCU Audit] Member logged in: ID=${user.id}`);
        res.status(200).json({
            success: true,
            message: `Welcome back, ${user.displayName}! ❤️`,
            user
        });
    } catch (err) {
        console.error("[RFCU Login Error]:", err.message);
        res.status(401).json({ success: false, error: err.message });
    }
});

// ==============================================================================
// 4. STATIC ASSET SERVING & SPA FALLBACK
// ==============================================================================
// Serve static frontend files from workspace root
app.use(express.static(path.join(__dirname), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

// Route fallback for client-side navigation (Express 5 requires named wildcard: /{*path})
app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ success: false, error: "API endpoint not found" });
    }
    res.sendFile(path.join(__dirname, "index.html"));
});

// Export app for Netlify Serverless Functions / tests
module.exports = app;

// Start server if executed directly
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`========================================================`);
        console.log(`⚽ Ronaldians In Bengal API & Web Server Active`);
        console.log(`   URL: http://localhost:${PORT}`);
        console.log(`   Health: http://localhost:${PORT}/api/health`);
        console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`========================================================`);
    });
}
