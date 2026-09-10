const express = require('express');
const path = require('node:path');
const { createApiRouter } = require('./routes/api.js');
const { getDatabase } = require('./database.js');

function createApp(customDb = null) {
  const app = express();

  // Middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Rotas de API
  app.use('/api', createApiRouter(customDb));

  // Arquivos estáticos do frontend
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  // Fallback para SPA em rotas não-API
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

function startServer(port = process.env.PORT || 3000) {
  const app = createApp();
  // Garante que o banco seja inicializado
  getDatabase();

  const server = app.listen(port, () => {
    console.log(`🎓 Plataforma Educacional iniciada com sucesso!`);
    console.log(`🌐 Acesse localmente em: http://localhost:${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
