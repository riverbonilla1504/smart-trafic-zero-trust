const axios = require("axios");

async function getToken() {
    // Request a token from the auth server using client credentials.
    const res = await axios.post(
        "https://10.0.1.154/token",
        { client_id: "dispatcher", client_secret: "dispatcher123" },
        { httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }) }
    );
    // Return the access token from the response.
    return res.data.access_token;
}

module.exports = { getToken };
