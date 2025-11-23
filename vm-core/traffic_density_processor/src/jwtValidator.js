// src/jwtValidator.js
const jwt = require("jsonwebtoken");
const { settings } = require("./config");

function validateToken(token) {
    if (!token) {
        throw new Error("Token vacío");
    }

    const payload = jwt.verify(token, settings.jwtSecret, {
        algorithms: ["HS256"]
    });

    // Aquí podrías validar scopes, issuer, audience, etc.
    // if (!payload.scopes?.includes("produce:traffic_raw_events")) throw new Error("Scope inválido");

    return payload;
}

module.exports = { validateToken };
