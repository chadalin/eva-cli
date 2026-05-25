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

const TOOLS_LIST = 'read_file, list_dir, write_file, edit_file, make_dir, delete_file, delete_dir, run_command, git, git_commit, artisan, composer, check_syntax, test, lint, npm_run, none';

async function selectTool(input, userId) {
    const toolPrompt = `Ответь ТОЛЬКО JSON без пояснений.
Запрос: "${input}"
Инструменты: list_dir(путь), read_file(путь), write_file(путь|||содержимое), edit_file(путь|||старое|||новое), make_dir(путь), delete_file(путь), delete_dir(путь), git(команда), git_commit(сообщение), artisan(команда), composer(команда), check_syntax(файл), test(фильтр), lint(путь), npm_run(скрипт), run_command(команда), none
Маппинг:
покажи папки/файлы/структуру → list_dir
прочитай/открой файл → read_file
создай/запиши/сохрани файл → write_file
отредактируй/измени файл → edit_file
создай папку → make_dir
удали файл → delete_file
удали папку → delete_dir
ветка/статус/git → git
закоммить/пушни/сохрани в гит → git_commit
артизан/artisan/миграция/роут → artisan
композер/composer/зависимости → composer
Пример: {"tool":"list_dir","args":"."}
JSON:`;
    const { reply: raw } = await askEva(toolPrompt, userId);
    console.log(Y + `[tool-select raw]: ${raw}` + R);
    try {
        const m = raw.match(/\{[\s\S]*?\}/);
        return m ? JSON.parse(m[0]) : { tool: 'none' };
    } catch {
        const toolMatch = raw.match(/"tool"\s*:\s*"([^"]+)"/);
        const argsMatch = raw.match(/"args"\s*:\s*"([\s\S]*?)(?<!\\)"/);
        if (toolMatch) return { tool: toolMatch[1], args: argsMatch ? argsMatch[1] : '' };
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
            case 'read_file': {
                const content = fs.readFileSync(a, 'utf8');
                if (content.length > 3000) {
                    return content.slice(0, 3000) + '\n\n... [файл обрезан, показаны первые 3000 символов]';
                }
                return content;
            }
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
            case 'write_file': {
                try {
                    const sepIdx = a.indexOf('|||');
                    const filePath = a.slice(0, sepIdx).trim();
                    const content = a.slice(sepIdx + 3).replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
                    fs.mkdirSync(require('path').dirname(filePath), { recursive: true });
                    fs.writeFileSync(filePath, content, 'utf8');
                    return `Файл ${filePath} создан (${content.length} символов)`;
                } catch (e) {
                    return `ОШИБКА: ${e.message}`;
                }
            }
            case 'make_dir':
                fs.mkdirSync(a, { recursive: true });
                return `Папка ${a} создана`;
            case 'edit_file': {
                const [ePath, oldText, newText] = a.split('|||');
                const content = fs.readFileSync(ePath.trim(), 'utf8');
                const updated = content.replace(oldText, newText);
                fs.writeFileSync(ePath.trim(), updated);
                return `Файл ${ePath.trim()} обновлён`;
            }
            case 'delete_file': {
                const confirmDel = await prompt(Y + `Eva: Удалить файл "${a}"? (да/нет): ` + R);
                if (confirmDel.trim().toLowerCase() !== 'да') return 'Отменено';
                fs.unlinkSync(a);
                return `Файл ${a} удалён`;
            }
            case 'delete_dir': {
                const confirmDir = await prompt(Y + `Eva: Удалить папку "${a}" со всем содержимым? (да/нет): ` + R);
                if (confirmDir.trim().toLowerCase() !== 'да') return 'Отменено';
                fs.rmSync(a, { recursive: true });
                return `Папка ${a} удалена`;
            }
            case 'git_commit':
                execSync('git add .', { shell: true, cwd });
                execSync(`git commit -m "${a}"`, { shell: true, cwd });
                execSync('git push', { shell: true, cwd });
                return 'Закоммичено и запушено';
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
    let sessionTokens = 0;
    const sessionStart = Date.now();

    while (true) {
        const input = await prompt('You: ');
        if (!input.trim()) continue;

        if (input === '/exit' || input === '/quit') {
            const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            const cost = (sessionTokens * 0.000001).toFixed(4);
            console.log(G + '\nEva: Сессия завершена' + R);
            console.log(G + `⏱ Время: ${mins} мин ${secs} сек` + R);
            console.log(G + `🪙 Токенов использовано: ${sessionTokens}` + R);
            console.log(G + `💰 Примерная стоимость: $${cost}\n` + R);
            rl.close(); process.exit(0);
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
            const { reply } = await askEva(fixPrompt, userId);
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
            const { reply: q } = await askEva(`Пользователь написал: "${input}". Задай ОДИН короткий уточняющий вопрос. Только вопрос.`, userId);
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
            console.log(Y + `[tool-result]: ${toolResult}` + R);
            if (toolResult !== null) {
                finalInput = `${input}\n\n[Результат инструмента ${toolChoice.tool}(${toolChoice.args || ''})]\n${toolResult}`;
            }
        }

        const requestStart = Date.now();
        const stop = startThinking('Eva: думаю');
        const { reply, tokens } = await askEva(finalInput, userId);
        stop();
        sessionTokens += tokens;
        const elapsed = ((Date.now() - requestStart) / 1000).toFixed(1);
        console.log(G + 'Eva: ' + R + reply + '\n');
        console.log(Y + `[⏱ ${elapsed}с | 🪙 ${tokens} токенов | сессия: ${sessionTokens} токенов]` + R + '\n');

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