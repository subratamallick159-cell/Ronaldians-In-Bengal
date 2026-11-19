/**
 * ==============================================================================
 * RONALDIANS IN BENGAL (RFCU) — RUNTIME CONFIGURATION
 * ==============================================================================
 * Manages Supabase client initialization, environment resolution (Vite, Netlify,
 * window.__ENV__, /api/config), and club contacts.
 * Strictly publishes ONLY publishable/anon keys; NEVER leaks service_role keys.
 */

(function () {
    // 1. Default configuration fallback (mirrors repository setup & README)
    const DEFAULT_CONFIG = {
        SUPABASE_URL: "https://qwwrusjteykwsfeplutt.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_NQfFAIXzd-MIYcsiEFYM5Q_ueMij0SL",
        COMMUNITY_WHATSAPP_NUMBER: "916296277118",
        ORDER_WHATSAPP_NUMBER: "919163398371",
        CLUB_EMAIL: "contact@ronaldiansinbengal.org",
        SITE_NAME: "Ronaldians Of Bengal"
    };

    // 2. Resolve Vite environment variables if running through Vite dev or build
    const viteEnv = (typeof import.meta !== "undefined" && import.meta && import.meta.env) ? import.meta.env : {};

    // 3. Resolve Netlify / browser injected runtime environment
    const runtimeEnv = window.__ENV__ || {};

    // 4. Prioritized resolution of Supabase credentials
    const rawSupabaseUrl = (
        runtimeEnv.VITE_SUPABASE_URL ||
        runtimeEnv.SUPABASE_URL ||
        viteEnv.VITE_SUPABASE_URL ||
        viteEnv.SUPABASE_URL ||
        DEFAULT_CONFIG.SUPABASE_URL ||
        ""
    ).trim();

    const rawSupabaseKey = (
        runtimeEnv.VITE_SUPABASE_ANON_KEY ||
        runtimeEnv.SUPABASE_PUBLISHABLE_KEY ||
        runtimeEnv.SUPABASE_ANON_KEY ||
        viteEnv.VITE_SUPABASE_ANON_KEY ||
        viteEnv.SUPABASE_PUBLISHABLE_KEY ||
        viteEnv.SUPABASE_ANON_KEY ||
        DEFAULT_CONFIG.SUPABASE_PUBLISHABLE_KEY ||
        ""
    ).trim();

    function isValidSupabase(url, key) {
        if (!url || !key) return false;
        if (url.includes("your-project-id") || url.includes("placeholder")) return false;
        if (key.includes("your-supabase-anon-key") || key.includes("placeholder")) return false;
        return url.startsWith("https://") && url.includes(".supabase.co");
    }

    const hasValidSupabase = isValidSupabase(rawSupabaseUrl, rawSupabaseKey);
    const effectiveSupabaseUrl = hasValidSupabase ? rawSupabaseUrl : null;
    const effectiveSupabaseKey = hasValidSupabase ? rawSupabaseKey : null;

    // Determine API Base URL
    let apiBase = runtimeEnv.API_BASE_URL || viteEnv.VITE_API_BASE_URL || "/api";
    if (window.location && window.location.protocol === "file:") {
        apiBase = "http://localhost:3000/api";
    }

    window.APP_CONFIG = {
        API_BASE_URL: apiBase,
        SUPABASE_URL: effectiveSupabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: effectiveSupabaseKey,
        HAS_SUPABASE: hasValidSupabase,
        COMMUNITY_WHATSAPP_NUMBER: runtimeEnv.COMMUNITY_WHATSAPP_NUMBER || viteEnv.VITE_COMMUNITY_WHATSAPP_NUMBER || DEFAULT_CONFIG.COMMUNITY_WHATSAPP_NUMBER,
        ORDER_WHATSAPP_NUMBER: runtimeEnv.ORDER_WHATSAPP_NUMBER || viteEnv.VITE_ORDER_WHATSAPP_NUMBER || DEFAULT_CONFIG.ORDER_WHATSAPP_NUMBER,
        CLUB_EMAIL: DEFAULT_CONFIG.CLUB_EMAIL,
        SITE_NAME: DEFAULT_CONFIG.SITE_NAME
    };

    console.log("[RFCU Config] Runtime config loaded. Supabase active:", window.APP_CONFIG.HAS_SUPABASE);

    // Initialize Supabase client
    function initClient(url, key) {
        if (!isValidSupabase(url, key) || typeof window.supabase === "undefined") {
            return null;
        }
        try {
            const client = window.supabase.createClient(url, key, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
            window.supabaseClient = client;
            window.APP_CONFIG.SUPABASE_URL = url;
            window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY = key;
            window.APP_CONFIG.HAS_SUPABASE = true;
            console.log("[RFCU Config] Supabase client active at:", url);
            window.dispatchEvent(new CustomEvent("rfcu:configReady", { detail: window.APP_CONFIG }));
            return client;
        } catch (err) {
            console.warn("[RFCU Config] Supabase client initialization bypassed:", err.message);
            window.supabaseClient = null;
            return null;
        }
    }

    window.initSupabaseClient = initClient;

    if (window.APP_CONFIG.HAS_SUPABASE) {
        initClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY);
    }

    // Dynamic runtime fetch from Netlify serverless function (/api/config) if not yet resolved
    if (!window.APP_CONFIG.HAS_SUPABASE && typeof fetch !== "undefined") {
        fetch(`${apiBase}/config`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && isValidSupabase(data.SUPABASE_URL, data.SUPABASE_PUBLISHABLE_KEY)) {
                    initClient(data.SUPABASE_URL, data.SUPABASE_PUBLISHABLE_KEY);
                }
            })
            .catch(() => {
                // Silently bypass if /api/config is unreachable
            });
    }

    // Re-verify on DOMContentLoaded in case Supabase CDN script loaded afterwards
    window.addEventListener("DOMContentLoaded", () => {
        if (!window.supabaseClient && window.APP_CONFIG.HAS_SUPABASE && typeof window.supabase !== "undefined") {
            initClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY);
        }
    });
})();
