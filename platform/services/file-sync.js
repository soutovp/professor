const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PROFESSOR_DIR = path.resolve(__dirname, '..', '..', 'professor');
const ALUNO_DIR = path.join(PROFESSOR_DIR, 'aluno');
const TENTATIVAS_DIR = path.join(ALUNO_DIR, 'tentativas');
const CERTIFICADOS_DIR = path.join(PROFESSOR_DIR, 'certificados');
const HISTORICO_MD_PATH = path.join(ALUNO_DIR, 'historico_avaliacoes.md');
const EXERCICIOS_FIXACAO_PATH = path.join(ALUNO_DIR, 'exercicios_fixacao.json');
const PERFIL_MD_PATH = path.join(ALUNO_DIR, 'perfil.md');
const PROGRESSO_JS_PATH = path.join(PROFESSOR_DIR, 'materias', 'javascript', 'progresso.md');

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function shouldSkipSync() {
  return process.env.NODE_ENV === 'test' && process.env.ENABLE_FILE_SYNC_IN_TEST !== 'true';
}

/**
 * Gera documento legível em Markdown para consumo por agentes pedagógicos e humanos
 */
function generateAttemptMarkdown(attempt, answers, assessment) {
  const assessmentTitle = assessment ? assessment.title : (attempt.assessment_title || attempt.assessment_id);
  const assessmentType = assessment ? assessment.type : (attempt.assessment_type || 'EXAM');
  const dateFormatted = attempt.completed_at || attempt.started_at || new Date().toISOString();

  let md = `# Registro de Tentativa de Avaliação\n\n`;
  md += `- **ID da Tentativa:** \`${attempt.id}\`\n`;
  md += `- **Aluno:** \`${attempt.student_id}\`\n`;
  md += `- **Avaliação:** ${assessmentTitle} (\`${attempt.assessment_id}\`)\n`;
  md += `- **Tipo de Avaliação:** ${assessmentType}\n`;
  md += `- **Data de Início:** ${attempt.started_at}\n`;
  md += `- **Data de Conclusão:** ${attempt.completed_at || 'Em andamento'}\n`;
  md += `- **Status:** \`${attempt.status}\`\n`;
  md += `- **Nota Obtida:** **${attempt.score}** / **${attempt.max_score}** pts\n\n`;
  md += `---\n\n## Questões e Respostas\n\n`;

  answers.forEach((ans, idx) => {
    const qNum = idx + 1;
    const qId = ans.question_id;
    const isPending = ans.is_pending === 1 || ans.is_pending === true || ans.status === 'PENDING_EVALUATION';
    const statusText = isPending ? '⏳ PENDING_EVALUATION (Em espera de avaliação)' : '✅ GRADED (Corrigido)';

    md += `### Questão ${qNum}: \`${qId}\`\n`;
    md += `- **Tipo:** ${ans.type || ans.question_type || 'QUESTION'}\n`;
    md += `- **Pontuação Máxima:** ${ans.max_score || ans.points || 0} pts\n`;
    md += `- **Pontuação Obtida:** ${ans.score || 0} pts\n`;
    md += `- **Status da Avaliação:** ${statusText}\n\n`;

    md += `#### Enunciado:\n${ans.prompt_markdown || 'Enunciado não disponível'}\n\n`;
    md += `#### Resposta do Aluno:\n\`\`\`text\n${ans.student_answer !== undefined && ans.student_answer !== null ? ans.student_answer : ''}\n\`\`\`\n\n`;

    if (ans.rubric) {
      md += `#### Rubrica de Avaliação:\n${ans.rubric}\n\n`;
    }

    md += `#### Feedback do Avaliador:\n${ans.feedback || 'Aguardando avaliação pelo agente pedagógico.'}\n\n`;
    md += `---\n\n`;
  });

  return md;
}

/**
 * Atualiza ou anexa a linha correspondente no arquivo mestre historico_avaliacoes.md
 */
function updateHistoricoAvaliacoesMd(attempt, assessmentTitle) {
  ensureDirExists(ALUNO_DIR);
  const dateFormatted = (attempt.completed_at || attempt.started_at || new Date().toISOString()).replace('T', ' ').slice(0, 16);
  const title = assessmentTitle || attempt.assessment_title || attempt.assessment_id;
  const fileName = `tentativa-${attempt.id}.md`;
  const relativeLink = `[${fileName}](tentativas/${fileName})`;
  const newRow = `| ${dateFormatted} | ${attempt.id} | ${title} | ${attempt.status} | ${attempt.score} / ${attempt.max_score} | ${relativeLink} |`;

  const header = `# Histórico de Avaliações do Aluno\n\nRegistro consolidado e append-only de todas as tentativas de avaliações realizadas na plataforma.\n\n| Data | ID | Avaliação | Status | Nota | Arquivo |\n|---|---|---|---|---|---|\n`;

  if (!fs.existsSync(HISTORICO_MD_PATH)) {
    fs.writeFileSync(HISTORICO_MD_PATH, header + newRow + '\n', 'utf-8');
    return;
  }

  const content = fs.readFileSync(HISTORICO_MD_PATH, 'utf-8');
  const lines = content.split('\n');
  let found = false;

  const updatedLines = lines.map(line => {
    if (line.includes(`| ${attempt.id} `) || line.includes(`| ${attempt.id}|`)) {
      found = true;
      return newRow;
    }
    return line;
  });

  if (!found) {
    let lastTableRowIndex = -1;
    for (let i = updatedLines.length - 1; i >= 0; i--) {
      if (updatedLines[i].startsWith('|')) {
        lastTableRowIndex = i;
        break;
      }
    }
    if (lastTableRowIndex !== -1) {
      updatedLines.splice(lastTableRowIndex + 1, 0, newRow);
    } else {
      updatedLines.push(newRow);
    }
  }

  fs.writeFileSync(HISTORICO_MD_PATH, updatedLines.join('\n'), 'utf-8');
}

/**
 * Atualiza o perfil acadêmico do aluno após avaliação corrigida
 */
function updatePerfilMdAfterGrading(attempt) {
  if (!fs.existsSync(PERFIL_MD_PATH)) return;
  try {
    let content = fs.readFileSync(PERFIL_MD_PATH, 'utf-8');
    if (content.includes('DIAGNOSTIC_PENDING')) {
      content = content.replace('DIAGNOSTIC_PENDING', 'IN_PROGRESS');
      content = content.replace('Em Avaliação Diagnóstica', `Avaliação Concluída (${attempt.score} pts)`);
      fs.writeFileSync(PERFIL_MD_PATH, content, 'utf-8');
    }
  } catch (err) {
    console.error('Erro ao atualizar perfil.md:', err.message);
  }
}

/**
 * Atualiza o arquivo de progresso da disciplina após correção de avaliação
 */
function updateProgressoMdAfterGrading(attempt, formattedAnswers) {
  if (!fs.existsSync(PROGRESSO_JS_PATH)) return;
  try {
    let content = fs.readFileSync(PROGRESSO_JS_PATH, 'utf-8');
    const noteMarker = `### Registro de Correção - ${attempt.id}`;
    if (!content.includes(attempt.id)) {
      const addition = `\n\n${noteMarker}\n- **Data:** ${new Date().toLocaleString('pt-BR')}\n- **Nota Final:** ${attempt.score}/${attempt.max_score} pts (${attempt.status})\n`;
      content += addition;
      fs.writeFileSync(PROGRESSO_JS_PATH, content, 'utf-8');
    }
  } catch (err) {
    console.error('Erro ao atualizar progresso.md:', err.message);
  }
}

/**
 * Sincronização após submissão de tentativa de avaliação
 */
function syncAttemptSubmitted({ attempt, answers, assessment, subject }) {
  if (shouldSkipSync()) return;
  ensureDirExists(TENTATIVAS_DIR);

  const fullData = {
    id: attempt.id,
    student_id: attempt.student_id,
    assessment_id: attempt.assessment_id,
    assessment_title: assessment ? assessment.title : (attempt.assessment_title || attempt.assessment_id),
    assessment_type: assessment ? assessment.type : (attempt.assessment_type || 'EXAM'),
    subject_id: subject ? subject.id : 'javascript-avancado',
    subject_title: subject ? subject.title : 'JavaScript Avançado e Arquitetura de Sistemas',
    started_at: attempt.started_at,
    completed_at: attempt.completed_at,
    score: Number(attempt.score) || 0,
    max_score: Number(attempt.max_score) || 100,
    status: attempt.status,
    answers: answers.map(a => ({
      question_id: a.question_id,
      prompt_markdown: a.prompt_markdown,
      type: a.type || a.question_type,
      student_answer: a.student_answer,
      correct_answer: a.correct_answer,
      explanation: a.explanation,
      rubric: a.rubric,
      score: Number(a.score) || 0,
      max_score: Number(a.max_score || a.points || 0),
      feedback: a.feedback,
      is_pending: a.is_pending === 1 || a.is_pending === true || a.status === 'PENDING_EVALUATION',
      status: a.status
    }))
  };

  // 1. Salvar JSON completo
  const jsonPath = path.join(TENTATIVAS_DIR, `tentativa-${attempt.id}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(fullData, null, 2), 'utf-8');

  // 2. Salvar Markdown legível para os agentes
  const mdPath = path.join(TENTATIVAS_DIR, `tentativa-${attempt.id}.md`);
  const mdContent = generateAttemptMarkdown(attempt, answers, assessment);
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  // 3. Atualizar arquivo mestre de histórico
  updateHistoricoAvaliacoesMd(attempt, fullData.assessment_title);
}

/**
 * Sincronização após correção (grading) de tentativa de avaliação
 */
function syncAttemptGraded(attemptId, db) {
  if (shouldSkipSync()) return;
  ensureDirExists(TENTATIVAS_DIR);

  const attempt = db.prepare(`
    SELECT att.*, ass.title as assessment_title, ass.type as assessment_type, s.title as subject_title
    FROM attempts att
    JOIN assessments ass ON att.assessment_id = ass.id
    JOIN subjects s ON ass.subject_id = s.id
    WHERE att.id = ?
  `).get(attemptId);

  if (!attempt) return;

  const answers = db.prepare(`
    SELECT ans.*, q.prompt_markdown, q.type as question_type, q.points, q.rubric, q.correct_answer, q.explanation
    FROM answers ans
    JOIN questions q ON ans.question_id = q.id
    WHERE ans.attempt_id = ?
    ORDER BY q.order_index ASC
  `).all(attemptId);

  const formattedAnswers = answers.map(a => ({
    question_id: a.question_id,
    prompt_markdown: a.prompt_markdown,
    type: a.question_type,
    student_answer: a.student_answer,
    correct_answer: a.correct_answer,
    explanation: a.explanation,
    rubric: a.rubric,
    score: Number(a.score) || 0,
    max_score: Number(a.points) || 0,
    feedback: a.feedback,
    is_pending: false,
    status: 'GRADED'
  }));

  const jsonPath = path.join(TENTATIVAS_DIR, `tentativa-${attempt.id}.json`);
  let fullData = {};
  if (fs.existsSync(jsonPath)) {
    try {
      fullData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (_) {}
  }

  fullData = {
    ...fullData,
    id: attempt.id,
    student_id: attempt.student_id,
    assessment_id: attempt.assessment_id,
    assessment_title: attempt.assessment_title,
    assessment_type: attempt.assessment_type,
    score: Number(attempt.score) || 0,
    max_score: Number(attempt.max_score) || 100,
    status: 'GRADED',
    answers: formattedAnswers
  };

  // Atualizar JSON
  fs.writeFileSync(jsonPath, JSON.stringify(fullData, null, 2), 'utf-8');

  // Atualizar Markdown
  const mdPath = path.join(TENTATIVAS_DIR, `tentativa-${attempt.id}.md`);
  const mdContent = generateAttemptMarkdown(attempt, formattedAnswers, {
    title: attempt.assessment_title,
    type: attempt.assessment_type
  });
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  // Atualizar historico_avaliacoes.md
  updateHistoricoAvaliacoesMd(attempt, attempt.assessment_title);

  // Atualizar perfil.md e progresso.md
  updatePerfilMdAfterGrading(attempt);
  updateProgressoMdAfterGrading(attempt, formattedAnswers);
}

/**
 * Sincronização após emissão de certificado
 */
function syncCertificateGenerated(certificate) {
  if (shouldSkipSync()) return;
  ensureDirExists(CERTIFICADOS_DIR);

  const code = certificate.verification_code;
  const jsonPath = path.join(CERTIFICADOS_DIR, `certificado-${code}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(certificate, null, 2), 'utf-8');

  const mdPath = path.join(CERTIFICADOS_DIR, `certificado-${code}.md`);
  const mdContent = `# Certificado de Conclusão Acadêmica

Certificamos que **${certificate.student_name}** concluiu com aproveitamento e dedicação a disciplina:

## ${certificate.subject_title}

- **Nota Final:** **${certificate.final_grade}** / 10.0
- **Carga Horária Estimada:** ${certificate.hours_estimate} horas
- **Data de Conclusão:** ${certificate.completion_date}
- **Data de Emissão:** ${certificate.issued_at || new Date().toISOString()}
- **Código de Verificação:** \`${certificate.verification_code}\`

---
*Este documento foi gerado pelo Sistema Acadêmico Assistido por IA com base nos registros auditáveis da plataforma educacional.*
`;
  fs.writeFileSync(mdPath, mdContent, 'utf-8');
}

/**
 * Sincronização de submissões de exercícios de fixação em exercicios_fixacao.json
 */
function syncExerciseSubmitted(submission) {
  if (shouldSkipSync()) return;
  ensureDirExists(ALUNO_DIR);
  let exercises = [];
  if (fs.existsSync(EXERCICIOS_FIXACAO_PATH)) {
    try {
      exercises = JSON.parse(fs.readFileSync(EXERCICIOS_FIXACAO_PATH, 'utf-8'));
      if (!Array.isArray(exercises)) exercises = [];
    } catch (_) {
      exercises = [];
    }
  }

  exercises.push({
    submission_id: submission.submission_id,
    user_id: submission.user_id,
    exercise_id: submission.exercise_id,
    lesson_id: submission.lesson_id,
    student_answer: submission.student_answer,
    is_correct: Boolean(submission.is_correct),
    submitted_at: submission.submitted_at || new Date().toISOString()
  });

  fs.writeFileSync(EXERCICIOS_FIXACAO_PATH, JSON.stringify(exercises, null, 2), 'utf-8');
}

/**
 * Rotina de reidratação: lê professor/aluno/tentativas/*.json e garante inserção no SQLite
 */
function rehydrateAttempts(db) {
  try {
    if (!fs.existsSync(TENTATIVAS_DIR)) return;

    const files = fs.readdirSync(TENTATIVAS_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) return;

    for (const file of files) {
      const filePath = path.join(TENTATIVAS_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!data || !data.id || !data.assessment_id) continue;

        const existing = db.prepare('SELECT id FROM attempts WHERE id = ?').get(data.id);
        if (existing) continue;

        let targetAssessmentId = data.assessment_id;
        const assExists = db.prepare('SELECT id FROM assessments WHERE id = ?').get(targetAssessmentId);
        if (!assExists) {
          const matchCase = db.prepare('SELECT id FROM assessments WHERE LOWER(id) = LOWER(?)').get(targetAssessmentId);
          if (matchCase) {
            targetAssessmentId = matchCase.id;
          } else {
            continue;
          }
        }

        db.prepare(`
          INSERT INTO attempts (id, student_id, assessment_id, started_at, completed_at, score, max_score, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.id,
          data.student_id || 'aluno-padrao',
          targetAssessmentId,
          data.started_at || new Date().toISOString(),
          data.completed_at || null,
          Number(data.score) || 0,
          Number(data.max_score) || 100,
          data.status || 'SUBMITTED'
        );

        if (Array.isArray(data.answers)) {
          const insertAns = db.prepare(`
            INSERT INTO answers (id, attempt_id, question_id, student_answer, score, feedback, is_pending)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const ans of data.answers) {
            const ansId = ans.id || `ans-${crypto.randomUUID()}`;
            insertAns.run(
              ansId,
              data.id,
              ans.question_id,
              ans.student_answer || '',
              Number(ans.score) || 0,
              ans.feedback || '',
              ans.is_pending ? 1 : 0
            );
          }
        }
        console.log(`[Reidratação] Tentativa ${data.id} reidratada com sucesso no SQLite.`);
      } catch (err) {
        console.error(`[Reidratação] Erro ao reidratar tentativa ${file}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Reidratação] Erro na rotina de reidratação:', err.message);
  }
}

module.exports = {
  syncAttemptSubmitted,
  syncAttemptGraded,
  syncCertificateGenerated,
  syncExerciseSubmitted,
  rehydrateAttempts,
  generateAttemptMarkdown,
  updateHistoricoAvaliacoesMd,
  shouldSkipSync,
  TENTATIVAS_DIR,
  HISTORICO_MD_PATH,
  CERTIFICADOS_DIR,
  EXERCICIOS_FIXACAO_PATH
};
