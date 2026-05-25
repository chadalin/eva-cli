const readline = require('readline');
const fs = require('fs');
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

const TOOLS_LIST = 'read_file, list_dir, run_command, git, artisan, composer, check_syntax, test, lint, npm_run, none';

async function selectTool(input, userId) {
    const toolPrompt = `Ответь ТОЛЬКО JSON без пояснений.
Запрос: "${input}"
Инструменты: list_dir(путь), read_file(путь), git(команда), artisan(команда), composer(команда), check_syntax(файл), test(фильтр), lint(путь), npm_run(скрипт), run_command(команда), none
Пример: {"tool":"list_dir","args":"."}
JSON:`;
    const raw = await askEva(toolPrompt, userId);
    console.log(Y + `[tool-select raw]: ${raw}` + R);
    try {
        const m = raw.match(/\{[\s\S]*?\}/);
        return m ? JSON.parse(m[0]) : { tool: 'none' };
    } catch {
        return { tool: 'none' };
    }
}

const DANGEROUS = ['rm -rf', 'rmdir /s', 'del /f', 'format', 'mkfs', 'dd if=', 'shutdown', 'reboot', ':(){:|:&};:'];

function isSafe(cmd) {
    return !DANGEROUS.some(d => cmd.toLowerCase().includes(d));
}

function tryComposer(a, cwd) {
    for (const bin of ['php composer.phar', 'composer', 'composer.bat']) {
        try {
            return execSync(`${bin} ${a}`, { encoding: 'utf8', cwd, shell: true });
        } catch { /* следующий вариант */ }
    }
    throw new Error('composer не найден (попробованы: php composer.phar, composer, composer.bat)');
}

async function executeTool(tool, args) {
    const cwd = process.cwd();
    const a = (args || '').trim();
    const blocked = 'Ошибка: команда заблокирована из соображений безопасности';
    try {
        switch (tool) {
            case 'read_file':
                return fs.readFileSync(a, 'utf8');
            case 'list_dir':
                return fs.readdirSync(a || '.').join('\n');
            case 'run_command': {
                if (!isSafe(a)) return blocked;
                const confirm = await prompt(Y + `Eva: выполнить команду "${a}"? (да/нет): ` + R);
                if (!confirm.trim().toLowerCase().startsWith('д')) return 'Eva: команда отменена.';
                return execSync(a, { encoding: 'utf8', cwd, shell: true });
            }
            case 'git':
                if (!isSafe(a)) return blocked;
                return execSync(`git ${a}`, { encoding: 'utf8', cwd, shell: true });
            case 'artisan':
                if (!isSafe(a)) return blocked;
                return execSync(`php artisan ${a}`, { encoding: 'utf8', cwd, shell: true });
            case 'composer':
                if (!isSafe(a)) return blocked;
                return tryComposer(a, cwd);
            case 'check_syntax':
                if (!isSafe(a)) return blocked;
                return execSync(`php -l ${a}`, { encoding: 'utf8', cwd, shell: true });
            case 'test':
                return execSync(`composer run test${a ? ' -- --filter ' + a : ''}`, { encoding: 'utf8', cwd, shell: true });
            case 'lint':
                return execSync(`./vendor/bin/pint${a ? ' ' + a : ''}`, { encoding: 'utf8', cwd, shell: true });
            case 'npm_run':
                if (!isSafe(a)) return blocked;
                return execSync(`npm run ${a}`, { encoding: 'utf8', cwd, shell: true });
            default:
                return null;
        }
    } catch (err) {
        return `Ошибка: ${err.stderr || err.message}`;
    }
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

        const stopTool = startThinking('Eva: выбираю инструмент');
        const toolChoice = await selectTool(input, userId);
        stopTool();

        let finalInput = input;
        if (toolChoice.tool !== 'none') {
            console.log(Y + `Eva: использую ${toolChoice.tool}(${toolChoice.args || ''})` + R);
            const toolResult = await executeTool(toolChoice.tool, toolChoice.args);
            if (toolResult !== null) {
                finalInput = `${input}\n\n[Результат инструмента ${toolChoice.tool}(${toolChoice.args || ''})]\n${toolResult}`;
            }
        }

        const stop = startThinking('Eva: думаю');
        const reply = await askEva(finalInput, userId);
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