const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

// L'URL du service de base de données doit être fournie par une variable d'environnement
console.log('BDD_SERVICE_URL here1:', process.env.BDD_SERVICE_URL);
const BDD_SERVICE_URL = process.env.BDD_SERVICE_URL;

// Instance axios configurée pour le service BDD
const bddAPI = axios.create({
  baseURL: `${BDD_SERVICE_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

const saveAnalysis = async (analysisData) => {
  try {
    const response = await bddAPI.post('/analyses', analysisData);
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de l\'analyse:', error.response?.data || error.message);
    throw new Error('Impossible de sauvegarder l\'analyse');
  }
};

const getAnalysesByUser = async (userId) => {
  try {
    const response = await bddAPI.get(`/analyses/user/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération des analyses:', error.response?.data || error.message);
    throw new Error('Impossible de récupérer les analyses');
  }
};

const saveQuote = async (quoteData) => {
  try {
    console.log('🔄 Envoi de la demande de devis vers BDD service:', {
      url: `${BDD_SERVICE_URL}/quote-requests`,
      userId: quoteData.userId,
      title: quoteData.title
    });
    
    const response = await bddAPI.post('/quote-requests', quoteData);
    console.log('✅ Réponse BDD service:', response.status, response.data?.id);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde du devis:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      url: error.config?.url
    });
    throw new Error(`Impossible de sauvegarder le devis: ${error.response?.data?.error || error.message}`);
  }
};

const getUserById = async (userId) => {
  try {
    const response = await bddAPI.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error.response?.data || error.message);
    throw new Error('Impossible de récupérer les informations utilisateur');
  }
};

module.exports = {
  saveAnalysis,
  getAnalysesByUser,
  saveQuote,
  getUserById,
  bddAPI
}; 