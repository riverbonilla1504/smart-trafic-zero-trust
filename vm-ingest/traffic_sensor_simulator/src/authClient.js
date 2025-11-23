// src/authClient.js
const axios = require("axios");
const { settings } = require("./config");

class AuthClient {
    constructor() {
        this.token = null;
    }

    async getToken() {
        const payload = {
            client_id: settings.authClientId,
            client_secret: settings.authClientSecret,
        };

        console.log(`[AUTH] Solicitando token a ${settings.authUrl}`);

        try {
            const resp = await axios.post(settings.authUrl, payload, {
                // En dev, NODE_TLS_REJECT_UNAUTHORIZED=0 ya saltará la verificación
                timeout: 5000,
            });

            const accessToken = resp.data.access_token;
            if (!accessToken) {
                throw new Error("La respuesta de auth no tiene access_token");
            }

            this.token = accessToken;
            console.log("[AUTH] Token obtenido correctamente");
            return this.token;
        } catch (err) {
            console.error("[AUTH] Error obteniendo token:", err.message);
            throw err;
        }
    }
}

module.exports = { AuthClient };
