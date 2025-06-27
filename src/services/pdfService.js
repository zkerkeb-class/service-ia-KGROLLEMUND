const fs = require('fs');
const path = require('path');
const { logPdfDebug, logHtmlContent, logPdfInfo, cleanOldLogs } = require('./pdfLogger');
const { generateSimplePDF } = require('./simplePdf');


//Générer un PDF de devis
const generateQuotePDF = async (quoteData, userData) => {
  try {
    // Nettoyer les anciens logs au début
    cleanOldLogs();
    
    logPdfDebug('PDF-GENERATION-START', {
      hasQuoteData: !!quoteData,
      hasUserData: !!userData,
      estimatesCount: quoteData?.estimates?.length || 0,
      puppeteerStatus: 'checking...'
    });
    
    const htmlContent = generateQuoteHTML(quoteData, userData);
    
    // Utiliser puppeteer pour convertir HTML en PDF
    try {
      logPdfDebug('PUPPETEER-INIT', 'Tentative de lancement de Puppeteer...');
      
      // Vérifier que Puppeteer est bien installé
      let puppeteer;
      try {
        puppeteer = require('puppeteer');
        logPdfDebug('PUPPETEER-INSTALLED', 'Puppeteer trouvé et chargé');
      } catch (requireError) {
        logPdfDebug('PUPPETEER-NOT-FOUND', {
          message: 'Puppeteer not installed',
          error: requireError.message
        });
        throw new Error('Puppeteer not installed');
      }
      
      logPdfDebug('PUPPETEER-BROWSER', 'Lancement du navigateur...');
      const browser = await puppeteer.launch({ 
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
        timeout: 60000,
        protocolTimeout: 60000
      });
      
      logPdfDebug('PUPPETEER-PAGE', 'Création de la page...');
      const page = await browser.newPage();
      
      // Configuration de la page pour améliorer le rendu
      await page.setViewport({ width: 1200, height: 800 });
      
      // Configuration des en-têtes pour l'encoding
      await page.setExtraHTTPHeaders({
        'Accept-Charset': 'utf-8'
      });
      
      logPdfDebug('PUPPETEER-CONTENT', 'Chargement du contenu HTML...');
      await page.setContent(htmlContent, { 
        waitUntil: ['load', 'domcontentloaded'],
        timeout: 60000
      });
      
      // Attendre que le rendu soit complet
      await page.waitForTimeout(1000);
      
      logPdfDebug('PUPPETEER-PDF', 'Génération du PDF...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        margin: {
          top: '15mm',
          right: '15mm',
          bottom: '15mm',
          left: '15mm'
        },
        scale: 1,
        timeout: 60000
      });
      
      // Vérifier que le PDF n'est pas vide
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('PDF buffer is empty');
      }
      
      // Vérifier que le PDF a des headers valides
      const pdfHeader = pdfBuffer.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        throw new Error(`Invalid PDF format - header: ${pdfHeader}`);
      }
      
      // Logger les infos détaillées du PDF généré
      logPdfInfo(pdfBuffer);
      logPdfDebug('PDF-VALIDATION', {
        size: pdfBuffer.length,
        header: pdfHeader,
        isValid: true
      });
      
      // Sauvegarder le PDF pour debug
      try {
        const debugPdfPath = path.join(__dirname, '../logs', `debug-pdf-${Date.now()}.pdf`);
        fs.writeFileSync(debugPdfPath, pdfBuffer);
        logPdfDebug('PDF-DEBUG-SAVED', { path: debugPdfPath });
      } catch (saveError) {
        logPdfDebug('PDF-DEBUG-SAVE-ERROR', saveError.message);
      }
      
      await browser.close();
      return pdfBuffer;
      
    } catch (puppeteerError) {
      logPdfDebug('PUPPETEER-ERROR', {
        message: puppeteerError.message,
        type: puppeteerError.constructor.name,
        stack: puppeteerError.stack
      });
      
      // NOUVEAU : Créer un vrai PDF de fallback avec jsPDF
      try {
        logPdfDebug('FALLBACK-JSPDF-START', 'Tentative avec jsPDF...');
        
        // Essayer d'utiliser jsPDF comme fallback
        const { jsPDF } = require('jspdf');
        const doc = new jsPDF();
        
        // Créer un PDF simple mais valide
        doc.setFontSize(20);
        doc.text('DEVIS', 20, 30);
        
        doc.setFontSize(12);
        doc.text(`Titre: ${quoteData.title}`, 20, 50);
        doc.text(`Description: ${quoteData.description}`, 20, 60);
        doc.text(`Client: ${userData.name} (${userData.email})`, 20, 70);
        
        let yPos = 90;
        doc.text('Détail des estimations:', 20, yPos);
        yPos += 10;
        
        if (quoteData.estimates && quoteData.estimates.length > 0) {
          quoteData.estimates.forEach((estimate, index) => {
            if (yPos > 280) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(`${index + 1}. ${estimate.featureName || 'Tâche'}`, 20, yPos);
            yPos += 7;
            doc.text(`   Prix: ${estimate.fixedPrice || 0}€ - Temps: ${estimate.estimatedHours?.min || 0}h`, 25, yPos);
            yPos += 10;
          });
        }
        
        yPos += 10;
        doc.text(`TOTAL: ${quoteData.totalPrice}€ - ${quoteData.totalHours}h`, 20, yPos);
        
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        
        logPdfDebug('FALLBACK-JSPDF-SUCCESS', {
          size: pdfBuffer.length,
          method: 'jsPDF'
        });
        
        return pdfBuffer;
        
      } catch (jsPdfError) {
        logPdfDebug('FALLBACK-JSPDF-ERROR', {
          message: jsPdfError.message,
          stack: jsPdfError.stack
        });
        
        // Fallback vers PDF simple custom
        try {
          logPdfDebug('FALLBACK-SIMPLE-PDF-START', 'Génération PDF simple...');
          
          const simplePdfBuffer = generateSimplePDF(quoteData, userData);
          
          logPdfDebug('FALLBACK-SIMPLE-PDF-SUCCESS', {
            size: simplePdfBuffer.length,
            method: 'simplePDF'
          });
          
          return simplePdfBuffer;
          
        } catch (simplePdfError) {
          logPdfDebug('FALLBACK-SIMPLE-PDF-ERROR', {
            message: simplePdfError.message,
            stack: simplePdfError.stack
          });
          
          // Dernier fallback: HTML avec headers PDF
          const enhancedHtml = htmlContent.replace('<title>', '<title>PDF - ');
          logPdfDebug('HTML-FALLBACK', {
            htmlLength: enhancedHtml.length,
            bufferSize: Buffer.from(enhancedHtml, 'utf8').length
          });
          
          return Buffer.from(enhancedHtml, 'utf8');
        }
      }
    }
    
  } catch (error) {
    logPdfDebug('PDF-GENERATION-ERROR', {
      message: error.message,
      type: error.constructor.name,
      stack: error.stack
    });
    throw new Error('Impossible de générer le PDF du devis');
  }
};


//Générer le contenu HTML du devis
const generateQuoteHTML = (quoteData, userData) => {
  // Logger les données d'entrée dans un fichier dédié
  logPdfDebug('INPUT-DATA', {
    quoteData,
    userData,
    estimates: {
      exists: !!quoteData.estimates,
      length: quoteData.estimates?.length || 0,
      firstEstimate: quoteData.estimates?.[0] || null
    }
  });
  
  const currentDate = new Date().toLocaleDateString('fr-FR');
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Devis - ${quoteData.title || 'Devis'}</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 20mm;
            color: #333;
            font-size: 12pt;
            line-height: 1.5;
            background: white;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #4a90e2;
            padding-bottom: 20px;
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        .header h1 {
            color: #4a90e2;
            margin: 0;
            font-size: 24pt;
            font-weight: bold;
        }
        .header p {
            margin: 10px 0;
            font-size: 11pt;
            color: #666;
        }
        .info-section {
            margin-bottom: 25px;
            page-break-inside: avoid;
        }
        .info-section h2 {
            color: #444;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
            margin-bottom: 15px;
            font-size: 16pt;
            font-weight: bold;
        }
        .info-section p {
            margin: 8px 0;
            font-size: 11pt;
        }
        .estimate-item {
            background: #f9f9f9;
            padding: 15px;
            margin: 10px 0;
            border-left: 4px solid #4a90e2;
            page-break-inside: avoid;
            border-radius: 3px;
        }
        .estimate-item h3 {
            margin: 0 0 10px 0;
            color: #4a90e2;
            font-size: 13pt;
            font-weight: bold;
        }
        .estimate-item p {
            margin: 5px 0;
            font-size: 11pt;
        }
        .price {
            font-weight: bold;
            color: #2e7d32;
            font-size: 12pt;
        }
        .total {
            background: #e8f5e9;
            padding: 20px;
            text-align: center;
            border-radius: 5px;
            margin-top: 30px;
            page-break-inside: avoid;
            border: 1px solid #c8e6c9;
        }
        .total h2 {
            margin: 0 0 10px 0;
            color: #2e7d32;
            font-size: 18pt;
            font-weight: bold;
        }
        .total p {
            margin: 5px 0;
            font-size: 12pt;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 10pt;
            page-break-inside: avoid;
        }
        
        /* Styles pour l'impression et PDF */
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            body {
                margin: 0 !important;
                padding: 15mm !important;
                font-size: 11pt !important;
                line-height: 1.4 !important;
            }
            .header {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .estimate-item {
                page-break-inside: avoid;
                break-inside: avoid;
                margin-bottom: 10pt;
            }
            .total {
                page-break-inside: avoid;
                break-inside: avoid;
                margin-top: 20pt;
            }
            .info-section {
                page-break-inside: avoid;
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>DEVIS</h1>
        <p>Généré le ${currentDate}</p>
    </div>
    
    <div class="info-section">
        <h2>Informations du projet</h2>
        <p><strong>Titre :</strong> ${quoteData.title || 'Non spécifié'}</p>
        <p><strong>Description :</strong> ${quoteData.description || 'Non spécifiée'}</p>
        <p><strong>Client :</strong> ${userData.name || 'Non spécifié'} (${userData.email || 'Non spécifié'})</p>
    </div>
    
    <div class="info-section">
        <h2>Détail des estimations</h2>
        ${quoteData.estimates && quoteData.estimates.length > 0 ? 
          quoteData.estimates.map((estimate, index) => {
            return `
            <div class="estimate-item">
                <h3>${(estimate.featureName || 'Tâche ' + (index + 1)).replace(/[<>&"']/g, (char) => {
                  const entities = {'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'};
                  return entities[char];
                })}</h3>
                <p>${(estimate.explanation || 'Description non disponible').replace(/[<>&"']/g, (char) => {
                  const entities = {'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'};
                  return entities[char];
                })}</p>
                <p class="price">Prix fixe: ${estimate.fixedPrice || 0}€</p>
                <p>Temps estimé: ${estimate.estimatedHours && estimate.estimatedHours.min ? estimate.estimatedHours.min : '0'}h</p>
            </div>`;
          }).join('\n        ') 
        : '<p>Aucune estimation détaillée disponible</p>'}
    </div>
    
    <div class="total">
        <h2>Total estimé</h2>
        <p style="font-size: 1.3em; margin: 10px 0;">
            ${quoteData.totalPrice}€
        </p>
        <p>Temps total estimé: ${quoteData.totalHours || 'N/A'}h</p>
    </div>
    
    <div class="footer">
        <p>Document généré automatiquement le ${currentDate}</p>
    </div>
</body>
</html>
  `;
  
  // Logger le HTML complet dans un fichier pour inspection
  logHtmlContent(htmlContent);
  logPdfDebug('HTML-INFO', {
    length: htmlContent.length,
    firstChars: htmlContent.substring(0, 100),
    lastChars: htmlContent.substring(htmlContent.length - 100)
  });
  
  return htmlContent;
};


const savePDFToServer = async (pdfBuffer, filename) => {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads/pdfs');
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, pdfBuffer);
    
    return filePath;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde du PDF:', error);
    throw new Error('Impossible de sauvegarder le PDF');
  }
};

module.exports = {
  generateQuotePDF,
  generateQuoteHTML,
  savePDFToServer
}; 