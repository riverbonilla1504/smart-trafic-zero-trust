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

        const resp = await axios.post(settings.authUrl, {
            client_id: settings.authClientId,
            client_secret: settings.authClientSecret,
        });

        const token = resp.data.access_token;
        if (!token) throw new Error("Auth no devolvió access_token");

        // Decodificar el payload para leer exp
        const [, payloadB64] = token.split(".");
        const payloadJson = Buffer.from(payloadB64, "base64").toString("utf8");
        const payload = JSON.parse(payloadJson);

        cachedToken = token;
        cachedExp = payload.exp;

        console.log("[AUTH] Nuevo token cacheado. Exp:", new Date(cachedExp * 1000).toISOString());

        return token;
    }
}

module.exports = { AuthClient };
