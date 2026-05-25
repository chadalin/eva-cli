const readline = require('readline');
const { askEva } = require('./client');
const { executeCode } = require('./executor');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function extractCode(text) {
    const match = text.match(/```(?:python|py)\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
}

function startThinking(label = 'Eva: думаю') {
    const frames = ['   ', '.  ', '.. ', '...'];
    let i = 0;
    process.stdout.write(label + frames[0]);
    const timer = setInterval(() => {
        process.stdout.write('\r' + label + frames[i % frames.length]);
        i++;
    }, 350);
    return () => {
        clearInterval(timer);
        process.stdout.write('\r' + ' '.repeat(label.length + 5) + '\r');
    };
}

const STEPS = {
    analyze: ['Eva: 🔍 анализирую задачу...','Eva: 🔍 ищу решение...','Eva: 🔍 смотрю что тут у нас...'],
    write: ['Eva: ⚙️  пишу код...','Eva: ⚙️  компилирую мысли...','Eva: ⚙️  кручу шестерёнки...'],
    run: ['Eva: 🚀 запускаю...','Eva: 🚀 поехали!','Eva: 🚀 3... 2... 1...'],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function showStep(type, ms = 500) {
    console.log(pick(STEPS[type]));
    await new Promise(r => setTimeout(r, ms));
}

const VAGUE = ['сделай', 'напиши', 'помоги', 'придумай', 'что-нибудь', 'что-то', 'хочу'];
function isVague(input) {
    const lower = input.toLowerCase().trim();
    return lower.split(/\s+/).length <= 5 && VAGUE.some(k => lower.includes(k));
}
function looksLikeCode(input) {
    return /напиши|сделай код|код|скрипт|функци|алгоритм|программ/i.test(input);
}

async function startRepl() {
    console.log('\n Eva CLI — AI ассистент');
    console.log(' Команды: /exit, /graph, /run <код>, /fix');
    console.log(' ─────────────────────────────────\n');

    const userId = process.env.EVA_USER || 'cli-' + Date.now();
    let lastCode = null;
    let lastError = null;

    while (true) {
        const input = await prompt('You: ');
        if (!input.trim()) continue;

        if (input === '/exit' || input === '/quit') {
            console.log('\nEva: Пока!\n'); rl.close(); process.exit(0);
        }

        if (input.startsWith('/run ')) {
            const code = input.slice(5); lastCode = code;
            await showStep('run');
            const result = executeCode(code, 'python');
            if (result.success) { console.log(`Eva: Результат:\n${result.output}\n`); lastError = null; }
            else { lastError = result.error; console.log(`Eva: Ошибка:\n${result.error}\n`); }
            continue;
        }

        if (input === '/fix' && lastCode && lastError) {
            const fixPrompt = `Этот код вызвал ошибку:\n\`\`\`python\n${lastCode}\n\`\`\`\nОшибка: ${lastError}\nИсправь код.`;
            await showStep('analyze', 400);
            const stopFix = startThinking('Eva: думаю');
            const reply = await askEva(fixPrompt, userId);
            stopFix();
            console.log('Eva: ' + reply + '\n');
            const code = extractCode(reply);
            if (code) {
                lastCode = code; await showStep('run');
                const result = executeCode(code, 'python');
                if (result.success) { console.log(`Eva: Результат:\n${result.output}\n`); lastError = null; }
                else { lastError = result.error; console.log(`Eva: Ошибка:\n${result.error}\n`); }
            }
            continue;
        }

        if (input === '/graph') {
            const { getBrainGraph } = require('./client');
            const stopGraph = startThinking('Eva: загружаю граф');
            const graph = await getBrainGraph(userId);
            stopGraph();
            if (graph && graph.nodes) console.log('Eva: Мои мысли о тебе:', graph.nodes.slice(0,5).map(n => n.name).join(', ') + '\n');
            continue;
        }

        if (isVague(input)) {
            const stopQ = startThinking('Eva: уточняю');
            const question = await askEva(`Пользователь написал: "${input}". Задача слишком расплывчата. Задай ОДИН короткий уточняющий вопрос. Только вопрос, без вступлений.`, userId);
            stopQ();
            console.log('Eva: ' + question + '\n');
            continue;
        }

        if (looksLikeCode(input)) { await showStep('analyze', 400); await showStep('write', 600); }

        const stop = startThinking('Eva: думаю');
        const reply = await askEva(input, userId);
        stop();
        console.log('Eva: ' + reply + '\n');

        const code = extractCode(reply);
        if (code) {
            lastCode = code;
            if (code) {
                await showStep('run');
                const result = executeCode(code, 'python');
                if (result.success) { console.log(`Eva: Результат:\n${result.output}\n`); lastError = null; }
                else { lastError = result.error; console.log(`Eva: Ошибка:\n${result.error}\n`); }
            }
        }
    }
}

module.exports = { startRepl };
