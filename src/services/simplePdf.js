const fs = require('fs');
const path = require('path');

// Générateur PDF simple sans dépendances externes
const generateSimplePDF = (quoteData, userData) => {
  // Template PDF minimaliste mais valide
  const currentDate = new Date().toLocaleDateString('fr-FR');
  
  // Créer le contenu du PDF en format texte
  let content = `DEVIS\n`;
  content += `Généré le ${currentDate}\n\n`;
  content += `INFORMATIONS DU PROJET\n`;
  content += `Titre: ${quoteData.title}\n`;
  content += `Description: ${quoteData.description}\n`;
  content += `Client: ${userData.name} (${userData.email})\n\n`;
  content += `DÉTAIL DU DEVIS\n`;
  
  if (quoteData.estimates && quoteData.estimates.length > 0) {
    quoteData.estimates.forEach((estimate, index) => {
      content += `${index + 1}. ${estimate.featureName || 'Tâche'}\n`;
      content += `   Description: ${estimate.explanation || 'N/A'}\n`;
      content += `   Prix: ${estimate.fixedPrice || 0}€\n`;
      content += `   Temps: ${estimate.estimatedHours?.min || 0}h\n\n`;
    });
  }
  
  content += `TOTAL ESTIMÉ\n`;
  content += `${quoteData.totalPrice}€\n`;
  content += `Temps total: ${quoteData.totalHours}h\n`;
  
  // Créer un PDF minimal mais valide en utilisant une structure PDF de base
  const pdfHeader = '%PDF-1.4\n';
  const pdfTrailer = 'trailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n9\n%%EOF';
  
  // Objet catalogue simple
  const catalog = '1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n';
  
  // Page simple
  const pages = '2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n';
  
  // Contenu de la page (text simple)
  const pageContent = `3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Times-Roman\n>>\n>>\n>>\n>>\nendobj\n`;
  
  // Stream de contenu texte avec sauts de ligne appropriés
  const lines = content.split('\n');
  let streamContent = 'BT\n/F1 12 Tf\n';
  let yPosition = 750;
  
  lines.forEach((line, index) => {
    if (line.trim()) {
      // Échapper les caractères spéciaux pour PDF
      const escapedLine = line.replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\\/g, '\\\\');
      // Utiliser Tm pour la position absolue au lieu de Td
      streamContent += `1 0 0 1 50 ${yPosition} Tm\n(${escapedLine}) Tj\n`;
      yPosition -= 15; // Espace entre les lignes
    } else {
      yPosition -= 10; // Espace plus petit pour les lignes vides
    }
  });
  
  streamContent += 'ET\n';
  const streamLength = streamContent.length;
  const stream = `4 0 obj\n<<\n/Length ${streamLength}\n>>\nstream\n${streamContent}endstream\nendobj\n`;
  
  const pdfContent = pdfHeader + catalog + pages + pageContent + stream + pdfTrailer;
  
  return Buffer.from(pdfContent, 'utf8');
};

module.exports = {
  generateSimplePDF
}; 