const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_DB_PATH = path.resolve(__dirname, '..', 'professor', 'database', 'platform.db');

let activeDbInstance = null;

function createSchema(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      prerequisites TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      objective TEXT,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content_markdown TEXT NOT NULL,
      lesson_type TEXT DEFAULT 'THEORY',
      estimated_minutes INTEGER DEFAULT 30,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learning_objectives (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_materials (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      resource_type TEXT
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      last_accessed_at TEXT,
      UNIQUE(user_id, entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      passing_score REAL DEFAULT 70,
      max_score REAL DEFAULT 100,
      time_limit_minutes INTEGER,
      status TEXT DEFAULT 'ACTIVE',
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      type TEXT NOT NULL,
      prompt_markdown TEXT NOT NULL,
      options_json TEXT,
      correct_answer TEXT,
      rubric TEXT,
      explanation TEXT,
      points REAL NOT NULL,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      assessment_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      score REAL,
      max_score REAL,
      status TEXT NOT NULL,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      student_answer TEXT,
      score REAL,
      feedback TEXT,
      is_pending INTEGER DEFAULT 0,
      FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topic_mastery (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      mastery_score REAL DEFAULT 0,
      status TEXT DEFAULT 'NOT_STARTED',
      last_assessed_at TEXT,
      UNIQUE(user_id, subject_id, topic_id)
    );

    CREATE TABLE IF NOT EXISTS spaced_reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      card_title TEXT NOT NULL,
      prompt_front TEXT NOT NULL,
      answer_back TEXT NOT NULL,
      repetition INTEGER DEFAULT 0,
      interval_days INTEGER DEFAULT 1,
      ease_factor REAL DEFAULT 2.5,
      due_date TEXT NOT NULL,
      last_reviewed_at TEXT,
      status TEXT DEFAULT 'REVIEW_REQUIRED'
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      subject_title TEXT NOT NULL,
      final_grade REAL NOT NULL,
      completion_date TEXT NOT NULL,
      verification_code TEXT NOT NULL UNIQUE,
      hours_estimate INTEGER NOT NULL,
      issued_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lesson_exercises (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt_markdown TEXT NOT NULL,
      options_json TEXT,
      correct_answer TEXT,
      explanation TEXT,
      initial_code TEXT,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lesson_exercise_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      student_answer TEXT,
      is_correct INTEGER NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_modules_subject ON modules(subject_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
    CREATE INDEX IF NOT EXISTS idx_objectives_entity ON learning_objectives(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_materials_target ON support_materials(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_subject ON assessments(subject_id);
    CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id, assessment_id);
    CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_topic_mastery_user ON topic_mastery(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_spaced_reviews_due ON spaced_reviews(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id, subject_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_code ON certificates(verification_code);
    CREATE INDEX IF NOT EXISTS idx_lesson_exercises_lesson ON lesson_exercises(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_exercise_sub_user_lesson ON lesson_exercise_submissions(user_id, lesson_id);
  `);

  try {
    db.exec('ALTER TABLE answers ADD COLUMN is_pending INTEGER DEFAULT 0;');
  } catch (err) {
    // Coluna já existe ou migração prévia aplicada
  }

  return db;
}

function getDatabase(customPath = null) {
  if (customPath) {
    if (customPath !== ':memory:') {
      const dbDir = path.dirname(customPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }
    const db = new DatabaseSync(customPath);
    return createSchema(db);
  }

  if (!activeDbInstance) {
    const dbDir = path.dirname(DEFAULT_DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    activeDbInstance = new DatabaseSync(DEFAULT_DB_PATH);
    createSchema(activeDbInstance);
    try {
      const { rehydrateAttempts } = require('./services/file-sync.js');
      rehydrateAttempts(activeDbInstance);
    } catch (err) {
      console.error('Erro ao reidratar banco padrão:', err.message);
    }
  }

  return activeDbInstance;
}

function closeDatabase() {
  if (activeDbInstance) {
    activeDbInstance.close();
    activeDbInstance = null;
  }
}

module.exports = {
  getDatabase,
  createSchema,
  closeDatabase,
  DEFAULT_DB_PATH
};
