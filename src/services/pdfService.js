const fs = require('fs');
const path = require('path');
const { logPdfDebug, logHtmlContent, logPdfInfo, cleanOldLogs } = require('./pdfLogger');
const { generateSimplePDF } = require('./simplePdf');
let puppeteer = require('puppeteer');

// Fonction pour décoder les entités HTML
const decodeHtmlEntities = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
};

// Fonction utilitaire pour formater les estimations selon le type (précise ou fourchette)
const formatEstimateValue = (value, unit = '', isSubscribed = true) => {
  // Si c'est déjà une chaîne formatée avec unité, la retourner telle quelle
  if (typeof value === 'string') {
    if (value.includes(unit)) {
      return value; // Déjà formaté avec l'unité
    }
    if (value.includes('-')) {
      return `${value}${unit}`; // Fourchette sans unité, ajouter l'unité
    }
    // Chaîne simple, convertir en nombre si possible
    const numValue = parseFloat(value);
    return isNaN(numValue) ? `${value}${unit}` : `${numValue}${unit}`;
  }
  
  // Si c'est un objet avec min/max (ancienne structure)
  if (value && typeof value === 'object' && (value.min !== undefined || value.max !== undefined)) {
    if (value.min === value.max) {
      return `${value.min}${unit}`;
    }
    return `${value.min}-${value.max}${unit}`;
  }
  
  // Si c'est une valeur numérique
  if (typeof value === 'number') {
    return `${value}${unit}`;
  }
  
  // Fallback
  return `0${unit}`;
};

// Fonction pour extraire la valeur numérique d'une fourchette ou valeur précise
const extractNumericValue = (value) => {
  if (typeof value === 'number') return value;
  
  if (typeof value === 'string') {
    // Retirer les symboles € et h si présents
    const cleanValue = value.replace(/[€h]/g, '');
    
    // Si c'est une fourchette (ex: "20-30"), prendre la valeur médiane
    if (cleanValue.includes('-')) {
      const parts = cleanValue.split('-');
      const min = parseFloat(parts[0]) || 0;
      const max = parseFloat(parts[1]) || min;
      return (min + max) / 2; // Valeur médiane
    }
    
    return parseFloat(cleanValue) || 0;
  }
  
  // Si c'est un objet avec min/max (ancienne structure)
  if (value && typeof value === 'object' && (value.min !== undefined || value.max !== undefined)) {
    const min = parseFloat(value.min) || 0;
    const max = parseFloat(value.max) || min;
    return (min + max) / 2; // Valeur médiane
  }
  
  return 0;
};

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
      // try {
      //   puppeteer = require('puppeteer');
      //   logPdfDebug('PUPPETEER-INSTALLED', 'Puppeteer trouvé et chargé');
      // } catch (requireError) {
      //   logPdfDebug('PUPPETEER-NOT-FOUND', {
      //     message: 'Puppeteer not installed',
      //     error: requireError.message
      //   });
      //   throw new Error('Puppeteer not installed');
      // }
      
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
        
        // === EN-TÊTE PROFESSIONNEL ===
        // Bandeau bleu avec dégradé
        doc.setFillColor(70, 130, 226);
        doc.rect(0, 0, 210, 55, 'F');
        
        // Titre principal avec nom du client
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        const clientName = quoteData.clientName || userData.clientName || 'Client';
        doc.text(`DEVIS pour ${clientName}`, 20, 25);
        
        // Informations devis (droite de l'en-tête)
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        const devisNumber = `${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        const currentDate = new Date().toLocaleDateString('fr-FR');
        
        doc.text(`N° de devis: ${devisNumber}`, 20, 35);
        doc.text(`Date d'émission: ${currentDate}`, 20, 42);
        
        // === INFORMATIONS PROJET (Section grisée) ===
        doc.setFillColor(248, 250, 255);
        doc.rect(20, 65, 170, 30, 'F');
        
        doc.setTextColor(44, 62, 80);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('OBJET DE LA PRESTATION', 25, 75);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Besoin: ${quoteData.title || 'Non spécifié'}`, 25, 83);
        
        // === TABLEAU DES PRESTATIONS ===
        let yPos = 105;
        doc.setFontSize(14);
        doc.setTextColor(44, 62, 80);
        doc.setFont('helvetica', 'bold');
        doc.text('DÉTAIL DE LA PRESTATION', 20, yPos);
        yPos += 15;
        
        logPdfDebug('JSPDF-ESTIMATES', {
          hasEstimates: !!quoteData.estimates,
          estimatesLength: quoteData.estimates?.length || 0,
          estimates: quoteData.estimates
        });
        
        // En-tête du tableau professionnel avec bordures
        doc.setFillColor(70, 130, 226);
        doc.rect(20, yPos, 170, 10, 'F');
        
        // Bordure de l'en-tête
        doc.setDrawColor(70, 130, 226);
        doc.setLineWidth(0.5);
        doc.rect(20, yPos, 170, 10);
        
        // Colonnes d'en-tête - Supprimer QTÉ et garder 3 colonnes
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PRESTATION', 22, yPos + 7);
        doc.text('TEMPS', 120, yPos + 7);
        doc.text('PRIX HT', 155, yPos + 7);
        
        // Lignes verticales de séparation de l'en-tête - Ajuster les positions
        doc.line(115, yPos, 115, yPos + 10);
        doc.line(150, yPos, 150, yPos + 10);
        
        yPos += 10;
        
        let totalHT = 0;
        
        if (quoteData.estimates && quoteData.estimates.length > 0) {
          quoteData.estimates.forEach((estimate, index) => {
            // Vérifier si on a assez de place
            if (yPos > 230) {
              doc.addPage();
              yPos = 20;
              // Redessiner l'en-tête
              doc.setFillColor(70, 130, 226);
              doc.rect(20, yPos, 170, 10, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(10);
              doc.text('PRESTATION', 22, yPos + 7);
              doc.text('TEMPS', 120, yPos + 7);
              doc.text('PRIX HT', 155, yPos + 7);
              yPos += 10;
            }
            
            const rowHeight = 18;
            
            // Alternance de couleurs
            if (index % 2 === 0) {
              doc.setFillColor(248, 250, 255);
              doc.rect(20, yPos, 170, rowHeight, 'F');
            }
            
            // Bordures du tableau
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.rect(20, yPos, 170, rowHeight);
            doc.line(115, yPos, 115, yPos + rowHeight);
            doc.line(150, yPos, 150, yPos + rowHeight);
            
            // Contenu des cellules
            doc.setTextColor(44, 62, 80);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            
            // Nom de la prestation
            const taskName = decodeHtmlEntities(estimate.featureName || 'Tâche ' + (index + 1));
            const description = decodeHtmlEntities(estimate.explanation || 'Description non disponible');
            
            // Utiliser formatEstimateValue pour gérer tous les formats
            const formattedTime = formatEstimateValue(estimate.estimatedHours, 'h');
            const formattedPrice = formatEstimateValue(estimate.fixedPrice, '€');
            
            doc.text(taskName, 22, yPos + 6);
            
            // Description de la tâche (remettre)
            if (description) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7);
              doc.setTextColor(90, 108, 125);
              const descLines = doc.splitTextToSize(description, 70);
              doc.text(descLines.slice(0, 1), 22, yPos + 12); // 1 ligne max
            }
            
            // Temps - utiliser formatEstimateValue pour gérer fourchettes vs précis
            doc.setTextColor(102, 126, 234);
            doc.text(formattedTime, 122, yPos + 9);
            
            // Prix HT - utiliser extractNumericValue pour les calculs et formatEstimateValue pour l'affichage
            const priceValue = estimate.fixedPrice || 0;
            const numericPrice = extractNumericValue(priceValue);
            totalHT += numericPrice;
            
            doc.setTextColor(39, 174, 96);
            doc.setFont('helvetica', 'bold');
            doc.text(formattedPrice, 172, yPos + 9, { align: 'right' });
            
            yPos += rowHeight;
          });
        }
        
        // === SECTION TOTAUX PROFESSIONNELLE ===
        yPos += 10;
        
        // Calculs fiscaux français
        const tauxTVA = 0.20; // 20% TVA standard
        const montantTVA = totalHT * tauxTVA;
        const totalTTC = totalHT + montantTVA;
        
        // Encadré des totaux (aligné à droite)
        const encadreX = 120;
        const encadreWidth = 70;
        
        // Fond de l'encadré totaux
        doc.setFillColor(248, 250, 255);
        doc.rect(encadreX, yPos, encadreWidth, 35, 'F');
        
        // Bordure de l'encadré
        doc.setDrawColor(70, 130, 226);
        doc.setLineWidth(0.5);
        doc.rect(encadreX, yPos, encadreWidth, 35);
        
        // Titre de l'encadré
        doc.setFillColor(70, 130, 226);
        doc.rect(encadreX, yPos, encadreWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('RÉCAPITULATIF', encadreX + 2, yPos + 6);
        
        // Lignes de totaux
        yPos += 12;
        doc.setTextColor(44, 62, 80);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        // Total HT
        doc.text('Total HT:', encadreX + 2, yPos);
        doc.setFont('helvetica', 'bold');
        doc.text(`${totalHT.toFixed(2)}€`, encadreX + encadreWidth - 2, yPos, { align: 'right' });
        
        // TVA
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.text(`TVA (${(tauxTVA * 100)}%):`, encadreX + 2, yPos);
        doc.setFont('helvetica', 'bold');
        doc.text(`${montantTVA.toFixed(2)}€`, encadreX + encadreWidth - 2, yPos, { align: 'right' });
        
        // Ligne de séparation
        yPos += 3;
        doc.setDrawColor(70, 130, 226);
        doc.line(encadreX + 2, yPos, encadreX + encadreWidth - 2, yPos);
        
        // Total TTC (mis en valeur)
        yPos += 5;
        doc.setFillColor(39, 174, 96);
        doc.rect(encadreX + 1, yPos - 2, encadreWidth - 2, 8, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('TOTAL TTC:', encadreX + 2, yPos + 4);
        doc.text(`${totalTTC.toFixed(2)}€`, encadreX + encadreWidth - 2, yPos + 4, { align: 'right' });
        
        // === CONDITIONS ET VALIDITÉ ===
        yPos += 25;
        doc.setTextColor(44, 62, 80);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('CONDITIONS GÉNÉRALES', 20, yPos);
        
        yPos += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        
        const conditions = [
          '• Paiement : 30% à la commande, solde à la livraison',
          '• Les prix sont exprimés en euros TTC',
        ];
        
        conditions.forEach((condition, index) => {
          doc.text(condition, 20, yPos + (index * 5));
        });
        
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
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            line-height: 1.5;
            color: #2c3e50;
            background-color: #fff;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 20mm;
            font-size: 11pt;
        }
        
        /* En-tête professionnel avec dégradé */
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px;
            margin-bottom: 40px;
            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.2);
            page-break-inside: avoid;
        }
        .header h1 {
            font-size: 32pt;
            font-weight: 300;
            letter-spacing: 2px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .header .subtitle {
            font-size: 14pt;
            opacity: 0.9;
            font-weight: 300;
        }
        .header .date {
            font-size: 11pt;
            opacity: 0.8;
            margin-top: 10px;
        }
        
        /* Section projet avec bordure élégante */
        .project-info {
            background: #f8faff;
            border: 1px solid #e3ebf0;
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 35px;
            page-break-inside: avoid;
        }
        .project-info h2 {
            color: #2c3e50;
            font-size: 18pt;
            font-weight: 600;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        .project-info .info-row {
            display: flex;
            margin-bottom: 12px;
            align-items: flex-start;
        }
        .project-info .label {
            font-weight: 600;
            color: #667eea;
            min-width: 120px;
            margin-right: 15px;
        }
        .project-info .value {
            flex: 1;
            color: #2c3e50;
        }
        
        /* Section estimations avec tableau professionnel */
        .estimates-section {
            margin-bottom: 35px;
        }
        .estimates-section h2 {
            color: #2c3e50;
            font-size: 18pt;
            font-weight: 600;
            margin-bottom: 25px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        /* Tableau des estimations */
        .estimates-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        .estimates-table thead {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .estimates-table th {
            padding: 15px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12pt;
            letter-spacing: 0.5px;
        }
        .estimates-table td {
            padding: 15px 12px;
            border-bottom: 1px solid #e8ecf1;
            vertical-align: top;
        }
        .estimates-table tbody tr:nth-child(even) {
            background-color: #f8faff;
        }
        .estimates-table tbody tr:hover {
            background-color: #eef2ff;
        }
        
        /* Styles pour les cellules */
        .task-name {
            font-weight: 600;
            color: #2c3e50;
            font-size: 12pt;
        }
        .task-description {
            color: #5a6c7d;
            font-size: 10pt;
            margin-top: 5px;
            line-height: 1.4;
            font-style: italic;
        }
        .price-cell {
            text-align: right;
            font-weight: 600;
            color: #27ae60;
            font-size: 12pt;
        }
        .time-cell {
            text-align: center;
            color: #667eea;
            font-weight: 500;
        }
        
        /* Section total professionnelle */
        .total-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-top: 30px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
            page-break-inside: avoid;
        }
        .total-section h2 {
            font-size: 24pt;
            font-weight: 300;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .total-price {
            font-size: 36pt;
            font-weight: 700;
            margin: 15px 0;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .total-time {
            font-size: 14pt;
            opacity: 0.9;
            font-weight: 300;
        }
        
        /* Footer minimaliste */
        .footer {
            margin-top: 50px;
            text-align: center;
            color: #7f8c8d;
            font-size: 10pt;
            border-top: 1px solid #ecf0f1;
            padding-top: 20px;
            page-break-inside: avoid;
        }
        
        /* Responsive et print optimizations */
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            body {
                margin: 0 !important;
                padding: 15mm !important;
                font-size: 11pt !important;
            }
            .header, .project-info, .estimates-section, .total-section {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .estimates-table {
                page-break-inside: auto;
            }
            .estimates-table tr {
                page-break-inside: avoid;
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <!-- En-tête professionnel -->
    <div class="header">
        <h1>Devis Professionnel</h1>
        <div class="subtitle">Estimation détaillée de projet</div>
        <div class="date">Généré le ${currentDate}</div>
    </div>
    
    <!-- Informations du projet -->
    <div class="project-info">
        <h2>📋 Informations du Projet</h2>
        <div class="info-row">
            <span class="label">Titre :</span>
            <span class="value">${quoteData.title || 'Non spécifié'}</span>
        </div>
    </div>
    
    <!-- Section des estimations -->
    <div class="estimates-section">
        <h2>💼 Détail des Estimations</h2>
        
        <table class="estimates-table">
            <thead>
                <tr>
                    <th style="width: 60%;">Tâche</th>
                    <th style="width: 20%; text-align: center;">Temps</th>
                    <th style="width: 20%; text-align: right;">Prix</th>
                </tr>
            </thead>
            <tbody>
                ${quoteData.estimates && quoteData.estimates.length > 0 ? 
                  quoteData.estimates.map((estimate, index) => {
                    const taskName = decodeHtmlEntities(estimate.featureName || 'Tâche ' + (index + 1));
                    const description = decodeHtmlEntities(estimate.explanation || 'Description non disponible');
                    
                    // Utiliser formatEstimateValue pour gérer tous les formats
                    const formattedTime = formatEstimateValue(estimate.estimatedHours, 'h');
                    const formattedPrice = formatEstimateValue(estimate.fixedPrice, '€');
                    
                    return `
                <tr>
                    <td>
                        <div class="task-name">${index + 1}. ${taskName}</div>
                        <div class="task-description">${description}</div>
                    </td>
                    <td class="time-cell">${formattedTime}</td>
                    <td class="price-cell">${formattedPrice}</td>
                </tr>`;
                  }).join('') 
                : '<tr><td colspan="3" style="text-align: center; color: #7f8c8d;">Aucune estimation détaillée disponible</td></tr>'}
            </tbody>
        </table>
    </div>
    
    <!-- Section total -->
    <div class="total-section">
        <h2>💰 Total Estimé</h2>
        <div class="total-price">${formatEstimateValue(quoteData.totalPrice, '€')}</div>
        <div class="total-time">Temps total estimé : ${formatEstimateValue(quoteData.totalHours, 'h')}</div>
    </div>
    
    <!-- Footer -->
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