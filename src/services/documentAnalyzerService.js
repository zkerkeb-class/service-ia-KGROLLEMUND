const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const dotenv = require('dotenv');

dotenv.config(); 


// Initialisation du client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const analyzeDocumentWithAI = async (options) => {
  try {
    const { filePath, fileType, fileName, metadata } = options;
    console.log("metadata1", metadata);
    // Vérification du type de fichier
    if (fileType !== 'application/pdf') {
      throw new Error('Seuls les fichiers PDF sont supportés pour l\'analyse');
    }
    
    // Extraction du texte du document selon son type
    let documentText;
    try {
      documentText = await extractTextFromDocument(filePath, fileType);
      
      if (!documentText || documentText.length === 0) {
        throw new Error('Impossible d\'extraire du texte du document');
      }
      
      // Enregistrer le texte extrait dans un fichier de log
      // logExtractedText(fileName, documentText);
      
    } catch (extractError) {
      // Si l'erreur concerne un PDF corrompu, on la renvoie directement
      if (extractError.message.includes('PDF contient des références corrompues')) {
        throw extractError;
      }
      throw new Error('Erreur lors de l\'extraction du texte: ' + extractError.message);
    }
    
    // Construction du prompt pour l'IA
    const prompt = buildDocumentAnalysisPrompt(documentText, metadata);
    
    // Appel à l'API OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en analyse de projets professionnels multi-secteurs. Tu vas analyser ce document pour en extraire les principales étapes/prestations à réaliser et fournir une estimation adaptée au secteur d'activité. Fournis le résultat au format JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    // Traitement de la réponse
    const assistantResponse = response.choices[0].message.content;
    const analysisData = JSON.parse(assistantResponse);
    
    // Enregistrement de l'analyse pour référence future (logs)
    logDocumentAnalysis(fileName, fileType, analysisData);
    
    return analysisData;
  } catch (error) {
    console.error('Erreur lors de l\'analyse du document avec l\'IA:', error);
    
    // Gestion spécifique des erreurs OpenAI
    if (error.status === 429) {
      throw new Error('Quota OpenAI dépassé. Veuillez réessayer plus tard ou vérifier les limites de votre compte OpenAI.');
    } else if (error.status === 500) {
      throw new Error('Erreur serveur OpenAI. Veuillez réessayer plus tard.');
    } else {
      throw new Error('Impossible d\'analyser le document: ' + error.message);
    }
  }
};

const extractTextFromDocument = async (filePath, fileType) => {
  try {
    // Vérification du type de fichier
    if (fileType !== 'application/pdf') {
      throw new Error('Seuls les fichiers PDF sont supportés pour l\'analyse');
    }
    
    // Extraction de texte d'un PDF
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (pdfError) {
      console.error('Erreur lors de l\'extraction du PDF:', pdfError);
      // Si le PDF ne peut pas être analysé, retourner un message d'erreur
      if (pdfError.message && pdfError.message.includes('bad XRef entry')) {
        throw new Error('Le PDF contient des références corrompues. Veuillez essayer avec un autre PDF.');
      }
      throw new Error('Le PDF n\'a pas pu être analysé correctement. Veuillez essayer avec un autre PDF.');
    }
  } catch (error) {
    console.error('Erreur lors de l\'extraction du texte:', error);
    throw error;
  }
};

const buildDocumentAnalysisPrompt = (documentText, metadata) => {
  // console.log("metadata", metadata);
  // S'assurer que documentText est une chaîne de caractères
  if (typeof documentText !== 'string') {
    documentText = String(documentText);
  }

  // Renommer les propriétés pour correspondre à celles attendues par le front-end
  const sector = metadata?.sector || 'Non spécifié';
  const specialties = JSON.stringify(metadata?.specialties) || 'Non spécifiées';
  const yearsOfExperience = metadata?.yearsOfExperience || 'Non spécifiée';
  const projectTitle = metadata?.projectTitle || '';
  const projectDescription = metadata?.projectDescription || '';
  const isSubscribed = metadata?.isSubscribed || false;
  
  const promptTemplate = `
  Voici un document qui décrit un projet professionnel. 
  
  Informations du projet fournies par l'utilisateur:
  - Titre: ${projectTitle}
  - Description: ${projectDescription}
  
  IMPORTANT: Analyse ce document et extrais les PRINCIPALES phases/livrables/prestations à réaliser.
  - Regroupe les sous-tâches en GRANDES étapes logiques du projet
  - Évite de découper en micro-tâches détaillées 
  - Privilégie les regroupements par PHASE DE TRAVAIL ou LIVRABLE FINAL
  - Limite-toi à maximum 10-12 grandes étapes principales
  - Adapte-toi au secteur d'activité (construction, marketing, développement, conseil, design, etc.)
  
  Exemples de regroupement par secteur:
  • Construction: "Étude de faisabilité et permis" (au lieu de "Dossier permis" + "Étude sol" + "Plans archi" séparés)
  • Marketing: "Stratégie et création de contenu" (au lieu de "Audit" + "Brief créatif" + "Rédaction" séparés)  
  • Développement: "Interface utilisateur complète" (au lieu de "HTML" + "CSS" + "JavaScript" séparés)
  • Conseil: "Diagnostic et recommandations" (au lieu de "Audit" + "Analyse" + "Rapport" séparés)
  
  Métadonnées du profil professionnel (à prendre en compte pour l'estimation):
  - Secteur: ${sector}
  - Spécialités: ${JSON.stringify(specialties)}
  - Années d'expérience: ${yearsOfExperience}

  ${isSubscribed ? 
    `UTILISATEUR ABONNÉ - Fournis des estimations PRÉCISES :
  Pour chaque GRANDE ÉTAPE, détermine :
  - Son nom (phase ou livrable principal)
  - Une description qui englobe tous les aspects de cette étape de travail
  - Estimation PRÉCISE du coût en euros (basé sur les tarifs standards du secteur et le niveau d'expérience)
  - Estimation PRÉCISE du temps de réalisation (basé sur les pratiques du secteur et l'expérience du professionnel)
  
  Exemple de valeurs précises : 25 heures, 1250€` : 
    `UTILISATEUR NON ABONNÉ - Fournis des estimations en FOURCHETTES :
  Pour chaque GRANDE ÉTAPE, détermine :
  - Son nom (phase ou livrable principal)
  - Une description qui englobe tous les aspects de cette étape de travail
  - Estimation en FOURCHETTE du coût en euros (ex: "800-1200€" au lieu d'une valeur précise)
  - Estimation en FOURCHETTE du temps de réalisation (ex: "15-25h" au lieu d'une valeur précise)
  
  Exemple de fourchettes : "20-30 heures", "1000-1500€"`}
  
  Document à analyser:
  ${documentText.substring(0, 15000)}
  
  ${isSubscribed ? 
    `Retourne l'analyse sous forme de JSON avec cette structure (VALEURS PRÉCISES):
  {
    "title": "${projectTitle}",
    "description": "${projectDescription}",
    "summary": "Résumé concis des principales étapes/prestations identifiées dans le document",
    "isSubscribed": true,
    "tasksBreakdown": [
      {
        "task": "Nom de la grande étape/prestation",
        "description": "Description complète incluant tous les aspects de cette phase de travail",
        "estimatedHours": 25,
        "estimatedCost": 1250
      },
      ...
    ],
    "totalEstimatedHours": 120,
    "totalEstimatedCost": 6000
  }` :
    `Retourne l'analyse sous forme de JSON avec cette structure (FOURCHETTES):
  {
    "title": "${projectTitle}",
    "description": "${projectDescription}",
    "summary": "Résumé concis des principales étapes/prestations identifiées dans le document",
    "isSubscribed": false,
    "tasksBreakdown": [
      {
        "task": "Nom de la grande étape/prestation",
        "description": "Description complète incluant tous les aspects de cette phase de travail",
        "estimatedHours": "20-30h",
        "estimatedCost": "1000-1500€"
      },
      ...
    ],
    "totalEstimatedHours": "100-150h",
    "totalEstimatedCost": "5000-7500€"
  }`}`;
  
  return promptTemplate;
};

const logExtractedText = (fileName, extractedText) => {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const logFileName = `extracted-text-${timestamp}.txt`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Écrire l'en-tête et le contenu
    const content = `
===========================================
TEXTE EXTRAIT DU FICHIER: ${fileName}
DATE: ${new Date().toLocaleString()}
===========================================

${extractedText}
`;
    
    fs.writeFileSync(logFilePath, content);
    console.log(`Texte extrait enregistré dans: ${logFilePath}`);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du texte extrait:', error);
  }
};

const logDocumentAnalysis = (fileName, fileType, analysisData) => {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString();
    const logFileName = `document-analysis-${timestamp.split('T')[0]}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    const logEntry = {
      timestamp,
      fileName,
      fileType,
      analysisData
    };
    
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du log:', error);
  }
};

module.exports = {
  analyzeDocumentWithAI
}; 