# ⚽ Ronaldians In Bengal (RFCU) — Full-Stack Platform

> **"One Club. One Passion. One Legend."**  
> Official full-stack website and community platform for **Ronaldians Of Bengal** (Ronaldo Fans Club Ultadanga), celebrating the legacy of Cristiano Ronaldo. Built with clean, performant frontend architecture and backed by **Supabase PostgreSQL**, **Supabase Auth**, **Supabase Storage**, and prepared for automated continuous deployment on **Netlify**.

---

## 🌟 Table of Contents
1. [Architecture & Technology Stack](#-architecture--technology-stack)
2. [Design System & Aesthetics](#-design-system--aesthetics)
3. [Features & Capabilities](#-features--capabilities)
4. [Supabase Database & Row-Level Security (RLS)](#-supabase-database--row-level-security-rls)
5. [Storage Buckets Configuration](#-storage-buckets-configuration)
6. [Administrator Bootstrap Procedure](#-administrator-bootstrap-procedure)
7. [Local Development Setup](#-local-development-setup)
8. [Netlify Deployment Guide](#-netlify-deployment-guide)
9. [Testing & Verification Checklist](#-testing--verification-checklist)
10. [Security & Known Limitations](#-security--known-limitations)

---

## 🏗️ Architecture & Technology Stack

- **Frontend Core**: Vanilla HTML5, CSS3, ES6+ JavaScript (fast, light, and 100% compliant with existing branding)
- **Typography & Icons**: Google Fonts (`Montserrat`), FontAwesome 6.5.2
- **Backend-as-a-Service**: [Supabase](https://supabase.com/)
  - **Database**: PostgreSQL 15+ with relational schema, triggers, and Row Level Security (RLS)
  - **Auth**: Supabase Auth (Email/Password, session persistence, automatic trigger-based profile creation)
  - **Storage**: Supabase Storage (`gallery` and `products` buckets)
  - **Transactions**: Atomic PostgreSQL Stored Procedures (`create_verified_order`)
- **Hosting & Edge Delivery**: [Netlify](https://www.netlify.com/)
  - Automated deployment configuration (`netlify.toml`)
  - Strict security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`)
  - Static asset cache optimization

---

## 🎨 Design System & Aesthetics

The site preserves 100% of the original visual identity, layout structure, and community atmosphere:
- **Background**: Deep obsidian black (`#080808` / `#121212`)
- **Primary Accent**: Crimson Red (`#e50914` / `#9e0008`)
- **Highlight Accent**: Trophy Gold (`#d4af37` / `#997b1a`)
- **Cards & Modals**: Premium dark glassmorphism with subtle 1px border highlights (`rgba(255, 255, 255, 0.08)`)
- **Micro-Animations**: Smooth scroll reveal, interactive buttons, modal dialog transitions, and accessible toast alerts.

---

## 🚀 Features & Capabilities

### 1. Public Community Experience
- **Hero & Story**: Highlighting Cristiano Ronaldo's career milestones (900+ goals, 5 Ballon d'Ors, 5 Champions Leagues).
- **Club Timeline**: Our Journey from founding to the RFCU family.
- **Dynamic Gallery**: Categorized moments (Fan Meets, Screenings, Merchandise, Community) with image zoom Lightbox.
- **Dynamic Events**: Upcoming tournaments, screenings, and celebrations with instant RSVP via WhatsApp.
- **Fan Reviews**: Real community testimonials with interactive 5-star rating submission.
- **Helpdesk & FAQ**: Interactive accordion with direct ticket submission to Supabase.
- **Helping Hands**: Community charity initiatives with pledge recording and direct UPI QR scan.

### 2. Member & Cart System
- **Supabase Auth**: Secure email login and registration.
- **Navbar User Chip**: Member avatar badge, dynamic profile access, and order counter.
- **Member Dashboard**:
  - Edit personal profile details (Name, Phone).
  - Track order history with real-time status pills (`PENDING`, `CONFIRMED`, `SHIPPED`, `DELIVERED`).
  - View donation pledge history.
  - View support tickets and admin replies.
- **Fan Shop & Cart Drawer**:
  - Live inventory tracking (`IN STOCK`, `ONLY X LEFT`, `SOLD OUT`).
  - Dynamic size selector (`S`, `M`, `L`, `XL`, `XXL`).
  - Cart drawer with quantity increment/decrement, item removal, and subtotal calculation.
  - **Server-Verified Checkout**: Orders are validated against actual database stock and unit prices.
  - Instant WhatsApp notification integration.

### 3. Integrated Administrator Console
- Protected by database-level Row Level Security (`role = 'admin'`).
- **Overview Tab**: Live statistics (Total Members, Store Orders, Club Revenue, Open Support Tickets, Total Pledges).
- **Gallery Management**: Upload images directly to Supabase Storage, edit captions, toggle publish status, or delete.
- **Events Management**: Schedule upcoming match screenings and tournaments with live publish controls.
- **Product & Inventory Management**: Create products, modify prices, update stock levels, and toggle active status.
- **Order Management**: Review shipping details, items ordered, and update fulfillment statuses.
- **Review Moderation**: Approve fan reviews before display or delete spam.
- **Support Tickets**: Review incoming fan queries, update status, and attach admin resolution notes.
- **Donation Pledges**: Verify contributions and update pledge statuses.
- **Member Directory**: View registered fan club members and their activity counts.

---

## 🗄️ Supabase Database & Row-Level Security (RLS)

The complete SQL schema is located in `supabase/schema.sql`.

### Tables Created
1. `public.profiles`: Stores display name, email, phone, age, role (`member` or `admin`), login stats.
2. `public.gallery_items`: Stores club gallery photos, captions, categories, and published state.
3. `public.events`: Stores upcoming match screenings and fan events with RSVP count.
4. `public.products`: Official fan merchandise catalog with verified INR prices and live stock quantities.
5. `public.orders`: Customer orders, delivery addresses, and order statuses.
6. `public.order_items`: Snapshots of items, sizes, quantities, and unit prices per order.
7. `public.reviews`: Fan community reviews with rating and moderation flag.
8. `public.support_tickets`: Helpdesk inquiries with customer contact and admin notes.
9. `public.donation_pledges`: Recorded contribution pledges with verification statuses.

### Applying the Schema
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to the **SQL Editor** in the left sidebar.
3. Open `supabase/schema.sql` in this project, copy the entire file contents, and paste it into the Supabase SQL Editor.
4. Click **Run**. All tables, triggers, RPC functions, and RLS policies will be created and seeded automatically.

---

## 📦 Storage Buckets Configuration

The file `supabase/storage_policies.sql` contains the setup for Supabase Storage.

### Setup Instructions
1. In the Supabase Dashboard, go to **Storage**.
2. Run `supabase/storage_policies.sql` in the SQL Editor. This will:
   - Create public buckets `gallery` and `products`.
   - Set file size limits to 5 MB per image.
   - Configure public read policies for all visitors.
   - Restrict file uploads, updates, and deletions exclusively to authorized administrators (`public.is_admin()`).

---

## 👑 Administrator Bootstrap Procedure

By default, all registered users are created with `role = 'member'`. Normal members cannot promote themselves.

To promote a trusted member to Administrator:
1. Ensure the user has registered their account through the website or Supabase Auth.
2. In the Supabase Dashboard, open the **SQL Editor**.
3. Run the following command with the member's email:
   ```sql
   SELECT public.promote_user_to_admin('your-admin-email@example.com');
   ```
4. The user will now have the `admin` role in `public.profiles` and full access to the Administrator Console upon logging in.

---

## 💻 Local Development Setup

### Prerequisites
- Node.js (v18+) OR Python 3 (any modern version)
- A modern web browser (Chrome, Edge, Firefox, Safari)

### Running Locally
1. Ensure dependencies are installed (run once):
   ```bash
   npm install
   ```
2. Start the local development server:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to the displayed local URL (typically `http://localhost:5173`).
4. To build the production bundle:
   ```bash
   npm run build
   ```

---

## 🚀 Netlify Deployment Guide

The site is ready for continuous deployment on Netlify with zero build complications:

1. **Push to GitHub**:
   Ensure all changes are pushed to your repository (e.g., `https://github.com/subratamallick159-cell/RFCU-page`).
2. **Link to Netlify**:
   - Go to [Netlify](https://app.netlify.com/) and click **Add new site** > **Import an existing project**.
   - Select your GitHub repository `subratamallick159-cell/RFCU-page`.
3. **Build & Deploy Settings**:
   - **Base directory**: `.` (leave empty or set to root)
   - **Build command**: `echo 'RFCU Static Site Ready'` (handled automatically via `netlify.toml`)
   - **Publish directory**: `.`
4. **Environment Variables**:
   In Netlify Site Settings > **Environment variables**, configure:
   - `SUPABASE_URL`: `https://qwwrusjteykwsfeplutt.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_NQfFAIXzd-MIYcsiEFYM5Q_ueMij0SL`
   - `COMMUNITY_WHATSAPP_NUMBER`: `916296277118`
   - `ORDER_WHATSAPP_NUMBER`: `919163398371`
5. **Supabase Auth Redirect Configuration**:
   In your Supabase Dashboard under **Authentication > URL Configuration**:
   - **Site URL**: Enter your Netlify URL (e.g. `https://ronaldiansofbengal.netlify.app`).
   - **Redirect URLs**: Add `https://ronaldiansofbengal.netlify.app/**`.
6. Click **Deploy Site**!

---

## ✅ Testing & Verification Checklist

- [x] **Design Preservation**: Tested colors (`#e50914`, `#080808`, `#d4af37`), fonts (`Montserrat`), and original section layouts.
- [x] **Mobile Responsiveness**: Verified navbar toggle, card grids, modals, and cart drawer on mobile, tablet, and desktop viewports.
- [x] **Supabase Authentication**: Verified `signInWithPassword`, trigger-based profile creation on `signUp`, session persistence, and password reset email workflow.
- [x] **Row-Level Security (RLS)**: Enforced RLS on all 9 tables; non-admin members cannot alter other members' data or elevate their own role.
- [x] **Transactional Orders**: Verified product stock decrement and server-calculated price totals via PostgreSQL stored procedure.
- [x] **Gallery & Events**: Dynamic cards loaded from database with filter tabs, Lightbox zoom, and RSVP integrations.
- [x] **Helping Hands**: Pledge record form saves reference in `donation_pledges` before displaying the official UPI QR code.
- [x] **Helpdesk**: Support tickets saved in database with tracking reference IDs.
- [x] **Administrator Dashboard**: Verified access control, real-time counters, gallery/events/products creation, and order status updates.
- [x] **No Leaked Secrets**: Verified that only publishable/anon keys are used in client code; `service_role` keys are strictly prohibited from frontend code.

---

## 🔒 Security & Known Limitations

1. **Client-Side Environment**: The frontend uses the Supabase anon/publishable key (`SUPABASE_PUBLISHABLE_KEY`). Security is strictly enforced by PostgreSQL Row-Level Security (RLS) policies at the database layer.
2. **Online Payment Gateway**: In accordance with the prompt guidelines, payment is processed via **Cash on Delivery / UPI Confirmation on Delivery** with direct WhatsApp order notification. No credit card numbers or banking secrets are collected or stored in browser code. If online payment processing (e.g., Razorpay/Stripe) is desired in the future, it should be connected via verified server-side webhooks (e.g. Netlify Functions or Supabase Edge Functions).
3. **Admin Promotion**: Never edit the database via browser to grant yourself admin privileges. Always use the secure `promote_user_to_admin` SQL procedure in the Supabase Dashboard.

---

*Made with passion for Cristiano Ronaldo & Ronaldians Of Bengal.*  
*SIUUUU!*
