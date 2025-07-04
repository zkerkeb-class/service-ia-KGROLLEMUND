const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
// Initialisation du client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


const generateQuoteWithAI = async (quoteRequest) => {
  try {
    // Préparation des données pour l'IA
    const { developer, features, title, description } = quoteRequest;
    
    // Construction du prompt pour l'IA
    const prompt = buildQuotePrompt(developer, features, title, description);
    
    // Appel à l'API OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un expert en estimation de projets de développement logiciel. Tu vas générer une estimation précise et détaillée pour chaque fonctionnalité, en tenant compte de l'expérience de l'utilisateur et des spécialités qu'il a déjà. Fournis le résultat au format JSON."
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
    const quoteData = JSON.parse(assistantResponse);
    
    // Enregistrement du devis pour référence future (logs)
    logQuoteGeneration(quoteRequest, quoteData);
    
    return quoteData;
  } catch (error) {
    console.error('Erreur lors de la génération du devis avec l\'IA:', error);
    throw new Error('Impossible de générer le devis: ' + error.message);
  }
};

const buildQuotePrompt = (developer, features, title, description) => {
  // Construction du JSON à envoyer à l'IA
  const promptData = {
    projectTitle: title ,
    projectDescription: description ,
    developer: {
      experience: developer.experience,
      skills: developer.skills,
      specialty: developer.specialty,
      hourlyRate: developer.hourlyRate || null
    },
    features: features.map(feature => ({
      name: feature.name,
      description: feature.description,
      technologies: feature.technologies
    })),
    requestFormat: {
      estimates: [
        {
          featureName: "Nom de la tâche",
          estimatedHours: { min: 0, max: 0 },
          priceRange: { min: 0, max: 0 },
          explanation: "Explication de l'estimation"
        }
      ],
      totalPriceRange: { min: 0, max: 0 },
      totalEstimatedHours: { min: 0, max: 0 }
    }
  };
  
  return JSON.stringify(promptData);
};

const logQuoteGeneration = (request, response) => {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString();
    const logFileName = `quote-generation-${timestamp.split('T')[0]}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    const logEntry = {
      timestamp,
      request,
      response
    };
    
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du log:', error);
  }
};

module.exports = {
  generateQuoteWithAI
}; 