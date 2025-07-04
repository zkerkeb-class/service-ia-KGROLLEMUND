const express = require('express');
const { generateQuote } = require('../controllers/quoteController');
const { generateQuotePDF, generateQuoteHTML } = require('../services/pdfService');
const { getUserById, bddAPI } = require('../services/databaseService');
const { logPdfDebug } = require('../services/pdfLogger');

const router = express.Router();

// Route de test
router.post('/test', (req, res) => {
  console.log('🧪 Route de test appelée !');
  res.json({ message: 'Test OK', body: req.body });
});

// Route pour générer un devis
router.post('/quote', (req, res, next) => {
  console.log('🔥 Route POST /quote appelée dans quote.js !');
  console.log('Method:', req.method);
  console.log('Body present:', !!req.body);
  next();
}, generateQuote);


// Route pour générer un PDF temporaire (pour le développement)
router.post('/temp/pdf', async (req, res) => {
  try {
    const { quoteData, userData } = req.body;
    const htmlContent = generateQuoteHTML(quoteData, userData);
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
  }
});

// Route pour télécharger un devis en PDF
router.get('/quotes/pdf/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Logger le début de la génération PDF
    logPdfDebug('PDF-DOWNLOAD-START', {
      quoteId: id,
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    
    // Récupérer les données du devis depuis la base de données
    let quoteData = null;
    let isFinalized = false;
    
    // D'abord essayer de récupérer comme devis finalisé
    try {
      const finalQuoteUrl = `/quotes/${id}`;
      logPdfDebug('TRYING-FINAL-QUOTE', { url: finalQuoteUrl });
      
      const finalQuoteResponse = await bddAPI.get(finalQuoteUrl);
      quoteData = finalQuoteResponse.data;
      isFinalized = true;
      
      logPdfDebug('FINAL-QUOTE-FOUND', {
        id,
        data: quoteData,
        dataKeys: Object.keys(quoteData)
      });
      
      console.log('📄 Devis finalisé trouvé avec ID:', id);
    } catch (error) {
      logPdfDebug('FINAL-QUOTE-ERROR', {
        id,
        error: error.message,
        status: error.response?.status
      });
      
      // Si pas trouvé, essayer comme demande de devis
      try {
        const quoteRequestUrl = `/quote-requests/${id}`;
        logPdfDebug('TRYING-QUOTE-REQUEST', { url: quoteRequestUrl });
        
        const quoteRequestResponse = await bddAPI.get(quoteRequestUrl);
        quoteData = quoteRequestResponse.data;
        isFinalized = false;
        
        logPdfDebug('QUOTE-REQUEST-FOUND', {
          id,
          data: quoteData,
          dataKeys: Object.keys(quoteData)
        });
        
        console.log('📋 Demande de devis trouvée avec ID:', id);
      } catch (requestError) {
        logPdfDebug('QUOTE-REQUEST-ERROR', {
          id,
          error: requestError.message,
          status: requestError.response?.status
        });
        
        return res.status(404).json({ message: 'Devis non trouvé' });
      }
    }
    
    if (!quoteData) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }
    
    // Console log pour debug des données avant transformation
    console.log('🔍 Données brutes reçues de la BDD:', {
      title: quoteData.title,
      clientName: quoteData.clientName,
      tasksEstimation: quoteData.tasksEstimation ? quoteData.tasksEstimation.slice(0, 2) : null,
      totalEstimate: quoteData.totalEstimate,
      timeEstimate: quoteData.timeEstimate
    });
    
    // Générer le PDF avec la bonne structure de données
    const pdfBuffer = await generateQuotePDF({
      title: quoteData.title,
      description: quoteData.description,
      clientName: quoteData.clientName || 'Client',
      estimates: (quoteData.tasksEstimation || []).map(task => ({
        featureName: task.task || task.featureName || 'Tâche',
        explanation: task.description || `Tâche: ${task.task || 'Non spécifiée'}`,
        fixedPrice: task.cost || task.estimatedCost || task.fixedPrice || 0,
        estimatedHours: task.time || task.estimatedHours || 0
      })),
      totalPrice: quoteData.totalEstimate || 0,
      totalHours: quoteData.timeEstimate || 0,
      clientEmail: quoteData.clientEmail || 'client@example.com'
    }, {
      name: quoteData.user?.name || 'Développeur',
      email: quoteData.user?.email || quoteData.clientEmail || '',
      clientName: quoteData.clientName || 'Client'
    });
    
    // Détecter si c'est un PDF ou du HTML
    const isHtml = pdfBuffer.toString().startsWith('<!DOCTYPE html>');
    
    if (isHtml) {
      // Envoyer le HTML avec instructions d'impression
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="devis-${id}.html"`);
      
      // Ajouter un script pour imprimer automatiquement
      const htmlWithPrintScript = pdfBuffer.toString().replace(
        '</body>',
        `
        <script>
          window.onload = function() {
            if (confirm('Voulez-vous imprimer ce devis maintenant ?')) {
              window.print();
            }
          }
        </script>
        </body>`
      );
      
      res.send(htmlWithPrintScript);
    } else {
      // Envoyer le PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="devis-${id}.pdf"`);
      res.send(pdfBuffer);
    }
    
  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
  }
});

// Route pour mettre à jour les tâches d'une demande de devis
router.put('/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { tasksEstimation, totalEstimate, timeEstimate } = req.body;
    
    // Mettre à jour les tâches dans la base de données
    const response = await bddAPI.put(`/quote-requests/${id}`, {
      tasksEstimation,
      totalEstimate,
      timeEstimate
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des tâches:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour des tâches' });
  }
});

module.exports = router; 