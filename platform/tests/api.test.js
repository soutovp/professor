process.env.NODE_ENV = 'test';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { getDatabase, closeDatabase } = require('../database.js');
const { seedDatabase } = require('../seed.js');
const { createApp } = require('../server.js');

describe('Plataforma Educacional - Testes de Infraestrutura e APIs', () => {
  let server;
  let baseUrl;
  let testDb;

  before(async () => {
    // Usar banco em memória isolado para os testes
    testDb = getDatabase(':memory:');
    seedDatabase(testDb);

    const app = createApp(testDb);
    server = http.createServer(app);

    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    testDb.close();
    closeDatabase();
  });

  // 1. Validação de Schema do Banco
  test('1. Schema SQLite: Todas as 10 tabelas devem existir no banco', () => {
    const requiredTables = [
      'subjects',
      'modules',
      'lessons',
      'learning_objectives',
      'support_materials',
      'user_progress',
      'assessments',
      'questions',
      'attempts',
      'answers'
    ];

    const existingTables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(t => t.name);

    for (const table of requiredTables) {
      assert.ok(existingTables.includes(table), `Tabela obrigatória '${table}' deve existir no banco`);
    }
  });

  // 2. Validação do Seeder
  test('2. Seeder: Disciplina de JavaScript, 4 módulos e 5 aulas ricas cadastradas', () => {
    const subject = testDb.prepare("SELECT * FROM subjects WHERE id = 'javascript-avancado'").get();
    assert.ok(subject, 'Disciplina javascript-avancado deve existir');
    assert.strictEqual(subject.title, 'JavaScript Avançado e Arquitetura de Sistemas');

    const modules = testDb.prepare("SELECT * FROM modules WHERE subject_id = 'javascript-avancado' ORDER BY order_index").all();
    assert.strictEqual(modules.length, 4, 'Devem existir exatamente 4 módulos');

    const lessons = testDb.prepare("SELECT * FROM lessons WHERE module_id = 'js-mod-1' ORDER BY order_index").all();
    assert.strictEqual(lessons.length, 5, 'Módulo 1 deve conter 5 aulas teóricas ricas');

    for (const lesson of lessons) {
      assert.ok(lesson.content_markdown.length > 200, `Aula ${lesson.id} deve conter conteúdo rico em Markdown`);
      assert.ok(lesson.estimated_minutes > 0, `Aula ${lesson.id} deve ter tempo estimado`);
    }

    const assessment = testDb.prepare("SELECT * FROM assessments WHERE id = 'js-diag-01'").get();
    assert.ok(assessment, 'Avaliação diagnóstica js-diag-01 deve existir');

    const questions = testDb.prepare("SELECT * FROM questions WHERE assessment_id = 'js-diag-01'").all();
    assert.strictEqual(questions.length, 6, 'Avaliação diagnóstica deve ter 6 questões');
  });

  // 3. GET /api/dashboard
  test('3. API: GET /api/dashboard retorna sumário, matérias e atalho para continuar', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard?userId=aluno-padrao`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.user_id, 'aluno-padrao');
    assert.ok(Array.isArray(data.subjects), 'subjects deve ser um array');
    assert.ok(data.subjects.length > 0, 'deve haver pelo menos 1 matéria');
    assert.ok(data.continue_studying, 'continue_studying deve fornecer o atalho da aula atual');
    assert.strictEqual(data.continue_studying.lesson_id, 'js-mod-1-aula-1');
    assert.ok(data.overall_stats, 'overall_stats deve estar presente');
  });

  // 4. GET /api/subjects e GET /api/subjects/:id
  test('4. API: GET /api/subjects e GET /api/subjects/:id retornam ementa e progresso', async () => {
    const listRes = await fetch(`${baseUrl}/api/subjects`);
    assert.strictEqual(listRes.status, 200);
    const list = await listRes.json();
    assert.ok(list.length >= 1);
    assert.strictEqual(list[0].id, 'javascript-avancado');
    assert.strictEqual(typeof list[0].progress_percentage, 'number');

    const detailRes = await fetch(`${baseUrl}/api/subjects/javascript-avancado`);
    assert.strictEqual(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.strictEqual(detail.id, 'javascript-avancado');
    assert.strictEqual(detail.modules.length, 4);
    assert.ok(Array.isArray(detail.objectives), 'deve conter objetivos de aprendizagem');
    assert.ok(Array.isArray(detail.materials), 'deve conter materiais de apoio');
    assert.ok(Array.isArray(detail.assessments), 'deve conter avaliações vinculadas');
  });

  // 5. GET /api/lessons/:id e POST /api/lessons/:id/progress
  test('5. API: GET /api/lessons/:id retorna dados completos e POST /api/lessons/:id/progress atualiza status', async () => {
    const lessonRes = await fetch(`${baseUrl}/api/lessons/js-mod-1-aula-1`);
    assert.strictEqual(lessonRes.status, 200);
    const lesson = await lessonRes.json();

    assert.strictEqual(lesson.id, 'js-mod-1-aula-1');
    assert.ok(lesson.content_markdown.includes('Engine V8'), 'deve conter o markdown pedagógico');
    assert.ok(lesson.next_lesson, 'deve apontar para a próxima aula');
    assert.strictEqual(lesson.next_lesson.id, 'js-mod-1-aula-2');

    // Atualizar progresso para COMPLETED
    const progRes = await fetch(`${baseUrl}/api/lessons/js-mod-1-aula-1/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'aluno-padrao', status: 'COMPLETED' })
    });
    assert.strictEqual(progRes.status, 200);
    const progData = await progRes.json();
    assert.strictEqual(progData.progress.status, 'COMPLETED');
    assert.ok(progData.progress.completed_at, 'deve ter timestamp de conclusão');

    // Verificar se o GET da aula agora reflete COMPLETED
    const verifyRes = await fetch(`${baseUrl}/api/lessons/js-mod-1-aula-1?userId=aluno-padrao`);
    const verifyLesson = await verifyRes.json();
    assert.strictEqual(verifyLesson.status, 'COMPLETED');
  });

  // 6. SEGURANÇA CRÍTICA: GET /api/assessments/:id NUNCA expõe gabarito
  test('6. SEGURANÇA CRÍTICA: GET /api/assessments/:id NUNCA deve retornar correct_answer, rubric ou explanation', async () => {
    const res = await fetch(`${baseUrl}/api/assessments/js-diag-01`);
    assert.strictEqual(res.status, 200);
    const assessment = await res.json();

    assert.strictEqual(assessment.id, 'js-diag-01');
    assert.strictEqual(assessment.questions.length, 6);

    for (const q of assessment.questions) {
      assert.strictEqual(q.correct_answer, undefined, `Questão ${q.id} NÃO deve conter correct_answer`);
      assert.strictEqual(q.rubric, undefined, `Questão ${q.id} NÃO deve conter rubric`);
      assert.strictEqual(q.explanation, undefined, `Questão ${q.id} NÃO deve conter explanation`);
      assert.ok(q.prompt_markdown, `Questão ${q.id} deve conter prompt_markdown`);
      assert.ok(q.points > 0, `Questão ${q.id} deve indicar pontuação`);
    }
  });

  // 7. Submissão Append-Only & Correção
  test('7. APPEND-ONLY: POST /api/assessments/:id/attempt cria novas tentativas sem sobrescrever histórico', async () => {
    // Primeira tentativa
    const attempt1Res = await fetch(`${baseUrl}/api/assessments/js-diag-01/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'aluno-padrao',
        answers: {
          'q1-closures-hoisting': 'var possui escopo de função, let escopo de bloco',
          'q2-event-loop': 'B', // Resposta correta
          'q3-prototypes-this': 'Arrow functions herdam this léxico',
          'q4-immutability-memory': 'Shallow copy vs structuredClone',
          'q5-esm-commonjs-treeshaking': 'ESM estático vs CJS dinâmico',
          'q6-design-patterns-observer': 'Padrão Observer'
        }
      })
    });
    assert.strictEqual(attempt1Res.status, 201);
    const attempt1 = await attempt1Res.json();
    assert.ok(attempt1.attempt_id, 'deve retornar attempt_id');
    assert.ok(attempt1.score > 0, 'deve pontuar tentativa');
    assert.ok(Array.isArray(attempt1.answers), 'deve retornar respostas avaliadas com feedback pós-prova');

    // Segunda tentativa (submissão posterior pelo mesmo aluno)
    const attempt2Res = await fetch(`${baseUrl}/api/assessments/js-diag-01/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'aluno-padrao',
        answers: {
          'q1-closures-hoisting': 'Explicação revisada',
          'q2-event-loop': 'A', // Resposta errada de propósito
          'q3-prototypes-this': 'Explicação revisada',
          'q4-immutability-memory': 'Explicação revisada',
          'q5-esm-commonjs-treeshaking': 'Explicação revisada',
          'q6-design-patterns-observer': 'Explicação revisada'
        }
      })
    });
    assert.strictEqual(attempt2Res.status, 201);
    const attempt2 = await attempt2Res.json();
    assert.notStrictEqual(attempt1.attempt_id, attempt2.attempt_id, 'tentativas devem ter IDs únicos');

    // Validar APPEND-ONLY no banco de dados: AMBAS as tentativas devem existir
    const attemptsInDb = testDb
      .prepare("SELECT id, student_id, score FROM attempts WHERE assessment_id = 'js-diag-01' AND student_id = 'aluno-padrao'")
      .all();

    assert.strictEqual(attemptsInDb.length, 2, 'Histórico deve conter exatamente 2 registros (append-only)');
    assert.ok(attemptsInDb.some(a => a.id === attempt1.attempt_id), 'Primeira tentativa deve estar preservada intacta');
    assert.ok(attemptsInDb.some(a => a.id === attempt2.attempt_id), 'Segunda tentativa deve estar preservada intacta');
  });

  // 8. Histórico de Avaliações e Detalhes
  test('8. API: GET /api/attempts e GET /api/attempts/:id retornam histórico com feedback', async () => {
    const historyRes = await fetch(`${baseUrl}/api/attempts?studentId=aluno-padrao`);
    assert.strictEqual(historyRes.status, 200);
    const history = await historyRes.json();
    assert.ok(history.length >= 2, 'Histórico deve listar as tentativas realizadas');

    const firstAttemptId = history[0].id;
    const detailRes = await fetch(`${baseUrl}/api/attempts/${firstAttemptId}`);
    assert.strictEqual(detailRes.status, 200);
    const detail = await detailRes.json();

    assert.strictEqual(detail.id, firstAttemptId);
    assert.ok(detail.answers.length === 6, 'Detalhe deve conter as 6 respostas');
    assert.ok(detail.answers[0].feedback, 'Cada resposta deve conter feedback pedagógico');
  });

  // 9. Proibição de nota automática em questões abertas (DIAGNOSTIC e SUMMATIVE)
  test('9. AVALIAÇÃO: Proibição de nota automática em questões abertas (DIAGNOSTIC e SUMMATIVE registram status SUBMITTED e is_pending)', async () => {
    // Cadastrar avaliação somativa com 1 questão múltipla escolha e 1 questão discursiva
    testDb.prepare(`
      INSERT INTO assessments (id, subject_id, title, description, type, passing_score, max_score, time_limit_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('js-sum-01', 'javascript-avancado', 'Prova Somativa Oficial', 'Avaliação somativa com rubricas', 'SUMMATIVE', 70.0, 100.0, 60, 'ACTIVE');

    testDb.prepare(`
      INSERT INTO questions (id, assessment_id, type, prompt_markdown, options_json, correct_answer, rubric, explanation, points, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('q-sum-1', 'js-sum-01', 'MULTIPLE_CHOICE', 'Qual o retorno de typeof NaN?', JSON.stringify([{id:'A', text:'number'}, {id:'B', text:'NaN'}]), 'A', null, 'NaN é um valor numérico', 50.0, 1);

    testDb.prepare(`
      INSERT INTO questions (id, assessment_id, type, prompt_markdown, options_json, correct_answer, rubric, explanation, points, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('q-sum-2', 'js-sum-01', 'OPEN_QUESTION', 'Descreva o funcionamento do Garbage Collector V8', null, null, 'Rubrica: Clareza sobre Mark-and-Sweep', 'Gabarito oficial', 50.0, 2);

    // Submeter tentativa da prova somativa
    const summativeRes = await fetch(`${baseUrl}/api/assessments/js-sum-01/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'aluno-padrao',
        answers: {
          'q-sum-1': 'A', // Correto -> 50 pts
          'q-sum-2': 'O V8 utiliza o algoritmo Mark-and-Sweep...' // Aberta -> deve ser 0 pts aguardando correção
        }
      })
    });

    assert.strictEqual(summativeRes.status, 201);
    const sumAttempt = await summativeRes.json();

    // Validar status SUBMITTED e pontuação
    assert.strictEqual(sumAttempt.status, 'SUBMITTED', 'Prova somativa com questões abertas deve registrar status SUBMITTED');
    assert.strictEqual(sumAttempt.score, 50, 'Apenas questões objetivas devem ser pontuadas imediatamente');

    const openAns = sumAttempt.answers.find(a => a.question_id === 'q-sum-2');
    assert.ok(openAns, 'Resposta da questão aberta deve estar presente');
    assert.strictEqual(openAns.score, 0, 'Questão aberta em prova somativa deve registrar earnedScore = 0');
    assert.strictEqual(openAns.is_pending, true, 'Questão aberta deve ter is_pending = true');
    assert.strictEqual(openAns.feedback, 'Sua resposta foi registrada com sucesso e está em espera para avaliação pelo agente pedagógico baseada na rubrica acadêmica.', 'Feedback deve informar espera de avaliação pelo agente');

    // Validar registro gravado no SQLite
    const dbAttempt = testDb.prepare('SELECT status, score FROM attempts WHERE id = ?').get(sumAttempt.attempt_id);
    assert.strictEqual(dbAttempt.status, 'SUBMITTED', 'Status no banco deve ser SUBMITTED');
    assert.strictEqual(dbAttempt.score, 50);

    const dbAnswer = testDb.prepare('SELECT is_pending, score FROM answers WHERE attempt_id = ? AND question_id = ?').get(sumAttempt.attempt_id, 'q-sum-2');
    assert.strictEqual(dbAnswer.is_pending, 1, 'is_pending no banco deve ser 1');
    assert.strictEqual(dbAnswer.score, 0);

    // Prova Diagnóstica: NUNCA pontua preliminarmente questões abertas, registra status SUBMITTED e is_pending = true
    const diagRes = await fetch(`${baseUrl}/api/assessments/js-diag-01/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'aluno-padrao',
        answers: {
          'q1-closures-hoisting': 'var possui escopo de função...',
          'q2-event-loop': 'B'
        }
      })
    });

    assert.strictEqual(diagRes.status, 201);
    const diagAttempt = await diagRes.json();
    assert.strictEqual(diagAttempt.status, 'SUBMITTED', 'Prova diagnóstica com questões abertas deve registrar status SUBMITTED');
    assert.strictEqual(diagAttempt.score, 15, 'Apenas a questão objetiva q2 deve pontuar (15 pts)');

    const diagOpenAns = diagAttempt.answers.find(a => a.question_id === 'q1-closures-hoisting');
    assert.ok(diagOpenAns, 'Resposta diagnóstica aberta deve estar presente');
    assert.strictEqual(diagOpenAns.score, 0, 'Questão aberta diagnóstica NUNCA concede pontuação automática');
    assert.strictEqual(diagOpenAns.is_pending, true, 'Questão aberta diagnóstica deve ser is_pending = true');
    assert.strictEqual(diagOpenAns.feedback, 'Sua resposta foi registrada com sucesso e está em espera para avaliação pelo agente pedagógico baseada na rubrica acadêmica.');

    const diagMcAns = diagAttempt.answers.find(a => a.question_id === 'q2-event-loop');
    assert.strictEqual(diagMcAns.score, 15, 'Questão objetiva correta deve pontuar');
    assert.strictEqual(diagMcAns.is_pending, false, 'Questão objetiva não deve ser pendente');

    // Validar no SQLite para prova diagnóstica
    const dbDiagAttempt = testDb.prepare('SELECT status, score FROM attempts WHERE id = ?').get(diagAttempt.attempt_id);
    assert.strictEqual(dbDiagAttempt.status, 'SUBMITTED', 'Status da tentativa diagnóstica no banco deve ser SUBMITTED');
    assert.strictEqual(dbDiagAttempt.score, 15);

    // Validar também outros tipos discursivos/código: CODE_ANALYSIS, CODE_ESSAY, SHORT_ANSWER
    testDb.prepare(`
      INSERT INTO assessments (id, subject_id, title, description, type, passing_score, max_score, time_limit_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('js-code-01', 'javascript-avancado', 'Prova Prática de Código', 'Avaliação de código', 'FORMATIVE', 70.0, 100.0, 60, 'ACTIVE');

    testDb.prepare(`
      INSERT INTO questions (id, assessment_id, type, prompt_markdown, options_json, correct_answer, rubric, explanation, points, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('q-code-1', 'js-code-01', 'CODE_ANALYSIS', 'Analise o vazamento de memória...', null, null, 'Rubrica código', 'Explicação', 30.0, 1);

    testDb.prepare(`
      INSERT INTO questions (id, assessment_id, type, prompt_markdown, options_json, correct_answer, rubric, explanation, points, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('q-code-2', 'js-code-01', 'CODE_ESSAY', 'Implemente um EventEmitter...', null, null, 'Rubrica código', 'Explicação', 40.0, 2);

    testDb.prepare(`
      INSERT INTO questions (id, assessment_id, type, prompt_markdown, options_json, correct_answer, rubric, explanation, points, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('q-code-3', 'js-code-01', 'SHORT_ANSWER', 'Qual a complexidade de tempo...?', null, null, 'Rubrica resposta curta', 'Explicação', 30.0, 3);

    const codeRes = await fetch(`${baseUrl}/api/assessments/js-code-01/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'aluno-padrao',
        answers: {
          'q-code-1': 'O timer não foi limpo',
          'q-code-2': 'class EventEmitter { ... }',
          'q-code-3': 'O(1)'
        }
      })
    });

    assert.strictEqual(codeRes.status, 201);
    const codeAttempt = await codeRes.json();
    assert.strictEqual(codeAttempt.status, 'SUBMITTED', 'Tentativa com CODE_ANALYSIS, CODE_ESSAY e SHORT_ANSWER deve ser SUBMITTED');
    assert.strictEqual(codeAttempt.score, 0, 'Pontuação inicial de questões discursivas/código deve ser 0');
    assert.strictEqual(codeAttempt.answers.every(a => a.is_pending === true), true, 'Todas as respostas devem ter is_pending = true');
    assert.strictEqual(codeAttempt.answers.every(a => a.score === 0), true, 'Todas as respostas devem ter score = 0');
    assert.strictEqual(codeAttempt.answers.every(a => a.status === 'PENDING_EVALUATION'), true, 'Todas as respostas devem ter status PENDING_EVALUATION');
  });

  // 10. SEGURANÇA / XSS: Sanitização de respostas de alunos com escapeHtml
  test('10. SEGURANÇA / XSS: escapeHtml neutraliza scripts maliciosos e é utilizado na renderização', async () => {
    const { escapeHtml } = await import('../public/js/markdown.js');

    const maliciousInput = '<script>alert("xss")</script><img src="x" onerror="evil()">&\'';
    const escaped = escapeHtml(maliciousInput);

    assert.ok(!escaped.includes('<script>'), 'Não deve conter tag script sem escape');
    assert.ok(!escaped.includes('<img'), 'Não deve conter tag img sem escape');
    assert.ok(escaped.includes('&lt;script&gt;'), 'Deve converter <script> para &lt;script&gt;');
    assert.ok(escaped.includes('&quot;'), 'Deve converter aspas duplas');
    assert.ok(escaped.includes('&#039;'), 'Deve converter aspas simples');
    assert.ok(escaped.includes('&amp;'), 'Deve converter & para &amp;');

    // Testar casos de borda
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(''), '');

    // Validar que app.js importa e utiliza escapeHtml nos pontos de renderização
    const fs = require('node:fs');
    const path = require('node:path');
    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf-8');

    assert.ok(appJsContent.includes('escapeHtml'), 'app.js deve importar escapeHtml de markdown.js');
    assert.ok(
      appJsContent.includes('escapeHtml(ans.student_answer)'),
      'app.js deve sanitizar ans.student_answer com escapeHtml antes de injetar no DOM'
    );
  });

  // 11. META 1: Syntax Highlighting JavaScript e Display de Código
  test('11. SYNTAX HIGHLIGHTING: highlightJavaScript gera tokens semânticos e cabeçalho customizado', async () => {
    const { highlightJavaScript, renderMarkdown } = await import('../public/js/markdown.js');

    const sampleCode = `// Comentário de teste
function calcularTaxa(valor) {
  const taxa = 0.15;
  return valor * taxa;
}`;

    const highlighted = highlightJavaScript(sampleCode);

    // Valida comentário
    assert.ok(highlighted.includes('class="token-comment"'), 'Deve conter token-comment');
    assert.ok(highlighted.includes('// Comentário de teste'), 'Deve conter o texto do comentário');

    // Valida palavras-chave
    assert.ok(highlighted.includes('<span class="token-keyword">function</span>'), 'Deve colorir function como keyword');
    assert.ok(highlighted.includes('<span class="token-keyword">const</span>'), 'Deve colorir const como keyword');
    assert.ok(highlighted.includes('<span class="token-keyword">return</span>'), 'Deve colorir return como keyword');

    // Valida identificador de função
    assert.ok(highlighted.includes('<span class="token-function">calcularTaxa</span>'), 'Deve colorir calcularTaxa como function');

    // Valida número
    assert.ok(highlighted.includes('<span class="token-number">0.15</span>'), 'Deve colorir 0.15 como number');

    // Valida operadores
    assert.ok(highlighted.includes('<span class="token-operator">*</span>'), 'Deve colorir operador de multiplicação');

    // Valida sanitização contra XSS dentro de código
    const xssCode = 'const payload = "<script>alert(1)</script>";';
    const xssHighlighted = highlightJavaScript(xssCode);
    assert.ok(!xssHighlighted.includes('<script>'), 'Código não deve conter tag script sem escape');
    assert.ok(xssHighlighted.includes('&lt;script&gt;'), 'Deve escapar tags HTML para entidades seguras');

    // Valida cabeçalho no renderMarkdown: tag em caixa alta JAVASCRIPT e botão Copiar
    const markdownWithCode = "```javascript\nconst a = 1;\n```";
    const renderedMd = renderMarkdown(markdownWithCode);

    assert.ok(renderedMd.includes('class="code-block-container"'), 'Deve gerar container estilizado de código');
    assert.ok(renderedMd.includes('class="code-lang-tag">JAVASCRIPT</span>'), 'Cabeçalho deve exibir linguagem em caixa alta JAVASCRIPT');
    assert.ok(renderedMd.includes('class="copy-button"'), 'Deve conter botão estilizado Copiar');
    assert.ok(renderedMd.includes('data-code="const a = 1;"'), 'Botão deve conter o código bruto no data-code');
  });

  // 12. META 4: Revisão Espaçada (SRS - Algoritmo SM-2)
  test('12. SRS (SM-2): GET /api/srs/due e POST /api/srs/review calculam repetição e intervalos', async () => {
    // Buscar flashcards devidos
    const dueRes = await fetch(`${baseUrl}/api/srs/due?userId=aluno-padrao`);
    assert.strictEqual(dueRes.status, 200);
    const dueData = await dueRes.json();

    assert.ok(Array.isArray(dueData.cards), 'cards deve ser uma lista');
    assert.ok(dueData.cards.length >= 6, 'Devem existir pelo menos 6 flashcards essenciais no seed');

    const firstCard = dueData.cards[0];
    assert.ok(firstCard.id, 'Card deve ter id');
    assert.ok(firstCard.prompt_front, 'Card deve ter prompt_front');
    assert.ok(firstCard.answer_back, 'Card deve ter answer_back');
    assert.strictEqual(firstCard.repetition, 0, 'Repetição inicial deve ser 0');

    // Testar resposta com rating 0 (Errei): deve resetar repetição para 0 e intervalo para 1
    const reviewFailRes = await fetch(`${baseUrl}/api/srs/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: firstCard.id,
        rating: 0,
        userId: 'aluno-padrao'
      })
    });
    assert.strictEqual(reviewFailRes.status, 200);
    const reviewFailData = await reviewFailRes.json();
    assert.strictEqual(reviewFailData.card.repetition, 0, 'Repetição deve ser 0 após erro');
    assert.strictEqual(reviewFailData.card.interval_days, 1, 'Intervalo deve ser 1 dia após erro');
    assert.strictEqual(reviewFailData.card.status, 'REVIEW_REQUIRED', 'Status deve ser REVIEW_REQUIRED');

    // Testar resposta sucessiva com rating 3 (Fácil): repetição 0 -> 1, intervalo = 1, EF aumentado
    const reviewPass1 = await fetch(`${baseUrl}/api/srs/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: firstCard.id,
        rating: 3,
        userId: 'aluno-padrao'
      })
    });
    const pass1Data = await reviewPass1.json();
    assert.strictEqual(pass1Data.card.repetition, 1, 'Repetição deve avançar para 1');
    assert.strictEqual(pass1Data.card.interval_days, 1, 'Primeiro intervalo deve ser 1');
    assert.strictEqual(pass1Data.card.status, 'PRACTICING');

    // Testar segunda resposta com rating 2 (Bom): repetição 1 -> 2, intervalo = 3
    const reviewPass2 = await fetch(`${baseUrl}/api/srs/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: firstCard.id,
        rating: 2,
        userId: 'aluno-padrao'
      })
    });
    const pass2Data = await reviewPass2.json();
    assert.strictEqual(pass2Data.card.repetition, 2, 'Repetição deve avançar para 2');
    assert.strictEqual(pass2Data.card.interval_days, 3, 'Segundo intervalo deve ser 3 dias');

    // Validar atualização de topic_mastery no SQLite
    const mastery = testDb.prepare(`
      SELECT * FROM topic_mastery WHERE user_id = 'aluno-padrao' AND topic_id = ?
    `).get(firstCard.topic_id);
    assert.ok(mastery, 'Deve registrar domínio em topic_mastery');
    assert.strictEqual(mastery.status, 'PRACTICING');
  });

  // 13. META 3: Avaliação por Rubrica (Fila de Correção e Transição de Status)
  test('13. RUBRICA: GET /api/assessments/pending-grading e POST /api/assessments/attempts/:id/grade', async () => {
    // Buscar a tentativa somativa pendente cadastrada no teste 9
    const pendingRes = await fetch(`${baseUrl}/api/assessments/pending-grading`);
    assert.strictEqual(pendingRes.status, 200);
    const pendingList = await pendingRes.json();

    const sumAttempt = pendingList.find(a => a.assessment_id === 'js-sum-01');
    assert.ok(sumAttempt, 'Tentativa da prova somativa deve constar na fila de pendentes de correção');
    assert.strictEqual(sumAttempt.status, 'SUBMITTED');

    // Submeter avaliação por rubrica pelo professor/avaliador
    const gradeRes = await fetch(`${baseUrl}/api/assessments/attempts/${sumAttempt.id}/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grades: [
          {
            question_id: 'q-sum-2',
            score: 45.0, // Nota atribuída com base na rubrica (máx 50)
            feedback: 'Excelente domínio sobre as fases Mark e Sweep do Garbage Collector V8.'
          }
        ]
      })
    });

    assert.strictEqual(gradeRes.status, 200);
    const gradeData = await gradeRes.json();

    assert.strictEqual(gradeData.status, 'GRADED', 'Status deve transicionar para GRADED');
    assert.strictEqual(gradeData.score, 95.0, 'Pontuação total deve somar as questões (50 + 45 = 95)');
    assert.strictEqual(gradeData.final_grade, 9.5, 'Nota final em escala 0.0 - 10.0 deve ser 9.5');

    // Validar atualização no banco de dados SQLite
    const dbAttempt = testDb.prepare('SELECT status, score FROM attempts WHERE id = ?').get(sumAttempt.id);
    assert.strictEqual(dbAttempt.status, 'GRADED', 'No banco de dados, o status deve ser GRADED');
    assert.strictEqual(dbAttempt.score, 95.0);

    const dbAnswer = testDb.prepare('SELECT score, feedback FROM answers WHERE attempt_id = ? AND question_id = ?').get(sumAttempt.id, 'q-sum-2');
    assert.strictEqual(dbAnswer.score, 45.0);
    assert.ok(dbAnswer.feedback.includes('Mark e Sweep'));

    // Validar que não consta mais na fila de pendentes
    const updatedPending = await fetch(`${baseUrl}/api/assessments/pending-grading`);
    const updatedList = await updatedPending.json();
    assert.strictEqual(updatedList.some(a => a.id === sumAttempt.id), false, 'Tentativa corrigida não deve mais estar na fila de pendentes');
  });

  // 14. META 5: Módulo de Certificados (Validação de Elegibilidade e Emissão)
  test('14. CERTIFICADOS: Bloqueio de inelegibilidade, validação de critérios e emissão solene', async () => {
    // 1. Aluno padrão tem apenas a aula 1 concluída até agora, logo NÃO deve estar elegível (faltam aulas 2, 3, 4, 5)
    const eligRes1 = await fetch(`${baseUrl}/api/certificates/eligibility?subjectId=javascript-avancado&userId=aluno-padrao`);
    assert.strictEqual(eligRes1.status, 200);
    const elig1 = await eligRes1.json();

    assert.strictEqual(elig1.eligible, false, 'Aluno com aulas incompletas NÃO deve ser elegível');
    assert.ok(elig1.reasons.length > 0, 'Deve retornar motivos da inelegibilidade');
    assert.ok(elig1.lessons_progress.percentage < 100, 'Progresso das aulas deve ser inferior a 100%');

    // Tentativa de gerar certificado deve ser rejeitada com HTTP 400
    const failGenRes = await fetch(`${baseUrl}/api/certificates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: 'javascript-avancado',
        student_name: 'Dev Aluno',
        userId: 'aluno-padrao'
      })
    });
    assert.strictEqual(failGenRes.status, 400, 'Geração de certificado deve ser bloqueada quando inelegível');

    // 2. Concluir 100% das aulas da disciplina para o aluno
    const remainingLessons = ['js-mod-1-aula-2', 'js-mod-1-aula-3', 'js-mod-1-aula-4', 'js-mod-1-aula-5'];
    for (const lId of remainingLessons) {
      await fetch(`${baseUrl}/api/lessons/${lId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'aluno-padrao', status: 'COMPLETED' })
      });
    }

    // 3. Verificar elegibilidade novamente (agora 100% das aulas e prova somativa com nota 9.5 >= 6.0)
    const eligRes2 = await fetch(`${baseUrl}/api/certificates/eligibility?subjectId=javascript-avancado&userId=aluno-padrao`);
    assert.strictEqual(eligRes2.status, 200);
    const elig2 = await eligRes2.json();

    assert.strictEqual(elig2.eligible, true, 'Aluno com 100% das aulas e média somativa >= 6.0 DEVE ser elegível');
    assert.strictEqual(elig2.lessons_progress.percentage, 100);
    assert.ok(elig2.exam_average >= 6.0, 'Média das provas somativas deve ser >= 6.0');

    // 4. Emitir o Certificado Oficial
    const genRes = await fetch(`${baseUrl}/api/certificates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: 'javascript-avancado',
        student_name: 'Fernando Engenheiro Dev',
        userId: 'aluno-padrao'
      })
    });
    assert.strictEqual(genRes.status, 201, 'Deve emitir certificado com status 201');
    const certData = await genRes.json();

    assert.ok(certData.certificate.id, 'Certificado deve possuir ID único');
    assert.ok(certData.certificate.verification_code.startsWith('CERT-JS-'), 'Código de verificação deve seguir padrão');
    assert.strictEqual(certData.certificate.student_name, 'Fernando Engenheiro Dev');
    assert.strictEqual(certData.certificate.final_grade, 9.5);
    assert.ok(certData.certificate.hours_estimate > 0, 'Carga horária estimada deve ser positiva');

    // 5. Consultar certificado por ID ou código de autenticidade
    const getCertRes = await fetch(`${baseUrl}/api/certificates/${certData.certificate.id}`);
    assert.strictEqual(getCertRes.status, 200);
    const fetchedCert = await getCertRes.json();
    assert.strictEqual(fetchedCert.verification_code, certData.certificate.verification_code);

    // 6. Validar que segunda requisição retorna o mesmo certificado sem duplicações
    const repeatGenRes = await fetch(`${baseUrl}/api/certificates/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: 'javascript-avancado',
        student_name: 'Fernando Engenheiro Dev',
        userId: 'aluno-padrao'
      })
    });
    assert.strictEqual(repeatGenRes.status, 200);
    const repeatData = await repeatGenRes.json();
    assert.strictEqual(repeatData.certificate.id, certData.certificate.id);
  });

  // 15. META 2: Editor Interativo de Código e Navegação
  test('15. CODE EDITOR & UI: code-editor.js exportado e index.html contém novos links de navegação', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    // Verificar code-editor.js
    const editorJsPath = path.resolve(__dirname, '../public/js/code-editor.js');
    assert.ok(fs.existsSync(editorJsPath), 'code-editor.js deve existir no diretório public/js');
    const editorContent = fs.readFileSync(editorJsPath, 'utf-8');

    assert.ok(editorContent.includes('class CodeEditor'), 'Deve exportar classe CodeEditor');
    assert.ok(editorContent.includes('updateGutter'), 'Deve possuir controle de gutter e linhas');
    assert.ok(editorContent.includes('Escape'), 'Deve possuir suporte a tecla Escape para acessibilidade');
    assert.ok(editorContent.includes('Tab'), 'Deve possuir suporte a tecla Tab e Shift+Tab');
    assert.ok(editorContent.includes('console'), 'Deve possuir sandbox com interceptação de console');

    // Verificar index.html com links no header
    const indexHtmlPath = path.resolve(__dirname, '../public/index.html');
    const indexContent = fs.readFileSync(indexHtmlPath, 'utf-8');

    assert.ok(indexContent.includes('#/playground'), 'index.html deve conter link para #/playground');
    assert.ok(indexContent.includes('#/srs'), 'index.html deve conter link para #/srs');
    assert.ok(indexContent.includes('#/certificates'), 'index.html deve conter link para #/certificates');
    assert.ok(indexContent.includes('#/grading'), 'index.html deve conter link para #/grading');
  });

  // 16. RESPONSIVIDADE & UX/UI: Menu Hamburger Responsivo e Mobile Navigation Drawer
  test('16. MOBILE NAV & RESPONSIVIDADE: index.html, styles.css e app.js contêm componentes e lógica do menu hamburger', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    // 1. Validar index.html
    const indexHtmlPath = path.resolve(__dirname, '../public/index.html');
    const indexContent = fs.readFileSync(indexHtmlPath, 'utf-8');

    // Botão Hamburger
    assert.ok(indexContent.includes('id="hamburgerBtn"'), 'index.html deve conter botão com id="hamburgerBtn"');
    assert.ok(indexContent.includes('class="hamburger-btn"'), 'index.html deve conter classe hamburger-btn');
    assert.ok(indexContent.includes('aria-controls="mobileNav"'), 'index.html deve conter aria-controls="mobileNav"');
    assert.ok(indexContent.includes('hamburger-line'), 'index.html deve conter spans hamburger-line');

    // Backdrop e Drawer
    assert.ok(indexContent.includes('id="navBackdrop"'), 'index.html deve conter backdrop com id="navBackdrop"');
    assert.ok(indexContent.includes('class="nav-backdrop"'), 'index.html deve conter classe nav-backdrop');
    assert.ok(indexContent.includes('id="mobileNav"'), 'index.html deve conter drawer com id="mobileNav"');
    assert.ok(indexContent.includes('class="mobile-nav"'), 'index.html deve conter classe mobile-nav');

    // 7 links móveis
    const expectedRoutes = ['dashboard', 'subjects', 'playground', 'srs', 'certificates', 'history', 'grading'];
    for (const route of expectedRoutes) {
      assert.ok(
        indexContent.includes(`class="mobile-nav-link" data-route="${route}"`),
        `Drawer mobile deve conter link com data-route="${route}"`
      );
    }

    // Separador e Seletor de Tema Mobile
    assert.ok(indexContent.includes('mobile-nav-divider'), 'Drawer mobile deve conter separador visual mobile-nav-divider');
    assert.ok(indexContent.includes('id="mobileThemeSelect"'), 'Drawer mobile deve conter select com id="mobileThemeSelect"');

    // 2. Validar styles.css
    const stylesCssPath = path.resolve(__dirname, '../public/css/styles.css');
    const stylesContent = fs.readFileSync(stylesCssPath, 'utf-8');

    assert.ok(stylesContent.includes('.hamburger-btn'), 'styles.css deve definir .hamburger-btn');
    assert.ok(stylesContent.includes('min-width: 44px') || stylesContent.includes('width: 44px'), 'hamburger-btn deve possuir dimensões mínimas de 44x44px');
    assert.ok(stylesContent.includes('.hamburger-line'), 'styles.css deve definir .hamburger-line');
    assert.ok(stylesContent.includes('.hamburger-btn.is-active'), 'styles.css deve definir estado ativo com animação do X');
    assert.ok(stylesContent.includes('.nav-backdrop'), 'styles.css deve definir .nav-backdrop');
    assert.ok(stylesContent.includes('.mobile-nav'), 'styles.css deve definir .mobile-nav');
    assert.ok(stylesContent.includes('max-height: 90vh'), 'mobile-nav deve possuir expansão vertical de até 90vh');
    assert.ok(stylesContent.includes('.mobile-nav-link'), 'styles.css deve definir .mobile-nav-link');
    assert.ok(stylesContent.includes('min-height: 48px'), 'mobile-nav-link deve garantir touch target mínimo de 48px');
    assert.ok(stylesContent.includes('@media (max-width: 1024px)'), 'styles.css deve conter breakpoint max-width: 1024px');
    assert.ok(stylesContent.includes('body.menu-open'), 'styles.css deve definir bloqueio de scroll de fundo com body.menu-open');

    // 3. Validar app.js
    const appJsPath = path.resolve(__dirname, '../public/js/app.js');
    const appContent = fs.readFileSync(appJsPath, 'utf-8');

    assert.ok(appContent.includes('initMobileNav'), 'app.js deve implementar initMobileNav');
    assert.ok(appContent.includes('hamburgerBtn'), 'app.js deve manipular hamburgerBtn');
    assert.ok(appContent.includes('is-active'), 'app.js deve alternar classe is-active');
    assert.ok(appContent.includes('is-open'), 'app.js deve alternar classe is-open');
    assert.ok(appContent.includes('menu-open'), 'app.js deve alternar classe menu-open no body');
    assert.ok(appContent.includes('aria-expanded'), 'app.js deve atualizar acessibilidade aria-expanded');
    assert.ok(appContent.includes('Escape'), 'app.js deve fechar o menu com tecla Escape');
    assert.ok(appContent.includes('mobileThemeSelect'), 'app.js deve sincronizar tema móvel');

    // 4. Validar theme.js
    const themeJsPath = path.resolve(__dirname, '../public/js/theme.js');
    const themeContent = fs.readFileSync(themeJsPath, 'utf-8');
    assert.ok(themeContent.includes('mobileThemeSelect'), 'theme.js deve sincronizar mobileThemeSelect');
  });

  // 17. BATERIA DE FIXAÇÃO: GET /api/lessons/:id/exercises e Sanitização Pedagógica
  test('17. BATERIA DE FIXAÇÃO: Todas as 5 aulas possuem exatamente 3 exercícios na ordem pedagógica estrita', async () => {
    const lessonIds = ['lesson-js-01', 'lesson-js-02', 'lesson-js-03', 'lesson-js-04', 'lesson-js-05'];

    for (const lessonId of lessonIds) {
      const res = await fetch(`${baseUrl}/api/lessons/${lessonId}/exercises?userId=aluno-padrao`);
      assert.strictEqual(res.status, 200);
      const exercises = await res.json();

      assert.ok(Array.isArray(exercises), `Aula ${lessonId} deve retornar array de exercícios`);
      assert.strictEqual(exercises.length, 3, `Aula ${lessonId} deve conter exatamente 3 exercícios progressivos`);

      // 1. Ordem Pedagógica Estrita: Conceito (1), Análise (2), Prática (3)
      assert.strictEqual(exercises[0].order_index, 1, `Aula ${lessonId} Ex 1 deve ter order_index 1`);
      assert.strictEqual(exercises[0].type, 'MULTIPLE_CHOICE', `Aula ${lessonId} Ex 1 deve ser de Conceito (MULTIPLE_CHOICE)`);

      assert.strictEqual(exercises[1].order_index, 2, `Aula ${lessonId} Ex 2 deve ter order_index 2`);
      assert.strictEqual(exercises[1].type, 'OUTPUT_PREDICTION', `Aula ${lessonId} Ex 2 deve ser de Análise (OUTPUT_PREDICTION)`);

      assert.strictEqual(exercises[2].order_index, 3, `Aula ${lessonId} Ex 3 deve ter order_index 3`);
      assert.strictEqual(exercises[2].type, 'CODE_CHALLENGE', `Aula ${lessonId} Ex 3 deve ser de Prática Rápida (CODE_CHALLENGE)`);
      assert.ok(exercises[2].initial_code, `Aula ${lessonId} Ex 3 deve fornecer initial_code`);

      // 2. SEGURANÇA PEDAGÓGICA CRÍTICA: correct_answer NUNCA é exposto antes de o aluno acertar
      for (const ex of exercises) {
        assert.strictEqual(ex.correct_answer, undefined, `Exercício ${ex.id} NÃO deve expor correct_answer antes do acerto`);
        assert.ok(ex.prompt_markdown, `Exercício ${ex.id} deve conter prompt_markdown`);
        if (ex.type === 'MULTIPLE_CHOICE' || ex.type === 'OUTPUT_PREDICTION') {
          assert.ok(Array.isArray(ex.options), `Exercício ${ex.id} deve conter options`);
          assert.strictEqual(ex.options.length, 4, `Exercício ${ex.id} deve ter 4 opções`);
        }
      }
    }

    // Validar busca com o ID alternativo js-mod-1-aula-1
    const resAlt = await fetch(`${baseUrl}/api/lessons/js-mod-1-aula-1/exercises?userId=aluno-padrao`);
    assert.strictEqual(resAlt.status, 200);
    const exercisesAlt = await resAlt.json();
    assert.strictEqual(exercisesAlt.length, 3, 'deve resolver exercícios pelo alias js-mod-1-aula-1');
  });

  // 18. SUBMISSÃO COM FEEDBACK INSTANTÂNEO, SANDBOX CODE_CHALLENGE & APPEND-ONLY
  test('18. SUBMISSÃO DE EXERCÍCIO: Validação funcional em sandbox, rejeição de trapaças com comentários e append-only', async () => {
    // 1. Submissão incorreta em questão objetiva (ex-v8-01)
    const failRes = await fetch(`${baseUrl}/api/exercises/ex-v8-01/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'A' // Incorreto (o correto é 'C')
      })
    });
    assert.strictEqual(failRes.status, 200);
    const failData = await failRes.json();
    assert.strictEqual(failData.isCorrect, false, 'Opção A deve ser considerada incorreta');
    assert.ok(failData.explanation.length > 0, 'Deve retornar explicação pedagógica para aprendizado');
    assert.strictEqual(failData.completedCount, 0, 'completedCount deve permanecer 0 após erro');
    assert.strictEqual(failData.totalCount, 3);
    assert.strictEqual(failData.allCompleted, false);

    // 2. Submissão correta em ex-v8-01 (Opção C)
    const successRes = await fetch(`${baseUrl}/api/exercises/ex-v8-01/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'C' // Correto
      })
    });
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    assert.strictEqual(successData.isCorrect, true, 'Opção C deve ser considerada correta');
    assert.strictEqual(successData.completedCount, 1, 'completedCount deve avançar para 1');
    assert.strictEqual(successData.allCompleted, false, 'allCompleted ainda é false pois ex-v8-02 e ex-v8-03 estão pendentes');

    // 3. Validar que agora GET /api/lessons/lesson-js-01/exercises expõe correct_answer para ex-v8-01 e last_submission
    const updatedExercisesRes = await fetch(`${baseUrl}/api/lessons/lesson-js-01/exercises?userId=aluno-padrao`);
    const updatedExercises = await updatedExercisesRes.json();
    const updatedEx1 = updatedExercises.find(e => e.id === 'ex-v8-01');
    assert.strictEqual(updatedEx1.correct_answer, 'C', 'Após acertar, correct_answer deve ser exposto para conferência');
    assert.ok(updatedEx1.last_submission, 'Deve conter last_submission');
    assert.strictEqual(updatedEx1.last_submission.is_correct, true);
    assert.strictEqual(updatedEx1.last_submission.student_answer, 'C');

    const updatedEx2 = updatedExercises.find(e => e.id === 'ex-v8-02');
    assert.strictEqual(updatedEx2.correct_answer, undefined, 'ex-v8-02 ainda pendente NÃO deve expor correct_answer');

    // 4. Submeter ex-v8-02 com resposta correta ('C')
    const completeRes2 = await fetch(`${baseUrl}/api/exercises/ex-v8-02/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'C' // Correto (Stack Overflow)
      })
    });
    assert.strictEqual(completeRes2.status, 200);
    const completeData2 = await completeRes2.json();
    assert.strictEqual(completeData2.isCorrect, true);
    assert.strictEqual(completeData2.completedCount, 2);
    assert.strictEqual(completeData2.allCompleted, false, 'allCompleted ainda é false pois ex-v8-03 está pendente');

    // 5. Submeter ex-v8-03 com código válido para completar a bateria da aula 1
    const completeRes3 = await fetch(`${baseUrl}/api/exercises/ex-v8-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'function limparReferencia(objeto, propriedade) { delete objeto[propriedade]; return objeto; }'
      })
    });
    assert.strictEqual(completeRes3.status, 200);
    const completeData3 = await completeRes3.json();
    assert.strictEqual(completeData3.isCorrect, true, 'limparReferencia válida deve ser aprovada');
    assert.strictEqual(completeData3.completedCount, 3);
    assert.strictEqual(completeData3.allCompleted, true, 'allCompleted deve ser true quando todos os 3 exercícios forem resolvidos');

    // 6. VALIDAÇÃO FUNCIONAL ROBUSTA DE CODE_CHALLENGE & REJEIÇÃO DE TRAPAÇAS:

    // 6.1 Rejeição de trapaça: Submissão contendo APENAS comentários
    const cheatRes = await fetch(`${baseUrl}/api/exercises/ex-closures-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: '// function criarContador() { return true; }\n/* return 1 && 2 */'
      })
    });
    assert.strictEqual(cheatRes.status, 200);
    const cheatData = await cheatRes.json();
    assert.strictEqual(cheatData.isCorrect, false, 'Trapaça contendo apenas comentários DEVE ser rejeitada');
    assert.ok(cheatData.explanation.includes('não contém instruções executáveis'), 'Deve retornar feedback explicativo sobre ausência de código executável');

    // 6.2 Rejeição de erro de sintaxe com feedback explicativo
    const syntaxErrorRes = await fetch(`${baseUrl}/api/exercises/ex-closures-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'function criarContador() { const a = ; return a; }'
      })
    });
    assert.strictEqual(syntaxErrorRes.status, 200);
    const syntaxData = await syntaxErrorRes.json();
    assert.strictEqual(syntaxData.isCorrect, false, 'Erro de sintaxe DEVE ser rejeitado');
    assert.ok(syntaxData.explanation.includes('Falha na validação do código:'), 'Feedback deve reportar o erro de sintaxe da execução');

    // 6.3 Rejeição de lógica incorreta em criarContador (não incrementa ou não encapsula)
    const badLogicRes = await fetch(`${baseUrl}/api/exercises/ex-closures-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'function criarContador() { return function() { return 5; }; }'
      })
    });
    assert.strictEqual(badLogicRes.status, 200);
    const badLogicData = await badLogicRes.json();
    assert.strictEqual(badLogicData.isCorrect, false, 'Lógica incorreta deve ser rejeitada');
    assert.ok(badLogicData.explanation.includes('Falha no contador encapsulado'), 'Feedback deve explicar a falha no teste funcional');

    // 6.4 Aprovação funcional de criarContador()
    const validContador = `function criarContador(valorInicial = 0) {
      let count = valorInicial;
      return function() {
        count += 1;
        return count;
      };
    }`;
    const goodContadorRes = await fetch(`${baseUrl}/api/exercises/ex-closures-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: validContador
      })
    });
    assert.strictEqual(goodContadorRes.status, 200);
    const goodContadorData = await goodContadorRes.json();
    assert.strictEqual(goodContadorData.isCorrect, true, 'Solução funcional de criarContador deve ser aceita');

    // 6.5 Aprovação funcional de sleep(ms) (ex-async-03)
    const validSleep = 'function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }';
    const goodSleepRes = await fetch(`${baseUrl}/api/exercises/ex-async-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: validSleep
      })
    });
    assert.strictEqual(goodSleepRes.status, 200);
    const goodSleepData = await goodSleepRes.json();
    assert.strictEqual(goodSleepData.isCorrect, true, 'Solução funcional de sleep(ms) deve ser aceita');

    // 6.6 Validação funcional de fetchData (try/catch e async/await)
    const invalidFetchRes = await fetch(`${baseUrl}/api/exercises/ex-async-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: 'function fetchData(url) { return fetch(url); }'
      })
    });
    const invalidFetchData = await invalidFetchRes.json();
    assert.strictEqual(invalidFetchData.isCorrect, false, 'fetchData sem async/await/try/catch deve falhar');

    const validFetchCode = `async function fetchData(url) {
      try {
        const response = await fetch(url);
        return await response.json();
      } catch (error) {
        console.error(error);
        return null;
      }
    }`;
    const validFetchRes = await fetch(`${baseUrl}/api/exercises/ex-async-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: validFetchCode
      })
    });
    const validFetchResult = await validFetchRes.json();
    assert.strictEqual(validFetchResult.isCorrect, true, 'fetchData assíncrona funcional com try/catch deve ser aceita');

    // 6.7 Validação funcional de agendarTarefas (ex-eventloop-03)
    const validEventLoopCode = `function agendarTarefas(executarMicro, executarMacro) {
      Promise.resolve().then(executarMicro);
      setTimeout(executarMacro, 0);
    }`;
    const goodEventLoopRes = await fetch(`${baseUrl}/api/exercises/ex-eventloop-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: validEventLoopCode
      })
    });
    const goodEventLoopData = await goodEventLoopRes.json();
    assert.strictEqual(goodEventLoopData.isCorrect, true, 'Solução funcional de agendarTarefas deve ser aceita');

    // 6.8 Validação funcional de vincularPrototipo (ex-proto-03)
    const validProtoCode = `function vincularPrototipo(proto, propriedades) {
      const obj = Object.create(proto);
      if (propriedades) Object.assign(obj, propriedades);
      return obj;
    }`;
    const goodProtoRes = await fetch(`${baseUrl}/api/exercises/ex-proto-03/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'aluno-padrao',
        studentAnswer: validProtoCode
      })
    });
    const goodProtoData = await goodProtoRes.json();
    assert.strictEqual(goodProtoData.isCorrect, true, 'Solução funcional de vincularPrototipo deve ser aceita');

    // 7. Validar APPEND-ONLY no SQLite
    const submissionsInDb = testDb.prepare(`
      SELECT * FROM lesson_exercise_submissions
      WHERE exercise_id = 'ex-v8-01' AND user_id = 'aluno-padrao'
      ORDER BY submitted_at ASC
    `).all();

    assert.strictEqual(submissionsInDb.length, 2, 'Histórico de submissões deve registrar todas as tentativas (append-only)');
    assert.strictEqual(submissionsInDb[0].student_answer, 'A');
    assert.strictEqual(submissionsInDb[0].is_correct, 0);
    assert.strictEqual(submissionsInDb[1].student_answer, 'C');
    assert.strictEqual(submissionsInDb[1].is_correct, 1);
  });

  // 19. PERSISTÊNCIA DUAL: Validação de arquivos .json e .md em professor/aluno/tentativas/ e historico_avaliacoes.md
  test('19. PERSISTÊNCIA DUAL: Submeter avaliação grava .json e .md em professor/aluno/tentativas/ e atualiza historico_avaliacoes.md', async () => {
    const fs = require('node:fs');
    const path = require('node:path');

    process.env.ENABLE_FILE_SYNC_IN_TEST = 'true';
    let attemptId;
    let jsonPath;
    let mdPath;
    let historicoPath;

    try {
      const res = await fetch(`${baseUrl}/api/assessments/js-diag-01/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: 'aluno-padrao',
          answers: {
            'q1-closures-hoisting': 'var vs let em closures',
            'q2-event-loop': 'B',
            'q3-prototypes-this': 'Arrow functions capturam this léxico',
            'q4-immutability-memory': 'Shallow copy vs structuredClone',
            'q5-esm-commonjs-treeshaking': 'ESM estático e tree shaking',
            'q6-design-patterns-observer': 'Padrão Observer'
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      attemptId = data.attempt_id;
      assert.ok(attemptId, 'deve retornar attempt_id');

      const tentativasDir = path.resolve(__dirname, '../../professor/aluno/tentativas');
      jsonPath = path.join(tentativasDir, `tentativa-${attemptId}.json`);
      mdPath = path.join(tentativasDir, `tentativa-${attemptId}.md`);
      historicoPath = path.resolve(__dirname, '../../professor/aluno/historico_avaliacoes.md');

      // 1. Validar arquivo JSON completo
      assert.ok(fs.existsSync(jsonPath), `Arquivo JSON deve existir: ${jsonPath}`);
      const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      assert.strictEqual(jsonContent.id, attemptId);
      assert.strictEqual(jsonContent.student_id, 'aluno-padrao');
      assert.strictEqual(jsonContent.assessment_id, 'js-diag-01');
      assert.strictEqual(jsonContent.status, 'SUBMITTED');
      assert.ok(Array.isArray(jsonContent.answers), 'answers deve ser array no JSON');
      assert.strictEqual(jsonContent.answers.length, 6, 'deve conter 6 respostas registradas');

      // 2. Validar arquivo Markdown legível para os agentes
      assert.ok(fs.existsSync(mdPath), `Arquivo Markdown deve existir: ${mdPath}`);
      const mdContent = fs.readFileSync(mdPath, 'utf-8');
      assert.ok(mdContent.includes(attemptId), 'Markdown deve conter ID da tentativa');
      assert.ok(mdContent.includes('Registro de Tentativa de Avaliação'), 'Markdown deve conter título padrão');
      assert.ok(mdContent.includes('Questões e Respostas'), 'Markdown deve conter seção de questões');
      assert.ok(mdContent.includes('q1-closures-hoisting'), 'Markdown deve conter questão q1');
      assert.ok(mdContent.includes('q6-design-patterns-observer'), 'Markdown deve conter questão q6');

      // 3. Validar arquivo mestre historico_avaliacoes.md
      assert.ok(fs.existsSync(historicoPath), `historico_avaliacoes.md deve existir: ${historicoPath}`);
      const histContent = fs.readFileSync(historicoPath, 'utf-8');
      assert.ok(histContent.includes(attemptId), 'historico_avaliacoes.md deve conter o ID da tentativa');
      assert.ok(histContent.includes(`tentativa-${attemptId}.md`), 'historico_avaliacoes.md deve conter link para o markdown');
    } finally {
      delete process.env.ENABLE_FILE_SYNC_IN_TEST;
      // Limpeza dos arquivos temporários gerados pelo teste 19
      try {
        if (jsonPath && fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
        if (mdPath && fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
        if (historicoPath && attemptId && fs.existsSync(historicoPath)) {
          const histContent = fs.readFileSync(historicoPath, 'utf-8');
          const lines = histContent.split('\n').filter(line => !line.includes(attemptId));
          fs.writeFileSync(historicoPath, lines.join('\n'), 'utf-8');
        }
      } catch (_) {}
    }
  });
});
