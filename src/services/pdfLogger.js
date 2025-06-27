const fs = require('fs');
const path = require('path');

// Créer le dossier de logs s'il n'existe pas
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Fonction pour logger les données dans un fichier dédié
const logPdfDebug = (type, data) => {
  const timestamp = new Date().toISOString();
  const logFile = path.join(logsDir, 'pdf-debug.log');
  
  let logContent = `\n==================== ${type.toUpperCase()} - ${timestamp} ====================\n`;
  
  if (typeof data === 'object') {
    logContent += JSON.stringify(data, null, 2);
  } else {
    logContent += data;
  }
  
  logContent += '\n='.repeat(80) + '\n';
  
  // Écrire de manière asynchrone pour ne pas bloquer
  fs.appendFile(logFile, logContent, (err) => {
    if (err) {
      console.error('Erreur lors de l\'écriture du log PDF:', err);
    }
  });
  
  // Aussi afficher dans la console avec un préfixe court
  console.log(`📋 [PDF-DEBUG] ${type} - voir logs/pdf-debug.log`);
};

// Fonction pour logger le HTML généré
const logHtmlContent = (htmlContent) => {
  const timestamp = new Date().toISOString();
  const htmlFile = path.join(logsDir, `html-debug-${timestamp.replace(/[:.]/g, '-')}.html`);
  
  fs.writeFile(htmlFile, htmlContent, (err) => {
    if (err) {
      console.error('Erreur lors de l\'écriture du HTML:', err);
    } else {
      console.log(`📄 [HTML-DEBUG] Sauvegardé dans ${htmlFile}`);
    }
  });
};

// Fonction pour logger les infos du PDF binaire
const logPdfInfo = (pdfBuffer) => {
  const timestamp = new Date().toISOString();
  const logFile = path.join(logsDir, 'pdf-debug.log');
  
  // Analyse du PDF
  const pdfStart = pdfBuffer.toString('hex', 0, 8);
  const pdfEnd = pdfBuffer.toString('hex', pdfBuffer.length - 8, pdfBuffer.length);
  const isValidPdf = pdfStart.startsWith('255044462d'); // %PDF-
  
  const pdfInfo = {
    timestamp,
    size: pdfBuffer.length,
    startHex: pdfStart,
    endHex: pdfEnd,
    isValidPdf,
    startString: pdfBuffer.toString('ascii', 0, 10),
    endString: pdfBuffer.toString('ascii', pdfBuffer.length - 10, pdfBuffer.length)
  };
  
  logPdfDebug('PDF-INFO', pdfInfo);
  
  // Optionnellement sauvegarder le PDF pour inspection manuelle
  const pdfFile = path.join(logsDir, `debug-${timestamp.replace(/[:.]/g, '-')}.pdf`);
  fs.writeFile(pdfFile, pdfBuffer, (err) => {
    if (err) {
      console.error('Erreur lors de l\'écriture du PDF debug:', err);
    } else {
      console.log(`🔍 [PDF-DEBUG] PDF sauvegardé pour inspection: ${pdfFile}`);
    }
  });
};

// Fonction pour nettoyer les anciens logs (garder seulement les 5 derniers)
const cleanOldLogs = () => {
  try {
    const files = fs.readdirSync(logsDir);
    const debugFiles = files.filter(f => f.startsWith('html-debug-') || f.startsWith('debug-'));
    
    if (debugFiles.length > 10) {
      // Trier par date de modification et garder seulement les 5 plus récents
      const sortedFiles = debugFiles
        .map(f => ({ name: f, time: fs.statSync(path.join(logsDir, f)).mtime }))
        .sort((a, b) => b.time - a.time)
        .slice(5); // Garder les 5 plus récents, supprimer le reste
      
      sortedFiles.forEach(file => {
        fs.unlinkSync(path.join(logsDir, file.name));
      });
    }
  } catch (err) {
    console.error('Erreur lors du nettoyage des logs:', err);
  }
};

module.exports = {
  logPdfDebug,
  logHtmlContent,
  logPdfInfo,
  cleanOldLogs
}; 