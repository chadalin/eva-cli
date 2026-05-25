const readline = require('readline');
const { execSync } = require('child_process');
const { askEva } = require('./client');
const { executeCode } = require('./executor');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const G = '\x1b[32m';  // зелёный
const Y = '\x1b[33m';  // жёлтый
const R = '\x1b[0m';   // сброс

function prompt(q) { return new Promise(r => rl.question(q, r)); }

function extractCode(text) {
    const m = text.match(/```(?:python|py|javascript|js)\n([\s\S]*?)```/);
    return m ? m[1].trim() : null;
}

function startThinking(label = 'Eva: думаю') {
    const frames = ['   ', '.  ', '.. ', '...'];
    let i = 0;
    process.stdout.write(G + label + frames[0] + R);
    const t = setInterval(() => {
        process.stdout.write('\r' + G + label + frames[i++ % frames.length] + R);
    }, 350);
    return () => { clearInterval(t); process.stdout.write('\r' + ' '.repeat(label.length + 5) + '\r'); };
}

const STEPS = {
    analyze: ['Eva: 🔍 анализирую задачу...', 'Eva: 🔍 ищу решение...', 'Eva: 🔍 смотрю что тут у нас...'],
    write:   ['Eva: ⚙️  пишу код...', 'Eva: ⚙️  компилирую мысли...', 'Eva: ⚙️  кручу шестерёнки...'],
    run:     ['Eva: 🚀 запускаю...', 'Eva: 🚀 поехали!', 'Eva: 🚀 3... 2... 1...'],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
async function showStep(type, ms = 500) {
    console.log(G + pick(STEPS[type]) + R);
    await new Promise(r => setTimeout(r, ms));
}

function looksLikeCode(input) {
    return /напиши|сделай код|код|скрипт|функци|алгоритм|программ/i.test(input);
}

const VAGUE = ['сделай', 'помоги', 'придумай', 'что-нибудь', 'что-то', 'хочу'];
function isVague(input) {
    const l = input.toLowerCase().trim();
    return l.split(/\s+/).length <= 5 && VAGUE.some(k => l.includes(k));
}

async function startRepl() {
    console.log(G + '\n Eva CLI — AI ассистент v1.0.0' + R);
    console.log(' Команды: /exit  /run <код>  /fix  /git <команда>  /graph');
    console.log(' ─────────────────────────────────\n');

    const userId = process.env.EVA_USER || 'cli-' + Date.now();
    let lastCode = null;
    let lastError = null;

    while (true) {
        const input = await prompt('You: ');
        if (!input.trim()) continue;

        if (input === '/exit' || input === '/quit') {
            console.log(G + '\nEva: Пока!\n' + R); rl.close(); process.exit(0);
        }

        if (input.startsWith('/git ')) {
            const cmd = input.slice(5);
            try {
                const out = execSync(`git ${cmd}`, { encoding: 'utf8', cwd: process.cwd() });
                console.log(G + 'Eva: ' + R + out + '\n');
            } catch (err) {
                console.log(G + 'Eva: Ошибка git: ' + R + err.message + '\n');
            }
            continue;
        }

        if (input.startsWith('/run ')) {
            const code = input.slice(5); lastCode = code;
            await showStep('run');
            const result = await executeCode(code, 'python');
            if (result.success) { console.log(G + 'Eva: Результат:\n' + R + result.output + '\n'); lastError = null; }
            else { lastError = result.error; console.log(G + 'Eva: Ошибка:\n' + R + result.error + '\n'); }
            continue;
        }

        if (input === '/fix' && lastCode && lastError) {
            const fixPrompt = `Этот код вызвал ошибку:\n\`\`\`python\n${lastCode}\n\`\`\`\nОшибка: ${lastError}\nИсправь код.`;
            await showStep('analyze', 400);
            const stop = startThinking('Eva: думаю');
            const reply = await askEva(fixPrompt, userId);
            stop();
            console.log(G + 'Eva: ' + R + reply + '\n');
            const code = extractCode(reply);
            if (code) {
                lastCode = code; await showStep('run');
                const result = await executeCode(code, 'python');
                if (result.success) { console.log(G + 'Eva: Результат:\n' + R + result.output + '\n'); lastError = null; }
                else { lastError = result.error; console.log(G + 'Eva: Ошибка:\n' + R + result.error + '\n'); }
            }
            continue;
        }

        if (input === '/graph') {
            const { getBrainGraph } = require('./client');
            const stop = startThinking('Eva: загружаю граф');
            const graph = await getBrainGraph(userId);
            stop();
            if (graph && graph.nodes) console.log(G + 'Eva: Мои мысли о тебе: ' + R + graph.nodes.slice(0,5).map(n => n.name).join(', ') + '\n');
            continue;
        }

        if (isVague(input)) {
            const stop = startThinking('Eva: уточняю');
            const q = await askEva(`Пользователь написал: "${input}". Задай ОДИН короткий уточняющий вопрос. Только вопрос.`, userId);
            stop();
            console.log(G + 'Eva: ' + R + q + '\n');
            continue;
        }

        if (looksLikeCode(input)) { await showStep('analyze', 400); await showStep('write', 600); }

        const stop = startThinking('Eva: думаю');
        const reply = await askEva(input, userId);
        stop();
        console.log(G + 'Eva: ' + R + reply + '\n');

        const code = extractCode(reply);
        if (code) {
            lastCode = code;
            await showStep('run');
            const result = await executeCode(code, 'python');
            if (result.success) { console.log(G + 'Eva: Результат:\n' + R + result.output + '\n'); lastError = null; }
            else { lastError = result.error; console.log(G + 'Eva: Ошибка:\n' + R + result.error + '\n'); }
        }
    }
}

module.exports = { startRepl };