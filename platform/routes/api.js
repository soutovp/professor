const express = require('express');
const { getDatabase } = require('../database.js');
const crypto = require('node:crypto');
const fileSync = require('../services/file-sync.js');

function createApiRouter(customDb = null) {
  const router = express.Router();
  const getDb = () => customDb || getDatabase();

  const DEFAULT_USER_ID = 'aluno-padrao';

  // 1. GET /api/dashboard
  router.get('/dashboard', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;

      // Buscar matérias e progresso
      const subjects = db.prepare(`
        SELECT s.id, s.title, s.description,
          (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.subject_id = s.id) AS total_lessons,
          (SELECT COUNT(*) FROM user_progress up 
             JOIN lessons l ON up.entity_id = l.id 
             JOIN modules m ON l.module_id = m.id 
           WHERE m.subject_id = s.id AND up.user_id = ? AND up.status = 'COMPLETED') AS completed_lessons
        FROM subjects s
      `).all(userId);

      const subjectsWithProgress = subjects.map(s => {
        const total = Number(s.total_lessons) || 0;
        const completed = Number(s.completed_lessons) || 0;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
          id: s.id,
          title: s.title,
          description: s.description,
          total_lessons: total,
          completed_lessons: completed,
          progress_percentage: percentage
        };
      });

      // Última aula acessada ou próxima aula para continuar
      const lastAccessed = db.prepare(`
        SELECT up.entity_id as lesson_id, up.status, up.last_accessed_at,
               l.title as lesson_title, l.module_id, m.title as module_title, m.subject_id, s.title as subject_title
        FROM user_progress up
        JOIN lessons l ON up.entity_id = l.id
        JOIN modules m ON l.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE up.user_id = ? AND up.entity_type = 'LESSON'
        ORDER BY up.last_accessed_at DESC
        LIMIT 1
      `).get(userId);

      let continueStudying = null;
      if (lastAccessed) {
        if (lastAccessed.status === 'COMPLETED') {
          // Buscar próxima aula não concluída
          const nextLesson = db.prepare(`
            SELECT l.id as lesson_id, l.title as lesson_title, l.module_id, m.title as module_title, m.subject_id, s.title as subject_title
            FROM lessons l
            JOIN modules m ON l.module_id = m.id
            JOIN subjects s ON m.subject_id = s.id
            WHERE m.subject_id = ?
              AND l.id NOT IN (SELECT entity_id FROM user_progress WHERE user_id = ? AND status = 'COMPLETED')
            ORDER BY m.order_index ASC, l.order_index ASC
            LIMIT 1
          `).get(lastAccessed.subject_id, userId);

          continueStudying = nextLesson || lastAccessed;
        } else {
          continueStudying = lastAccessed;
        }
      } else {
        // Se nunca acessou nenhuma, pega a primeira aula do curso
        const firstLesson = db.prepare(`
          SELECT l.id as lesson_id, l.title as lesson_title, l.module_id, m.title as module_title, m.subject_id, s.title as subject_title
          FROM lessons l
          JOIN modules m ON l.module_id = m.id
          JOIN subjects s ON m.subject_id = s.id
          ORDER BY m.order_index ASC, l.order_index ASC
          LIMIT 1
        `).get();
        continueStudying = firstLesson || null;
      }

      // Histórico recente de atividades
      const recentActivity = db.prepare(`
        SELECT up.entity_id as lesson_id, up.status, up.last_accessed_at,
               l.title as lesson_title, m.title as module_title, s.title as subject_title
        FROM user_progress up
        JOIN lessons l ON up.entity_id = l.id
        JOIN modules m ON l.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE up.user_id = ? AND up.entity_type = 'LESSON'
        ORDER BY up.last_accessed_at DESC
        LIMIT 5
      `).all(userId);

      // Últimas tentativas de avaliações
      const recentAttempts = db.prepare(`
        SELECT att.id, att.assessment_id, att.started_at, att.completed_at, att.score, att.max_score, att.status,
               ass.title as assessment_title, ass.type as assessment_type
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        WHERE att.student_id = ?
        ORDER BY att.started_at DESC
        LIMIT 5
      `).all(userId);

      // Estatísticas gerais
      const totalLessonsQuery = db.prepare('SELECT COUNT(*) as count FROM lessons').get();
      const completedLessonsQuery = db.prepare(`
        SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND status = 'COMPLETED' AND entity_type = 'LESSON'
      `).get(userId);

      const totalLessons = Number(totalLessonsQuery.count) || 0;
      const completedLessons = Number(completedLessonsQuery.count) || 0;

      res.json({
        user_id: userId,
        subjects: subjectsWithProgress,
        continue_studying: continueStudying,
        recent_activity: recentActivity,
        recent_attempts: recentAttempts,
        overall_stats: {
          total_lessons: totalLessons,
          completed_lessons: completedLessons,
          overall_percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
          total_attempts: recentAttempts.length
        }
      });
    } catch (err) {
      console.error('Erro em GET /api/dashboard:', err);
      res.status(500).json({ error: 'Erro ao carregar dashboard', details: err.message });
    }
  });

  // 2. GET /api/subjects
  router.get('/subjects', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;

      const subjects = db.prepare(`
        SELECT s.id, s.title, s.description, s.prerequisites, s.created_at,
          (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.subject_id = s.id) AS total_lessons,
          (SELECT COUNT(*) FROM user_progress up 
             JOIN lessons l ON up.entity_id = l.id 
             JOIN modules m ON l.module_id = m.id 
           WHERE m.subject_id = s.id AND up.user_id = ? AND up.status = 'COMPLETED') AS completed_lessons,
          (SELECT COUNT(*) FROM assessments a WHERE a.subject_id = s.id AND a.status = 'ACTIVE') AS total_assessments
        FROM subjects s
        ORDER BY s.created_at ASC
      `).all(userId);

      const formatted = subjects.map(s => {
        let prerequisites = [];
        try {
          prerequisites = s.prerequisites ? JSON.parse(s.prerequisites) : [];
        } catch (_) {
          prerequisites = [s.prerequisites];
        }

        const total = Number(s.total_lessons) || 0;
        const completed = Number(s.completed_lessons) || 0;
        return {
          id: s.id,
          title: s.title,
          description: s.description,
          prerequisites,
          total_lessons: total,
          completed_lessons: completed,
          progress_percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
          total_assessments: Number(s.total_assessments) || 0
        };
      });

      res.json(formatted);
    } catch (err) {
      console.error('Erro em GET /api/subjects:', err);
      res.status(500).json({ error: 'Erro ao listar matérias', details: err.message });
    }
  });

  // 3. GET /api/subjects/:id
  router.get('/subjects/:id', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;
      const subjectId = req.params.id;

      const subject = db.prepare(`
        SELECT * FROM subjects WHERE id = ?
      `).get(subjectId);

      if (!subject) {
        return res.status(404).json({ error: 'Matéria não encontrada' });
      }

      let prerequisites = [];
      try {
        prerequisites = subject.prerequisites ? JSON.parse(subject.prerequisites) : [];
      } catch (_) {
        prerequisites = [subject.prerequisites];
      }

      // Objetivos da matéria
      const objectives = db.prepare(`
        SELECT id, description FROM learning_objectives WHERE entity_type = 'SUBJECT' AND entity_id = ?
      `).all(subjectId);

      // Materiais de apoio da matéria
      const materials = db.prepare(`
        SELECT id, title, url, resource_type FROM support_materials WHERE target_type = 'SUBJECT' AND target_id = ?
      `).all(subjectId);

      // Módulos com suas aulas e progresso
      const modules = db.prepare(`
        SELECT id, title, objective, order_index
        FROM modules
        WHERE subject_id = ?
        ORDER BY order_index ASC
      `).all(subjectId);

      const modulesWithLessons = modules.map(mod => {
        const lessons = db.prepare(`
          SELECT l.id, l.title, l.summary, l.lesson_type, l.estimated_minutes, l.order_index,
                 COALESCE(up.status, 'NOT_STARTED') as status,
                 up.completed_at
          FROM lessons l
          LEFT JOIN user_progress up ON l.id = up.entity_id AND up.user_id = ?
          WHERE l.module_id = ?
          ORDER BY l.order_index ASC
        `).all(userId, mod.id);

        return {
          id: mod.id,
          title: mod.title,
          objective: mod.objective,
          order_index: mod.order_index,
          lessons
        };
      });

      // Avaliações vinculadas
      const assessments = db.prepare(`
        SELECT a.id, a.title, a.description, a.type, a.passing_score, a.max_score, a.time_limit_minutes, a.status,
          (SELECT COUNT(*) FROM questions q WHERE q.assessment_id = a.id) as question_count,
          (SELECT MAX(score) FROM attempts att WHERE att.assessment_id = a.id AND att.student_id = ?) as best_score,
          (SELECT COUNT(*) FROM attempts att WHERE att.assessment_id = a.id AND att.student_id = ?) as attempts_count
        FROM assessments a
        WHERE a.subject_id = ? AND a.status = 'ACTIVE'
      `).all(userId, userId, subjectId);

      res.json({
        id: subject.id,
        title: subject.title,
        description: subject.description,
        prerequisites,
        objectives: objectives.map(o => o.description),
        materials,
        modules: modulesWithLessons,
        assessments
      });
    } catch (err) {
      console.error(`Erro em GET /api/subjects/${req.params.id}:`, err);
      res.status(500).json({ error: 'Erro ao carregar detalhes da matéria', details: err.message });
    }
  });

  // 4. GET /api/lessons/:id
  router.get('/lessons/:id', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;
      const lessonId = req.params.id;

      const lesson = db.prepare(`
        SELECT l.*, m.subject_id, m.title as module_title, s.title as subject_title
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        JOIN subjects s ON m.subject_id = s.id
        WHERE l.id = ?
      `).get(lessonId);

      if (!lesson) {
        return res.status(404).json({ error: 'Aula não encontrada' });
      }

      // Status de progresso atual
      const progress = db.prepare(`
        SELECT status, started_at, completed_at, last_accessed_at
        FROM user_progress
        WHERE user_id = ? AND entity_type = 'LESSON' AND entity_id = ?
      `).get(userId, lessonId);

      // Atualiza last_accessed_at discretamente ao visualizar
      db.prepare(`
        INSERT INTO user_progress (id, user_id, entity_type, entity_id, status, started_at, last_accessed_at)
        VALUES (?, ?, 'LESSON', ?, 'IN_PROGRESS', datetime('now'), datetime('now'))
        ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
          last_accessed_at = datetime('now')
      `).run(crypto.randomUUID(), userId, lessonId);

      // Objetivos da aula
      const objectives = db.prepare(`
        SELECT description FROM learning_objectives WHERE entity_type = 'LESSON' AND entity_id = ?
      `).all(lessonId);

      // Materiais de apoio da aula
      const materials = db.prepare(`
        SELECT id, title, url, resource_type FROM support_materials WHERE target_type = 'LESSON' AND target_id = ?
      `).all(lessonId);

      // Aula anterior e próxima aula na sequência do curso
      const allLessons = db.prepare(`
        SELECT l.id, l.title
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        WHERE m.subject_id = ?
        ORDER BY m.order_index ASC, l.order_index ASC
      `).all(lesson.subject_id);

      const currentIndex = allLessons.findIndex(item => item.id === lessonId);
      const previousLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
      const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

      res.json({
        id: lesson.id,
        module_id: lesson.module_id,
        subject_id: lesson.subject_id,
        module_title: lesson.module_title,
        subject_title: lesson.subject_title,
        title: lesson.title,
        summary: lesson.summary,
        content_markdown: lesson.content_markdown,
        lesson_type: lesson.lesson_type,
        estimated_minutes: lesson.estimated_minutes,
        order_index: lesson.order_index,
        status: progress ? progress.status : 'IN_PROGRESS',
        completed_at: progress ? progress.completed_at : null,
        objectives: objectives.map(o => o.description),
        materials,
        previous_lesson: previousLesson,
        next_lesson: nextLesson
      });
    } catch (err) {
      console.error(`Erro em GET /api/lessons/${req.params.id}:`, err);
      res.status(500).json({ error: 'Erro ao carregar aula', details: err.message });
    }
  });

  // 5. POST /api/lessons/:id/progress
  router.post('/lessons/:id/progress', (req, res) => {
    try {
      const db = getDb();
      const userId = req.body.userId || DEFAULT_USER_ID;
      const lessonId = req.params.id;
      const { status } = req.body;

      if (!status || !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido. Deve ser NOT_STARTED, IN_PROGRESS ou COMPLETED' });
      }

      const completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;

      db.prepare(`
        INSERT INTO user_progress (id, user_id, entity_type, entity_id, status, started_at, completed_at, last_accessed_at)
        VALUES (?, ?, 'LESSON', ?, ?, datetime('now'), ?, datetime('now'))
        ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
          status = excluded.status,
          completed_at = CASE WHEN excluded.status = 'COMPLETED' THEN datetime('now') ELSE user_progress.completed_at END,
          last_accessed_at = datetime('now')
      `).run(crypto.randomUUID(), userId, lessonId, status, completedAt);

      const updated = db.prepare(`
        SELECT status, started_at, completed_at, last_accessed_at
        FROM user_progress
        WHERE user_id = ? AND entity_type = 'LESSON' AND entity_id = ?
      `).get(userId, lessonId);

      res.json({
        message: 'Progresso atualizado com sucesso',
        progress: updated
      });
    } catch (err) {
      console.error(`Erro em POST /api/lessons/${req.params.id}/progress:`, err);
      res.status(500).json({ error: 'Erro ao atualizar progresso', details: err.message });
    }
  });

  // Mapeamento bidirecional de IDs de aula (ex: js-mod-1-aula-1 <-> lesson-js-01)
  const LESSON_ALIASES = {
    'js-mod-1-aula-1': 'lesson-js-01',
    'lesson-js-01': 'js-mod-1-aula-1',
    'js-mod-1-aula-2': 'lesson-js-02',
    'lesson-js-02': 'js-mod-1-aula-2',
    'js-mod-1-aula-3': 'lesson-js-03',
    'lesson-js-03': 'js-mod-1-aula-3',
    'js-mod-1-aula-4': 'lesson-js-04',
    'lesson-js-04': 'js-mod-1-aula-4',
    'js-mod-1-aula-5': 'lesson-js-05',
    'lesson-js-05': 'js-mod-1-aula-5'
  };

  // 5.1 GET /api/lessons/:id/exercises
  router.get('/lessons/:id/exercises', (req, res) => {
    try {
      const db = getDb();
      const lessonId = req.params.id;
      const userId = req.query.userId || DEFAULT_USER_ID;
      const aliasLessonId = LESSON_ALIASES[lessonId] || lessonId;

      const exercises = db.prepare(`
        SELECT * FROM lesson_exercises
        WHERE lesson_id = ? OR lesson_id = ?
        ORDER BY order_index ASC
      `).all(lessonId, aliasLessonId);

      const sanitizedExercises = exercises.map(ex => {
        let options = null;
        if (ex.options_json) {
          try {
            options = JSON.parse(ex.options_json);
          } catch (_) {
            options = null;
          }
        }

        // Buscar última submissão do usuário para este exercício
        const lastSub = db.prepare(`
          SELECT student_answer, is_correct, submitted_at
          FROM lesson_exercise_submissions
          WHERE user_id = ? AND exercise_id = ?
          ORDER BY submitted_at DESC
          LIMIT 1
        `).get(userId, ex.id);

        // Checar se o aluno já acertou este exercício anteriormente
        const alreadyCorrect = db.prepare(`
          SELECT 1 FROM lesson_exercise_submissions
          WHERE user_id = ? AND exercise_id = ? AND is_correct = 1
          LIMIT 1
        `).get(userId, ex.id);

        const exItem = {
          id: ex.id,
          lesson_id: ex.lesson_id,
          type: ex.type,
          title: ex.title,
          prompt_markdown: ex.prompt_markdown,
          options,
          initial_code: ex.initial_code,
          order_index: ex.order_index,
          last_submission: lastSub ? {
            student_answer: lastSub.student_answer,
            is_correct: Boolean(lastSub.is_correct),
            submitted_at: lastSub.submitted_at
          } : null
        };

        // SEGURANÇA PEDAGÓGICA: Oculta correct_answer se o aluno ainda não acertou ou não submeteu
        if (alreadyCorrect) {
          exItem.correct_answer = ex.correct_answer;
          exItem.explanation = ex.explanation;
        }

        return exItem;
      });

      res.json(sanitizedExercises);
    } catch (err) {
      console.error(`Erro em GET /api/lessons/${req.params.id}/exercises:`, err);
      res.status(500).json({ error: 'Erro ao carregar exercícios da aula', details: err.message });
    }
  });

  // Helpers de avaliação funcional para CODE_CHALLENGE
  function stripComments(code) {
    return String(code || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
  }

  async function runWithTimeout(asyncFn, timeoutMs = 1500) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Tempo limite de execução excedido (${timeoutMs}ms).`)), timeoutMs);
    });
    try {
      return await Promise.race([asyncFn(), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function evaluateCodeChallenge(exercise, studentCode) {
    const rawClean = stripComments(studentCode).trim();
    if (!rawClean) {
      throw new Error('O código submetido não contém instruções executáveis (apenas comentários ou vazio).');
    }

    const exId = exercise.id;

    // ex-v8-03: Limpeza de referências para mitigar memory leaks
    if (exId === 'ex-v8-03' || rawClean.includes('limparReferencia')) {
      const fnWrapper = new Function(`
        ${rawClean};
        if (typeof limparReferencia === 'function') return limparReferencia;
        throw new Error("A função 'limparReferencia' não foi declarada.");
      `);
      const fn = fnWrapper();
      const testObj = { cache: { dados: [1, 2, 3] }, id: 101 };
      fn(testObj, 'cache');
      if (testObj.cache !== null && testObj.cache !== undefined && 'cache' in testObj) {
        throw new Error("A referência à propriedade 'cache' não foi limpa ou anulada no objeto.");
      }
      return true;
    }

    // ex-eventloop-03: Agendamento com Microtasks e Macrotasks
    if (exId === 'ex-eventloop-03' || rawClean.includes('agendarTarefas')) {
      const fnWrapper = new Function(`
        ${rawClean};
        if (typeof agendarTarefas === 'function') return agendarTarefas;
        throw new Error("A função 'agendarTarefas' não foi declarada.");
      `);
      const fn = fnWrapper();
      const executionOrder = [];
      fn(
        () => executionOrder.push('microtask'),
        () => executionOrder.push('macrotask')
      );
      await new Promise(resolve => setTimeout(resolve, 50));
      if (executionOrder.length !== 2) {
        throw new Error("As tarefas agendadas não foram executadas.");
      }
      if (executionOrder[0] !== 'microtask' || executionOrder[1] !== 'macrotask') {
        throw new Error(`Ordem de execução incorreta do Event Loop: microtarefas devem executar antes de macrotarefas. Obtido: ${JSON.stringify(executionOrder)}`);
      }
      return true;
    }

    // ex-closures-03: Factory function criarContador com closure
    if (exId === 'ex-closures-03' || rawClean.includes('criarContador')) {
      const fnWrapper = new Function(`
        ${rawClean};
        if (typeof criarContador === 'function') return criarContador;
        throw new Error("A função 'criarContador' não foi declarada.");
      `);
      const fn = fnWrapper();
      const c = fn();
      if (typeof c !== 'function') {
        throw new Error("A função 'criarContador' deve retornar uma função interna.");
      }
      const val1 = c();
      const val2 = c();
      if (val1 !== 1 || val2 !== 2) {
        throw new Error(`Falha no contador encapsulado: esperado c() === 1 e c() === 2, mas obteve ${val1} e ${val2}.`);
      }
      const c10 = fn(10);
      const val10_1 = c10();
      if (val10_1 !== 11) {
        throw new Error(`Falha com valor inicial: esperado criarContador(10)() === 11, obteve ${val10_1}.`);
      }
      return true;
    }

    // ex-proto-03: Vincular protótipos com Object.create e invocar método herdado
    if (exId === 'ex-proto-03' || rawClean.includes('vincularPrototipo')) {
      const fnWrapper = new Function(`
        ${rawClean};
        if (typeof vincularPrototipo === 'function') return vincularPrototipo;
        throw new Error("A função 'vincularPrototipo' não foi declarada.");
      `);
      const fn = fnWrapper();
      const protoPai = {
        saudacao: 'Olá do Protótipo',
        falar() {
          return this.saudacao;
        }
      };
      const filho = fn(protoPai, { saudacao: 'Personalizada' });
      if (!filho || typeof filho !== 'object') {
        throw new Error("A função 'vincularPrototipo' deve retornar um objeto.");
      }
      if (Object.getPrototypeOf(filho) !== protoPai) {
        throw new Error("O objeto criado deve herdar de proto diretamente via Object.create(proto).");
      }
      if (typeof filho.falar !== 'function' || filho.falar() !== 'Personalizada') {
        throw new Error("Falha ao invocar método herdado ou acessar propriedades atribuídas.");
      }
      const filhoSimples = fn(protoPai);
      if (filhoSimples.falar() !== 'Olá do Protótipo') {
        throw new Error("Falha na delegação ao protótipo pai quando nenhuma propriedade adicional é informada.");
      }
      return true;
    }

    // fetchData: sanitiza comentários antes da análise sintática e testa a estrutura da função assíncrona com try/catch
    if (rawClean.includes('fetchData')) {
      const lowerClean = rawClean.toLowerCase();
      if (!lowerClean.includes('async') || !lowerClean.includes('await')) {
        throw new Error("A função 'fetchData' deve ser assíncrona e utilizar a sintaxe async/await.");
      }
      if (!lowerClean.includes('try') || !lowerClean.includes('catch')) {
        throw new Error("A função 'fetchData' deve conter tratamento de erros com bloco try/catch.");
      }

      const fnWrapper = new Function('fetch', 'console', `
        ${rawClean};
        if (typeof fetchData === 'function') return fetchData;
        throw new Error("A função 'fetchData' não foi declarada.");
      `);

      const mockConsole = { error: () => {}, warn: () => {}, log: () => {} };
      const mockSuccessFetch = async () => ({
        json: async () => ({ data: 'ok' })
      });
      const fnSuccess = fnWrapper(mockSuccessFetch, mockConsole);
      const successRes = await fnSuccess('https://api.test/resource');
      if (!successRes || successRes.data !== 'ok') {
        throw new Error("fetchData deve retornar os dados convertidos do JSON em caso de sucesso.");
      }

      const mockFailFetch = async () => {
        throw new Error("Erro de rede simulado");
      };
      const fnFail = fnWrapper(mockFailFetch, mockConsole);
      const failRes = await fnFail('https://api.test/resource');
      if (failRes !== null) {
        throw new Error("fetchData deve capturar o erro com try/catch e retornar null.");
      }
      return true;
    }

    // ex-async-03: sleep(ms) retornando Promise resolvida
    if (exId === 'ex-async-03' || rawClean.includes('sleep')) {
      const fnWrapper = new Function(`
        ${rawClean};
        if (typeof sleep === 'function') return sleep;
        throw new Error("A função 'sleep' não foi declarada.");
      `);
      const fn = fnWrapper();
      const p = fn(15);
      if (!p || typeof p.then !== 'function') {
        throw new Error("A função 'sleep' deve retornar uma Promise.");
      }
      let resolved = false;
      await Promise.race([
        p.then(() => { resolved = true; }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: a Promise retornada por sleep não foi resolvida dentro do prazo esperado.")), 500))
      ]);
      if (!resolved) {
        throw new Error("A Promise retornada por sleep não completou sua resolução.");
      }
      return true;
    }

    // Fallback genérico para outros code challenges
    const fnWrapper = new Function(`${rawClean}`);
    fnWrapper();
    return true;
  }

  // 5.2 POST /api/exercises/:id/submit
  router.post('/exercises/:id/submit', async (req, res) => {
    try {
      const db = getDb();
      const exerciseId = req.params.id;
      const userId = req.body.userId || DEFAULT_USER_ID;
      const studentAnswer = req.body.studentAnswer;

      const exercise = db.prepare('SELECT * FROM lesson_exercises WHERE id = ?').get(exerciseId);
      if (!exercise) {
        return res.status(404).json({ error: 'Exercício não encontrado' });
      }

      let isCorrect = false;
      let executionFeedback = null;
      const studentAnswerTrimmed = String(studentAnswer || '').trim();

      if (exercise.type === 'MULTIPLE_CHOICE' || exercise.type === 'OUTPUT_PREDICTION') {
        isCorrect = studentAnswerTrimmed.toUpperCase() === String(exercise.correct_answer || '').trim().toUpperCase();
        if (!isCorrect) {
          executionFeedback = 'Resposta incorreta. Revise o material da aula e tente novamente.';
        }
      } else if (exercise.type === 'CODE_CHALLENGE') {
        try {
          await runWithTimeout(async () => {
            await evaluateCodeChallenge(exercise, studentAnswerTrimmed);
          }, 1500);
          isCorrect = true;
        } catch (err) {
          isCorrect = false;
          executionFeedback = `Falha na validação do código: ${err.message}`;
        }
      }

      // Registro APPEND-ONLY na tabela lesson_exercise_submissions
      const submissionId = `exsub-${crypto.randomUUID()}`;
      const submittedAt = new Date().toISOString();

      db.prepare(`
        INSERT INTO lesson_exercise_submissions (id, user_id, exercise_id, lesson_id, student_answer, is_correct, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(submissionId, userId, exercise.id, exercise.lesson_id, studentAnswerTrimmed, isCorrect ? 1 : 0, submittedAt);

      // Persistência Dual: registrar em professor/aluno/exercicios_fixacao.json
      try {
        fileSync.syncExerciseSubmitted({
          submission_id: submissionId,
          user_id: userId,
          exercise_id: exercise.id,
          lesson_id: exercise.lesson_id,
          student_answer: studentAnswerTrimmed,
          is_correct: isCorrect ? 1 : 0,
          submitted_at: submittedAt
        });
      } catch (fileErr) {
        console.error('Erro ao sincronizar exercício no arquivo:', fileErr.message);
      }

      // Calcular totalCount e completedCount para a aula do exercício
      const aliasLessonId = LESSON_ALIASES[exercise.lesson_id] || exercise.lesson_id;
      const allExercisesOfLesson = db.prepare(`
        SELECT id FROM lesson_exercises
        WHERE lesson_id = ? OR lesson_id = ?
      `).all(exercise.lesson_id, aliasLessonId);

      const totalCount = allExercisesOfLesson.length;
      const exerciseIds = allExercisesOfLesson.map(e => e.id);

      let completedCount = 0;
      if (exerciseIds.length > 0) {
        const placeholders = exerciseIds.map(() => '?').join(',');
        const distinctCorrect = db.prepare(`
          SELECT COUNT(DISTINCT exercise_id) as count
          FROM lesson_exercise_submissions
          WHERE user_id = ? AND is_correct = 1 AND exercise_id IN (${placeholders})
        `).get(userId, ...exerciseIds);
        completedCount = Number(distinctCorrect.count) || 0;
      }

      const allCompleted = totalCount > 0 && completedCount >= totalCount;

      res.json({
        isCorrect,
        explanation: isCorrect ? exercise.explanation : (exercise.type === 'CODE_CHALLENGE' && executionFeedback ? executionFeedback : exercise.explanation),
        correctAnswer: exercise.correct_answer,
        completedCount,
        totalCount,
        allCompleted
      });
    } catch (err) {
      console.error(`Erro em POST /api/exercises/${req.params.id}/submit:`, err);
      res.status(500).json({ error: 'Erro ao submeter resposta do exercício', details: err.message });
    }
  });

  // 6. GET /api/assessments/pending-grading (DEVE VIR ANTES DE /:id para evitar colisão de rota)
  router.get('/assessments/pending-grading', (req, res) => {
    try {
      const db = getDb();
      const attempts = db.prepare(`
        SELECT att.id, att.student_id, att.assessment_id, att.started_at, att.completed_at, att.score, att.max_score, att.status,
               ass.title as assessment_title, ass.type as assessment_type,
               s.id as subject_id, s.title as subject_title,
               (SELECT COUNT(*) FROM answers WHERE attempt_id = att.id) as answers_count
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        JOIN subjects s ON ass.subject_id = s.id
        WHERE att.status = 'SUBMITTED'
        ORDER BY att.completed_at ASC
      `).all();

      res.json(attempts);
    } catch (err) {
      console.error('Erro em GET /api/assessments/pending-grading:', err);
      res.status(500).json({ error: 'Erro ao listar tentativas pendentes de correção', details: err.message });
    }
  });

  // 7. GET /api/assessments/:id (SEGURO: NUNCA expor correct_answer, rubric ou explanation)
  router.get('/assessments/:id', (req, res) => {
    try {
      const db = getDb();
      const assessmentId = req.params.id;

      const assessment = db.prepare(`
        SELECT id, subject_id, title, description, type, passing_score, max_score, time_limit_minutes, status
        FROM assessments
        WHERE id = ? OR LOWER(id) = LOWER(?)
      `).get(assessmentId, assessmentId);

      if (!assessment) {
        return res.status(404).json({ error: 'Avaliação não encontrada' });
      }

      // CRÍTICO: Selecionar apenas campos sanitizados. NUNCA correct_answer, rubric ou explanation!
      const questions = db.prepare(`
        SELECT id, assessment_id, type, prompt_markdown, options_json, points, order_index
        FROM questions
        WHERE assessment_id = ?
        ORDER BY order_index ASC
      `).all(assessment.id);

      const sanitizedQuestions = questions.map(q => {
        let options = null;
        if (q.options_json) {
          try {
            options = JSON.parse(q.options_json);
          } catch (_) {
            options = null;
          }
        }
        return {
          id: q.id,
          assessment_id: q.assessment_id,
          type: q.type,
          prompt_markdown: q.prompt_markdown,
          options,
          points: Number(q.points),
          order_index: q.order_index
        };
      });

      res.json({
        ...assessment,
        questions: sanitizedQuestions
      });
    } catch (err) {
      console.error(`Erro em GET /api/assessments/${req.params.id}:`, err);
      res.status(500).json({ error: 'Erro ao carregar avaliação', details: err.message });
    }
  });

  // 7. POST /api/assessments/:id/attempt (APPEND-ONLY & Correção)
  router.post('/assessments/:id/attempt', (req, res) => {
    try {
      const db = getDb();
      const assessmentId = req.params.id;
      const studentId = req.body.studentId || req.body.userId || DEFAULT_USER_ID;
      const studentAnswers = req.body.answers || {};

      const assessment = db.prepare(`
        SELECT id, title, type, passing_score, max_score
        FROM assessments
        WHERE id = ? OR LOWER(id) = LOWER(?)
      `).get(assessmentId, assessmentId);

      if (!assessment) {
        return res.status(404).json({ error: 'Avaliação não encontrada' });
      }

      // Buscar questões com os dados oficiais de correção
      const questions = db.prepare(`
        SELECT id, type, prompt_markdown, correct_answer, rubric, explanation, points, order_index
        FROM questions
        WHERE assessment_id = ?
        ORDER BY order_index ASC
      `).all(assessment.id);

      const attemptId = `att-${crypto.randomUUID()}`;
      const startedAt = req.body.startedAt || new Date().toISOString();
      const completedAt = new Date().toISOString();

      let totalEarnedScore = 0;
      let totalPossibleScore = 0;
      const evaluatedAnswers = [];
      let hasPendingQuestions = false;

      for (const q of questions) {
        const points = Number(q.points) || 0;
        totalPossibleScore += points;

        const rawStudentAnswer = studentAnswers[q.id];
        const studentAnswerStr = rawStudentAnswer !== undefined && rawStudentAnswer !== null
          ? String(rawStudentAnswer).trim()
          : '';

        let earnedScore = 0;
        let feedback = '';
        let isPending = false;

        if (q.type === 'MULTIPLE_CHOICE') {
          const isCorrect = studentAnswerStr.toUpperCase() === String(q.correct_answer).trim().toUpperCase();
          if (isCorrect) {
            earnedScore = points;
            feedback = `Correto! (+${points} pts). ${q.explanation || ''}`;
          } else {
            earnedScore = 0;
            feedback = `Incorreto. A resposta correta era: ${q.correct_answer}. ${q.explanation || ''}`;
          }
          isPending = false;
        } else {
          // OPEN_QUESTION, CODE_ANALYSIS, CODE_ESSAY, SHORT_ANSWER
          // NUNCA atribuir pontuação automática na submissão, independentemente do tipo da avaliação (DIAGNOSTIC, FORMATIVE ou SUMMATIVE)
          earnedScore = 0;
          isPending = true;
          hasPendingQuestions = true;
          feedback = 'Sua resposta foi registrada com sucesso e está em espera para avaliação pelo agente pedagógico baseada na rubrica acadêmica.';
        }

        totalEarnedScore += earnedScore;

        evaluatedAnswers.push({
          question_id: q.id,
          prompt_markdown: q.prompt_markdown,
          type: q.type,
          student_answer: studentAnswerStr,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          rubric: q.rubric,
          score: earnedScore,
          max_score: points,
          feedback,
          is_pending: isPending,
          status: isPending ? 'PENDING_EVALUATION' : 'GRADED'
        });
      }

      // Se a avaliação contiver qualquer questão aberta/código aguardando correção, o status da tentativa DEVE ser SUBMITTED
      const attemptStatus = hasPendingQuestions ? 'SUBMITTED' : 'GRADED';

      // Inserir tentativa em attempts PRIMEIRO (APPEND-ONLY) para satisfazer Foreign Key
      const insertAttempt = db.prepare(`
        INSERT INTO attempts (id, student_id, assessment_id, started_at, completed_at, score, max_score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertAttempt.run(
        attemptId,
        studentId,
        assessment.id,
        startedAt,
        completedAt,
        totalEarnedScore,
        totalPossibleScore,
        attemptStatus
      );

      // Agora inserir respostas em answers referenciando attemptId
      const insertAnswer = db.prepare(`
        INSERT INTO answers (id, attempt_id, question_id, student_answer, score, feedback, is_pending)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ans of evaluatedAnswers) {
        const answerId = `ans-${crypto.randomUUID()}`;
        insertAnswer.run(
          answerId,
          attemptId,
          ans.question_id,
          ans.student_answer,
          ans.score,
          ans.feedback,
          ans.is_pending ? 1 : 0
        );
      }

      // Persistência Dual: sincronizar com arquivos de texto (.json, .md e historico_avaliacoes.md)
      try {
        fileSync.syncAttemptSubmitted({
          attempt: {
            id: attemptId,
            student_id: studentId,
            assessment_id: assessment.id,
            started_at: startedAt,
            completed_at: completedAt,
            score: totalEarnedScore,
            max_score: totalPossibleScore,
            status: attemptStatus
          },
          answers: evaluatedAnswers,
          assessment: {
            id: assessment.id,
            title: assessment.title,
            type: assessment.type,
            passing_score: Number(assessment.passing_score),
            max_score: Number(assessment.max_score)
          }
        });
      } catch (syncErr) {
        console.error('Erro ao sincronizar tentativa nos arquivos:', syncErr.message);
      }

      const percentage = totalPossibleScore > 0
        ? Math.round((totalEarnedScore / totalPossibleScore) * 100)
        : 0;

      const passed = attemptStatus === 'GRADED'
        ? totalEarnedScore >= Number(assessment.passing_score)
        : false;

      res.status(201).json({
        attempt_id: attemptId,
        assessment_id: assessmentId,
        assessment_title: assessment.title,
        assessment_type: assessment.type,
        student_id: studentId,
        started_at: startedAt,
        completed_at: completedAt,
        score: totalEarnedScore,
        max_score: totalPossibleScore,
        percentage,
        passed,
        passing_score: Number(assessment.passing_score),
        status: attemptStatus,
        answers: evaluatedAnswers
      });
    } catch (err) {
      console.error(`Erro em POST /api/assessments/${req.params.id}/attempt:`, err);
      res.status(500).json({ error: 'Erro ao processar tentativa de avaliação', details: err.message });
    }
  });

  // 8. GET /api/attempts
  router.get('/attempts', (req, res) => {
    try {
      const db = getDb();
      const studentId = req.query.studentId || req.query.userId || DEFAULT_USER_ID;

      const attempts = db.prepare(`
        SELECT att.id, att.assessment_id, att.started_at, att.completed_at, att.score, att.max_score, att.status,
               ass.title as assessment_title, ass.type as assessment_type, ass.passing_score,
               s.title as subject_title, s.id as subject_id
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        JOIN subjects s ON ass.subject_id = s.id
        WHERE att.student_id = ?
        ORDER BY att.started_at DESC
      `).all(studentId);

      const formatted = attempts.map(a => {
        const score = Number(a.score) || 0;
        const maxScore = Number(a.max_score) || 100;
        const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
        return {
          id: a.id,
          assessment_id: a.assessment_id,
          assessment_title: a.assessment_title,
          assessment_type: a.assessment_type,
          subject_id: a.subject_id,
          subject_title: a.subject_title,
          started_at: a.started_at,
          completed_at: a.completed_at,
          score,
          max_score: maxScore,
          percentage,
          passed: score >= Number(a.passing_score),
          status: a.status
        };
      });

      res.json(formatted);
    } catch (err) {
      console.error('Erro em GET /api/attempts:', err);
      res.status(500).json({ error: 'Erro ao buscar histórico de tentativas', details: err.message });
    }
  });

  // 9. GET /api/attempts/:id
  router.get('/attempts/:id', (req, res) => {
    try {
      const db = getDb();
      const attemptId = req.params.id;

      const attempt = db.prepare(`
        SELECT att.id, att.student_id, att.assessment_id, att.started_at, att.completed_at, att.score, att.max_score, att.status,
               ass.title as assessment_title, ass.type as assessment_type, ass.passing_score,
               s.id as subject_id, s.title as subject_title
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        JOIN subjects s ON ass.subject_id = s.id
        WHERE att.id = ?
      `).get(attemptId);

      if (!attempt) {
        return res.status(404).json({ error: 'Tentativa não encontrada' });
      }

      const answers = db.prepare(`
        SELECT ans.id, ans.question_id, ans.student_answer, ans.score, ans.feedback, ans.is_pending,
               q.prompt_markdown, q.type as question_type, q.points, q.order_index, q.correct_answer, q.explanation, q.rubric
        FROM answers ans
        JOIN questions q ON ans.question_id = q.id
        WHERE ans.attempt_id = ?
        ORDER BY q.order_index ASC
      `).all(attemptId);

      const score = Number(attempt.score) || 0;
      const maxScore = Number(attempt.max_score) || 100;
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

      res.json({
        id: attempt.id,
        student_id: attempt.student_id,
        assessment_id: attempt.assessment_id,
        assessment_title: attempt.assessment_title,
        assessment_type: attempt.assessment_type,
        subject_id: attempt.subject_id,
        subject_title: attempt.subject_title,
        started_at: attempt.started_at,
        completed_at: attempt.completed_at,
        score,
        max_score: maxScore,
        percentage,
        passed: score >= Number(attempt.passing_score),
        status: attempt.status,
        answers: answers.map(a => {
          const isPending = a.is_pending === 1 || Boolean(a.is_pending) || (attempt.status === 'SUBMITTED' && a.question_type !== 'MULTIPLE_CHOICE');
          return {
            id: a.id,
            question_id: a.question_id,
            question_type: a.question_type,
            type: a.question_type,
            prompt_markdown: a.prompt_markdown,
            student_answer: a.student_answer,
            correct_answer: a.correct_answer,
            explanation: a.explanation,
            rubric: a.rubric,
            score: Number(a.score),
            max_score: Number(a.points),
            feedback: a.feedback,
            is_pending: isPending,
            status: isPending ? 'PENDING_EVALUATION' : 'GRADED'
          };
        })
      });
    } catch (err) {
      console.error(`Erro em GET /api/attempts/${req.params.id}:`, err);
      res.status(500).json({ error: 'Erro ao buscar detalhes da tentativa', details: err.message });
    }
  });

  // 11. POST /api/assessments/attempts/:id/grade
  router.post('/assessments/attempts/:id/grade', (req, res) => {
    try {
      const db = getDb();
      const attemptId = req.params.id;
      const { grades } = req.body;

      if (!grades || !Array.isArray(grades)) {
        return res.status(400).json({ error: 'grades deve ser um array contendo { question_id, score, feedback }' });
      }

      const attempt = db.prepare(`
        SELECT att.*, ass.subject_id
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        WHERE att.id = ?
      `).get(attemptId);

      if (!attempt) {
        return res.status(404).json({ error: 'Tentativa não encontrada' });
      }

      const updateAnswer = db.prepare(`
        UPDATE answers
        SET score = ?, feedback = ?, is_pending = 0
        WHERE attempt_id = ? AND question_id = ?
      `);

      const upsertMastery = db.prepare(`
        INSERT INTO topic_mastery (id, user_id, subject_id, topic_id, mastery_score, status, last_assessed_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, subject_id, topic_id) DO UPDATE SET
          mastery_score = excluded.mastery_score,
          status = excluded.status,
          last_assessed_at = datetime('now')
      `);

      for (const item of grades) {
        const itemScore = Number(item.score) || 0;
        const feedback = item.feedback || '';
        updateAnswer.run(itemScore, feedback, attemptId, item.question_id);

        const question = db.prepare('SELECT points FROM questions WHERE id = ?').get(item.question_id);
        const maxPoints = question ? Number(question.points) : 10;
        const percentage = maxPoints > 0 ? (itemScore / maxPoints) * 100 : 0;
        let status = 'REVIEW_REQUIRED';
        if (percentage >= 70) status = 'MASTERED';
        else if (percentage >= 50) status = 'PRACTICING';

        upsertMastery.run(
          `top-${crypto.randomUUID()}`,
          attempt.student_id,
          attempt.subject_id,
          item.question_id,
          itemScore,
          status
        );
      }

      // Recalcular soma total das respostas da tentativa
      const totalQuery = db.prepare(`
        SELECT COALESCE(SUM(score), 0) as total_score
        FROM answers
        WHERE attempt_id = ?
      `).get(attemptId);

      const newTotalScore = Number(totalQuery.total_score);
      const maxScore = Number(attempt.max_score) || 100;
      const finalGrade10 = maxScore > 0 ? Number(((newTotalScore / maxScore) * 10).toFixed(1)) : 0;

      // Atualiza tentativa para GRADED
      db.prepare(`
        UPDATE attempts
        SET score = ?, status = 'GRADED'
        WHERE id = ?
      `).run(newTotalScore, attemptId);

      // Persistência Dual: sincronizar arquivos de texto (.json, .md, historico, progresso e perfil)
      try {
        fileSync.syncAttemptGraded(attemptId, db);
      } catch (syncErr) {
        console.error('Erro ao sincronizar correção nos arquivos:', syncErr.message);
      }

      res.json({
        message: 'Avaliação corrigida com sucesso',
        attempt_id: attemptId,
        score: newTotalScore,
        max_score: maxScore,
        final_grade: finalGrade10,
        status: 'GRADED'
      });
    } catch (err) {
      console.error(`Erro em POST /api/assessments/attempts/${req.params.id}/grade:`, err);
      res.status(500).json({ error: 'Erro ao registrar correção por rubrica', details: err.message });
    }
  });

  // 12. GET /api/srs/due
  router.get('/srs/due', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;
      const todayStr = new Date().toISOString().split('T')[0];

      const cards = db.prepare(`
        SELECT id, user_id, subject_id, topic_id, card_title, prompt_front, answer_back,
               repetition, interval_days, ease_factor, due_date, last_reviewed_at, status
        FROM spaced_reviews
        WHERE user_id = ? AND due_date <= ?
        ORDER BY due_date ASC
      `).all(userId, todayStr);

      res.json({
        user_id: userId,
        today: todayStr,
        count: cards.length,
        cards
      });
    } catch (err) {
      console.error('Erro em GET /api/srs/due:', err);
      res.status(500).json({ error: 'Erro ao buscar revisões pendentes', details: err.message });
    }
  });

  // 13. POST /api/srs/review
  router.post('/srs/review', (req, res) => {
    try {
      const db = getDb();
      const { card_id, rating } = req.body;
      const userId = req.body.userId || DEFAULT_USER_ID;

      if (!card_id || rating === undefined) {
        return res.status(400).json({ error: 'card_id e rating (0 a 3) são obrigatórios' });
      }

      const q = Number(rating);
      if (![0, 1, 2, 3].includes(q)) {
        return res.status(400).json({ error: 'rating deve ser 0 (Errei), 1 (Difícil), 2 (Bom) ou 3 (Fácil)' });
      }

      const card = db.prepare(`
        SELECT * FROM spaced_reviews WHERE id = ?
      `).get(card_id);

      if (!card) {
        return res.status(404).json({ error: 'Card de revisão não encontrado' });
      }

      let repetition = Number(card.repetition) || 0;
      let interval = Number(card.interval_days) || 1;
      let easeFactor = Number(card.ease_factor) || 2.5;

      if (q === 0) {
        repetition = 0;
        interval = 1;
        easeFactor = Math.max(1.3, easeFactor - 0.2);
      } else {
        if (repetition === 0) {
          interval = 1;
        } else if (repetition === 1) {
          interval = 3;
        } else {
          interval = Math.round(interval * easeFactor);
        }
        const delta = 0.1 - (3 - q) * (0.08 + (3 - q) * 0.02);
        easeFactor = Math.max(1.3, easeFactor + delta);
        repetition += 1;
      }

      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + interval);
      const dueDateStr = nextDue.toISOString().split('T')[0];

      let status = 'PRACTICING';
      if (q === 0) {
        status = 'REVIEW_REQUIRED';
      } else if (repetition >= 4 && interval >= 14) {
        status = 'MASTERED';
      }

      db.prepare(`
        UPDATE spaced_reviews
        SET repetition = ?, interval_days = ?, ease_factor = ?, due_date = ?, last_reviewed_at = datetime('now'), status = ?
        WHERE id = ?
      `).run(repetition, interval, Number(easeFactor.toFixed(2)), dueDateStr, status, card_id);

      db.prepare(`
        INSERT INTO topic_mastery (id, user_id, subject_id, topic_id, mastery_score, status, last_assessed_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, subject_id, topic_id) DO UPDATE SET
          mastery_score = excluded.mastery_score,
          status = excluded.status,
          last_assessed_at = datetime('now')
      `).run(
        `top-${crypto.randomUUID()}`,
        card.user_id,
        card.subject_id,
        card.topic_id,
        status === 'MASTERED' ? 100 : status === 'PRACTICING' ? 70 : 30,
        status
      );

      const updatedCard = db.prepare('SELECT * FROM spaced_reviews WHERE id = ?').get(card_id);

      res.json({
        message: 'Revisão registrada com sucesso',
        card: updatedCard
      });
    } catch (err) {
      console.error('Erro em POST /api/srs/review:', err);
      res.status(500).json({ error: 'Erro ao processar revisão SRS', details: err.message });
    }
  });

  // 14. GET /api/certificates/eligibility
  router.get('/certificates/eligibility', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;
      const subjectId = req.query.subjectId || 'javascript-avancado';

      const subject = db.prepare('SELECT id, title FROM subjects WHERE id = ?').get(subjectId);
      if (!subject) {
        return res.status(404).json({ error: 'Matéria não encontrada' });
      }

      const totalLessonsQ = db.prepare(`
        SELECT COUNT(*) as count
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        WHERE m.subject_id = ?
      `).get(subjectId);

      const completedLessonsQ = db.prepare(`
        SELECT COUNT(*) as count
        FROM user_progress up
        JOIN lessons l ON up.entity_id = l.id
        JOIN modules m ON l.module_id = m.id
        WHERE m.subject_id = ? AND up.user_id = ? AND up.status = 'COMPLETED'
      `).get(subjectId, userId);

      const totalLessons = Number(totalLessonsQ.count) || 0;
      const completedLessons = Number(completedLessonsQ.count) || 0;
      const lessonsCompleted = totalLessons > 0 && completedLessons === totalLessons;

      const summativeAttempts = db.prepare(`
        SELECT att.score, att.max_score
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        WHERE ass.subject_id = ? AND att.student_id = ? AND ass.type = 'SUMMATIVE' AND att.status = 'GRADED'
      `).all(subjectId, userId);

      let examAverage = 0;
      let examsPassed = false;

      if (summativeAttempts.length > 0) {
        const grades = summativeAttempts.map(a => {
          const maxS = Number(a.max_score) || 100;
          return maxS > 0 ? (Number(a.score) / maxS) * 10 : 0;
        });
        const sum = grades.reduce((acc, val) => acc + val, 0);
        examAverage = Number((sum / grades.length).toFixed(1));
        examsPassed = examAverage >= 6.0;
      }

      const reasons = [];
      if (!lessonsCompleted) {
        reasons.push(`Todas as aulas da matéria devem estar concluídas (${completedLessons}/${totalLessons} concluídas)`);
      }
      if (summativeAttempts.length === 0) {
        reasons.push('É necessário ter ao menos uma avaliação somativa oficial avaliada e com nota');
      } else if (!examsPassed) {
        reasons.push(`Média final das provas somativas (${examAverage}) deve ser >= 6.0`);
      }

      const eligible = lessonsCompleted && examsPassed;

      const existingCert = db.prepare(`
        SELECT * FROM certificates WHERE user_id = ? AND subject_id = ?
      `).get(userId, subjectId);

      res.json({
        eligible,
        reasons,
        subject: { id: subject.id, title: subject.title },
        lessons_progress: {
          total: totalLessons,
          completed: completedLessons,
          percentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
        },
        exam_average: examAverage,
        existing_certificate: existingCert || null
      });
    } catch (err) {
      console.error('Erro em GET /api/certificates/eligibility:', err);
      res.status(500).json({ error: 'Erro ao verificar elegibilidade de certificado', details: err.message });
    }
  });

  // 15. POST /api/certificates/generate
  router.post('/certificates/generate', (req, res) => {
    try {
      const db = getDb();
      const userId = req.body.userId || DEFAULT_USER_ID;
      const subjectId = req.body.subject_id || 'javascript-avancado';
      const studentName = (req.body.student_name || 'Aluno').trim();

      const subject = db.prepare('SELECT id, title FROM subjects WHERE id = ?').get(subjectId);
      if (!subject) {
        return res.status(404).json({ error: 'Matéria não encontrada' });
      }

      const totalLessonsQ = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(estimated_minutes), 0) as total_minutes
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        WHERE m.subject_id = ?
      `).get(subjectId);

      const completedLessonsQ = db.prepare(`
        SELECT COUNT(*) as count
        FROM user_progress up
        JOIN lessons l ON up.entity_id = l.id
        JOIN modules m ON l.module_id = m.id
        WHERE m.subject_id = ? AND up.user_id = ? AND up.status = 'COMPLETED'
      `).get(subjectId, userId);

      const totalLessons = Number(totalLessonsQ.count) || 0;
      const completedLessons = Number(completedLessonsQ.count) || 0;
      const totalMinutes = Number(totalLessonsQ.total_minutes) || 0;

      const summativeAttempts = db.prepare(`
        SELECT att.score, att.max_score
        FROM attempts att
        JOIN assessments ass ON att.assessment_id = ass.id
        WHERE ass.subject_id = ? AND att.student_id = ? AND ass.type = 'SUMMATIVE' AND att.status = 'GRADED'
      `).all(subjectId, userId);

      const reasons = [];
      if (totalLessons === 0 || completedLessons < totalLessons) {
        reasons.push(`Todas as aulas devem estar concluídas (${completedLessons}/${totalLessons})`);
      }

      let examAverage = 0;
      if (summativeAttempts.length === 0) {
        reasons.push('Nenhuma avaliação somativa corrigida encontrada');
      } else {
        const grades = summativeAttempts.map(a => {
          const maxS = Number(a.max_score) || 100;
          return maxS > 0 ? (Number(a.score) / maxS) * 10 : 0;
        });
        const sum = grades.reduce((acc, val) => acc + val, 0);
        examAverage = Number((sum / grades.length).toFixed(1));
        if (examAverage < 6.0) {
          reasons.push(`Média final (${examAverage}) abaixo do mínimo exigido (6.0)`);
        }
      }

      if (reasons.length > 0) {
        return res.status(400).json({
          error: 'Aluno não elegível para emissão de certificado',
          reasons
        });
      }

      const existingCert = db.prepare(`
        SELECT * FROM certificates WHERE user_id = ? AND subject_id = ?
      `).get(userId, subjectId);

      if (existingCert) {
        return res.status(200).json({
          message: 'Certificado já emitido anteriormente',
          certificate: existingCert
        });
      }

      const hoursEstimate = Math.max(40, Math.ceil(totalMinutes / 60) + 20);
      const certId = `cert-${crypto.randomUUID()}`;
      const verificationCode = `CERT-JS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const completionDate = new Date().toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO certificates (
          id, user_id, subject_id, student_name, subject_title,
          final_grade, completion_date, verification_code, hours_estimate, issued_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        certId,
        userId,
        subjectId,
        studentName,
        subject.title,
        examAverage,
        completionDate,
        verificationCode,
        hoursEstimate
      );

      const createdCert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(certId);

      // Persistência Dual: salvar certificado em arquivos .json e .md
      try {
        fileSync.syncCertificateGenerated(createdCert);
      } catch (syncErr) {
        console.error('Erro ao sincronizar certificado nos arquivos:', syncErr.message);
      }

      res.status(201).json({
        message: 'Certificado emitido com sucesso',
        certificate: createdCert
      });
    } catch (err) {
      console.error('Erro em POST /api/certificates/generate:', err);
      res.status(500).json({ error: 'Erro ao gerar certificado', details: err.message });
    }
  });

  // 16. GET /api/certificates
  router.get('/certificates', (req, res) => {
    try {
      const db = getDb();
      const userId = req.query.userId || DEFAULT_USER_ID;

      const certs = db.prepare(`
        SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC
      `).all(userId);

      res.json(certs);
    } catch (err) {
      console.error('Erro em GET /api/certificates:', err);
      res.status(500).json({ error: 'Erro ao listar certificados', details: err.message });
    }
  });

  // 17. GET /api/certificates/:id
  router.get('/certificates/:id', (req, res) => {
    try {
      const db = getDb();
      const idOrCode = req.params.id;

      const cert = db.prepare(`
        SELECT * FROM certificates WHERE id = ? OR verification_code = ?
      `).get(idOrCode, idOrCode);

      if (!cert) {
        return res.status(404).json({ error: 'Certificado não encontrado' });
      }

      res.json(cert);
    } catch (err) {
      console.error(`Erro em GET /api/certificates/${req.params.id}:`, err);
      res.status(500).json({ error: 'Erro ao buscar certificado', details: err.message });
    }
  });

  return router;
}

module.exports = { createApiRouter };
