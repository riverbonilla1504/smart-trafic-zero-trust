const axios = require("axios");

async function getToken() {
    // Request a token from the auth server using client credentials.
    // El certificado se verifica contra la CA interna (NODE_EXTRA_CA_CERTS).
    const res = await axios.post(process.env.AUTH_URL, {
        client_id: process.env.AUTH_CLIENT_ID,
        client_secret: process.env.AUTH_CLIENT_SECRET,
    });
    // Return the access token from the response.
    return res.data.access_token;
}

module.exports = { getToken };
