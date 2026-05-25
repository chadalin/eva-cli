const axios = require('axios');

const EVA_URL = process.env.EVA_URL || 'http://46.173.26.56:8100';
const LARAVEL_URL = process.env.LARAVEL_URL || 'https://peopl.ru';
const EVA_TOKEN = process.env.EVA_TOKEN || 'eva-secret-2026';

async function askEva(message, userId = 'cli-user') {
    try {
        const res = await axios.post(`${LARAVEL_URL}/api/eva/chat`, {
            message,
            user_id: isNaN(userId) ? 3 : parseInt(userId),
            source: 'cli'
        }, {
            timeout: 30000,
            headers: { 'X-Eva-Token': EVA_TOKEN }
        });
        return res.data.reply || res.data.message || 'Нет ответа';
    } catch (err) {
        return `Ошибка: ${err.message}`;
    }
}

async function getBrainGraph(userId = 'cli-user') {
    try {
        const res = await axios.get(`${EVA_URL}/brain/graph`, {
            params: { user_id: userId }
        });
        return res.data;
    } catch (err) {
        return null;
    }
}

async function executeCode(code, language = 'python') {
    try {
        const res = await axios.post(`${EVA_URL}/brain/execute`, {
            code,
            language
        }, { timeout: 15000 });
        return res.data;
    } catch (err) {
        return { error: err.message };
    }
}

module.exports = { askEva, getBrainGraph, executeCode };
