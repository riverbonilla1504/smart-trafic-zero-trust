const fs = require("fs");
const jwt = require("jsonwebtoken");
const { settings } = require("./config");

const publicKey = fs.readFileSync(settings.jwtPublicKeyFile, "utf8");

// Zero Trust: cada mensaje se verifica por firma, emisor, audiencia, caducidad y permiso.
function validateToken(token) {
    if (!token) {
        throw new Error("Empty token");
    }

    const payload = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: settings.jwtIssuer,
        audience: settings.jwtAudience,
    });

    if (payload.scope !== settings.jwtRequiredScope) {
        throw new Error(`Scope not allowed: ${payload.scope}`);
    }

    return payload;
}

module.exports = { validateToken };
