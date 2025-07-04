const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const quoteRoutes = require('./routes/quote');
const documentRoutes = require('./routes/document');
// À ajouter dans le fichier principal (index.js) de chaque microservice
const promBundle = require('express-prom-bundle');
const dotenv = require('dotenv');
dotenv.config();


// Création de l'application Express
const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
app.use(morgan('dev'));

// Middleware custom pour logger toutes les requêtes
app.use((req, res, next) => {
  // console.log(`🌐 Service IA reçoit: ${req.method} ${req.url}`);
  // console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body keys:', Object.keys(req.body));
  }
  next();
});

// Créer les dossiers nécessaires s'ils n'existent pas
const uploadsDir = path.join(__dirname, '../uploads');
const logsDir = path.join(__dirname, '../logs');

[uploadsDir, logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Routes
app.use('/api', quoteRoutes);
app.use('/api', documentRoutes);

// Middleware Prometheus pour collecter les métriques HTTP
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { project_name: 'ia-service' }, // Remplacer par le nom du service
  promClient: { collectDefaultMetrics: {} }
});
app.use(metricsMiddleware);

// Route pour exposer les métriques Prometheus
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.end(promBundle.promClient.register.metrics());
});
// Route par défaut
app.get('/', (req, res) => {
  res.json({
    message: 'Service IA opérationnel',
    endpoints: [
      '/api/quote',
      '/api/analyze-document',
      
    ]
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur:', err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Une erreur est survenue sur le serveur'
    }
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Service IA démarré sur le port ${PORT}`);
}); 