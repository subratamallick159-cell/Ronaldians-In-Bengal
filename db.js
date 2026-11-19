/**
 * ==============================================================================
 * RONALDIANS IN BENGAL (RFCU) — DATABASE & DATA ACCESS LAYER
 * ==============================================================================
 * Powered by Node.js built-in node:sqlite with ACID transactions and WAL mode.
 * Mirrors the schema in supabase/schema.sql.
 */

const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Detect serverless environments (Netlify, AWS Lambda, Vercel) where __dirname is read-only
const isServerless = Boolean(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.VERCEL
);

let DATA_DIR = path.join(__dirname, "data");
let DB_PATH = path.join(DATA_DIR, "ronaldians.db");

if (isServerless) {
    // In serverless environments, the deployment directory is strictly read-only.
    // Use /tmp which is the designated writable directory in Lambda.
    const tmpDir = path.join("/tmp", "ronaldians-data");
    try {
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const tmpDbPath = path.join(tmpDir, "ronaldians.db");
        // Seed /tmp database from bundled DB if available and not yet copied
        if (!fs.existsSync(tmpDbPath) && fs.existsSync(DB_PATH)) {
            try {
                fs.copyFileSync(DB_PATH, tmpDbPath);
            } catch (copyErr) {
                console.warn("[RFCU DB] Could not copy seed DB to /tmp:", copyErr.message);
            }
        }
        DB_PATH = tmpDbPath;
        DATA_DIR = tmpDir;
    } catch (e) {
        console.warn("[RFCU DB] Serverless /tmp setup note:", e.message);
        DB_PATH = ":memory:";
    }
} else {
    // Ensure data directory exists in standard local environment
    if (!fs.existsSync(DATA_DIR)) {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch (e) {
            DB_PATH = ":memory:";
        }
    }
}

let db;
try {
    db = new DatabaseSync(DB_PATH);
    if (DB_PATH !== ":memory:") {
        try {
            db.exec("PRAGMA journal_mode = WAL;");
        } catch (walErr) {
            console.warn("[RFCU DB] WAL mode note:", walErr.message);
        }
    }
    db.exec("PRAGMA foreign_keys = ON;");
} catch (err) {
    console.warn("[RFCU DB] Read-only / initial path error. Falling back to in-memory SQLite database:", err.message);
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
}

// Initialize tables matching supabase/schema.sql
function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price_inr REAL NOT NULL CHECK (price_inr >= 0),
            image_url TEXT NOT NULL,
            stock_quantity INTEGER NOT NULL DEFAULT 50 CHECK (stock_quantity >= 0),
            available_sizes TEXT DEFAULT '["S","M","L","XL","XXL"]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            order_status TEXT NOT NULL DEFAULT 'pending',
            total_inr REAL NOT NULL CHECK (total_inr >= 0),
            shipping_name TEXT NOT NULL,
            shipping_phone TEXT NOT NULL,
            shipping_email TEXT,
            shipping_address TEXT NOT NULL,
            shipping_city TEXT NOT NULL,
            shipping_pincode TEXT NOT NULL,
            notes TEXT,
            payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery / UPI on Confirmation',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id TEXT,
            product_name TEXT NOT NULL,
            unit_price_inr REAL NOT NULL CHECK (unit_price_inr >= 0),
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            selected_size TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            age INTEGER,
            password_hash TEXT,
            role TEXT NOT NULL DEFAULT 'member',
            login_count INTEGER NOT NULL DEFAULT 0,
            last_login TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS support_tickets (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            contact_name TEXT NOT NULL,
            contact_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            admin_notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS donation_pledges (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            donor_name TEXT NOT NULL,
            donor_phone TEXT,
            donor_email TEXT,
            amount_inr REAL NOT NULL CHECK (amount_inr > 0),
            purpose_or_note TEXT,
            status TEXT NOT NULL DEFAULT 'pledged',
            admin_notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            author_name TEXT NOT NULL,
            author_role TEXT DEFAULT 'Community Member',
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            review_body TEXT NOT NULL,
            is_published INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);

    // Seed canonical products if table is empty
    const countStmt = db.prepare("SELECT COUNT(*) as count FROM products");
    const countResult = countStmt.get();
    if (countResult && countResult.count === 0) {
        const insertProd = db.prepare(`
            INSERT INTO products (id, name, description, price_inr, image_url, stock_quantity, available_sizes, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `);

        insertProd.run(
            "default-tshirt",
            "Ronaldians Of Bengal T-Shirt",
            "Official limited edition club jersey. Breathable premium cotton-poly blend with custom CR7 Bengal crest.",
            449.00,
            "images/tshirt.jpg",
            50,
            JSON.stringify(["S", "M", "L", "XL", "XXL"])
        );

        insertProd.run(
            "prod-hoodie-002",
            "CR7 Legend Hoodie - Black & Gold",
            "Heavyweight fleece hoodie celebrating Cristiano Ronaldo 900+ career goals with gold embroidered detailing.",
            999.00,
            "images/hero.jpg",
            25,
            JSON.stringify(["M", "L", "XL"])
        );

        insertProd.run(
            "prod-scarf-003",
            "Ronaldians Official Club Scarf",
            "High-definition knitted fan club scarf in signature crimson red, black and gold.",
            299.00,
            "images/logo.jpg",
            40,
            JSON.stringify(["One Size"])
        );

        console.log("[RFCU DB] Initialized database with canonical merchandise products.");
    }

    // Seed initial review if reviews table is empty
    const reviewCountStmt = db.prepare("SELECT COUNT(*) as count FROM reviews");
    const reviewCount = reviewCountStmt.get();
    if (reviewCount && reviewCount.count === 0) {
        const insertReview = db.prepare(`
            INSERT INTO reviews (id, author_name, author_role, rating, review_body, is_published, created_at)
            VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
        `);
        insertReview.run(
            "rev-init-001",
            "Subrata Mallick",
            "Club Founder & Diehard Fan",
            5,
            "The energy of Ronaldians Of Bengal is unmatched! Best fan club in Bengal celebrating the greatest of all time. SIUUUU! ❤️",
        );
    }
}

initSchema();

// Hash password with SHA-256 + salt
function hashPassword(password) {
    const salt = "rfcu_salt_2026";
    return crypto.createHash("sha256").update(password + salt).digest("hex");
}

/* ==============================================================================
   DATA ACCESS METHODS
============================================================================== */

/**
 * Validates products, stock, calculates trusted totals on backend, and atomic insert.
 * Satisfies Requirement 9: "Ensure order totals and product prices are validated on the trusted backend"
 */
function createVerifiedOrder({ shipping, items, userId = null }) {
    if (!shipping || !shipping.name || !shipping.phone || !shipping.address || !shipping.pincode) {
        throw new Error("Missing required shipping fields: name, phone, address, and pincode are required.");
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Order must contain at least one item.");
    }

    // Verify phone number format
    const cleanPhone = String(shipping.phone).trim();
    if (cleanPhone.length < 10) {
        throw new Error("Please provide a valid 10-digit mobile number.");
    }

    // Begin atomic transaction
    db.exec("BEGIN TRANSACTION;");

    try {
        let calculatedTotal = 0;
        const verifiedItems = [];

        const getProdStmt = db.prepare("SELECT * FROM products WHERE id = ? OR name = ?");
        const updateStockStmt = db.prepare("UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = datetime('now') WHERE id = ?");

        for (const item of items) {
            const qty = parseInt(item.quantity, 10);
            if (!qty || qty <= 0) {
                throw new Error("Invalid item quantity. Must be at least 1.");
            }

            // Lookup product in trusted database
            let product = null;
            if (item.product_id) {
                product = getProdStmt.get(item.product_id, item.name || "");
            }
            if (!product && item.name) {
                product = getProdStmt.get(item.name, item.name);
            }
            // Fallback for default t-shirt if passed with generic ID
            if (!product && (item.product_id === "default-tshirt" || (item.name && item.name.includes("T-Shirt")))) {
                product = getProdStmt.get("default-tshirt", "Ronaldians Of Bengal T-Shirt");
            }

            if (!product) {
                throw new Error(`Product "${item.name || item.product_id}" was not found in official catalog.`);
            }

            if (!product.is_active) {
                throw new Error(`Product "${product.name}" is currently inactive.`);
            }

            if (product.stock_quantity < qty) {
                throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, requested: ${qty}.`);
            }

            // TRUSTED PRICE FROM DATABASE (ignores whatever price client sent)
            const trustedUnitPrice = Number(product.price_inr);
            const lineTotal = trustedUnitPrice * qty;
            calculatedTotal += lineTotal;

            // Decrement stock in database
            updateStockStmt.run(qty, product.id);

            verifiedItems.push({
                productId: product.id,
                productName: product.name,
                unitPrice: trustedUnitPrice,
                quantity: qty,
                size: item.size || "Standard"
            });
        }

        const orderId = "RFCU-" + Math.floor(100000 + Math.random() * 900000);
        const insertOrderStmt = db.prepare(`
            INSERT INTO orders (
                id, user_id, order_status, total_inr,
                shipping_name, shipping_phone, shipping_email,
                shipping_address, shipping_city, shipping_pincode,
                notes, payment_method, created_at, updated_at
            ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        insertOrderStmt.run(
            orderId,
            userId,
            calculatedTotal,
            shipping.name.trim(),
            cleanPhone,
            shipping.email ? shipping.email.trim().toLowerCase() : null,
            shipping.address.trim(),
            shipping.city ? shipping.city.trim() : "Kolkata",
            shipping.pincode.trim(),
            shipping.notes ? shipping.notes.trim() : null,
            shipping.payment_method || "Cash on Delivery / UPI on Confirmation"
        );

        const insertItemStmt = db.prepare(`
            INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_inr, quantity, selected_size, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);

        for (const vItem of verifiedItems) {
            const itemId = "ITEM-" + crypto.randomUUID().slice(0, 8);
            insertItemStmt.run(
                itemId,
                orderId,
                vItem.productId,
                vItem.productName,
                vItem.unitPrice,
                vItem.quantity,
                vItem.size
            );
        }

        db.exec("COMMIT;");

        return {
            orderId,
            totalInr: calculatedTotal,
            items: verifiedItems,
            status: "pending",
            createdAt: new Date().toISOString()
        };
    } catch (err) {
        db.exec("ROLLBACK;");
        throw err;
    }
}

/**
 * Retrieve an order with its items
 */
function getOrderById(orderId) {
    const orderStmt = db.prepare("SELECT * FROM orders WHERE id = ?");
    const order = orderStmt.get(orderId);
    if (!order) return null;

    const itemsStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
    order.items = itemsStmt.all(orderId);
    return order;
}

/**
 * Retrieve recent orders (for user profile or admin)
 */
function getOrders({ userId = null, limit = 50 } = {}) {
    let stmt;
    if (userId) {
        stmt = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?");
        const rows = stmt.all(userId, limit);
        const itemStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
        return rows.map(r => ({ ...r, items: itemStmt.all(r.id) }));
    } else {
        stmt = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?");
        const rows = stmt.all(limit);
        const itemStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
        return rows.map(r => ({ ...r, items: itemStmt.all(r.id) }));
    }
}

/**
 * Get active products catalog
 */
function getProducts() {
    const stmt = db.prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY created_at ASC");
    const prods = stmt.all();
    return prods.map(p => ({
        ...p,
        available_sizes: typeof p.available_sizes === "string" ? JSON.parse(p.available_sizes) : p.available_sizes
    }));
}

/**
 * Create a support ticket
 */
function createSupportTicket({ name, email, subject, message, userId = null }) {
    if (!name || !email || !message) {
        throw new Error("Name, email, and message are required.");
    }
    const ticketId = "TCK-" + Math.floor(1000 + Math.random() * 9000);
    const stmt = db.prepare(`
        INSERT INTO support_tickets (id, user_id, contact_name, contact_email, subject, message, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
    `);
    stmt.run(ticketId, userId, name.trim(), email.trim().toLowerCase(), (subject || "General Inquiry").trim(), message.trim());
    return { ticketId, status: "open", createdAt: new Date().toISOString() };
}

/**
 * Create donation pledge
 */
function createDonationPledge({ name, phone, email, amount, note, userId = null }) {
    const numAmount = parseFloat(amount);
    if (!name || isNaN(numAmount) || numAmount <= 0) {
        throw new Error("Donor name and a valid pledge amount (> 0) are required.");
    }
    const pledgeId = "PLG-" + Math.floor(1000 + Math.random() * 9000);
    const stmt = db.prepare(`
        INSERT INTO donation_pledges (id, user_id, donor_name, donor_phone, donor_email, amount_inr, purpose_or_note, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pledged', datetime('now'), datetime('now'))
    `);
    stmt.run(
        pledgeId,
        userId,
        name.trim(),
        phone ? phone.trim() : null,
        email ? email.trim().toLowerCase() : null,
        numAmount,
        note ? note.trim() : "Helping Hands Initiative"
    );
    return { pledgeId, amountInr: numAmount, status: "pledged", createdAt: new Date().toISOString() };
}

/**
 * Create customer review
 */
function createReview({ authorName, authorRole, rating, reviewBody, userId = null }) {
    const numRating = parseInt(rating, 10);
    if (!authorName || !reviewBody || isNaN(numRating) || numRating < 1 || numRating > 5) {
        throw new Error("Author name, review text, and rating between 1 and 5 are required.");
    }
    const reviewId = "REV-" + Math.floor(1000 + Math.random() * 9000);
    const stmt = db.prepare(`
        INSERT INTO reviews (id, user_id, author_name, author_role, rating, review_body, is_published, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `);
    stmt.run(reviewId, userId, authorName.trim(), authorRole ? authorRole.trim() : "Community Member", numRating, reviewBody.trim());
    return { reviewId, authorName, rating: numRating, createdAt: new Date().toISOString() };
}

/**
 * Get published reviews
 */
function getReviews(limit = 20) {
    const stmt = db.prepare("SELECT * FROM reviews WHERE is_published = 1 ORDER BY created_at DESC LIMIT ?");
    return stmt.all(limit);
}

/**
 * Community member registration
 */
function registerMember({ name, email, phone, age, password }) {
    if (!name || !email || !password) {
        throw new Error("Name, email, and password are required.");
    }
    if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare("SELECT id FROM profiles WHERE email = ?").get(cleanEmail);
    if (existing) {
        throw new Error("An account with this email address already exists.");
    }

    const memberId = "USR-" + crypto.randomUUID().slice(0, 8);
    const passHash = hashPassword(password);
    const stmt = db.prepare(`
        INSERT INTO profiles (id, display_name, email, phone, age, password_hash, role, login_count, last_login, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'member', 1, datetime('now'), datetime('now'), datetime('now'))
    `);
    stmt.run(memberId, name.trim(), cleanEmail, phone ? phone.trim() : null, age ? parseInt(age, 10) : null, passHash);

    return {
        id: memberId,
        displayName: name.trim(),
        email: cleanEmail,
        role: "member",
        loginCount: 1
    };
}

/**
 * Community member login
 */
function loginMember({ email, password }) {
    if (!email || !password) {
        throw new Error("Email and password are required.");
    }
    const cleanEmail = email.trim().toLowerCase();
    const passHash = hashPassword(password);
    const user = db.prepare("SELECT * FROM profiles WHERE email = ?").get(cleanEmail);

    if (!user || user.password_hash !== passHash) {
        throw new Error("Invalid email or password.");
    }

    db.prepare("UPDATE profiles SET login_count = login_count + 1, last_login = datetime('now') WHERE id = ?").run(user.id);

    return {
        id: user.id,
        displayName: user.display_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        loginCount: user.login_count + 1
    };
}

/**
 * Health check & stats
 */
function getHealth() {
    const ordersCount = db.prepare("SELECT COUNT(*) as count FROM orders").get().count;
    const productsCount = db.prepare("SELECT COUNT(*) as count FROM products").get().count;
    const ticketsCount = db.prepare("SELECT COUNT(*) as count FROM support_tickets").get().count;
    const pledgesCount = db.prepare("SELECT COUNT(*) as count FROM donation_pledges").get().count;
    const membersCount = db.prepare("SELECT COUNT(*) as count FROM profiles").get().count;

    return {
        status: "ok",
        database: "connected",
        driver: "node:sqlite (WAL mode)",
        stats: {
            orders: ordersCount,
            products: productsCount,
            tickets: ticketsCount,
            pledges: pledgesCount,
            members: membersCount
        },
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    db,
    createVerifiedOrder,
    getOrderById,
    getOrders,
    getProducts,
    createSupportTicket,
    createDonationPledge,
    createReview,
    getReviews,
    registerMember,
    loginMember,
    getHealth
};
