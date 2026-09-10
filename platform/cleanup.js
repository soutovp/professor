const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const TENTATIVAS_DIR = path.resolve(__dirname, '..', 'professor', 'aluno', 'tentativas');
const DB_PATH = path.resolve(__dirname, '..', 'professor', 'database', 'platform.db');

// 1. Limpar arquivos em professor/aluno/tentativas/ mantendo intactos os arquivos reais
if (fs.existsSync(TENTATIVAS_DIR)) {
  const files = fs.readdirSync(TENTATIVAS_DIR);
  for (const file of files) {
    if (file !== 'tentativa-att-diag-js-01-aluno.json' && file !== 'tentativa-att-diag-js-01-aluno.md') {
      fs.unlinkSync(path.join(TENTATIVAS_DIR, file));
      console.log('Removed attempt file:', file);
    }
  }
}

// 2. Limpar banco SQLite professor/database/platform.db
if (fs.existsSync(DB_PATH)) {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  const delAnswers = db.prepare("DELETE FROM answers WHERE attempt_id != 'att-diag-js-01-aluno'").run();
  const delAttempts = db.prepare("DELETE FROM attempts WHERE id != 'att-diag-js-01-aluno'").run();
  console.log('Deleted from platform.db - attempts:', delAttempts, 'answers:', delAnswers);
  db.close();
}

console.log('Cleanup completed successfully.');
