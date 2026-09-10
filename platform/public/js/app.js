/**
 * Aplicação Principal da Plataforma Acadêmica
 * Roteamento SPA reativo, renderização dinâmica e gerenciamento de estado
 */

import { initTheme } from './theme.js';
import { renderMarkdown, attachCopyCodeListeners, escapeHtml } from './markdown.js';
import { CodeEditor } from './code-editor.js';

const appContainer = document.getElementById('app');
const toastContainer = document.getElementById('toastContainer');

function showToast(message, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function updateActiveNav(routeName) {
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
    if (link.getAttribute('data-route') === routeName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function setFocusMode(enabled) {
  if (enabled) {
    document.body.classList.add('focus-mode');
  } else {
    document.body.classList.remove('focus-mode');
  }
}

// --------------------------------------------------------------------------
// VISÃO: DASHBOARD
// --------------------------------------------------------------------------
async function renderDashboard() {
  setFocusMode(false);
  updateActiveNav('dashboard');
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando seu painel acadêmico...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error('Falha ao carregar dashboard');
    const data = await res.json();

    let srsDueCount = 0;
    try {
      const srsRes = await fetch('/api/srs/due');
      if (srsRes.ok) {
        const srsData = await srsRes.json();
        srsDueCount = srsData.count || 0;
      }
    } catch (_) {}

    const continueCardHtml = data.continue_studying ? `
      <section class="card hero-card" aria-labelledby="continueHeading">
        <span class="hero-badge">Continuar Estudando</span>
        <h2 id="continueHeading" class="hero-title">${data.continue_studying.lesson_title}</h2>
        <p class="hero-desc">
          Matéria: <strong>${data.continue_studying.subject_title}</strong> • ${data.continue_studying.module_title}
        </p>
        <div style="margin-top: 0.5rem;">
          <a href="#/lesson/${data.continue_studying.lesson_id}" class="btn btn-primary">
            Retomar Aula →
          </a>
        </div>
      </section>
    ` : `
      <section class="card hero-card">
        <span class="hero-badge">Primeiros Passos</span>
        <h2 class="hero-title">Bem-vindo à Plataforma Educacional</h2>
        <p class="hero-desc">Explore as matérias disponíveis e comece sua jornada de aprendizado estruturado.</p>
        <div>
          <a href="#/subjects" class="btn btn-primary">Ver Matérias Disponíveis →</a>
        </div>
      </section>
    `;

    const srsWidgetHtml = `
      <section class="card" style="border-left: 4px solid var(--primary); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.06em; margin-bottom: 0.25rem;">
            🧠 Revisão Espaçada (SRS - SM-2)
          </div>
          <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0 0 0.25rem 0;">
            ${srsDueCount > 0 ? `Você tem <span style="color: var(--primary); font-weight: 800;">${srsDueCount}</span> flashcard${srsDueCount > 1 ? 's' : ''} para revisar hoje!` : 'Parabéns! Todas as revisões de hoje estão em dia.'}
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">
            Algoritmo SM-2 ativo para consolidar arquitetura e conceitos na memória de longo prazo.
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <a href="#/srs" class="btn ${srsDueCount > 0 ? 'btn-primary' : 'btn-secondary'}">
            ${srsDueCount > 0 ? 'Iniciar Revisão →' : 'Revisar Flashcards →'}
          </a>
          <a href="#/playground" class="btn btn-secondary">
            ⚡ Playground
          </a>
        </div>
      </section>
    `;

    const statsHtml = `
      <div class="stats-bar" aria-label="Estatísticas Gerais">
        <div class="stat-box">
          <div class="stat-value">${data.overall_stats.overall_percentage}%</div>
          <div class="stat-label">Progresso Geral</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${data.overall_stats.completed_lessons} / ${data.overall_stats.total_lessons}</div>
          <div class="stat-label">Aulas Concluídas</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${data.overall_stats.total_attempts}</div>
          <div class="stat-label">Avaliações Realizadas</div>
        </div>
      </div>
    `;

    const subjectsHtml = data.subjects.map(s => `
      <article class="card subject-card">
        <div>
          <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem;">${s.title}</h3>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">${s.description}</p>
        </div>
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.25rem;">
            <span>Progresso</span>
            <span><strong>${s.progress_percentage}%</strong> (${s.completed_lessons}/${s.total_lessons} aulas)</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${s.progress_percentage}%;"></div>
          </div>
          <div style="margin-top: 1rem;">
            <a href="#/subject/${s.id}" class="btn btn-secondary btn-block">Acessar Ementa e Módulos</a>
          </div>
        </div>
      </article>
    `).join('');

    const recentAttemptsHtml = data.recent_attempts.length > 0 ? `
      <section class="card" style="margin-top: 2rem;">
        <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1rem;">Últimas Avaliações Realizadas</h3>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${data.recent_attempts.map(att => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background-color: var(--surface-muted); border-radius: var(--radius-sm);">
              <div>
                <strong>${att.assessment_title}</strong>
                <div style="font-size: 0.8125rem; color: var(--text-muted);">
                  Realizada em ${new Date(att.started_at).toLocaleDateString('pt-BR')} • Status: ${att.status}
                </div>
              </div>
              <div style="text-align: right;">
                <span style="font-weight: 700; color: ${att.score >= 70 ? 'var(--success)' : 'var(--warning)'};">
                  ${att.score} / ${att.max_score} pts
                </span>
                <div style="margin-top: 0.25rem;">
                  <a href="#/attempt/${att.id}" style="font-size: 0.8125rem; color: var(--primary); text-decoration: none;">Ver Gabarito & Detalhes →</a>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '';

    appContainer.innerHTML = `
      <div class="dashboard-grid">
        ${continueCardHtml}
        ${srsWidgetHtml}
        ${statsHtml}
        <section aria-labelledby="subjectsHeading">
          <h2 id="subjectsHeading" style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">Suas Disciplinas</h2>
          <div class="subject-grid">
            ${subjectsHtml}
          </div>
        </section>
        ${recentAttemptsHtml}
      </div>
    `;
  } catch (err) {
    appContainer.innerHTML = `
      <div class="card" style="border-color: var(--danger);">
        <h2>Erro ao carregar Dashboard</h2>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="window.location.reload()" style="margin-top: 1rem;">Tentar Novamente</button>
      </div>
    `;
  }
}

// --------------------------------------------------------------------------
// VISÃO: MATÉRIAS
// --------------------------------------------------------------------------
async function renderSubjects() {
  setFocusMode(false);
  updateActiveNav('subjects');
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando disciplinas...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/subjects');
    const subjects = await res.json();

    appContainer.innerHTML = `
      <div>
        <header style="margin-bottom: 2rem;">
          <h1 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 0.5rem;">Disciplinas Disponíveis</h1>
          <p style="color: var(--text-secondary);">Trilhas estruturadas focadas em domínio conceitual e autonomia prática.</p>
        </header>

        <div class="subject-grid">
          ${subjects.map(s => `
            <article class="card subject-card">
              <div>
                <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">${s.title}</h2>
                <p style="color: var(--text-secondary); font-size: 0.9375rem; margin-bottom: 1rem;">${s.description}</p>
                
                ${s.prerequisites.length > 0 ? `
                  <div style="margin-bottom: 1rem; font-size: 0.8125rem;">
                    <span style="font-weight: 600; color: var(--text-muted);">Pré-requisitos:</span>
                    <ul style="padding-left: 1.2rem; color: var(--text-secondary); margin-top: 0.25rem;">
                      ${s.prerequisites.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                  <span>Progresso da Disciplina</span>
                  <span><strong>${s.progress_percentage}%</strong> (${s.completed_lessons}/${s.total_lessons} aulas)</span>
                </div>
                <div class="progress-bar-container">
                  <div class="progress-bar-fill" style="width: ${s.progress_percentage}%;"></div>
                </div>
                <div style="margin-top: 1.25rem;">
                  <a href="#/subject/${s.id}" class="btn btn-primary btn-block">Acessar Conteúdo do Curso →</a>
                </div>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: DETALHES DA MATÉRIA
// --------------------------------------------------------------------------
async function renderSubjectDetail(subjectId) {
  setFocusMode(false);
  updateActiveNav('subjects');
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando plano de curso...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/subjects/${subjectId}`);
    if (!res.ok) throw new Error('Matéria não encontrada');
    const subject = await res.json();

    const modulesHtml = subject.modules.map(mod => `
      <section class="card" style="margin-bottom: 1.5rem;">
        <header style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
          <h3 style="font-size: 1.125rem; font-weight: 700; color: var(--text-primary);">${mod.title}</h3>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">${mod.objective}</p>
        </header>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${mod.lessons.length > 0 ? mod.lessons.map(lesson => {
            const statusIcon = lesson.status === 'COMPLETED' ? '✅' : (lesson.status === 'IN_PROGRESS' ? '⏳' : '⚪');
            const statusText = lesson.status === 'COMPLETED' ? 'Concluída' : (lesson.status === 'IN_PROGRESS' ? 'Em Andamento' : 'Não Iniciada');
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background-color: var(--surface);">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span title="${statusText}">${statusIcon}</span>
                    <a href="#/lesson/${lesson.id}" style="font-weight: 600; color: var(--text-primary); text-decoration: none;">
                      ${lesson.title}
                    </a>
                  </div>
                  <div style="font-size: 0.8125rem; color: var(--text-muted); margin-left: 1.5rem; margin-top: 0.2rem;">
                    Estimativa: ${lesson.estimated_minutes} min • ${lesson.lesson_type === 'THEORY' ? 'Teoria & Prática' : 'Laboratório'}
                  </div>
                </div>
                <div>
                  <a href="#/lesson/${lesson.id}" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8125rem; min-height: auto;">
                    ${lesson.status === 'COMPLETED' ? 'Revisar' : 'Estudar'}
                  </a>
                </div>
              </div>
            `;
          }).join('') : '<p style="color: var(--text-muted); font-size: 0.875rem;">Aulas em preparação pelo currículo.</p>'}
        </div>
      </section>
    `).join('');

    const assessmentsHtml = subject.assessments.length > 0 ? `
      <section class="card" style="margin-bottom: 2rem; border-color: var(--primary-border);">
        <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1rem;">Avaliações Vinculadas</h3>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${subject.assessments.map(a => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background-color: var(--surface-muted); border-radius: var(--radius-md);">
              <div>
                <span class="hero-badge" style="background-color: var(--info); font-size: 0.7rem;">${a.type}</span>
                <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.25rem;">${a.title}</h4>
                <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.2rem;">
                  ${a.description}
                </p>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                  ${a.question_count} questões • Tempo sugerido: ${a.time_limit_minutes} min • Nota de corte: ${a.passing_score} pts
                  ${a.attempts_count > 0 ? ` • <strong>${a.attempts_count} tentativa(s)</strong> (Melhor: ${a.best_score || 0} pts)` : ''}
                </div>
              </div>
              <div>
                <a href="#/assessment/${a.id}" class="btn btn-primary">
                  ${a.attempts_count > 0 ? 'Nova Tentativa' : 'Iniciar Avaliação'}
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '';

    const materialsHtml = subject.materials.length > 0 ? `
      <section class="card" style="margin-top: 2rem;">
        <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 0.75rem;">Materiais de Apoio Recomendados</h3>
        <ul style="padding-left: 1.25rem; color: var(--text-secondary); font-size: 0.875rem;">
          ${subject.materials.map(m => `
            <li style="margin-bottom: 0.5rem;">
              <a href="${m.url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-weight: 500;">
                ${m.title}
              </a>
              <span style="color: var(--text-muted);">(${m.resource_type})</span>
            </li>
          `).join('')}
        </ul>
      </section>
    ` : '';

    appContainer.innerHTML = `
      <div>
        <nav class="breadcrumb">
          <a href="#/subjects">← Voltar para Matérias</a>
        </nav>

        <header style="margin-bottom: 2rem;">
          <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 0.75rem;">${subject.title}</h1>
          <p style="font-size: 1.0625rem; color: var(--text-secondary); max-width: 80ch;">${subject.description}</p>
        </header>

        ${assessmentsHtml}

        <h2 style="font-size: 1.375rem; font-weight: 700; margin-bottom: 1rem;">Módulos do Curso</h2>
        ${modulesHtml}

        ${materialsHtml}
      </div>
    `;
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: AULA TEÓRICA
// --------------------------------------------------------------------------
async function renderLesson(lessonId) {
  setFocusMode(false);
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando aula e materiais...</p>
    </div>
  `;

  try {
    const [lessonRes, exercisesRes] = await Promise.all([
      fetch(`/api/lessons/${lessonId}`),
      fetch(`/api/lessons/${lessonId}/exercises`)
    ]);

    if (!lessonRes.ok) throw new Error('Aula não encontrada');
    const lesson = await lessonRes.json();
    const exercises = exercisesRes.ok ? await exercisesRes.json() : [];

    const markdownHtml = renderMarkdown(lesson.content_markdown);
    const isCompleted = lesson.status === 'COMPLETED';

    // Bateria de Fixação Imediata
    const totalCount = exercises.length;
    let completedCount = exercises.filter(e => e.last_submission && e.last_submission.is_correct).length;
    let allCompleted = totalCount > 0 && completedCount >= totalCount;

    const exercisesSectionHtml = totalCount > 0 ? `
      <section id="lessonExercisesSection" class="lesson-exercises-section" aria-labelledby="exercisesHeading">
        <div class="exercises-header">
          <div>
            <h2 id="exercisesHeading" class="exercises-heading">🧩 Pratique & Fixe o Conhecimento</h2>
            <p class="exercises-subheading">Teste sua compreensão imediatamente e consolide o aprendizado prático antes de avançar.</p>
          </div>
          <div class="exercises-progress-counter" id="exercisesProgressCounter">
            <span id="counterValue">${completedCount} de ${totalCount} resolvidos</span>
            <div class="progress-bar-container" style="width: 140px; height: 8px; margin-top: 0.35rem;">
              <div class="progress-bar-fill" id="exercisesProgressBarFill" style="width: ${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%;"></div>
            </div>
          </div>
        </div>

        <div class="exercises-completion-banner ${allCompleted ? 'show' : ''}" id="exercisesCompletionBanner">
          <div class="banner-icon" aria-hidden="true">🎉</div>
          <div class="banner-body">
            <h3>Bateria de fixação concluída com sucesso!</h3>
            <p>Você está pronto para avançar.</p>
          </div>
        </div>

        <div class="exercises-list">
          ${exercises.map((ex, idx) => {
            const isExerciseResolved = Boolean(ex.last_submission && ex.last_submission.is_correct);
            const hasPreviousFail = Boolean(ex.last_submission && !ex.last_submission.is_correct);

            let typeBadgeClass = 'badge-concept';
            let typeBadgeText = '[Conceito]';
            if (ex.type === 'OUTPUT_PREDICTION') {
              typeBadgeClass = 'badge-output';
              typeBadgeText = '[Previsão de Saída]';
            } else if (ex.type === 'CODE_CHALLENGE') {
              typeBadgeClass = 'badge-challenge';
              typeBadgeText = '[Desafio Prático]';
            }

            const isCodeChallenge = ex.type === 'CODE_CHALLENGE';

            return `
              <div class="exercise-card" id="card-${ex.id}" data-exercise-id="${ex.id}">
                <div class="exercise-card-header">
                  <div class="exercise-badge-group">
                    <span class="exercise-type-badge ${typeBadgeClass}">${typeBadgeText}</span>
                    <span class="exercise-number">Exercício ${idx + 1} de ${totalCount}</span>
                  </div>
                  <span class="exercise-status-indicator ${isExerciseResolved ? 'resolved' : ''}" id="status-ind-${ex.id}">
                    ${isExerciseResolved ? '✅ Resolvido' : '⚪ Pendente'}
                  </span>
                </div>
                <h3 class="exercise-title">${escapeHtml(ex.title)}</h3>
                <div class="markdown-body exercise-prompt">
                  ${renderMarkdown(ex.prompt_markdown)}
                </div>

                ${isCodeChallenge ? `
                  <div class="exercise-code-container">
                    <div class="code-editor-mount" id="editor-mount-${ex.id}"></div>
                    <div style="margin-top: 1rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                      <button type="button" class="btn btn-primary btn-submit-exercise" data-exercise-id="${ex.id}" ${isExerciseResolved ? 'disabled' : ''}>
                        ${isExerciseResolved ? '✓ Solução Correta' : 'Verificar Resposta'}
                      </button>
                    </div>
                  </div>
                ` : `
                  <div class="exercise-options" role="radiogroup" aria-label="Opções para ${escapeHtml(ex.title)}">
                    ${(ex.options || []).map(opt => {
                      const isSelected = Boolean(ex.last_submission && ex.last_submission.student_answer === opt.id);
                      return `
                        <button type="button" class="exercise-option-btn ${isSelected ? 'selected' : ''}"
                                data-exercise-id="${ex.id}" data-opt-id="${opt.id}"
                                role="radio" aria-checked="${isSelected ? 'true' : 'false'}"
                                ${isExerciseResolved ? 'disabled' : ''}>
                          <span class="option-id-badge">${opt.id}</span>
                          <span class="option-text">${escapeHtml(opt.text)}</span>
                        </button>
                      `;
                    }).join('')}
                  </div>
                  <div style="margin-top: 1rem; display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary btn-submit-exercise" data-exercise-id="${ex.id}" ${isExerciseResolved ? 'disabled' : ''}>
                      ${isExerciseResolved ? '✓ Resolvido' : 'Verificar Resposta'}
                    </button>
                  </div>
                `}

                <div class="exercise-feedback-box ${isExerciseResolved ? 'feedback-success show' : (hasPreviousFail ? 'feedback-error show' : '')}" id="feedback-${ex.id}">
                  ${isExerciseResolved ? `
                    <div class="feedback-content">
                      <div class="feedback-title">✓ Resposta Correta!</div>
                      ${ex.explanation ? `<div class="feedback-explanation markdown-body">${renderMarkdown(ex.explanation)}</div>` : ''}
                    </div>
                  ` : (hasPreviousFail ? `
                    <div class="feedback-content">
                      <div class="feedback-title">✗ Resposta Incorreta</div>
                      <p>Revise o conteúdo da aula acima e tente novamente!</p>
                      <button type="button" class="btn btn-secondary btn-sm btn-retry-exercise" data-exercise-id="${ex.id}" style="margin-top: 0.5rem; padding: 0.35rem 0.75rem; font-size: 0.8125rem;">Nova Tentativa</button>
                    </div>
                  ` : '')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    ` : '';

    const advanceButtonText = isCompleted
      ? '✓ Marcada como Concluída (Reabrir?)'
      : (allCompleted ? 'Concluir Aula e Avançar →' : 'Concluir Aula');

    const advanceButtonClass = isCompleted
      ? 'btn-secondary'
      : (allCompleted ? 'btn-success btn-highlight-advance' : 'btn-success');

    appContainer.innerHTML = `
      <div class="reading-column">
        <nav class="breadcrumb">
          <a href="#/">Início</a>
          <span>›</span>
          <a href="#/subject/${lesson.subject_id}">${lesson.subject_title}</a>
          <span>›</span>
          <span>${lesson.module_title}</span>
        </nav>

        <article class="lesson-article">
          <header class="lesson-header">
            <div class="lesson-meta">
              <span class="meta-item">⏱️ ${lesson.estimated_minutes} min de leitura</span>
              <span class="meta-item">📚 ${lesson.lesson_type === 'THEORY' ? 'Teoria & Prática' : 'Laboratório'}</span>
              <span class="meta-item" id="lessonStatusBadge">
                ${isCompleted ? '✅ Concluída' : '⏳ Em Estudo'}
              </span>
            </div>
            <h1 class="lesson-title" style="margin-top: 0.75rem;">${lesson.title}</h1>
            <p style="color: var(--text-secondary); font-size: 1.0625rem;">${lesson.summary}</p>
          </header>

          <div class="markdown-body">
            ${markdownHtml}
          </div>

          ${exercisesSectionHtml}

          <footer style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--border);">
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
              <!-- Botão de Conclusão -->
              <div style="text-align: center; padding: 1.5rem; background-color: var(--surface-muted); border-radius: var(--radius-md);">
                <p style="margin-bottom: 0.75rem; font-weight: 500;" id="completionPromptText">
                  ${isCompleted ? 'Você já marcou esta aula como concluída!' : (allCompleted ? '🎉 Bateria de fixação concluída com sucesso! Você está pronto para avançar.' : 'Compreendeu os conceitos fundamentais desta aula?')}
                </p>
                <button id="toggleCompleteBtn" class="btn ${advanceButtonClass}">
                  ${advanceButtonText}
                </button>
              </div>

              <!-- Navegação Anterior / Próxima -->
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
                ${lesson.previous_lesson ? `
                  <a href="#/lesson/${lesson.previous_lesson.id}" class="btn btn-secondary">
                    ← ${lesson.previous_lesson.title}
                  </a>
                ` : '<div></div>'}

                <a href="#/subject/${lesson.subject_id}" class="btn btn-outline">
                  Índice do Curso
                </a>

                ${lesson.next_lesson ? `
                  <a href="#/lesson/${lesson.next_lesson.id}" class="btn btn-primary" id="btnNextLesson">
                    ${lesson.next_lesson.title} →
                  </a>
                ` : `
                  <a href="#/subject/${lesson.subject_id}" class="btn btn-primary">
                    Finalizar Módulo →
                  </a>
                `}
              </div>
            </div>
          </footer>
        </article>
      </div>
    `;

    // Ativa cópia de código nos blocos markdown
    attachCopyCodeListeners();

    // Instancia os editores interativos para desafios de código
    const editorInstances = {};
    exercises.forEach(ex => {
      if (ex.type === 'CODE_CHALLENGE') {
        const mountEl = document.getElementById(`editor-mount-${ex.id}`);
        if (mountEl) {
          const startingCode = (ex.last_submission && ex.last_submission.student_answer)
            ? ex.last_submission.student_answer
            : (ex.initial_code || '// Escreva sua solução aqui');
          editorInstances[ex.id] = new CodeEditor(mountEl, {
            initialCode: startingCode,
            title: 'DESAFIO JAVASCRIPT'
          });
        }
      }
    });

    // Gerenciamento de seleção de opções (MULTIPLE_CHOICE / OUTPUT_PREDICTION)
    const selectedOptions = {};
    exercises.forEach(ex => {
      if (ex.last_submission && ex.last_submission.student_answer) {
        selectedOptions[ex.id] = ex.last_submission.student_answer;
      }
    });

    document.querySelectorAll('.exercise-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const exId = btn.getAttribute('data-exercise-id');
        const optId = btn.getAttribute('data-opt-id');

        // Desmarca outros botões do mesmo exercício
        document.querySelectorAll(`.exercise-option-btn[data-exercise-id="${exId}"]`).forEach(b => {
          b.classList.remove('selected');
          b.setAttribute('aria-checked', 'false');
        });

        // Marca este botão
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
        selectedOptions[exId] = optId;

        // Oculta feedback de erro se houver
        const feedbackEl = document.getElementById(`feedback-${exId}`);
        if (feedbackEl && feedbackEl.classList.contains('feedback-error')) {
          feedbackEl.classList.remove('show');
        }
      });
    });

    // Botão de Nova Tentativa
    document.querySelectorAll('.btn-retry-exercise').forEach(btn => {
      btn.addEventListener('click', () => {
        const exId = btn.getAttribute('data-exercise-id');
        const feedbackEl = document.getElementById(`feedback-${exId}`);
        if (feedbackEl) {
          feedbackEl.classList.remove('show');
          feedbackEl.innerHTML = '';
        }
        delete selectedOptions[exId];
        document.querySelectorAll(`.exercise-option-btn[data-exercise-id="${exId}"]`).forEach(b => {
          b.classList.remove('selected');
          b.removeAttribute('disabled');
          b.setAttribute('aria-checked', 'false');
        });
        const submitBtn = document.querySelector(`.btn-submit-exercise[data-exercise-id="${exId}"]`);
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      });
    });

    // Submissão de cada exercício
    document.querySelectorAll('.btn-submit-exercise').forEach(btn => {
      btn.addEventListener('click', async () => {
        const exId = btn.getAttribute('data-exercise-id');
        const exercise = exercises.find(e => e.id === exId);
        if (!exercise) return;

        let answer = '';
        if (exercise.type === 'CODE_CHALLENGE') {
          if (editorInstances[exId]) {
            answer = editorInstances[exId].getValue();
          }
        } else {
          answer = selectedOptions[exId] || '';
        }

        if (!answer.trim()) {
          showToast('Por favor, selecione uma opção ou digite sua solução antes de verificar.', 'warning');
          return;
        }

        try {
          btn.disabled = true;
          btn.textContent = 'Verificando...';

          const submitRes = await fetch(`/api/exercises/${exId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentAnswer: answer })
          });

          if (!submitRes.ok) throw new Error('Falha ao submeter resposta');
          const result = await submitRes.json();

          const feedbackEl = document.getElementById(`feedback-${exId}`);
          const statusIndEl = document.getElementById(`status-ind-${exId}`);

          if (result.isCorrect) {
            btn.textContent = '✓ Resolvido';
            btn.disabled = true;
            if (statusIndEl) {
              statusIndEl.textContent = '✅ Resolvido';
              statusIndEl.classList.add('resolved');
            }
            if (feedbackEl) {
              feedbackEl.className = 'exercise-feedback-box feedback-success show';
              feedbackEl.innerHTML = `
                <div class="feedback-content">
                  <div class="feedback-title">✓ Resposta Correta!</div>
                  ${result.explanation ? `<div class="feedback-explanation markdown-body">${renderMarkdown(result.explanation)}</div>` : ''}
                </div>
              `;
            }
            // Desabilita opções
            document.querySelectorAll(`.exercise-option-btn[data-exercise-id="${exId}"]`).forEach(b => {
              b.disabled = true;
            });
          } else {
            btn.textContent = 'Verificar Resposta';
            btn.disabled = false;
            if (feedbackEl) {
              feedbackEl.className = 'exercise-feedback-box feedback-error show';
              feedbackEl.innerHTML = `
                <div class="feedback-content">
                  <div class="feedback-title">✗ Resposta Incorreta</div>
                  ${result.explanation ? `<div class="feedback-explanation markdown-body" style="margin-top:0.35rem; color:var(--text-danger, #ef4444);">${renderMarkdown(result.explanation)}</div>` : '<p>Revise o conteúdo da aula acima e tente novamente!</p>'}
                  <button type="button" class="btn btn-secondary btn-sm btn-retry-exercise" data-exercise-id="${exId}" style="margin-top: 0.5rem; padding: 0.35rem 0.75rem; font-size: 0.8125rem;">Nova Tentativa</button>
                </div>
              `;
              feedbackEl.querySelector('.btn-retry-exercise')?.addEventListener('click', () => {
                feedbackEl.classList.remove('show');
                delete selectedOptions[exId];
                document.querySelectorAll(`.exercise-option-btn[data-exercise-id="${exId}"]`).forEach(b => {
                  b.classList.remove('selected');
                  b.setAttribute('aria-checked', 'false');
                });
              });
            }
          }

          // Atualizar contador e barra de progresso
          const counterVal = document.getElementById('counterValue');
          const barFill = document.getElementById('exercisesProgressBarFill');
          if (counterVal) {
            counterVal.textContent = `${result.completedCount} de ${result.totalCount} resolvidos`;
          }
          if (barFill && result.totalCount > 0) {
            barFill.style.width = `${(result.completedCount / result.totalCount) * 100}%`;
          }

          // Se concluiu todos os exercícios da aula:
          if (result.allCompleted) {
            allCompleted = true;
            const completionBanner = document.getElementById('exercisesCompletionBanner');
            if (completionBanner) {
              completionBanner.classList.add('show');
            }
            const toggleCompleteBtn = document.getElementById('toggleCompleteBtn');
            const completionPromptText = document.getElementById('completionPromptText');

            if (completionPromptText && !isCompleted) {
              completionPromptText.textContent = '🎉 Bateria de fixação concluída com sucesso! Você está pronto para avançar.';
            }

            if (toggleCompleteBtn && !isCompleted) {
              toggleCompleteBtn.textContent = 'Concluir Aula e Avançar →';
              toggleCompleteBtn.className = 'btn btn-success btn-highlight-advance';
            }

            showToast('🎉 Bateria de fixação concluída com sucesso! Você está pronto para avançar.', 'success');
          }
        } catch (err) {
          showToast(`Erro: ${err.message}`, 'danger');
          btn.disabled = false;
          btn.textContent = 'Verificar Resposta';
        }
      });
    });

    // Event Listener de Conclusão / Avançar
    const toggleBtn = document.getElementById('toggleCompleteBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async () => {
        const nextStatus = isCompleted ? 'IN_PROGRESS' : 'COMPLETED';
        try {
          toggleBtn.disabled = true;
          const progRes = await fetch(`/api/lessons/${lessonId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus })
          });
          if (!progRes.ok) throw new Error('Falha ao atualizar status');

          if (nextStatus === 'COMPLETED') {
            showToast('Parabéns! Aula concluída com sucesso.', 'success');
            if (lesson.next_lesson && allCompleted) {
              window.location.hash = `#/lesson/${lesson.next_lesson.id}`;
              return;
            }
          } else {
            showToast('Status alterado para em andamento.', 'info');
          }
          // Recarregar visão da aula
          renderLesson(lessonId);
        } catch (err) {
          showToast(`Erro: ${err.message}`, 'danger');
          toggleBtn.disabled = false;
        }
      });
    }

    window.scrollTo(0, 0);
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro ao carregar aula: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: AVALIAÇÃO (MODO FOCO & DINÂMICA)
// --------------------------------------------------------------------------
async function renderAssessment(assessmentId) {
  setFocusMode(true);
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Preparando ambiente de avaliação...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/assessments/${assessmentId}`);
    if (!res.ok) throw new Error('Avaliação não encontrada');
    const assessment = await res.json();

    // Renderizar formulário das questões
    const questionsHtml = assessment.questions.map((q, idx) => {
      let inputAreaHtml = '';

      if (q.type === 'MULTIPLE_CHOICE' && q.options) {
        inputAreaHtml = `
          <div class="options-list" role="radiogroup" aria-labelledby="question-title-${q.id}">
            ${q.options.map(opt => `
              <label class="option-item" id="opt-label-${q.id}-${opt.id}">
                <input type="radio" name="answer_${q.id}" value="${opt.id}" required>
                <span><strong>${opt.id})</strong> ${opt.text}</span>
              </label>
            `).join('')}
          </div>
        `;
      } else if (q.type === 'CODE_ANALYSIS') {
        inputAreaHtml = `
          <div style="margin-top: 1rem;">
            <div style="font-size: 0.8125rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.5rem;">
              💻 Editor Interativo de Código (Escreva e teste sua solução):
            </div>
            <div class="code-editor-mount" data-question-id="${q.id}"></div>
            <input type="hidden" id="answer_${q.id}" name="answer_${q.id}">
          </div>
        `;
      } else {
        // OPEN_QUESTION
        inputAreaHtml = `
          <div style="margin-top: 1rem;">
            <label for="answer_${q.id}" class="sr-only">Sua resposta técnica</label>
            <textarea
              id="answer_${q.id}"
              name="answer_${q.id}"
              class="question-textarea"
              placeholder="Digite sua resposta técnica detalhada, justificando os conceitos..."
              rows="5"
              required
            ></textarea>
          </div>
        `;
      }

      return `
        <fieldset class="question-card" id="q-card-${q.id}" style="border: 1px solid var(--border);">
          <legend class="sr-only">Questão ${idx + 1}</legend>
          <div class="question-header">
            <span class="question-number" id="question-title-${q.id}">Questão ${idx + 1} de ${assessment.questions.length}</span>
            <span class="question-points">${q.points} pontos • ${q.type}</span>
          </div>
          <div class="markdown-body" style="font-size: 1rem;">
            ${renderMarkdown(q.prompt_markdown)}
          </div>
          ${inputAreaHtml}
        </fieldset>
      `;
    }).join('');

    appContainer.innerHTML = `
      <div class="assessment-container">
        <div class="focus-topbar">
          <div>
            <span class="focus-badge">Modo de Foco</span>
            <h1 style="font-size: 1.5rem; font-weight: 800; margin-top: 0.5rem;">${assessment.title}</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">
              ${assessment.description}
            </p>
          </div>
          <div>
            <a href="#/subject/${assessment.subject_id}" class="btn btn-secondary" style="font-size: 0.8125rem;" onclick="return confirm('Deseja realmente sair? As respostas não salvas serão perdidas.');">
              Sair da Prova
            </a>
          </div>
        </div>

        <div class="callout callout-info" style="margin-bottom: 2rem;">
          <div class="callout-icon">📋</div>
          <div class="callout-content">
            <p><strong>Instruções</strong>: Responda a todas as questões com clareza. Ao finalizar, clique em <strong>Submeter Avaliação</strong>. Seu histórico será registrado e você receberá correção imediata com explicação pedagógica.</p>
          </div>
        </div>

        <form id="assessmentForm">
          ${questionsHtml}

          <div style="margin-top: 2.5rem; text-align: right; border-top: 1px solid var(--border); padding-top: 1.5rem;">
            <button type="submit" id="submitAssessmentBtn" class="btn btn-primary" style="padding: 0.75rem 2rem; font-size: 1rem;">
              Submeter Avaliação Oficial
            </button>
          </div>
        </form>
      </div>
    `;

    attachCopyCodeListeners();

    // Montar instâncias do CodeEditor para questões práticas
    document.querySelectorAll('.code-editor-mount').forEach(mountEl => {
      const qId = mountEl.getAttribute('data-question-id');
      const hiddenInput = document.getElementById(`answer_${qId}`);
      new CodeEditor(mountEl, {
        title: 'EDITOR PRÁTICO DA QUESTÃO',
        initialCode: '// Escreva e teste sua implementação aqui\n',
        onChange: (code) => {
          if (hiddenInput) hiddenInput.value = code;
        }
      });
    });

    // Highlight em radio inputs
    document.querySelectorAll('.option-item input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const name = e.target.name;
        document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
          r.closest('.option-item').classList.remove('selected');
        });
        e.target.closest('.option-item').classList.add('selected');
      });
    });

    // Submissão da Avaliação
    const form = document.getElementById('assessmentForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = document.getElementById('submitAssessmentBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Corrigindo e Registrando...';

      // Coletar respostas
      const answers = {};
      assessment.questions.forEach(q => {
        if (q.type === 'MULTIPLE_CHOICE') {
          const selected = form.querySelector(`input[name="answer_${q.id}"]:checked`);
          answers[q.id] = selected ? selected.value : '';
        } else {
          const inputEl = form.querySelector(`[name="answer_${q.id}"]`);
          answers[q.id] = inputEl ? inputEl.value.trim() : '';
        }
      });

      try {
        const submitRes = await fetch(`/api/assessments/${assessmentId}/attempt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: 'aluno-padrao',
            answers
          })
        });

        if (!submitRes.ok) throw new Error('Falha ao processar tentativa');
        const result = await submitRes.json();

        // Renderizar Resultado com Gabarito e Explicações Pedagógicas
        renderAssessmentResult(result);
      } catch (err) {
        showToast(`Erro na submissão: ${err.message}`, 'danger');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submeter Avaliação Oficial';
      }
    });

    window.scrollTo(0, 0);
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro ao carregar avaliação: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// HELPERS & VISÃO: RESULTADO DA AVALIAÇÃO COM GABARITO & FEEDBACK
// --------------------------------------------------------------------------
function isAnswerPendingEvaluation(ans, attemptStatus) {
  if (ans.is_pending === true || ans.is_pending === 1) return true;
  if (ans.status === 'PENDING_EVALUATION') return true;
  const qType = ans.type || ans.question_type;
  if (qType !== 'MULTIPLE_CHOICE' && attemptStatus === 'SUBMITTED') return true;
  return false;
}

function renderAssessmentAnswerCard(ans, idx, attemptStatus) {
  const qType = ans.type || ans.question_type || 'DISCURSIVA';
  const isPending = isAnswerPendingEvaluation(ans, attemptStatus);

  let headerScoreHtml = '';
  let feedbackBoxHtml = '';

  if (isPending) {
    headerScoreHtml = `
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span class="badge-pending-question">⏳ Em espera de avaliação pelo agente</span>
        <span style="font-weight: 600; color: var(--text-muted); font-size: 0.875rem;">(Pendente / ${ans.max_score} pts)</span>
      </div>
    `;

    feedbackBoxHtml = `
      <div class="feedback-box feedback-pending">
        <div style="margin-bottom: 0.35rem;">
          <strong>⏳ Status: Em espera de avaliação pelo agente</strong>
        </div>
        <p style="margin: 0.35rem 0; font-size: 0.9375rem; line-height: 1.5;">
          Sua resposta foi submetida com sucesso e aguarda avaliação baseada na rubrica acadêmica pelo agente educacional.
        </p>
        ${ans.rubric ? `
          <div class="feedback-rubric-criteria">
            <strong style="color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Critérios de Avaliação (Rubrica Acadêmica):</strong>
            <div style="color: var(--text-primary); white-space: pre-line; line-height: 1.5;">${escapeHtml(ans.rubric)}</div>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    headerScoreHtml = `
      <span style="font-weight: 700; color: ${ans.score > 0 ? 'var(--success)' : 'var(--danger)'};">
        ${ans.score} / ${ans.max_score} pontos
      </span>
    `;

    feedbackBoxHtml = `
      <div class="feedback-box ${ans.score > 0 ? 'feedback-correct' : 'feedback-incorrect'}">
        <strong>Feedback Pedagógico & Gabarito:</strong>
        <p style="margin-top: 0.35rem; font-size: 0.9rem; white-space: pre-line;">${escapeHtml(ans.feedback || '')}</p>
      </div>
    `;
  }

  return `
    <div class="question-card" style="margin-bottom: 1.5rem;">
      <div class="question-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <span class="question-number">Questão ${idx + 1} (${qType})</span>
        ${headerScoreHtml}
      </div>
      <div class="markdown-body" style="font-size: 0.95rem; margin-bottom: 1rem;">
        ${renderMarkdown(ans.prompt_markdown)}
      </div>

      <div style="background-color: var(--surface-muted); padding: 0.875rem; border-radius: var(--radius-sm); margin-bottom: 0.75rem;">
        <div style="font-size: 0.8125rem; font-weight: 600; color: var(--text-muted);">Sua Resposta:</div>
        <div style="font-family: monospace; font-size: 0.9rem; margin-top: 0.25rem; white-space: pre-wrap;">${ans.student_answer ? escapeHtml(ans.student_answer) : '<em>(Sem resposta)</em>'}</div>
      </div>

      ${feedbackBoxHtml}
    </div>
  `;
}

function renderAssessmentResult(result) {
  setFocusMode(false);

  const pendingAnswers = result.answers.filter(ans => isAnswerPendingEvaluation(ans, result.status));
  const hasPending = pendingAnswers.length > 0 || result.status === 'SUBMITTED';
  const pendingCount = pendingAnswers.length;

  let topBadgeHtml = '';
  let topDescriptionHtml = '';
  let scoreSectionHtml = '';

  if (hasPending) {
    topBadgeHtml = `<span class="badge-pending-top">⏳ AGUARDANDO AVALIAÇÃO DO AGENTE (SUBMETIDO)</span>`;
    topDescriptionHtml = `
      <p style="color: var(--text-secondary); font-size: 1rem; margin-top: 0.5rem; max-width: 650px; margin-left: auto; margin-right: auto; line-height: 1.5;">
        Sua tentativa foi registrada e está em espera para avaliação das questões abertas pelo agente pedagógico.
      </p>
    `;
    scoreSectionHtml = `
      <div style="margin: 1.75rem 0; padding: 1.25rem; background-color: var(--surface-muted); border-radius: var(--radius-md); border: 1px dashed var(--info-border);">
        <div style="font-size: 1.125rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1rem; text-align: center;">
          Nota Parcial: ${result.score} / ${result.max_score} (${pendingCount} ${pendingCount === 1 ? 'questão aguardando' : 'questões aguardando'} avaliação pelo agente)
        </div>
        <div style="display: flex; justify-content: center; gap: 2.5rem; flex-wrap: wrap;">
          <div>
            <div style="font-size: 2.25rem; font-weight: 800; color: var(--info); text-align: center;">${result.score} / ${result.max_score}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; text-align: center;">Pontuação Parcial Automática</div>
          </div>
          <div style="border-left: 1px solid var(--border); padding-left: 2.5rem;">
            <div style="font-size: 2.25rem; font-weight: 800; color: var(--warning); text-align: center;">${pendingCount}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; text-align: center;">Aguardando Agente</div>
          </div>
        </div>
      </div>
    `;
  } else {
    topBadgeHtml = result.passed
      ? `<span style="background-color: var(--success); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.875rem; font-weight: 700;">✓ APROVADO</span>`
      : `<span style="background-color: var(--warning); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.875rem; font-weight: 700;">CONCLUÍDO (DIAGNÓSTICO)</span>`;
    topDescriptionHtml = `<p style="color: var(--text-secondary); font-size: 1rem; margin-top: 0.5rem;">${escapeHtml(result.assessment_title)}</p>`;
    scoreSectionHtml = `
      <div style="display: flex; justify-content: center; gap: 2rem; margin: 1.5rem 0;">
        <div>
          <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary);">${result.percentage}%</div>
          <div style="font-size: 0.8125rem; color: var(--text-muted); text-transform: uppercase;">Aproveitamento</div>
        </div>
        <div style="border-left: 1px solid var(--border); padding-left: 2rem;">
          <div style="font-size: 2.5rem; font-weight: 800; color: var(--text-primary);">${result.score} / ${result.max_score}</div>
          <div style="font-size: 0.8125rem; color: var(--text-muted); text-transform: uppercase;">Pontuação Obtida</div>
        </div>
      </div>
    `;
  }

  const answersFeedbackHtml = result.answers.map((ans, idx) => renderAssessmentAnswerCard(ans, idx, result.status)).join('');

  appContainer.innerHTML = `
    <div style="max-width: 840px; margin: 0 auto;">
      <div class="card" style="text-align: center; padding: 2.5rem; margin-bottom: 2rem;">
        <div style="margin-bottom: 1rem;">${topBadgeHtml}</div>
        <h1 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 0.5rem;">Resultado da Avaliação</h1>
        <p style="color: var(--text-secondary); font-size: 1rem;">${escapeHtml(result.assessment_title)}</p>
        ${topDescriptionHtml}
        ${scoreSectionHtml}
        <div style="display: flex; justify-content: center; gap: 1rem; margin-top: 1.5rem;">
          <a href="#/" class="btn btn-primary">Ir para Dashboard</a>
          <a href="#/history" class="btn btn-secondary">Ver Todo o Histórico</a>
        </div>
      </div>

      <h2 style="font-size: 1.375rem; font-weight: 700; margin-bottom: 1rem;">Detalhamento Questão por Questão</h2>
      ${answersFeedbackHtml}
    </div>
  `;

  attachCopyCodeListeners();
  window.scrollTo(0, 0);
}

// --------------------------------------------------------------------------
// VISÃO: HISTÓRICO DE TENTATIVAS (APPEND-ONLY)
// --------------------------------------------------------------------------
async function renderHistory() {
  setFocusMode(false);
  updateActiveNav('history');
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando histórico de avaliações...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/attempts');
    const attempts = await res.json();

    if (attempts.length === 0) {
      appContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <h2>Nenhuma avaliação realizada ainda</h2>
          <p style="color: var(--text-secondary); margin: 1rem 0;">Realize as avaliações das disciplinas para acompanhar seu progresso.</p>
          <a href="#/subjects" class="btn btn-primary">Ver Disciplinas</a>
        </div>
      `;
      return;
    }

    const itemsHtml = attempts.map(att => `
      <div class="card" style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span class="hero-badge" style="font-size: 0.7rem; background-color: var(--info);">${att.assessment_type}</span>
          <h3 style="font-size: 1.125rem; font-weight: 700; margin-top: 0.25rem;">${att.assessment_title}</h3>
          <div style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem;">
            Matéria: ${att.subject_title} • Data: ${new Date(att.started_at).toLocaleString('pt-BR')}
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1.5rem;">
          <div style="text-align: right;">
            <div style="font-size: 1.25rem; font-weight: 800; color: ${att.score >= 70 ? 'var(--success)' : 'var(--warning)'};">
              ${att.percentage}% (${att.score}/${att.max_score} pts)
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Status: ${att.status}
            </div>
          </div>

          <a href="#/attempt/${att.id}" class="btn btn-secondary" style="font-size: 0.875rem;">
            Ver Gabarito Completo →
          </a>
        </div>
      </div>
    `).join('');

    appContainer.innerHTML = `
      <div>
        <header style="margin-bottom: 2rem;">
          <h1 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 0.5rem;">Histórico de Avaliações</h1>
          <p style="color: var(--text-secondary);">Registro append-only de todas as tentativas e correções realizadas.</p>
        </header>

        <div style="display: flex; flex-direction: column;">
          ${itemsHtml}
        </div>
      </div>
    `;
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro ao carregar histórico: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: DETALHES DE UMA TENTATIVA PASSADA
// --------------------------------------------------------------------------
async function renderAttemptDetail(attemptId) {
  setFocusMode(false);
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando gabarito da tentativa...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/attempts/${attemptId}`);
    if (!res.ok) throw new Error('Tentativa não encontrada');
    const attempt = await res.json();

    const pendingAnswers = attempt.answers.filter(ans => isAnswerPendingEvaluation(ans, attempt.status));
    const hasPending = pendingAnswers.length > 0 || attempt.status === 'SUBMITTED';
    const pendingCount = pendingAnswers.length;

    let topBadgeHtml = '';
    let topDescriptionHtml = '';
    let statsSectionHtml = '';

    if (hasPending) {
      topBadgeHtml = `<div style="margin-bottom: 0.75rem;"><span class="badge-pending-top">⏳ AGUARDANDO AVALIAÇÃO DO AGENTE (SUBMETIDO)</span></div>`;
      topDescriptionHtml = `
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.5;">
          Sua tentativa foi registrada e está em espera para avaliação das questões abertas pelo agente pedagógico.
        </p>
      `;
      statsSectionHtml = `
        <div style="padding: 1.25rem; background-color: var(--surface-muted); border-radius: var(--radius-md); border: 1px dashed var(--info-border);">
          <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem;">
            Nota Parcial: ${attempt.score} / ${attempt.max_score} (${pendingCount} ${pendingCount === 1 ? 'questão aguardando' : 'questões aguardando'} avaliação pelo agente)
          </div>
          <div style="display: flex; gap: 2.5rem; flex-wrap: wrap;">
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Pontuação Parcial Automática</span>
              <div style="font-size: 1.5rem; font-weight: 800; color: var(--info);">${attempt.score} / ${attempt.max_score}</div>
            </div>
            <div>
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Questões em Avaliação</span>
              <div style="font-size: 1.5rem; font-weight: 800; color: var(--warning);">${pendingCount}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      topBadgeHtml = attempt.passed
        ? `<div style="margin-bottom: 0.75rem;"><span style="background-color: var(--success); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8125rem; font-weight: 700;">✓ APROVADO</span></div>`
        : `<div style="margin-bottom: 0.75rem;"><span style="background-color: var(--warning); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8125rem; font-weight: 700;">CONCLUÍDO</span></div>`;
      topDescriptionHtml = '';
      statsSectionHtml = `
        <div style="display: flex; gap: 2rem;">
          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Nota</span>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${attempt.score} / ${attempt.max_score}</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">Aproveitamento</span>
            <div style="font-size: 1.5rem; font-weight: 800; color: ${attempt.score >= 70 ? 'var(--success)' : 'var(--warning)'};">${attempt.percentage}%</div>
          </div>
        </div>
      `;
    }

    const answersHtml = attempt.answers.map((ans, idx) => renderAssessmentAnswerCard(ans, idx, attempt.status)).join('');

    appContainer.innerHTML = `
      <div style="max-width: 840px; margin: 0 auto;">
        <nav class="breadcrumb">
          <a href="#/history">← Voltar para Histórico</a>
        </nav>

        <header class="card" style="padding: 2rem; margin-bottom: 2rem;">
          ${topBadgeHtml}
          <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.25rem;">${escapeHtml(attempt.assessment_title)}</h1>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">
            Matéria: ${escapeHtml(attempt.subject_title)} • Realizada em ${new Date(attempt.started_at).toLocaleString('pt-BR')}
          </p>
          ${topDescriptionHtml}
          ${statsSectionHtml}
        </header>

        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">Respostas e Correção</h2>
        ${answersHtml}
      </div>
    `;

    attachCopyCodeListeners();
    window.scrollTo(0, 0);
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro ao carregar detalhes: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: PLAYGROUND INTERATIVO DE CÓDIGO
// --------------------------------------------------------------------------
function renderPlayground() {
  setFocusMode(false);
  updateActiveNav('playground');

  const templates = {
    closures: `// Closures & Escopo Léxico
function criarContador(valorInicial = 0) {
  let contador = valorInicial;
  return {
    incrementar: () => ++contador,
    decrementar: () => --contador,
    obterValor: () => contador
  };
}

const meuContador = criarContador(10);
console.log('Valor inicial:', meuContador.obterValor());
console.log('Incrementado:', meuContador.incrementar());
console.log('Incrementado:', meuContador.incrementar());
console.log('Decrementado:', meuContador.decrementar());`,

    eventloop: `// Event Loop, Microtasks e Macrotasks
console.log('1. Call Stack síncrono iniciado');

setTimeout(() => {
  console.log('4. Macrotask (setTimeout 0ms)');
}, 0);

Promise.resolve().then(() => {
  console.log('3. Microtask (Promise callback)');
});

console.log('2. Call Stack síncrono concluído');`,

    immutability: `// Imutabilidade com structuredClone
const configOriginal = {
  app: 'Academia Dev',
  recursos: {
    srs: true,
    tema: 'dark'
  }
};

// Deep Copy nativo moderno
const configClonada = structuredClone(configOriginal);
configClonada.recursos.tema = 'light';

console.log('Original permanece intacto:', configOriginal.recursos.tema);
console.log('Clone atualizado com sucesso:', configClonada.recursos.tema);`,

    observer: `// Padrão de Projeto Observer
class EventEmitter {
  constructor() {
    this.eventos = new Map();
  }

  on(evento, callback) {
    if (!this.eventos.has(evento)) this.eventos.set(evento, []);
    this.eventos.get(evento).push(callback);
  }

  emit(evento, dados) {
    if (this.eventos.has(evento)) {
      this.eventos.get(evento).forEach(cb => cb(dados));
    }
  }
}

const emissor = new EventEmitter();
emissor.on('alunoAprovado', (dados) => {
  console.log('🎓 Parabéns ' + dados.nome + '! Nota: ' + dados.nota);
});

emissor.emit('alunoAprovado', { nome: 'Dev Sênior', nota: 10 });`
  };

  appContainer.innerHTML = `
    <div style="max-width: 1040px; margin: 0 auto;">
      <header class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.25rem;">Playground Interativo JavaScript</h1>
            <p style="color: var(--text-secondary); font-size: 0.875rem;">
              Ambiente seguro para experimentação de algoritmos, prototipagem e estudo da Engine V8.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label for="templateSelect" style="font-size: 0.8125rem; font-weight: 600; color: var(--text-muted);">Exemplos:</label>
            <select id="templateSelect" class="theme-select" style="font-size: 0.8125rem; padding: 0.35rem 0.75rem;">
              <option value="closures">Closures & Memória</option>
              <option value="eventloop">Event Loop & Promises</option>
              <option value="immutability">structuredClone Nativo</option>
              <option value="observer">Observer Pattern</option>
            </select>
          </div>
        </div>
      </header>

      <div id="playgroundEditorMount"></div>
    </div>
  `;

  const mount = document.getElementById('playgroundEditorMount');
  const editor = new CodeEditor(mount, {
    title: 'JAVASCRIPT PLAYGROUND',
    initialCode: templates.closures,
    autoRun: true
  });

  const select = document.getElementById('templateSelect');
  select.addEventListener('change', (e) => {
    const selectedTemplate = templates[e.target.value];
    if (selectedTemplate) {
      editor.setValue(selectedTemplate);
      editor.execute();
    }
  });

  window.scrollTo(0, 0);
}

// --------------------------------------------------------------------------
// VISÃO: REVISÃO ESPAÇADA (SRS - SM-2)
// --------------------------------------------------------------------------
async function renderSRS() {
  setFocusMode(false);
  updateActiveNav('srs');
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Buscando revisões espaçadas programadas...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/srs/due');
    if (!res.ok) throw new Error('Falha ao buscar cards de revisão');
    const data = await res.json();
    const cards = data.cards || [];

    if (cards.length === 0) {
      appContainer.innerHTML = `
        <div class="srs-container">
          <div class="card" style="text-align: center; padding: 3rem 2rem;">
            <div style="font-size: 3.5rem; margin-bottom: 1rem;">🎉</div>
            <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">Todas as Revisões em Dia!</h1>
            <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 1.5rem;">
              Você não possui flashcards pendentes para hoje. O algoritmo SM-2 continuará espaçando os conteúdos conforme seu ritmo biológico de retenção.
            </p>
            <div style="display: flex; justify-content: center; gap: 1rem;">
              <a href="#/" class="btn btn-primary">Voltar ao Dashboard</a>
              <a href="#/playground" class="btn btn-secondary">Praticar no Playground</a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    let currentIndex = 0;
    let isRevealed = false;

    function renderCurrentCard() {
      if (currentIndex >= cards.length) {
        appContainer.innerHTML = `
          <div class="srs-container">
            <div class="card" style="text-align: center; padding: 3rem 2rem;">
              <div style="font-size: 3.5rem; margin-bottom: 1rem;">🏆</div>
              <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">Sessão Diária Concluída!</h1>
              <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                Você revisou <strong>${cards.length}</strong> conceitos essenciais de engenharia hoje.
              </p>
              <a href="#/" class="btn btn-primary">Retornar ao Dashboard</a>
            </div>
          </div>
        `;
        return;
      }

      const card = cards[currentIndex];
      const progressPercent = Math.round(((currentIndex) / cards.length) * 100);

      appContainer.innerHTML = `
        <div class="srs-container">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <a href="#/" class="breadcrumb-link" style="text-decoration: none; color: var(--text-muted); font-size: 0.875rem;">← Sair da Revisão</a>
            <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-muted);">
              Card ${currentIndex + 1} de ${cards.length} (${progressPercent}%)
            </span>
          </div>

          <div class="progress-bar-container" style="margin-bottom: 1.5rem; height: 6px;">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>

          <div class="srs-card">
            <div>
              <div class="srs-topic-tag">${escapeHtml(card.card_title || card.topic_id)}</div>
              <div class="srs-prompt markdown-body">
                ${renderMarkdown(card.prompt_front)}
              </div>
            </div>

            ${!isRevealed ? `
              <div style="margin-top: 2rem; text-align: center;">
                <button type="button" id="btnRevealAnswer" class="btn btn-primary" style="padding: 0.75rem 2.5rem; font-size: 1rem;">
                  Mostrar Resposta [Espaço]
                </button>
              </div>
            ` : `
              <div class="srs-answer-box">
                <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--success); letter-spacing: 0.05em; margin-bottom: 0.5rem;">
                  ✓ Resposta & Explicação Técnica:
                </div>
                <div class="markdown-body" style="font-size: 1.05rem; line-height: 1.65;">
                  ${renderMarkdown(card.answer_back)}
                </div>

                <div class="srs-ratings-grid">
                  <button type="button" class="btn-rating btn-rating-0" data-rating="0" title="Atalho: Tecla 1">
                    <span>Errei</span>
                    <span class="rating-kbd">[1]</span>
                  </button>
                  <button type="button" class="btn-rating btn-rating-1" data-rating="1" title="Atalho: Tecla 2">
                    <span>Difícil</span>
                    <span class="rating-kbd">[2]</span>
                  </button>
                  <button type="button" class="btn-rating btn-rating-2" data-rating="2" title="Atalho: Tecla 3">
                    <span>Bom</span>
                    <span class="rating-kbd">[3]</span>
                  </button>
                  <button type="button" class="btn-rating btn-rating-3" data-rating="3" title="Atalho: Tecla 4">
                    <span>Fácil</span>
                    <span class="rating-kbd">[4]</span>
                  </button>
                </div>
              </div>
            `}
          </div>
        </div>
      `;

      attachCopyCodeListeners();

      if (!isRevealed) {
        const btnReveal = document.getElementById('btnRevealAnswer');
        btnReveal.addEventListener('click', () => {
          isRevealed = true;
          renderCurrentCard();
        });
      } else {
        document.querySelectorAll('.btn-rating').forEach(btn => {
          btn.addEventListener('click', async () => {
            const rating = Number(btn.getAttribute('data-rating'));
            await submitReview(card.id, rating);
          });
        });
      }
    }

    async function submitReview(cardId, rating) {
      try {
        const reviewRes = await fetch('/api/srs/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_id: cardId, rating, userId: 'aluno-padrao' })
        });
        if (!reviewRes.ok) throw new Error('Falha ao registrar revisão');
        showToast('Revisão registrada com algoritmo SM-2!', 'info');
      } catch (err) {
        showToast(err.message, 'danger');
      }
      isRevealed = false;
      currentIndex++;
      renderCurrentCard();
    }

    function handleSrsKeyboard(e) {
      if (window.location.hash !== '#/srs') {
        window.removeEventListener('keydown', handleSrsKeyboard);
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (!isRevealed && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        isRevealed = true;
        renderCurrentCard();
        return;
      }

      if (isRevealed) {
        if (e.key === '1') { e.preventDefault(); submitReview(cards[currentIndex].id, 0); }
        if (e.key === '2') { e.preventDefault(); submitReview(cards[currentIndex].id, 1); }
        if (e.key === '3') { e.preventDefault(); submitReview(cards[currentIndex].id, 2); }
        if (e.key === '4') { e.preventDefault(); submitReview(cards[currentIndex].id, 3); }
      }
    }

    window.removeEventListener('keydown', handleSrsKeyboard);
    window.addEventListener('keydown', handleSrsKeyboard);

    renderCurrentCard();
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro ao carregar SRS: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: CORREÇÃO & AVALIAÇÃO POR RUBRICA
// --------------------------------------------------------------------------
async function renderGrading(attemptId = null) {
  setFocusMode(false);
  updateActiveNav('grading');

  if (attemptId) {
    return renderGradingAttempt(attemptId);
  }

  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando avaliações pendentes de correção...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/assessments/pending-grading');
    if (!res.ok) throw new Error('Falha ao carregar lista de correções');
    const attempts = await res.json();

    if (attempts.length === 0) {
      appContainer.innerHTML = `
        <div style="max-width: 840px; margin: 0 auto;">
          <div class="card" style="text-align: center; padding: 3rem 2rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
            <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;">Fila de Correção Vazia</h1>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
              Não há avaliações somativas com status <code>SUBMITTED</code> aguardando correção por rubrica no momento.
            </p>
            <a href="#/history" class="btn btn-secondary">Ver Histórico de Provas</a>
          </div>
        </div>
      `;
      return;
    }

    const itemsHtml = attempts.map(att => `
      <div class="card" style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <span style="font-size: 0.75rem; font-weight: 700; color: #D97706; background: #FFFBEB; border: 1px solid #FDE68A; padding: 0.15rem 0.5rem; border-radius: 4px;">
            AGUARDANDO CORREÇÃO
          </span>
          <h2 style="font-size: 1.15rem; font-weight: 700; margin: 0.35rem 0 0.2rem 0;">${att.assessment_title}</h2>
          <div style="font-size: 0.8125rem; color: var(--text-muted);">
            Aluno: <strong>${att.student_id}</strong> • Submetido em: ${new Date(att.completed_at || att.started_at).toLocaleString('pt-BR')}
          </div>
        </div>
        <div>
          <a href="#/grading?attempt_id=${att.id}" class="btn btn-primary">
            Avaliar por Rubrica →
          </a>
        </div>
      </div>
    `).join('');

    appContainer.innerHTML = `
      <div style="max-width: 840px; margin: 0 auto;">
        <header class="card" style="margin-bottom: 1.5rem;">
          <h1 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.25rem;">Fila de Avaliação por Rubrica</h1>
          <p style="color: var(--text-secondary); font-size: 0.875rem;">
            Avalie respostas discursivas e análises de código conforme os critérios pedagógicos oficiais.
          </p>
        </header>
        ${itemsHtml}
      </div>
    `;
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
}

async function renderGradingAttempt(attemptId) {
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Carregando dados da prova para correção...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/attempts/${attemptId}`);
    if (!res.ok) throw new Error('Tentativa não encontrada');
    const attempt = await res.json();

    const questionsHtml = attempt.answers.map((ans, idx) => `
      <div class="card" style="margin-bottom: 2rem; border-left: 4px solid var(--primary);">
        <div class="question-header">
          <span class="question-number">Questão ${idx + 1} (${ans.question_type})</span>
          <span class="question-points">Máximo: ${ans.max_score} pontos</span>
        </div>

        <div class="markdown-body" style="font-size: 0.95rem; margin-bottom: 1.25rem;">
          ${renderMarkdown(ans.prompt_markdown)}
        </div>

        <div style="background-color: var(--surface-muted); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1rem; border: 1px solid var(--border);">
          <div style="font-size: 0.8125rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.35rem;">
            Resposta Submetida pelo Aluno:
          </div>
          <div style="font-family: monospace; font-size: 0.9rem; white-space: pre-wrap;">${ans.student_answer ? escapeHtml(ans.student_answer) : '<em>(Sem resposta enviada)</em>'}</div>
        </div>

        ${ans.rubric ? `
          <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; color: #1E40AF; padding: 0.875rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.875rem;">
            <strong>📋 Rubrica Oficial de Pontuação:</strong>
            <p style="margin-top: 0.35rem; white-space: pre-line;">${escapeHtml(ans.rubric)}</p>
          </div>
        ` : ''}

        ${ans.explanation ? `
          <div style="background-color: #F8FAFC; border: 1px solid var(--border); padding: 0.875rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; font-size: 0.875rem;">
            <strong>💡 Gabarito Pedagógico:</strong>
            <p style="margin-top: 0.35rem;">${escapeHtml(ans.explanation)}</p>
          </div>
        ` : ''}

        <div style="display: grid; grid-template-columns: 180px 1fr; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border);">
          <div>
            <label for="score_${ans.question_id}" style="display: block; font-size: 0.8125rem; font-weight: 700; margin-bottom: 0.35rem;">
              Pontuação Atribuída:
            </label>
            <input
              type="number"
              id="score_${ans.question_id}"
              class="grade-input"
              data-question-id="${ans.question_id}"
              min="0"
              max="${ans.max_score}"
              step="0.5"
              value="${ans.score !== undefined ? ans.score : 0}"
              style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 1rem; font-weight: 700;"
              required
            >
          </div>
          <div>
            <label for="feedback_${ans.question_id}" style="display: block; font-size: 0.8125rem; font-weight: 700; margin-bottom: 0.35rem;">
              Feedback Pedagógico e Justificativa:
            </label>
            <textarea
              id="feedback_${ans.question_id}"
              class="feedback-input"
              data-question-id="${ans.question_id}"
              rows="3"
              style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: inherit; font-size: 0.875rem;"
              placeholder="Explique detalhadamente o que o aluno acertou ou precisa revisar..."
            >${escapeHtml(ans.feedback || '')}</textarea>
          </div>
        </div>
      </div>
    `).join('');

    appContainer.innerHTML = `
      <div style="max-width: 840px; margin: 0 auto;">
        <nav class="breadcrumb" style="margin-bottom: 1rem;">
          <a href="#/grading">← Voltar para Fila de Correção</a>
        </nav>

        <header class="card" style="margin-bottom: 2rem; padding: 2rem;">
          <span style="font-size: 0.75rem; font-weight: 700; color: #D97706; text-transform: uppercase;">
            Formulário de Correção por Rubrica
          </span>
          <h1 style="font-size: 1.5rem; font-weight: 800; margin: 0.35rem 0 0.5rem 0;">${attempt.assessment_title}</h1>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">
            Aluno: <strong>${attempt.student_id}</strong> • Disciplina: <strong>${attempt.subject_title}</strong>
          </p>
        </header>

        <form id="gradingForm">
          ${questionsHtml}

          <div style="text-align: right; margin-top: 2rem; margin-bottom: 4rem;">
            <button type="submit" id="btnSubmitGrade" class="btn btn-primary" style="padding: 0.875rem 2rem; font-size: 1rem; font-weight: 700;">
              Salvar Correção e Emitir Nota
            </button>
          </div>
        </form>
      </div>
    `;

    attachCopyCodeListeners();

    const form = document.getElementById('gradingForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSubmitGrade');
      btn.disabled = true;
      btn.textContent = 'Salvando e atualizando domínio...';

      const grades = [];
      attempt.answers.forEach(ans => {
        const scoreInput = form.querySelector(`.grade-input[data-question-id="${ans.question_id}"]`);
        const feedbackInput = form.querySelector(`.feedback-input[data-question-id="${ans.question_id}"]`);
        grades.push({
          question_id: ans.question_id,
          score: Number(scoreInput.value) || 0,
          feedback: feedbackInput ? feedbackInput.value.trim() : ''
        });
      });

      try {
        const gradeRes = await fetch(`/api/assessments/attempts/${attemptId}/grade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grades })
        });
        if (!gradeRes.ok) throw new Error('Falha ao salvar correção');
        const data = await gradeRes.json();
        showToast(`Correção concluída! Nota Final: ${data.final_grade} / 10.0`, 'success');
        window.location.hash = `#/attempt/${attemptId}`;
      } catch (err) {
        showToast(err.message, 'danger');
        btn.disabled = false;
        btn.textContent = 'Salvar Correção e Emitir Nota';
      }
    });

    window.scrollTo(0, 0);
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// VISÃO: CERTIFICADOS ACADÊMICOS
// --------------------------------------------------------------------------
async function renderCertificates() {
  setFocusMode(false);
  updateActiveNav('certificates');
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Verificando elegibilidade e histórico de certificados...</p>
    </div>
  `;

  try {
    const [eligRes, certsRes] = await Promise.all([
      fetch('/api/certificates/eligibility'),
      fetch('/api/certificates')
    ]);

    const eligData = eligRes.ok ? await eligRes.json() : null;
    const certs = certsRes.ok ? await certsRes.json() : [];

    const issuedCertsHtml = certs.length > 0 ? `
      <section style="margin-top: 2.5rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">Certificados Emitidos</h2>
        <div style="display: grid; gap: 1rem;">
          ${certs.map(c => `
            <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-left: 4px solid #B45309;">
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; color: #92400E; text-transform: uppercase;">Certificado Oficial</span>
                <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0.25rem 0;">${c.subject_title}</h3>
                <div style="font-size: 0.8125rem; color: var(--text-muted);">
                  Emitido para <strong>${c.student_name}</strong> em ${new Date(c.issued_at).toLocaleDateString('pt-BR')} • Nota: <strong>${c.final_grade} / 10.0</strong> • Carga: ${c.hours_estimate}h
                </div>
              </div>
              <div>
                <a href="#/certificate/${c.id}" class="btn btn-primary">
                  Ver Certificado Oficial →
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : '';

    const eligHtml = eligData ? `
      <section class="card" style="padding: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
          <div>
            <span class="hero-badge">Verificação de Conclusão</span>
            <h2 style="font-size: 1.35rem; font-weight: 800; margin: 0.25rem 0;">${eligData.subject.title}</h2>
          </div>
          <div>
            ${eligData.eligible ? `
              <span style="background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; padding: 0.35rem 0.85rem; border-radius: 999px; font-weight: 700; font-size: 0.875rem;">
                ✓ Elegível para Emissão
              </span>
            ` : `
              <span style="background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; padding: 0.35rem 0.85rem; border-radius: 999px; font-weight: 700; font-size: 0.875rem;">
                ⏳ Requisitos em Andamento
              </span>
            `}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: var(--surface-muted); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Aulas Concluídas</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0.25rem 0;">
              ${eligData.lessons_progress.percentage}%
            </div>
            <div style="font-size: 0.8125rem; color: var(--text-secondary);">
              ${eligData.lessons_progress.completed} de ${eligData.lessons_progress.total} aulas
            </div>
          </div>

          <div style="background: var(--surface-muted); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Média das Avaliações</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: ${eligData.exam_average >= 6.0 ? 'var(--success)' : 'var(--warning)'}; margin: 0.25rem 0;">
              ${eligData.exam_average > 0 ? eligData.exam_average : '—'} <span style="font-size: 0.875rem; font-weight: 500; color: var(--text-muted);">/ 10.0</span>
            </div>
            <div style="font-size: 0.8125rem; color: var(--text-secondary);">
              Mínimo exigido: 6.0
            </div>
          </div>
        </div>

        ${!eligData.eligible ? `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.5rem;">
            <strong style="color: #92400E; font-size: 0.875rem;">Pendências para Desbloquear o Certificado:</strong>
            <ul style="margin: 0.5rem 0 0 1.25rem; color: #78350F; font-size: 0.875rem;">
              ${eligData.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>
        ` : `
          ${eligData.existing_certificate ? `
            <div style="display: flex; align-items: center; justify-content: space-between; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 1rem; border-radius: var(--radius-sm);">
              <span style="color: #065F46; font-size: 0.875rem; font-weight: 600;">Seu certificado já foi emitido com sucesso!</span>
              <a href="#/certificate/${eligData.existing_certificate.id}" class="btn btn-primary">Abrir Certificado</a>
            </div>
          ` : `
            <form id="generateCertForm" style="border-top: 1px solid var(--border); padding-top: 1.5rem; margin-top: 1.5rem;">
              <div style="margin-bottom: 1rem;">
                <label for="studentNameInput" style="display: block; font-size: 0.875rem; font-weight: 700; margin-bottom: 0.5rem;">
                  Nome Completo para o Certificado:
                </label>
                <input
                  type="text"
                  id="studentNameInput"
                  value="Aluno Padrão"
                  required
                  style="width: 100%; max-width: 400px; padding: 0.6rem 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.95rem;"
                >
              </div>
              <button type="submit" id="btnEmitCert" class="btn btn-primary" style="padding: 0.75rem 2rem; font-size: 1rem; font-weight: 700;">
                🎓 Emitir Meu Certificado Agora
              </button>
            </form>
          `}
        `}
      </section>
    ` : '';

    appContainer.innerHTML = `
      <div style="max-width: 860px; margin: 0 auto;">
        <header class="card hero-card" style="margin-bottom: 2rem;">
          <h1 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 0.5rem;">Certificação Acadêmica</h1>
          <p class="hero-desc">
            Reconhecimento técnico com validação criptográfica de conclusão de estudos e avaliações somativas.
          </p>
        </header>

        ${eligHtml}
        ${issuedCertsHtml}
      </div>
    `;

    const genForm = document.getElementById('generateCertForm');
    if (genForm) {
      genForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnEmitCert');
        btn.disabled = true;
        btn.textContent = 'Emitindo certificado oficial...';

        const studentName = document.getElementById('studentNameInput').value;

        try {
          const genRes = await fetch('/api/certificates/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject_id: 'javascript-avancado',
              student_name: studentName,
              userId: 'aluno-padrao'
            })
          });

          if (!genRes.ok) {
            const errData = await genRes.json();
            throw new Error(errData.reasons ? errData.reasons.join(', ') : errData.error);
          }

          const certData = await genRes.json();
          showToast('Certificado emitido com sucesso!', 'success');
          window.location.hash = `#/certificate/${certData.certificate.id}`;
        } catch (err) {
          showToast(`Erro na emissão: ${err.message}`, 'danger');
          btn.disabled = false;
          btn.textContent = '🎓 Emitir Meu Certificado Agora';
        }
      });
    }

    window.scrollTo(0, 0);
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro: ${err.message}</p></div>`;
  }
}

async function renderCertificateDetail(certId) {
  setFocusMode(false);
  appContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Renderizando certificado solene...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/certificates/${certId}`);
    if (!res.ok) throw new Error('Certificado não localizado');
    const cert = await res.json();

    const formattedDate = new Date(cert.completion_date + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    appContainer.innerHTML = `
      <div style="max-width: 980px; margin: 0 auto; padding-bottom: 4rem;">
        <div class="cert-actions-bar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <a href="#/certificates" class="btn btn-secondary">← Voltar para Certificados</a>
          <button type="button" class="btn btn-primary" onclick="window.print()">
            🖨️ Imprimir / Salvar PDF
          </button>
        </div>

        <div class="certificate-frame">
          <div class="certificate-header-brand">
            SISTEMA ACADÊMICO ASSISTIDO POR IA • PLATAFORMA EDUCACIONAL
          </div>

          <div class="certificate-seal">🎓</div>

          <h1 class="certificate-main-title">CERTIFICADO DE CONCLUSÃO</h1>

          <p class="certificate-body-text">
            Certificamos solenemente que
          </p>

          <div class="certificate-student-name">${escapeHtml(cert.student_name)}</div>

          <p class="certificate-body-text">
            concluiu com êxito todas as exigências curriculares e acadêmicas da disciplina avançada de<br>
            <strong class="certificate-course-name">${escapeHtml(cert.subject_title)}</strong>
          </p>

          <div class="certificate-metrics">
            <div>
              <div class="cert-metric-val">${Number(cert.final_grade).toFixed(1)} / 10.0</div>
              <div class="cert-metric-label">Aproveitamento Final</div>
            </div>
            <div>
              <div class="cert-metric-val">${cert.hours_estimate} horas</div>
              <div class="cert-metric-label">Carga Horária Estimada</div>
            </div>
            <div>
              <div class="cert-metric-val">${formattedDate}</div>
              <div class="cert-metric-label">Data de Conclusão</div>
            </div>
          </div>

          <div class="certificate-verification">
            Código de Autenticação e Verificação: <strong>${escapeHtml(cert.verification_code)}</strong>
          </div>

          <div class="certificate-legal-disclaimer">
            Aviso Legal Obrigatório (AGENTS.md Seção 40): Este documento é um certificado de conclusão emitido no âmbito do projeto Sistema Acadêmico Assistido por IA, atestando o cumprimento dos requisitos e carga horária de estudos pelo aluno. Não possui reconhecimento governamental, acadêmico formal ou habilitação profissional legal.
          </div>
        </div>
      </div>
    `;

    window.scrollTo(0, 0);
  } catch (err) {
    appContainer.innerHTML = `<div class="card" style="border-color: var(--danger);"><p>Erro ao exibir certificado: ${err.message}</p></div>`;
  }
}

// --------------------------------------------------------------------------
// ROTEADOR CLIENT-SIDE
// --------------------------------------------------------------------------
function router() {
  const hash = window.location.hash || '#/';
  const searchParams = new URLSearchParams(window.location.search);

  // Suporte a rota com query param /assessment?id=...
  if (window.location.pathname.startsWith('/assessment') || (hash.startsWith('#/assessment') && searchParams.has('id'))) {
    const id = searchParams.get('id') || 'js-diag-01';
    renderAssessment(id);
    return;
  }

  // Roteamento de Correção por Rubrica
  if (hash.startsWith('#/grading')) {
    const urlParts = hash.split('?');
    const params = new URLSearchParams(urlParts[1] || '');
    let attemptId = params.get('attempt_id');
    if (!attemptId && hash.startsWith('#/grading/')) {
      attemptId = hash.replace('#/grading/', '');
    }
    renderGrading(attemptId || null);
    return;
  }

  // Roteamento Hash Principal
  if (hash === '#/' || hash === '') {
    renderDashboard();
  } else if (hash === '#/subjects') {
    renderSubjects();
  } else if (hash.startsWith('#/subject/')) {
    const id = hash.replace('#/subject/', '');
    renderSubjectDetail(id);
  } else if (hash.startsWith('#/lesson/')) {
    const id = hash.replace('#/lesson/', '');
    renderLesson(id);
  } else if (hash.startsWith('#/assessment/')) {
    const id = hash.replace('#/assessment/', '');
    renderAssessment(id);
  } else if (hash === '#/history') {
    renderHistory();
  } else if (hash.startsWith('#/attempt/')) {
    const id = hash.replace('#/attempt/', '');
    renderAttemptDetail(id);
  } else if (hash === '#/playground') {
    renderPlayground();
  } else if (hash === '#/srs') {
    renderSRS();
  } else if (hash === '#/certificates') {
    renderCertificates();
  } else if (hash.startsWith('#/certificate/')) {
    const id = hash.replace('#/certificate/', '');
    renderCertificateDetail(id);
  } else {
    renderDashboard();
  }
}

// --------------------------------------------------------------------------
// NAVEGAÇÃO MOBILE RESPONSIVA (MENU HAMBURGER & DRAWER)
// --------------------------------------------------------------------------
export function initMobileNav() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const navBackdrop = document.getElementById('navBackdrop');
  const themeSelect = document.getElementById('themeSelect');
  const mobileThemeSelect = document.getElementById('mobileThemeSelect');

  if (!hamburgerBtn || !mobileNav || !navBackdrop) return;

  function openMenu() {
    hamburgerBtn.classList.add('is-active');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    mobileNav.classList.add('is-open');
    mobileNav.setAttribute('aria-hidden', 'false');
    navBackdrop.classList.add('is-open');
    navBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
  }

  function closeMenu(restoreFocus = false) {
    hamburgerBtn.classList.remove('is-active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('is-open');
    mobileNav.setAttribute('aria-hidden', 'true');
    navBackdrop.classList.remove('is-open');
    navBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');

    if (restoreFocus) {
      hamburgerBtn.focus();
    }
  }

  function toggleMenu() {
    const isOpen = hamburgerBtn.classList.contains('is-active');
    if (isOpen) {
      closeMenu(false);
    } else {
      openMenu();
    }
  }

  // Alternar menu ao clicar no botão hamburger
  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Fechar ao clicar no backdrop
  navBackdrop.addEventListener('click', () => {
    closeMenu(false);
  });

  // Fechar automaticamente ao clicar em qualquer link móvel
  mobileNav.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      closeMenu(false);
    });
  });

  // Fechar ao pressionar Escape e devolver o foco para o botão hamburger
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hamburgerBtn.classList.contains('is-active')) {
      closeMenu(true);
    }
  });

  // Fechar automaticamente em caso de resize para tela desktop (> 1024px)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024 && hamburgerBtn.classList.contains('is-active')) {
      closeMenu(false);
    }
  });

  // Sincronização explícita dos seletores de tema (desktop e mobile)
  if (themeSelect && mobileThemeSelect) {
    mobileThemeSelect.value = themeSelect.value;
    themeSelect.addEventListener('change', () => {
      if (mobileThemeSelect.value !== themeSelect.value) {
        mobileThemeSelect.value = themeSelect.value;
      }
    });
    mobileThemeSelect.addEventListener('change', () => {
      if (themeSelect.value !== mobileThemeSelect.value) {
        themeSelect.value = mobileThemeSelect.value;
        themeSelect.dispatchEvent(new Event('change'));
      }
    });
  }
}

// Inicialização da Aplicação
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNav();
  router();
  window.addEventListener('hashchange', router);
});

