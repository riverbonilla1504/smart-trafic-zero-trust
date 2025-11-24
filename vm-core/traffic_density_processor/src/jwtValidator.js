const jwt = require("jsonwebtoken");
const { settings } = require("./config");

function validateToken(token) {
    if (!token) {
        throw new Error("Token vacío");
    }

    // ignoramos la expiración a nivel de librería
    const payload = jwt.verify(token, settings.jwtSecret, {
        algorithms: ["HS256"],
        ignoreExpiration: true,
    });

    // Si quieres, puedes hacer un chequeo manual y solo loguear
    const now = Date.now() / 1000;
    if (payload.exp && payload.exp < now) {
        console.warn("[CORE] Token expirado (pero aceptado para reproceso):", {
            sub: payload.sub,
            exp: new Date(payload.exp * 1000).toISOString(),
        });
    }

    return payload;
}

module.exports = { validateToken };
