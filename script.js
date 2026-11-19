/* ==============================================================================
   RONALDIANS OF BENGAL (RFCU) — FULL-STACK CLIENT SCRIPT
   Supabase Database, Auth, RLS, Storage, Fan Shop, Admin Console & UI
============================================================================== */

// Ensure configuration is ready
// Ensure configuration is ready from window.APP_CONFIG
const config = window.APP_CONFIG || {
    API_BASE_URL: "/api",
    COMMUNITY_WHATSAPP_NUMBER: "916296277118",
    ORDER_WHATSAPP_NUMBER: "919163398371",
    HAS_SUPABASE: false
};

// Supabase client (only active if valid remote credentials exist)
let supabase = window.supabaseClient || null;
function getSupabase() {
    if (!supabase && window.supabaseClient) {
        supabase = window.supabaseClient;
    }
    return supabase;
}

window.addEventListener("rfcu:configReady", (e) => {
    supabase = window.supabaseClient;
    if (typeof setupSupabaseAuth === "function") {
        setupSupabaseAuth();
    }
});

/**
 * Robust API helper with meaningful error reporting and diagnostics
 */
async function apiRequest(endpoint, options = {}) {
    const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "/api";
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
    const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${cleanEndpoint}`;

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            const errorMsg = data?.error || `Server responded with status ${response.status}`;
            const err = new Error(errorMsg);
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    } catch (networkErr) {
        if (networkErr.name === "TypeError" && networkErr.message.includes("fetch")) {
            console.error(`[RFCU API Error] Could not connect to backend server at ${url}.`);
            throw new Error(`Unable to connect to the RFCU backend server. Please verify the server is running on port 3000.`);
        }
        throw networkErr;
    }
}

// Global Application State
let currentUser = null;
let currentProfile = null;
let cart = [];
let cachedProducts = [];

/* ==============================================================================
   1. TOAST NOTIFICATION SYSTEM
============================================================================== */
function showToast(message, type = "info", duration = 4000) {
    const container = document.getElementById("toastContainer");
    if (!container) {
        alert(message);
        return;
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✓";
    if (type === "error") icon = "✕";
    if (type === "warning") icon = "⚠️";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-message">${message}</div>
        <button class="toast-close" type="button" aria-label="Close notification">&times;</button>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector(".toast-close");
    let timer = setTimeout(dismissToast, duration);

    function dismissToast() {
        clearTimeout(timer);
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        setTimeout(() => toast.remove(), 300);
    }

    closeBtn.addEventListener("click", dismissToast);
}

/* ==============================================================================
   2. DOM INITIALIZATION
============================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
    initAuth();
    initCart();
    initGallery();
    initEvents();
    initProducts();
    initReviews();
    initHelpdesk();
    initHelpingHands();
    initAdminDashboard();
    initFaqAccordion();
    initScrollAndAnimations();
});

/* ==============================================================================
   3. MOBILE NAVIGATION MENU
============================================================================== */
function initMobileMenu() {
    const menuBtn = document.getElementById("menuBtn");
    const nav = document.querySelector(".navbar nav");

    if (menuBtn && nav) {
        menuBtn.addEventListener("click", () => {
            nav.classList.toggle("active");
            menuBtn.textContent = nav.classList.contains("active") ? "✕" : "☰";
        });

        document.querySelectorAll(".navbar nav a").forEach(link => {
            link.addEventListener("click", () => {
                nav.classList.remove("active");
                menuBtn.textContent = "☰";
            });
        });
    }
}

/* ==============================================================================
   4. AUTHENTICATION & USER PROFILE SYSTEM
============================================================================== */
function initAuth() {
    // 4.0 Restore session from localStorage if present
    const savedUser = localStorage.getItem("rfcu_user");
    if (savedUser) {
        try {
            const parsed = JSON.parse(savedUser);
            currentUser = parsed;
            currentProfile = {
                id: parsed.id,
                display_name: parsed.displayName || parsed.name || (parsed.email ? parsed.email.split("@")[0] : "Member"),
                email: parsed.email,
                phone: parsed.phone,
                role: parsed.role || "member"
            };
            updateNavAuthUI(true);
        } catch (e) {
            console.warn("[RFCU] Stored session parse note:", e);
        }
    }

    // 4.1 If Supabase is actively configured, listen to Supabase Auth state
    function setupSupabaseAuth() {
        const client = getSupabase();
        if (client && window.APP_CONFIG?.HAS_SUPABASE) {
            try {
                client.auth.onAuthStateChange(async (event, session) => {
                    if (session?.user) {
                        currentUser = session.user;
                        await fetchUserProfile(currentUser.id);
                    } else if (!savedUser) {
                        currentUser = null;
                        currentProfile = null;
                        updateNavAuthUI(false);
                    }
                });

                client.auth.getSession().then(async ({ data: { session } }) => {
                    if (session?.user) {
                        currentUser = session.user;
                        await fetchUserProfile(session.user.id);
                    }
                }).catch(e => console.warn("[RFCU] Supabase getSession note:", e.message));
            } catch (err) {
                console.warn("[RFCU] Supabase auth listeners bypassed:", err.message);
            }
        }
    }
    setupSupabaseAuth();

    // 4.3 Login Form
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("loginEmail").value.trim().toLowerCase();
            const password = document.getElementById("loginPassword").value.trim();
            const submitBtn = document.getElementById("loginSubmitBtn");

            if (!email || !password) {
                showToast("Please enter both email and password.", "error");
                return;
            }

            if (!email.includes("@")) {
                showToast("Please enter a valid email address.", "warning");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "AUTHENTICATING...";
            }

            try {
                const client = getSupabase();
                let loggedIn = false;

                if (client && window.APP_CONFIG?.HAS_SUPABASE) {
                    try {
                        const { data, error } = await client.auth.signInWithPassword({
                            email,
                            password
                        });

                        if (error) {
                            throw error;
                        }

                        if (!data?.user) {
                            throw new Error("Login failed. Please check your credentials.");
                        }

                        currentUser = data.user;
                        await fetchUserProfile(data.user.id);

                        // Update login count & timestamp
                        if (currentProfile) {
                            const newCount = (currentProfile.login_count || 0) + 1;
                            client.from("profiles").update({
                                last_login: new Date().toISOString(),
                                login_count: newCount
                            }).eq("id", data.user.id).then(() => { }).catch(() => { });
                        }

                        localStorage.setItem("rfcu_user", JSON.stringify(currentUser));
                        updateNavAuthUI(true);
                        showToast(`Welcome back, ${currentProfile?.display_name || 'Member'}! ❤️`, "success");
                        loginForm.reset();

                        const loginModal = document.getElementById("loginModal");
                        if (loginModal) loginModal.classList.remove("show");
                        loggedIn = true;
                    } catch (sbErr) {
                        const isNetworkError = sbErr.message && (
                            sbErr.message.includes("fetch") ||
                            sbErr.message.includes("Network") ||
                            sbErr.message.includes("Failed")
                        );
                        if (isNetworkError) {
                            console.error(`[RFCU Diagnostic] Supabase network failure: Unable to reach ${window.APP_CONFIG.SUPABASE_URL}/auth/v1/token. Attempting backend fallback.`);
                        } else {
                            throw sbErr;
                        }
                    }
                }

                if (!loggedIn) {
                    // Fallback to local server API
                    const response = await apiRequest("/community/login", {
                        method: "POST",
                        body: JSON.stringify({ email, password })
                    });

                    currentUser = response.user;
                    currentProfile = {
                        id: response.user.id,
                        display_name: response.user.displayName || response.user.email.split("@")[0],
                        email: response.user.email,
                        phone: response.user.phone,
                        role: response.user.role || "member"
                    };
                    localStorage.setItem("rfcu_user", JSON.stringify(currentUser));
                    updateNavAuthUI(true);
                    showToast(`Welcome back, ${currentProfile.display_name}! ❤️`, "success");
                    loginForm.reset();

                    const loginModal = document.getElementById("loginModal");
                    if (loginModal) loginModal.classList.remove("show");
                }

            } catch (err) {
                console.error("[RFCU] Login failed:", err.message);
                const displayMsg = err.message && err.message.includes("Failed to fetch")
                    ? "Network error: Unable to reach database or backend server. Please verify your connection."
                    : (err.message || "Login failed. Please check your credentials.");
                showToast(displayMsg, "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "LOGIN";
                }
            }
        });
    }

    // 4.4 Join / Register Form
    const joinForm = document.getElementById("joinForm");
    if (joinForm) {
        joinForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("joinName")?.value.trim();
            const mobile = document.getElementById("joinMobile")?.value.trim();
            const email = document.getElementById("joinEmail")?.value.trim().toLowerCase();
            const password = document.getElementById("joinPassword")?.value;
            const age = parseInt(document.getElementById("joinAge")?.value || "0", 10);
            const submitBtn = document.getElementById("joinSubmitBtn");

            if (!name || !mobile || !email || !password) {
                showToast("Please fill all required registration fields.", "warning");
                return;
            }

            if (mobile.length < 10) {
                showToast("Please enter a valid 10-digit mobile number.", "warning");
                return;
            }

            if (password.length < 6) {
                showToast("Password must be at least 6 characters.", "warning");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "CREATING ACCOUNT...";
            }

            try {
                const client = getSupabase();
                let registered = false;

                if (client && window.APP_CONFIG?.HAS_SUPABASE) {
                    try {
                        // Primary Supabase registration
                        const { data, error } = await client.auth.signUp({
                            email,
                            password,
                            options: {
                                data: {
                                    full_name: name,
                                    phone: mobile,
                                    age: age
                                }
                            }
                        });

                        if (error) {
                            throw error;
                        }

                        if (data?.user) {
                            currentUser = data.user;
                            currentProfile = {
                                id: data.user.id,
                                display_name: name,
                                email: email,
                                phone: mobile,
                                age: age,
                                role: "member"
                            };

                            // Direct upsert to public.profiles table to guarantee profile persistence
                            try {
                                await client.from("profiles").upsert({
                                    id: data.user.id,
                                    display_name: name,
                                    email: email,
                                    phone: mobile,
                                    age: age,
                                    role: "member"
                                }, { onConflict: "id" });
                            } catch (profileErr) {
                                console.warn("[RFCU] Profile upsert notice:", profileErr.message);
                            }

                            if (data.session) {
                                localStorage.setItem("rfcu_user", JSON.stringify(currentUser));
                                updateNavAuthUI(true);
                                showToast("Account created successfully! Welcome to Ronaldians In Bengal! ❤️", "success");
                            } else {
                                showToast("Account created successfully! Please check your email to confirm your account. ❤️", "success");
                            }
                            registered = true;
                        }
                    } catch (sbErr) {
                        const isNetworkError = sbErr.message && (
                            sbErr.message.includes("fetch") ||
                            sbErr.message.includes("Network") ||
                            sbErr.message.includes("Failed")
                        );

                        if (isNetworkError) {
                            console.error(`[RFCU Diagnostic] Supabase network failure: Unable to reach ${window.APP_CONFIG.SUPABASE_URL}/auth/v1/signup (DNS or network failure). Attempting backend fallback.`);
                        } else {
                            // If Supabase returned an actual application error (e.g. User already registered), throw it
                            throw sbErr;
                        }
                    }
                }

                if (!registered) {
                    // Local or deployed server API fallback
                    const response = await apiRequest("/community/register", {
                        method: "POST",
                        body: JSON.stringify({
                            name,
                            email,
                            phone: mobile,
                            age,
                            password
                        })
                    });

                    currentUser = response.user;
                    currentProfile = {
                        id: response.user.id,
                        display_name: response.user.displayName || name,
                        email: response.user.email,
                        phone: mobile,
                        role: response.user.role || "member"
                    };
                    localStorage.setItem("rfcu_user", JSON.stringify(currentUser));
                    updateNavAuthUI(true);
                    showToast("Account created successfully! Welcome to Ronaldians In Bengal! ❤️", "success");
                }

                joinForm.reset();

                // WhatsApp Join Notification Option
                const waNumber = (window.APP_CONFIG && window.APP_CONFIG.COMMUNITY_WHATSAPP_NUMBER) || config.COMMUNITY_WHATSAPP_NUMBER || "916296277118";
                const waMsg = `Hello Ronaldians Of Bengal! ❤️\n\nI have registered for the community.\nName: ${name}\nMobile: ${mobile}\nEmail: ${email}\nAge: ${age}\n\nSIUUUU!`;
                const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
                setTimeout(() => {
                    if (confirm("Registration successful! Would you like to confirm your membership on our official WhatsApp community?")) {
                        window.open(waUrl, "_blank");
                    }
                }, 800);

            } catch (err) {
                console.error("[RFCU] Registration error:", err.message);
                const displayMsg = err.message && err.message.includes("Failed to fetch")
                    ? "Network error: Unable to reach database or backend server. Please verify your internet connection or Supabase project URL."
                    : (err.message || "Registration could not be completed.");
                showToast(displayMsg, "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "JOIN NOW";
                }
            }
        });
    }

    // 4.5 Forgot Password Modal & Logic
    const forgotLink = document.getElementById("forgotPasswordLink");
    const forgotModal = document.getElementById("forgotPasswordModal");
    const closeForgotBtn = document.getElementById("closeForgotModal");
    const forgotForm = document.getElementById("forgotPasswordForm");

    if (forgotLink && forgotModal) {
        forgotLink.addEventListener("click", (e) => {
            e.preventDefault();
            forgotModal.classList.add("show");
            forgotModal.setAttribute("aria-hidden", "false");
        });
    }

    if (closeForgotBtn && forgotModal) {
        closeForgotBtn.addEventListener("click", () => {
            forgotModal.classList.remove("show");
            forgotModal.setAttribute("aria-hidden", "true");
        });
    }

    if (forgotForm) {
        forgotForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("forgotEmail")?.value.trim();
            const btn = document.getElementById("sendResetBtn");
            if (!email) return;

            if (btn) {
                btn.disabled = true;
                btn.textContent = "SENDING...";
            }

            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin
                });
                if (error) throw error;
                showToast("Password reset instructions sent to your email.", "success");
                forgotModal.classList.remove("show");
                forgotForm.reset();
            } catch (err) {
                showToast(err.message || "Failed to send reset email.", "error");
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "SEND PASSWORD RESET EMAIL";
                }
            }
        });
    }

    // 4.6 User Profile Modal & Dashboard
    const userProfileBtn = document.getElementById("userProfileBtn");
    const profileModal = document.getElementById("profileModal");
    const closeProfileModal = document.getElementById("closeProfileModal");
    const logoutBtn = document.getElementById("logoutBtn");

    if (userProfileBtn && profileModal) {
        userProfileBtn.addEventListener("click", () => {
            openProfileModal();
        });
    }

    if (closeProfileModal && profileModal) {
        closeProfileModal.addEventListener("click", () => {
            profileModal.classList.remove("show");
            profileModal.setAttribute("aria-hidden", "true");
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await supabase.auth.signOut();
            showToast("You have been logged out.", "info");
            profileModal.classList.remove("show");
        });
    }

    // Profile form submit
    const profileForm = document.getElementById("profileUpdateForm");
    if (profileForm) {
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const newName = document.getElementById("profDisplayName").value.trim();
            const newPhone = document.getElementById("profPhone").value.trim();
            const btn = document.getElementById("saveProfileBtn");

            if (btn) btn.textContent = "SAVING...";

            try {
                const { error } = await supabase.from("profiles").update({
                    display_name: newName,
                    phone: newPhone,
                    updated_at: new Date().toISOString()
                }).eq("id", currentUser.id);

                if (error) throw error;

                showToast("Profile updated successfully!", "success");
                await fetchUserProfile(currentUser.id);
            } catch (err) {
                showToast(err.message || "Failed to update profile.", "error");
            } finally {
                if (btn) btn.textContent = "SAVE CHANGES";
            }
        });
    }

    // Profile tabs
    document.querySelectorAll(".profile-tab-content").forEach((panel, idx) => {
        if (idx !== 0) panel.style.display = "none";
    });

    document.querySelectorAll("#profileModal .admin-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#profileModal .admin-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            document.querySelectorAll(".profile-tab-content").forEach(panel => {
                panel.style.display = panel.id === targetId ? "block" : "none";
            });
            if (targetId === "tab-profile-orders") loadUserOrders();
            if (targetId === "tab-profile-pledges") loadUserPledges();
            if (targetId === "tab-profile-tickets") loadUserTickets();
        });
    });
}

// Fetch user profile from Supabase profiles table
async function fetchUserProfile(userId) {
    try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (error) {
            console.warn("[RFCU] Profile lookup note:", error.message);
            currentProfile = {
                id: userId,
                display_name: currentUser.email.split("@")[0],
                email: currentUser.email,
                role: "member"
            };
        } else {
            currentProfile = data;
        }
        updateNavAuthUI(true);
    } catch (err) {
        console.error("[RFCU] Profile error:", err);
    }
}

// Update Header UI based on login status
function updateNavAuthUI(isLoggedIn) {
    const navUserArea = document.getElementById("navUserArea");
    const userChipName = document.getElementById("userChipName");
    const userChipAvatar = document.getElementById("userChipAvatar");
    const userAdminBadge = document.getElementById("userAdminBadge");
    const navLoginItem = document.getElementById("navLoginItem");
    const navJoinItem = document.getElementById("navJoinItem");
    const openAdminDashboardBtn = document.getElementById("openAdminDashboardBtn");

    if (isLoggedIn && currentProfile) {
        if (navUserArea) navUserArea.style.display = "block";
        if (userChipName) userChipName.textContent = currentProfile.display_name || "Member";
        if (userChipAvatar) {
            const firstLetter = (currentProfile.display_name || "R")[0].toUpperCase();
            userChipAvatar.textContent = firstLetter;
        }

        const isAdmin = currentProfile.role === "admin";
        if (userAdminBadge) userAdminBadge.style.display = isAdmin ? "inline-flex" : "none";
        if (openAdminDashboardBtn) openAdminDashboardBtn.style.display = isAdmin ? "inline-block" : "none";

        if (navLoginItem) navLoginItem.style.display = "none";
        if (navJoinItem) navJoinItem.style.display = "none";
    } else {
        if (navUserArea) navUserArea.style.display = "none";
        if (navLoginItem) navLoginItem.style.display = "list-item";
        if (navJoinItem) navJoinItem.style.display = "list-item";
    }
}

// Open and populate profile modal
function openProfileModal() {
    const modal = document.getElementById("profileModal");
    if (!modal || !currentProfile) return;

    document.getElementById("profDisplayName").value = currentProfile.display_name || "";
    document.getElementById("profEmail").value = currentProfile.email || currentUser?.email || "";
    document.getElementById("profPhone").value = currentProfile.phone || "";
    document.getElementById("profRole").value = (currentProfile.role || "member").toUpperCase();

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

// Load logged-in user's orders
async function loadUserOrders() {
    const list = document.getElementById("userOrdersList");
    if (!list || !currentUser) return;

    list.innerHTML = `<p style="color:#888; font-size:12px; padding:15px;">Loading orders...</p>`;

    try {
        let orders = [];
        try {
            const data = await apiRequest(`/orders?userId=${encodeURIComponent(currentUser.id)}`);
            orders = data?.orders || [];
        } catch (apiErr) {
            if (supabase && window.APP_CONFIG?.HAS_SUPABASE) {
                const { data: cloudOrders } = await supabase
                    .from("orders")
                    .select(`*, order_items(*)`)
                    .eq("user_id", currentUser.id)
                    .order("created_at", { ascending: false });
                orders = cloudOrders || [];
            } else {
                throw apiErr;
            }
        }

        const countEl = document.getElementById("userOrderCount");
        if (countEl) countEl.textContent = orders.length;

        if (orders.length === 0) {
            list.innerHTML = `<p style="color:#777; font-size:12px; padding:20px 0;">You have not placed any store orders yet.</p>`;
            return;
        }

        let html = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Date</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        orders.forEach(order => {
            const dateStr = new Date(order.created_at).toLocaleDateString();
            const items = order.items || order.order_items || [];
            const itemsSummary = items.map(i => `${i.product_name} (${i.selected_size || 'Std'}) × ${i.quantity}`).join("<br>");
            html += `
                <tr>
                    <td style="font-family:monospace; font-size:11px; color:#d4af37;">${order.id}</td>
                    <td>${dateStr}</td>
                    <td style="font-size:11px;">${itemsSummary || 'Merchandise'}</td>
                    <td style="font-weight:700; color:#fff;">₹${order.total_inr}</td>
                    <td><span class="badge-status badge-${order.order_status}">${order.order_status.toUpperCase()}</span></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        list.innerHTML = html;
    } catch (err) {
        console.error("[RFCU] User orders error:", err.message);
        list.innerHTML = `<p style="color:#e50914; font-size:12px;">Could not load order history.</p>`;
    }
}

// Load user's donation pledges
async function loadUserPledges() {
    const list = document.getElementById("userPledgesList");
    if (!list || !currentUser) return;

    list.innerHTML = `<p style="color:#888; font-size:12px; padding:15px;">Loading pledges...</p>`;

    try {
        const { data: pledges, error } = await supabase
            .from("donation_pledges")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!pledges || pledges.length === 0) {
            list.innerHTML = `<p style="color:#777; font-size:12px; padding:20px 0;">No donation pledges recorded yet.</p>`;
            return;
        }

        let html = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Pledge Ref</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Note</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        pledges.forEach(p => {
            html += `
                <tr>
                    <td style="font-family:monospace; font-size:11px; color:#d4af37;">PLG-${p.id.slice(0, 6).toUpperCase()}</td>
                    <td>${new Date(p.created_at).toLocaleDateString()}</td>
                    <td style="font-weight:700; color:#2ecc71;">₹${p.amount_inr}</td>
                    <td style="font-size:11px;">${p.purpose_or_note || 'Helping Hands Community Support'}</td>
                    <td><span class="badge-status badge-${p.status === 'completed' ? 'delivered' : 'pending'}">${p.status.toUpperCase()}</span></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = `<p style="color:#e50914; font-size:12px;">Could not load pledges.</p>`;
    }
}

// Load user's support tickets
async function loadUserTickets() {
    const list = document.getElementById("userTicketsList");
    if (!list || !currentUser) return;

    list.innerHTML = `<p style="color:#888; font-size:12px; padding:15px;">Loading tickets...</p>`;

    try {
        const { data: tickets, error } = await supabase
            .from("support_tickets")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!tickets || tickets.length === 0) {
            list.innerHTML = `<p style="color:#777; font-size:12px; padding:20px 0;">No support tickets submitted yet.</p>`;
            return;
        }

        let html = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Ticket ID</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Admin Reply</th>
                    </tr>
                </thead>
                <tbody>
        `;

        tickets.forEach(t => {
            html += `
                <tr>
                    <td style="font-family:monospace; font-size:11px; color:#d4af37;">TCK-${t.id.slice(0, 6).toUpperCase()}</td>
                    <td><strong>${t.subject}</strong><br><small style="color:#888;">${t.message}</small></td>
                    <td><span class="badge-status badge-${t.status === 'resolved' ? 'delivered' : 'pending'}">${t.status.toUpperCase()}</span></td>
                    <td style="font-size:11px; color:#aaa;">${t.admin_notes || 'Pending response'}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = `<p style="color:#e50914; font-size:12px;">Could not load tickets.</p>`;
    }
}

/* ==============================================================================
   5. GALLERY & LIGHTBOX INTEGRATION
============================================================================== */
async function initGallery() {
    const grid = document.getElementById("galleryGrid");
    const filterBtns = document.querySelectorAll(".gallery-filter-btn");
    const lightboxModal = document.getElementById("imageLightboxModal");
    const lightboxImg = document.getElementById("lightboxImg");
    const lightboxCaption = document.getElementById("lightboxCaption");
    const closeLightboxBtn = document.getElementById("closeLightboxModal");

    if (!grid) return;

    // Fetch published gallery items from Supabase
    if (supabase) {
        try {
            const { data: items, error } = await supabase
                .from("gallery_items")
                .select("*")
                .eq("is_published", true)
                .order("created_at", { ascending: false });

            if (!error && items && items.length > 0) {
                grid.innerHTML = "";
                items.forEach(item => {
                    const card = document.createElement("div");
                    card.className = "gallery-card";
                    card.setAttribute("data-category", item.category || "Community");
                    card.innerHTML = `
                        <img src="${item.image_url}" alt="${item.title}" loading="lazy">
                        <div class="gallery-card-overlay">
                            <span class="gallery-card-category">${item.category || "Community"}</span>
                            <h4 class="gallery-card-title">${item.title}</h4>
                        </div>
                    `;
                    card.addEventListener("click", () => openLightbox(item.image_url, `${item.title} — ${item.caption || ''}`));
                    grid.appendChild(card);
                });
            }
        } catch (err) {
            console.warn("[RFCU] Gallery fetch fallback:", err);
        }
    }

    // Attach click events to any existing static cards as fallback
    document.querySelectorAll(".gallery-card").forEach(card => {
        card.addEventListener("click", () => {
            const img = card.querySelector("img");
            const title = card.querySelector(".gallery-card-title")?.textContent || "";
            if (img) openLightbox(img.src, title);
        });
    });

    // Lightbox modal logic
    function openLightbox(src, caption) {
        if (!lightboxModal) return;
        lightboxImg.src = src;
        lightboxCaption.textContent = caption;
        lightboxModal.classList.add("show");
        lightboxModal.setAttribute("aria-hidden", "false");
    }

    if (closeLightboxBtn && lightboxModal) {
        closeLightboxBtn.addEventListener("click", () => {
            lightboxModal.classList.remove("show");
            lightboxModal.setAttribute("aria-hidden", "true");
        });
    }

    if (lightboxModal) {
        lightboxModal.addEventListener("click", (e) => {
            if (e.target === lightboxModal) {
                lightboxModal.classList.remove("show");
                lightboxModal.setAttribute("aria-hidden", "true");
            }
        });
    }

    // Category Filter buttons
    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const filter = btn.getAttribute("data-filter");

            document.querySelectorAll(".gallery-card").forEach(card => {
                const category = card.getAttribute("data-category");
                if (filter === "all" || category === filter) {
                    card.style.display = "block";
                } else {
                    card.style.display = "none";
                }
            });
        });
    });
}

/* ==============================================================================
   6. EVENTS INTEGRATION
============================================================================== */
async function initEvents() {
    const grid = document.getElementById("eventsGrid");
    if (!grid) return;

    if (supabase) {
        try {
            const { data: events, error } = await supabase
                .from("events")
                .select("*")
                .eq("is_published", true)
                .order("event_date", { ascending: true });

            if (!error && events && events.length > 0) {
                grid.innerHTML = "";
                events.forEach(evt => {
                    const evtDate = new Date(evt.event_date);
                    const day = evtDate.getDate().toString().padStart(2, "0");
                    const month = evtDate.toLocaleString("default", { month: "short" }).toUpperCase();

                    const card = document.createElement("div");
                    card.className = "event-card";
                    card.innerHTML = `
                        <div class="event-image-wrap">
                            <img src="${evt.image_url || 'images/hero.jpg'}" alt="${evt.title}" loading="lazy">
                            <div class="event-date-badge">
                                <div class="event-date-day">${day}</div>
                                <div class="event-date-month">${month}</div>
                            </div>
                        </div>
                        <div class="event-body">
                            <div class="event-location">
                                <i class="fas fa-map-marker-alt"></i> ${evt.location}
                            </div>
                            <h3 class="event-title">${evt.title}</h3>
                            <p class="event-desc">${evt.description}</p>
                            <button class="btn secondary-btn event-rsvp-btn" type="button" data-event="${evt.title}">
                                RSVP / JOIN EVENT
                            </button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            }
        } catch (err) {
            console.warn("[RFCU] Events fetch fallback:", err);
        }
    }

    // Attach RSVP handlers
    document.addEventListener("click", (e) => {
        if (e.target && e.target.classList.contains("event-rsvp-btn")) {
            const eventName = e.target.getAttribute("data-event") || "Ronaldians Fan Meet";
            showToast(`RSVP recorded for ${eventName}! Opening official WhatsApp...`, "success");
            const msg = `Hello Ronaldians Of Bengal! ❤️\n\nI want to RSVP / attend the event:\n"${eventName}"\n\nPlease reserve my spot!\nSIUUUU!`;
            const waUrl = `https://wa.me/${config.COMMUNITY_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
            setTimeout(() => window.open(waUrl, "_blank"), 600);
        }
    });
}

/* ==============================================================================
   7. SHOP & PRODUCTS SYSTEM (Server-Verified Orders)
============================================================================== */
async function initProducts() {
    const container = document.getElementById("shopProductsContainer");
    if (!container) return;

    try {
        const data = await apiRequest("/products");
        if (data?.products && data.products.length > 0) {
            cachedProducts = data.products;
            renderShopProducts(data.products, container);
            return;
        }
    } catch (err) {
        console.warn("[RFCU] Products API load note:", err.message);
    }

    // Optional cloud fallback if Supabase is active
    if (supabase && window.APP_CONFIG?.HAS_SUPABASE) {
        try {
            const { data: products } = await supabase
                .from("products")
                .select("*")
                .eq("is_active", true)
                .order("created_at", { ascending: true });

            if (products && products.length > 0) {
                cachedProducts = products;
                renderShopProducts(products, container);
            }
        } catch (err) {
            console.warn("[RFCU] Products cloud fallback:", err.message);
        }
    }
}

function renderShopProducts(products, container) {
    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    grid.style.width = "100%";

    products.forEach(p => {
        // Determine if this product is a T-shirt (purchasable) or coming soon
        const isTshirt = /t-?shirt/i.test(p.name);

        const card = document.createElement("div");
        card.className = "product-card" + (isTshirt ? "" : " product-~card--coming-soon");

        let stockBadge = `<span class="stock-tag in-stock">IN STOCK (${p.stock_quantity})</span>`;
        if (p.stock_quantity <= 0) {
            stockBadge = `<span class="stock-tag out-stock">OUT OF STOCK</span>`;
        } else if (p.stock_quantity < 5) {
            stockBadge = `<span class="stock-tag low-stock">ONLY ${p.stock_quantity} LEFT</span>`;
        }

        const sizes = p.available_sizes || ["S", "M", "L", "XL", "XXL"];
        let sizeOptions = sizes.map(s => `<option value="${s}">${s}</option>`).join("");

        // Build the action area based on product type
        let actionArea;
        if (isTshirt) {
            // Fully purchasable: show size selector + Add to Cart
            actionArea = `
                ${sizes.length > 1 || sizes[0] !== 'One Size' ? `
                    <div class="product-options">
                        <label>Size</label>
                        <select class="prod-size-select" data-prod-id="${p.id}">
                            <option value="">Select Size</option>
                            ${sizeOptions}
                        </select>
                    </div>
                ` : ''}
                <button
                    class="btn primary-btn add-to-cart-dynamic-btn"
                    data-prod-id="${p.id}"
                    type="button"
                    ${p.stock_quantity <= 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    ${p.stock_quantity <= 0 ? 'SOLD OUT' : 'ADD TO CART'}
                </button>
            `;
        } else {
            // Not yet available: hide size selector, disable button, show COMING SOON
            actionArea = `
                <button
                    class="btn primary-btn"
                    type="button"
                    disabled
                    style="opacity:0.45; cursor:not-allowed;">
                    COMING SOON
                </button>
            `;
        }

        card.innerHTML = `
            <div class="product-image" style="position:relative;">
                ${!isTshirt ? '<span class="coming-soon-badge">COMING SOON</span>' : ''}
                <img src="${p.image_url}" alt="${p.name}" class="tshirt-image" loading="lazy">
            </div>
            <div class="product-info">
                <p class="product-category">OFFICIAL MERCHANDISE</p>
                <h3>${p.name}</h3>
                <p class="product-description">${p.description || 'Premium official CR7 Bengal club merchandise.'}</p>
                <div class="product-price">
                    <span>₹${p.price_inr}</span>
                </div>
                ${isTshirt ? stockBadge : ''}
                ${actionArea}
            </div>
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);

    // Event listener for dynamic Add to Cart buttons (T-shirt products only)
    container.querySelectorAll(".add-to-cart-dynamic-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const prodId = btn.getAttribute("data-prod-id");
            const prod = products.find(p => p.id === prodId);
            if (!prod) return;

            // Guard: only allow purchase for T-shirt products
            if (!/t-?shirt/i.test(prod.name)) return;

            let size = "Standard";
            const sizeSelect = container.querySelector(`.prod-size-select[data-prod-id="${prodId}"]`);
            if (sizeSelect) {
                size = sizeSelect.value;
                if (!size) {
                    showToast("Please choose a size before adding to cart.", "warning");
                    return;
                }
            }

            addToCart({
                product_id: prod.id,
                name: prod.name,
                price: Number(prod.price_inr),
                size: size,
                quantity: 1,
                image: prod.image_url
            });
        });
    });
}

/* ==============================================================================
   8. CART & CHECKOUT WORKFLOW
============================================================================== */
function initCart() {
    const navCartBtn = document.getElementById("navCartBtn");
    const cartSidebar = document.getElementById("cartSidebar");
    const closeCartBtn = document.getElementById("closeCart");
    const checkoutBtn = document.getElementById("checkoutBtn");
    const defaultAddBtn = document.getElementById("addToCartBtn");
    const defaultShirtSize = document.getElementById("shirtSize");

    // Standard static T-shirt Add to Cart handler
    if (defaultAddBtn && defaultShirtSize) {
        defaultAddBtn.addEventListener("click", () => {
            const size = defaultShirtSize.value;
            if (!size) {
                showToast("Please select a T-shirt size.", "warning");
                return;
            }
            addToCart({
                product_id: "default-tshirt",
                name: "Ronaldians Of Bengal T-Shirt",
                price: 449,
                size: size,
                quantity: 1,
                image: "images/tshirt.jpg"
            });
        });
    }

    if (navCartBtn) {
        navCartBtn.addEventListener("click", openCart);
    }

    if (closeCartBtn) {
        closeCartBtn.addEventListener("click", closeCart);
    }

    if (checkoutBtn) {
        checkoutBtn.addEventListener("click", () => {
            if (cart.length === 0) {
                showToast("Your shopping cart is empty.", "warning");
                return;
            }
            closeCart();
            openCheckoutModal();
        });
    }

    // Checkout Modal submit
    const checkoutForm = document.getElementById("checkoutShippingForm");
    const closeCheckoutBtn = document.getElementById("closeCheckoutModal");
    const checkoutModal = document.getElementById("checkoutModal");

    if (closeCheckoutBtn && checkoutModal) {
        closeCheckoutBtn.addEventListener("click", () => {
            checkoutModal.classList.remove("show");
            checkoutModal.setAttribute("aria-hidden", "true");
        });
    }

    if (checkoutForm) {
        checkoutForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await processVerifiedOrder();
        });
    }

    // Order Success Modal close
    const closeOrderSuccessModal = document.getElementById("closeOrderSuccessModal");
    const orderSuccessDoneBtn = document.getElementById("orderSuccessDoneBtn");
    const orderSuccessModal = document.getElementById("orderSuccessModal");

    [closeOrderSuccessModal, orderSuccessDoneBtn].forEach(btn => {
        if (btn && orderSuccessModal) {
            btn.addEventListener("click", () => {
                orderSuccessModal.classList.remove("show");
                orderSuccessModal.setAttribute("aria-hidden", "true");
            });
        }
    });

    updateCartUI();
}

function addToCart(item) {
    const existing = cart.find(i => i.product_id === item.product_id && i.size === item.size);
    if (existing) {
        existing.quantity += item.quantity;
    } else {
        cart.push(item);
    }
    updateCartUI();
    openCart();
    showToast(`Added ${item.name} to cart!`, "success", 2500);
}

function openCart() {
    const cartSidebar = document.getElementById("cartSidebar");
    if (cartSidebar) cartSidebar.classList.add("active");
}

function closeCart() {
    const cartSidebar = document.getElementById("cartSidebar");
    if (cartSidebar) cartSidebar.classList.remove("active");
}

function updateCartUI() {
    const cartItems = document.getElementById("cartItems");
    const cartTotal = document.getElementById("cartTotal");
    const navCartCount = document.getElementById("navCartCount");

    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (navCartCount) navCartCount.textContent = totalCount;

    if (!cartItems || !cartTotal) return;

    cartItems.innerHTML = "";
    if (cart.length === 0) {
        cartItems.innerHTML = `<p class="empty-cart">Your cart is empty.</p>`;
        cartTotal.textContent = "₹0";
        return;
    }

    let total = 0;
    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const el = document.createElement("div");
        el.className = "cart-item";
        el.style.padding = "16px 0";
        el.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                <div>
                    <strong style="font-size:13px; color:#fff;">${item.name}</strong>
                    <p style="color:#888; font-size:11px; margin-top:3px;">Size: <span style="color:#d4af37;">${item.size}</span></p>
                    <p style="color:#aaa; font-size:11px; margin-top:2px;">₹${item.price} × ${item.quantity}</p>
                    <p style="color:#fff; font-size:12px; margin-top:4px; font-weight:700;">Subtotal: ₹${itemTotal}</p>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="cart-qty-btn" data-index="${index}" data-action="dec" style="background:#222; border:1px solid #444; color:#fff; width:24px; height:24px; border-radius:4px; cursor:pointer;">-</button>
                    <span style="font-size:12px; font-weight:700;">${item.quantity}</span>
                    <button class="cart-qty-btn" data-index="${index}" data-action="inc" style="background:#222; border:1px solid #444; color:#fff; width:24px; height:24px; border-radius:4px; cursor:pointer;">+</button>
                    <button class="remove-cart-item-btn" data-index="${index}" style="background:none; border:none; color:#e50914; font-size:20px; cursor:pointer; margin-left:6px;">×</button>
                </div>
            </div>
        `;
        cartItems.appendChild(el);
    });

    cartTotal.textContent = "₹" + total;

    // Attach qty modifier and remove listeners
    cartItems.querySelectorAll(".cart-qty-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.getAttribute("data-index"), 10);
            const action = btn.getAttribute("data-action");
            if (action === "inc") {
                cart[idx].quantity++;
            } else if (action === "dec") {
                cart[idx].quantity--;
                if (cart[idx].quantity <= 0) cart.splice(idx, 1);
            }
            updateCartUI();
        });
    });

    cartItems.querySelectorAll(".remove-cart-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.getAttribute("data-index"), 10);
            cart.splice(idx, 1);
            updateCartUI();
        });
    });
}

function openCheckoutModal() {
    const modal = document.getElementById("checkoutModal");
    const totalEl = document.getElementById("modalCheckoutTotal");
    if (!modal) return;

    let total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (totalEl) totalEl.textContent = "₹" + total;

    // Auto-fill customer details if logged in
    if (currentProfile) {
        const nameInput = document.getElementById("shipName");
        const phoneInput = document.getElementById("shipPhone");
        if (nameInput && !nameInput.value) nameInput.value = currentProfile.display_name || "";
        if (phoneInput && !phoneInput.value) phoneInput.value = currentProfile.phone || "";
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

// Server-verified transaction checkout
async function processVerifiedOrder() {
    const submitBtn = document.getElementById("placeOrderSubmitBtn");
    const name = document.getElementById("shipName")?.value.trim();
    const phone = document.getElementById("shipPhone")?.value.trim();
    const address = document.getElementById("shipAddress")?.value.trim();
    const city = document.getElementById("shipCity")?.value.trim();
    const pincode = document.getElementById("shipPincode")?.value.trim();

    if (!name || !phone || !address || !pincode) {
        showToast("Please fill all shipping fields.", "warning");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "VERIFYING & RECORDING ORDER...";
    }

    try {
        let orderId = null;
        let finalTotal = 0;

        // Prepare shipping and item payloads
        const shippingPayload = {
            name,
            phone,
            address,
            city,
            pincode,
            email: currentUser?.email || null,
            payment_method: "Cash on Delivery / UPI on Confirmation"
        };

        // Try PostgreSQL transactional RPC first if UUIDs match DB products
        let rpcSuccess = false;
        const validDbItems = cart.filter(i => i.product_id && i.product_id !== "default-tshirt");

        if (supabase && validDbItems.length === cart.length) {
            try {
                const rpcItems = cart.map(i => ({
                    product_id: i.product_id,
                    quantity: i.quantity,
                    size: i.size
                }));

                const { data: rpcData, error: rpcError } = await supabase.rpc("create_verified_order", {
                    p_shipping: shippingPayload,
                    p_items: rpcItems
                });

                if (!rpcError && rpcData?.order_id) {
                    orderId = rpcData.order_id;
                    finalTotal = rpcData.total_inr;
                    rpcSuccess = true;
                }
            } catch (rpcErr) {
                console.warn("[RFCU] RPC fallback to direct insert:", rpcErr);
            }
        }

        // Direct table insertion fallback
        if (!rpcSuccess && supabase) {
            finalTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            const { data: orderData, error: orderError } = await supabase.from("orders").insert({
                user_id: currentUser?.id || null,
                order_status: "pending",
                total_inr: finalTotal,
                shipping_name: name,
                shipping_phone: phone,
                shipping_email: currentUser?.email || null,
                shipping_address: address,
                shipping_city: city,
                shipping_pincode: pincode,
                payment_method: "Cash on Delivery / UPI on Confirmation"
            }).select("id").single();

            if (orderError) throw orderError;
            orderId = orderData.id;

            // Insert order items
            for (const item of cart) {
                await supabase.from("order_items").insert({
                    order_id: orderId,
                    product_id: (item.product_id && item.product_id !== "default-tshirt") ? item.product_id : null,
                    product_name: item.name,
                    unit_price_inr: item.price,
                    quantity: item.quantity,
                    selected_size: item.size
                });
            }
        }

        // Generate synthetic order ID if DB was unreachable
        if (!orderId) {
            orderId = "RFCU-" + Math.floor(100000 + Math.random() * 900000);
            finalTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }

        // Success handling
        document.getElementById("checkoutModal").classList.remove("show");
        showToast("Order placed successfully!", "success");

        // Populate Success Modal
        document.getElementById("successOrderId").textContent = orderId;
        document.getElementById("successOrderTotal").textContent = "₹" + finalTotal;

        // Generate WhatsApp confirmation message link
        let waMsg = `Hello Ronaldians Of Bengal! ❤️\n\n`;
        waMsg += `🛒 ORDER CONFIRMATION\n`;
        waMsg += `Order ID: ${orderId}\n`;
        waMsg += `Total: ₹${finalTotal}\n\n`;
        cart.forEach(i => {
            waMsg += `👕 ${i.name} (${i.size}) × ${i.quantity} = ₹${i.price * i.quantity}\n`;
        });
        waMsg += `\n👤 Recipient: ${name}\n📱 Mobile: ${phone}\n📍 Address: ${address}, ${city} - ${pincode}\n`;
        waMsg += `\nPlease confirm my order. SIUUUU! ❤️`;

        const waLink = document.getElementById("whatsappConfirmLink");
        if (waLink) {
            waLink.href = `https://wa.me/${config.ORDER_WHATSAPP_NUMBER}?text=${encodeURIComponent(waMsg)}`;
        }

        const successModal = document.getElementById("orderSuccessModal");
        if (successModal) {
            successModal.classList.add("show");
            successModal.setAttribute("aria-hidden", "false");
        }

        // Reset cart
        cart = [];
        updateCartUI();

    } catch (err) {
        console.error("[RFCU] Checkout error:", err);
        showToast(err.message || "Could not process order. Please check inputs and retry.", "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "PLACE OFFICIAL ORDER";
        }
    }
}

/* ==============================================================================
   9. REVIEWS INTEGRATION
============================================================================== */
async function initReviews() {
    const grid = document.getElementById("reviewsGrid");
    const reviewForm = document.getElementById("reviewForm");

    if (supabase && grid) {
        try {
            const { data: reviews, error } = await supabase
                .from("reviews")
                .select("*")
                .eq("is_published", true)
                .order("created_at", { ascending: false });

            if (!error && reviews && reviews.length > 0) {
                grid.innerHTML = "";
                reviews.forEach(r => {
                    const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
                    const initial = (r.author_name || "R")[0].toUpperCase();
                    const card = document.createElement("div");
                    card.className = "review-card";
                    card.innerHTML = `
                        <div class="stars">${stars}</div>
                        <p>"${r.review_body}"</p>
                        <div class="review-user">
                            <div class="user-avatar">${initial}</div>
                            <div>
                                <strong>${r.author_name}</strong>
                                <span>${r.author_role || 'Community Member'}</span>
                            </div>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            }
        } catch (err) {
            console.warn("[RFCU] Reviews fetch note:", err);
        }
    }

    if (reviewForm) {
        reviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const authorName = document.getElementById("reviewAuthorName")?.value.trim();
            const authorEmail = document.getElementById("reviewAuthorEmail")?.value.trim();
            const rating = parseInt(document.getElementById("reviewRating")?.value || "5", 10);
            const reviewBody = document.getElementById("reviewBody")?.value.trim();
            const submitBtn = document.getElementById("reviewSubmitBtn");

            if (!authorName || !rating || !reviewBody) {
                showToast("Please fill all review fields.", "warning");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "SUBMITTING...";
            }

            try {
                if (supabase) {
                    const { error } = await supabase.from("reviews").insert({
                        user_id: currentUser?.id || null,
                        author_name: authorName,
                        author_role: currentUser ? "Verified Member" : "Fan Supporter",
                        rating: rating,
                        review_body: reviewBody,
                        is_published: true // auto published for immediate community engagement
                    });
                    if (error) throw error;
                }
                showToast(`Thank you, ${authorName}! Your review was submitted. ⭐`, "success");
                reviewForm.reset();
                initReviews(); // Refresh list
            } catch (err) {
                console.error("[RFCU] Review submit error:", err);
                showToast("Could not submit review at this moment.", "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "SUBMIT REVIEW";
                }
            }
        });
    }
}

/* ==============================================================================
   10. HELPDESK & SUPPORT TICKETS
============================================================================== */
function initHelpdesk() {
    const contactForm = document.getElementById("contactForm");
    if (!contactForm) return;

    contactForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("contactName")?.value.trim();
        const email = document.getElementById("contactEmail")?.value.trim();
        const subject = document.getElementById("contactSubject")?.value.trim() || "General Inquiry";
        const message = document.getElementById("contactMessage")?.value.trim();
        const submitBtn = document.getElementById("contactSubmitBtn");

        if (!name || !email || !message) {
            showToast("Please fill all contact fields.", "warning");
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "SENDING MESSAGE...";
        }

        try {
            let ticketRef = "TCK-" + Math.floor(1000 + Math.random() * 9000);
            if (supabase) {
                const { data, error } = await supabase.from("support_tickets").insert({
                    user_id: currentUser?.id || null,
                    contact_name: name,
                    contact_email: email,
                    subject: subject,
                    message: message,
                    status: "open"
                }).select("id").single();

                if (!error && data) {
                    ticketRef = "TCK-" + data.id.slice(0, 6).toUpperCase();
                }
            }

            showToast(`Ticket ${ticketRef} created! We will reply via email shortly. ❤️`, "success");
            contactForm.reset();
        } catch (err) {
            console.error("[RFCU] Contact ticket error:", err);
            showToast("Message sent to administrator.", "success");
            contactForm.reset();
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "SEND MESSAGE";
            }
        }
    });
}

/* ==============================================================================
   11. HELPING HANDS & DONATION PLEDGE SYSTEM
============================================================================== */
function initHelpingHands() {
    const donateBtn = document.getElementById("donateBtn");
    const qrModal = document.getElementById("qrModal");
    const qrClose = document.getElementById("qrClose");
    const pledgeForm = document.getElementById("pledgeForm");

    if (donateBtn && qrModal) {
        donateBtn.addEventListener("click", () => {
            qrModal.classList.add("show");
            qrModal.setAttribute("aria-hidden", "false");
            document.body.classList.add("qr-open");

            // Auto-fill donor details if logged in
            if (currentProfile) {
                const nameInput = document.getElementById("pledgeName");
                const phoneInput = document.getElementById("pledgePhone");
                if (nameInput && !nameInput.value) nameInput.value = currentProfile.display_name || "";
                if (phoneInput && !phoneInput.value) phoneInput.value = currentProfile.phone || "";
            }
        });
    }

    function closeQR() {
        if (!qrModal) return;
        qrModal.classList.remove("show");
        qrModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("qr-open");
    }

    if (qrClose) qrClose.addEventListener("click", closeQR);

    if (qrModal) {
        qrModal.addEventListener("click", (e) => {
            if (e.target === qrModal) closeQR();
        });
    }

    // Pledge recording form
    if (pledgeForm) {
        pledgeForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("pledgeName")?.value.trim();
            const phone = document.getElementById("pledgePhone")?.value.trim();
            const amount = parseFloat(document.getElementById("pledgeAmount")?.value || "0");
            const note = document.getElementById("pledgeNote")?.value.trim();
            const submitBtn = document.getElementById("pledgeSubmitBtn");

            if (!name || amount <= 0) {
                showToast("Please enter donor name and a valid pledge amount.", "warning");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "RECORDING PLEDGE...";
            }

            try {
                let ref = "PLG-" + Math.floor(1000 + Math.random() * 9000);
                if (supabase) {
                    const { data, error } = await supabase.from("donation_pledges").insert({
                        user_id: currentUser?.id || null,
                        donor_name: name,
                        donor_phone: phone,
                        donor_email: currentUser?.email || null,
                        amount_inr: amount,
                        purpose_or_note: note || "Helping Hands Initiative",
                        status: "pledged"
                    }).select("id").single();

                    if (!error && data) {
                        ref = "PLG-" + data.id.slice(0, 6).toUpperCase();
                    }
                }

                showToast(`Pledge for ₹${amount} recorded! (Ref: ${ref})`, "success");
                const banner = document.getElementById("pledgeConfirmationBanner");
                const refSpan = document.getElementById("pledgeRefId");
                if (banner && refSpan) {
                    refSpan.textContent = ref;
                    banner.style.display = "block";
                }
            } catch (err) {
                console.error("[RFCU] Pledge record error:", err);
                showToast("Pledge recorded. Please complete UPI contribution.", "info");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "CONFIRM PLEDGE & VIEW QR";
                }
            }
        });
    }
}

/* ==============================================================================
   12. ADMIN DASHBOARD (Protected by Role & Supabase RLS)
============================================================================== */
function initAdminDashboard() {
    const openAdminBtn = document.getElementById("openAdminDashboardBtn");
    const adminModal = document.getElementById("adminModal");
    const closeAdminBtn = document.getElementById("closeAdminModal");

    if (openAdminBtn && adminModal) {
        openAdminBtn.addEventListener("click", () => {
            if (!currentProfile || currentProfile.role !== "admin") {
                showToast("Access Denied: Administrator role required.", "error");
                return;
            }
            adminModal.classList.add("show");
            adminModal.setAttribute("aria-hidden", "false");
            loadAdminOverviewStats();
        });
    }

    if (closeAdminBtn && adminModal) {
        closeAdminBtn.addEventListener("click", () => {
            adminModal.classList.remove("show");
            adminModal.setAttribute("aria-hidden", "true");
        });
    }

    // Admin Tabs switching
    document.querySelectorAll("#adminMainTabs .admin-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#adminMainTabs .admin-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const targetPanel = btn.getAttribute("data-tab");

            document.querySelectorAll(".admin-tab-panel").forEach(p => {
                p.style.display = p.id === targetPanel ? "block" : "none";
            });

            if (targetPanel === "admin-tab-overview") loadAdminOverviewStats();
            if (targetPanel === "admin-tab-gallery") loadAdminGallery();
            if (targetPanel === "admin-tab-events") loadAdminEvents();
            if (targetPanel === "admin-tab-products") loadAdminProducts();
            if (targetPanel === "admin-tab-orders") loadAdminOrders();
            if (targetPanel === "admin-tab-reviews") loadAdminReviews();
            if (targetPanel === "admin-tab-tickets") loadAdminTickets();
            if (targetPanel === "admin-tab-pledges") loadAdminPledges();
            if (targetPanel === "admin-tab-members") loadAdminMembers();
        });
    });

    // 12.1 Add Gallery Item
    const addGalForm = document.getElementById("adminAddGalleryForm");
    if (addGalForm) {
        addGalForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const title = document.getElementById("adminGalTitle").value.trim();
            const category = document.getElementById("adminGalCategory").value.trim() || "Community";
            let imageUrl = document.getElementById("adminGalImageUrl").value.trim();
            const caption = document.getElementById("adminGalCaption").value.trim();
            const fileInput = document.getElementById("adminGalFileInput");
            const submitBtn = document.getElementById("adminGalSubmitBtn");

            if (submitBtn) submitBtn.textContent = "UPLOADING...";

            try {
                // If an image file was selected, upload directly to Supabase Storage 'gallery' bucket
                if (fileInput && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const fileExt = file.name.split(".").pop();
                    const fileName = `gallery_${Date.now()}.${fileExt}`;

                    const { data: uploadData, error: uploadErr } = await supabase.storage
                        .from("gallery")
                        .upload(fileName, file);

                    if (uploadErr) throw uploadErr;

                    const { data: urlData } = supabase.storage.from("gallery").getPublicUrl(fileName);
                    imageUrl = urlData.publicUrl;
                }

                const { error } = await supabase.from("gallery_items").insert({
                    title,
                    category,
                    image_url: imageUrl,
                    caption,
                    is_published: true,
                    created_by: currentUser.id
                });

                if (error) throw error;

                showToast("Gallery item published successfully!", "success");
                addGalForm.reset();
                loadAdminGallery();
                initGallery();
            } catch (err) {
                showToast(err.message || "Failed to add gallery item.", "error");
            } finally {
                if (submitBtn) submitBtn.textContent = "SAVE GALLERY ITEM";
            }
        });
    }

    // 12.2 Add Event
    const addEventForm = document.getElementById("adminAddEventForm");
    if (addEventForm) {
        addEventForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const title = document.getElementById("adminEventTitle").value.trim();
            const dateVal = document.getElementById("adminEventDate").value;
            const location = document.getElementById("adminEventLocation").value.trim();
            const imageUrl = document.getElementById("adminEventImage").value.trim();
            const desc = document.getElementById("adminEventDesc").value.trim();
            const submitBtn = document.getElementById("adminEventSubmitBtn");

            if (submitBtn) submitBtn.textContent = "PUBLISHING...";

            try {
                const { error } = await supabase.from("events").insert({
                    title,
                    event_date: new Date(dateVal).toISOString(),
                    location,
                    image_url: imageUrl,
                    description: desc,
                    is_published: true,
                    created_by: currentUser.id
                });

                if (error) throw error;

                showToast("Event published successfully!", "success");
                addEventForm.reset();
                loadAdminEvents();
                initEvents();
            } catch (err) {
                showToast(err.message || "Failed to publish event.", "error");
            } finally {
                if (submitBtn) submitBtn.textContent = "PUBLISH EVENT";
            }
        });
    }

    // 12.3 Add Product
    const addProductForm = document.getElementById("adminAddProductForm");
    if (addProductForm) {
        addProductForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("adminProdName").value.trim();
            const price = parseFloat(document.getElementById("adminProdPrice").value);
            const stock = parseInt(document.getElementById("adminProdStock").value, 10);
            const image = document.getElementById("adminProdImage").value.trim();
            const sizesStr = document.getElementById("adminProdSizes").value.trim();
            const desc = document.getElementById("adminProdDesc").value.trim();
            const submitBtn = document.getElementById("adminProdSubmitBtn");

            const sizes = sizesStr ? sizesStr.split(",").map(s => s.trim()) : ["S", "M", "L", "XL", "XXL"];

            if (submitBtn) submitBtn.textContent = "ADDING...";

            try {
                const { error } = await supabase.from("products").insert({
                    name,
                    price_inr: price,
                    stock_quantity: stock,
                    image_url: image,
                    available_sizes: sizes,
                    description: desc,
                    is_active: true
                });

                if (error) throw error;

                showToast("Product added to club store!", "success");
                addProductForm.reset();
                loadAdminProducts();
                initProducts();
            } catch (err) {
                showToast(err.message || "Failed to add product.", "error");
            } finally {
                if (submitBtn) submitBtn.textContent = "ADD PRODUCT TO STORE";
            }
        });
    }
}

// Load statistics for Overview Tab
async function loadAdminOverviewStats() {
    try {
        const [{ count: membersCount }, { count: ordersCount }, { data: orders }, { count: ticketsCount }, { data: pledges }] = await Promise.all([
            supabase.from("profiles").select("*", { count: "exact", head: true }),
            supabase.from("orders").select("*", { count: "exact", head: true }),
            supabase.from("orders").select("total_inr"),
            supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
            supabase.from("donation_pledges").select("amount_inr")
        ]);

        document.getElementById("statMembersCount").textContent = membersCount || 0;
        document.getElementById("statOrdersCount").textContent = ordersCount || 0;
        document.getElementById("statTicketsCount").textContent = ticketsCount || 0;

        const rev = (orders || []).reduce((sum, o) => sum + Number(o.total_inr || 0), 0);
        document.getElementById("statRevenueTotal").textContent = "₹" + rev;

        const plg = (pledges || []).reduce((sum, p) => sum + Number(p.amount_inr || 0), 0);
        document.getElementById("statPledgesTotal").textContent = "₹" + plg;
    } catch (err) {
        console.warn("[RFCU] Stats load error:", err);
    }
}

// Admin Gallery List
async function loadAdminGallery() {
    const wrap = document.getElementById("adminGalleryTable");
    if (!wrap) return;

    const { data: items, error } = await supabase.from("gallery_items").select("*").order("created_at", { ascending: false });
    if (error || !items) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load gallery items.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Thumbnail</th><th>Title</th><th>Category</th><th>Published</th><th>Actions</th></tr></thead><tbody>`;
    items.forEach(item => {
        html += `
            <tr>
                <td><img src="${item.image_url}" style="width:40px; height:30px; object-fit:cover; border-radius:4px;"></td>
                <td><strong>${item.title}</strong></td>
                <td>${item.category}</td>
                <td>${item.is_published ? '<span style="color:#2ecc71;">Yes</span>' : '<span style="color:#e74c3c;">No</span>'}</td>
                <td>
                    <button type="button" onclick="toggleGalleryPublish('${item.id}', ${!item.is_published})" style="background:#222; border:1px solid #444; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">
                        ${item.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button type="button" onclick="deleteGalleryItem('${item.id}')" style="background:#e50914; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer; margin-left:6px;">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.toggleGalleryPublish = async function (id, state) {
    await supabase.from("gallery_items").update({ is_published: state }).eq("id", id);
    showToast("Gallery item status updated.", "info");
    loadAdminGallery();
    initGallery();
};

window.deleteGalleryItem = async function (id) {
    if (!confirm("Are you sure you want to delete this gallery item?")) return;
    await supabase.from("gallery_items").delete().eq("id", id);
    showToast("Gallery item deleted.", "info");
    loadAdminGallery();
    initGallery();
};

// Admin Events List
async function loadAdminEvents() {
    const wrap = document.getElementById("adminEventsTable");
    if (!wrap) return;

    const { data: events, error } = await supabase.from("events").select("*").order("event_date", { ascending: true });
    if (error || !events) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load events.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Title</th><th>Date</th><th>Location</th><th>Published</th><th>Actions</th></tr></thead><tbody>`;
    events.forEach(evt => {
        html += `
            <tr>
                <td><strong>${evt.title}</strong></td>
                <td>${new Date(evt.event_date).toLocaleDateString()}</td>
                <td>${evt.location}</td>
                <td>${evt.is_published ? '<span style="color:#2ecc71;">Yes</span>' : '<span style="color:#e74c3c;">No</span>'}</td>
                <td>
                    <button type="button" onclick="toggleEventPublish('${evt.id}', ${!evt.is_published})" style="background:#222; border:1px solid #444; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">
                        ${evt.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button type="button" onclick="deleteEventItem('${evt.id}')" style="background:#e50914; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer; margin-left:6px;">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.toggleEventPublish = async function (id, state) {
    await supabase.from("events").update({ is_published: state }).eq("id", id);
    showToast("Event status updated.", "info");
    loadAdminEvents();
    initEvents();
};

window.deleteEventItem = async function (id) {
    if (!confirm("Are you sure you want to delete this event?")) return;
    await supabase.from("events").delete().eq("id", id);
    showToast("Event deleted.", "info");
    loadAdminEvents();
    initEvents();
};

// Admin Products List
async function loadAdminProducts() {
    const wrap = document.getElementById("adminProductsTable");
    if (!wrap) return;

    const { data: products, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error || !products) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load products.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Stock</th><th>Active</th><th>Actions</th></tr></thead><tbody>`;
    products.forEach(p => {
        html += `
            <tr>
                <td><img src="${p.image_url}" style="width:36px; height:36px; object-fit:cover; border-radius:4px;"></td>
                <td><strong>${p.name}</strong></td>
                <td>₹${p.price_inr}</td>
                <td>${p.stock_quantity}</td>
                <td>${p.is_active ? '<span style="color:#2ecc71;">Yes</span>' : '<span style="color:#e74c3c;">No</span>'}</td>
                <td>
                    <button type="button" onclick="updateProductStockPrompt('${p.id}', ${p.stock_quantity})" style="background:#222; border:1px solid #444; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">
                        Update Stock
                    </button>
                    <button type="button" onclick="toggleProductActive('${p.id}', ${!p.is_active})" style="background:#333; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer; margin-left:4px;">
                        ${p.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.updateProductStockPrompt = async function (id, currentStock) {
    const newStockStr = prompt("Enter new inventory stock count:", currentStock);
    if (newStockStr === null) return;
    const newStock = parseInt(newStockStr, 10);
    if (isNaN(newStock) || newStock < 0) {
        showToast("Invalid stock count entered.", "error");
        return;
    }
    await supabase.from("products").update({ stock_quantity: newStock, updated_at: new Date().toISOString() }).eq("id", id);
    showToast("Inventory stock updated.", "success");
    loadAdminProducts();
    initProducts();
};

window.toggleProductActive = async function (id, state) {
    await supabase.from("products").update({ is_active: state, updated_at: new Date().toISOString() }).eq("id", id);
    showToast("Product status updated.", "info");
    loadAdminProducts();
    initProducts();
};

// Admin Orders List
async function loadAdminOrders() {
    const wrap = document.getElementById("adminOrdersTable");
    if (!wrap) return;

    const { data: orders, error } = await supabase.from("orders").select(`*, order_items(*)`).order("created_at", { ascending: false });
    if (error || !orders) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load orders.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Update Status</th></tr></thead><tbody>`;
    orders.forEach(o => {
        const itemsStr = (o.order_items || []).map(i => `${i.product_name} (${i.selected_size}) × ${i.quantity}`).join("<br>");
        html += `
            <tr>
                <td style="font-family:monospace; font-size:11px; color:#d4af37;">${o.id.slice(0, 8)}...</td>
                <td><strong>${o.shipping_name}</strong><br><small style="color:#888;">${o.shipping_phone} | ${o.shipping_city}</small></td>
                <td style="font-size:11px;">${itemsStr || 'N/A'}</td>
                <td style="font-weight:700; color:#fff;">₹${o.total_inr}</td>
                <td><span class="badge-status badge-${o.order_status}">${o.order_status.toUpperCase()}</span></td>
                <td>
                    <select onchange="updateOrderStatus('${o.id}', this.value)" style="background:#111; color:#fff; border:1px solid #444; border-radius:4px; padding:4px; font-size:11px;">
                        <option value="pending" ${o.order_status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="confirmed" ${o.order_status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="processing" ${o.order_status === 'processing' ? 'selected' : ''}>Processing</option>
                        <option value="shipped" ${o.order_status === 'shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="delivered" ${o.order_status === 'delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="cancelled" ${o.order_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.updateOrderStatus = async function (orderId, newStatus) {
    await supabase.from("orders").update({ order_status: newStatus, updated_at: new Date().toISOString() }).eq("id", orderId);
    showToast(`Order status updated to ${newStatus.toUpperCase()}`, "success");
};

// Admin Reviews Moderation
async function loadAdminReviews() {
    const wrap = document.getElementById("adminReviewsTable");
    if (!wrap) return;

    const { data: reviews, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false });
    if (error || !reviews) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load reviews.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Author</th><th>Rating</th><th>Review</th><th>Published</th><th>Actions</th></tr></thead><tbody>`;
    reviews.forEach(r => {
        html += `
            <tr>
                <td><strong>${r.author_name}</strong></td>
                <td>${r.rating} ★</td>
                <td style="max-width:250px; font-size:11px;">${r.review_body}</td>
                <td>${r.is_published ? '<span style="color:#2ecc71;">Yes</span>' : '<span style="color:#e74c3c;">No</span>'}</td>
                <td>
                    <button type="button" onclick="toggleReviewPublish('${r.id}', ${!r.is_published})" style="background:#222; border:1px solid #444; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">
                        ${r.is_published ? 'Unpublish' : 'Approve'}
                    </button>
                    <button type="button" onclick="deleteReview('${r.id}')" style="background:#e50914; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer; margin-left:4px;">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.toggleReviewPublish = async function (id, state) {
    await supabase.from("reviews").update({ is_published: state }).eq("id", id);
    showToast("Review moderation updated.", "info");
    loadAdminReviews();
    initReviews();
};

window.deleteReview = async function (id) {
    if (!confirm("Delete this review?")) return;
    await supabase.from("reviews").delete().eq("id", id);
    showToast("Review deleted.", "info");
    loadAdminReviews();
    initReviews();
};

// Admin Support Tickets
async function loadAdminTickets() {
    const wrap = document.getElementById("adminTicketsTable");
    if (!wrap) return;

    const { data: tickets, error } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
    if (error || !tickets) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load tickets.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Customer</th><th>Subject & Message</th><th>Status</th><th>Admin Notes</th><th>Action</th></tr></thead><tbody>`;
    tickets.forEach(t => {
        html += `
            <tr>
                <td><strong>${t.contact_name}</strong><br><small style="color:#888;">${t.contact_email}</small></td>
                <td style="max-width:220px; font-size:11px;"><strong>${t.subject}</strong><br>${t.message}</td>
                <td><span class="badge-status badge-${t.status === 'resolved' ? 'delivered' : 'pending'}">${t.status.toUpperCase()}</span></td>
                <td style="font-size:11px; color:#aaa;">${t.admin_notes || 'None'}</td>
                <td>
                    <button type="button" onclick="respondTicketPrompt('${t.id}')" style="background:#222; border:1px solid #444; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">
                        Reply / Note
                    </button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.respondTicketPrompt = async function (id) {
    const note = prompt("Enter admin reply or resolution notes:");
    if (!note) return;
    await supabase.from("support_tickets").update({ admin_notes: note, status: "resolved", updated_at: new Date().toISOString() }).eq("id", id);
    showToast("Ticket marked resolved with note.", "success");
    loadAdminTickets();
};

// Admin Donation Pledges
async function loadAdminPledges() {
    const wrap = document.getElementById("adminPledgesTable");
    if (!wrap) return;

    const { data: pledges, error } = await supabase.from("donation_pledges").select("*").order("created_at", { ascending: false });
    if (error || !pledges) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load pledges.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Donor</th><th>Phone</th><th>Amount</th><th>Status</th><th>Update</th></tr></thead><tbody>`;
    pledges.forEach(p => {
        html += `
            <tr>
                <td><strong>${p.donor_name}</strong></td>
                <td>${p.donor_phone || 'N/A'}</td>
                <td style="font-weight:700; color:#2ecc71;">₹${p.amount_inr}</td>
                <td><span class="badge-status badge-${p.status === 'completed' ? 'delivered' : 'pending'}">${p.status.toUpperCase()}</span></td>
                <td>
                    <select onchange="updatePledgeStatus('${p.id}', this.value)" style="background:#111; color:#fff; border:1px solid #444; border-radius:4px; padding:4px; font-size:11px;">
                        <option value="pledged" ${p.status === 'pledged' ? 'selected' : ''}>Pledged</option>
                        <option value="verified" ${p.status === 'verified' ? 'selected' : ''}>Verified</option>
                        <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${p.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

window.updatePledgeStatus = async function (id, status) {
    await supabase.from("donation_pledges").update({ status: status, updated_at: new Date().toISOString() }).eq("id", id);
    showToast("Pledge status updated.", "info");
};

// Admin Members List
async function loadAdminMembers() {
    const wrap = document.getElementById("adminMembersTable");
    if (!wrap) return;

    const { data: members, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error || !members) {
        wrap.innerHTML = `<p style="color:#e50914;">Could not load members.</p>`;
        return;
    }

    let html = `<table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Logins</th></tr></thead><tbody>`;
    members.forEach(m => {
        html += `
            <tr>
                <td><strong>${m.display_name}</strong></td>
                <td>${m.email || 'N/A'}</td>
                <td>${m.phone || 'N/A'}</td>
                <td><span style="color:${m.role === 'admin' ? '#d4af37' : '#aaa'}; font-weight:700;">${m.role.toUpperCase()}</span></td>
                <td>${m.login_count || 0}</td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

/* ==============================================================================
   13. FAQ ACCORDION
============================================================================== */
function initFaqAccordion() {
    const faqQuestions = document.querySelectorAll(".faq-question");
    faqQuestions.forEach(question => {
        question.addEventListener("click", () => {
            const currentItem = question.parentElement;
            document.querySelectorAll(".faq-item").forEach(item => {
                if (item !== currentItem) item.classList.remove("active");
            });
            currentItem.classList.toggle("active");
        });
    });
}

/* ==============================================================================
   14. SCROLL, ACTIVE NAVIGATION & ANIMATIONS
============================================================================== */
function initScrollAndAnimations() {
    const backToTop = document.getElementById("backToTop");
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".navbar nav a");

    window.addEventListener("scroll", () => {
        if (backToTop) {
            if (window.scrollY > 400) {
                backToTop.classList.add("show");
            } else {
                backToTop.classList.remove("show");
            }
        }

        let currentSection = "";
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 150;
            const sectionHeight = section.offsetHeight;
            if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
                currentSection = section.getAttribute("id");
            }
        });

        navLinks.forEach(link => {
            link.classList.remove("active");
            if (link.getAttribute("href") === "#" + currentSection) {
                link.classList.add("active");
            }
        });
    });

    if (backToTop) {
        backToTop.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // Scroll reveal observer
    const revealElements = document.querySelectorAll(
        ".community-card, .review-card, .legacy-card, .timeline-item, .product-card, .about-container, .join-container, .helping-container, .event-card, .gallery-card"
    );

    if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = "1";
                    entry.target.style.transform = "translateY(0)";
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        revealElements.forEach(el => {
            el.style.opacity = "0";
            el.style.transform = "translateY(25px)";
            el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
            revealObserver.observe(el);
        });
    }
}