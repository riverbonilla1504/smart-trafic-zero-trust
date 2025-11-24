const jwt = require("jsonwebtoken");
const { settings } = require("./config");

// Validate a JWT token
function validateToken(token) {
    if (!token) {
        throw new Error("Empty token");
    }

    // Ignore the expiration at the library level
    const payload = jwt.verify(token, settings.jwtSecret, {
        algorithms: ["HS256"],
        ignoreExpiration: true,
    });

    // If you want, you can do a manual check and only log
    const now = Date.now() / 1000;
    if (payload.exp && payload.exp < now) {
        console.warn("[CORE] Token expired (but accepted for reprocessing):", {
            sub: payload.sub,
            exp: new Date(payload.exp * 1000).toISOString(),
        });
    }

    return payload;
}

module.exports = { validateToken };
