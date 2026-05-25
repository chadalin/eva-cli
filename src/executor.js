const axios = require('axios');

const EVA_URL = process.env.EVA_URL || 'http://46.173.26.56:8100';

async function executeCode(code, language = 'python') {
    try {
        const res = await axios.post(`${EVA_URL}/brain/execute`, {
            code,
            language
        }, { timeout: 15000 });
        return res.data;
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = { executeCode };