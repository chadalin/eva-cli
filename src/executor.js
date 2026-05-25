const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function executeCode(code, language = 'python') {
    const tmpDir = os.tmpdir();
    const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'sh';
    const tmpFile = path.join(tmpDir, `eva_exec_${Date.now()}.${ext}`);
    
    try {
        fs.writeFileSync(tmpFile, code);
        const cmd = language === 'python' ? `python3 ${tmpFile}` :
                    language === 'javascript' ? `node ${tmpFile}` :
                    `bash ${tmpFile}`;
        const output = execSync(cmd, { timeout: 10000, encoding: 'utf8' });
        return { success: true, output: output.trim() };
    } catch (err) {
        return { success: false, error: err.stderr || err.message };
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

module.exports = { executeCode };
