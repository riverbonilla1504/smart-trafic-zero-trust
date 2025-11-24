const axios = require("axios");
const { settings } = require("./config");

let cachedToken = null;
let cachedExp = 0; // timestamp en segundos

class AuthClient {
    async getToken() {
        const now = Date.now() / 1000;

        // Si tenemos token y faltan > 60s para expirar, lo reutilizamos
        if (cachedToken && now < cachedExp - 60) {
            return cachedToken;
        }

        // Request a token from the auth server
        const resp = await axios.post(settings.authUrl, {
            client_id: settings.authClientId,
            client_secret: settings.authClientSecret,
        });

        // Get the token from the response
        const token = resp.data.access_token;
        // Check if the token is present
        if (!token) throw new Error("Auth did not return access_token");

        // Decode the payload to read exp
        const [, payloadB64] = token.split(".");
        // Parse the payload
        const payloadJson = Buffer.from(payloadB64, "base64").toString("utf8");
        // Parse the payload
        const payload = JSON.parse(payloadJson);

        // Cache the token
        cachedToken = token;
        // Cache the expiration
        cachedExp = payload.exp;

        // Log the new token cached and the expiration
        console.log("[AUTH] New token cached. Exp:", new Date(cachedExp * 1000).toISOString());

        return token;
    }
}

module.exports = { AuthClient };
