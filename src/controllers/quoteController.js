const axios = require("axios");

const generateQuote = async (req, res, next) => {
  console.log('🎯 Service IA: Fonction generateQuote appelée !');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Body:', req.body);

  try {
    console.log('🎯 DONNÉES REÇUES DU FRONTEND:', {
      clientEmail: req.body.clientEmail,
      clientName: req.body.clientName,
      updatedTasksCount: req.body.updatedTasks?.length || 0,
      totalEstimate: req.body.totalEstimate,
      timeEstimate: req.body.timeEstimate
    });
    
    const {
      quoteRequestId,
      clientEmail,
      clientName,
      updatedTasks,
      totalEstimate,
      timeEstimate,
      projectTitle,
      projectDescription,
    } = req.body;

    console.log('🔍 Données reçues dans generateQuote:', {
      quoteRequestId,
      clientEmail,
      hasUpdatedTasks: !!updatedTasks,
      tasksCount: updatedTasks?.length || 0
    });

    let quoteRequestData = null;

    // Si on a un quoteRequestId, récupérer les données depuis la base de données
    if (quoteRequestId) {
      try {
        const bddServiceUrl =
          process.env.BDD_SERVICE_URL || "http://localhost:3004";
        console.log('📡 Récupération QuoteRequest depuis:', `${bddServiceUrl}/quote-requests/${quoteRequestId}`);
        
        const quoteRequestResponse = await axios.get(
          `${bddServiceUrl}/quote-requests/${quoteRequestId}`
        );
        quoteRequestData = quoteRequestResponse.data;

        console.log('✅ QuoteRequest récupéré:', {
          id: quoteRequestData?.id,
          userId: quoteRequestData?.userId,
          title: quoteRequestData?.title
        });

        if (!quoteRequestData) {
          return res
            .status(404)
            .json({ message: "Demande de devis non trouvée" });
        }
      } catch (error) {
        console.error(
          "❌ Erreur lors de la récupération de la demande de devis:",
          error.message
        );
        // On continue sans les données de la demande
      }
    }

    // Validation minimale des données requises
    if (!updatedTasks || updatedTasks.length === 0) {
      return res
        .status(400)
        .json({
          message: "Les tâches du projet sont requises pour générer le devis",
        });
    }

    // Utiliser les tâches mises à jour si fournies, sinon utiliser celles de la base de données
    const tasksToUse = updatedTasks || quoteRequestData?.tasksEstimation || [];
    
    // DEBUGGING: Logger les tâches pour diagnostiquer les doublons
    console.log('🔍 DIAGNOSTIC TÂCHES:', {
      updatedTasksCount: updatedTasks?.length || 0,
      dbTasksCount: quoteRequestData?.tasksEstimation?.length || 0,
      finalTasksCount: tasksToUse.length,
      tasksPreview: tasksToUse.slice(0, 3).map(task => ({
        task: task.task,
        description: task.description?.substring(0, 50) + '...',
        hours: task.estimatedHours,
        cost: task.estimatedCost
      }))
    });
    
    // Nettoyer les doublons potentiels basés sur le nom de la tâche
    const uniqueTasks = [];
    const seenTasks = new Set();
    
    tasksToUse.forEach(task => {
      const taskKey = task.task + '_' + task.description;
      if (!seenTasks.has(taskKey)) {
        seenTasks.add(taskKey);
        uniqueTasks.push(task);
      }
    });
    
    console.log('🧹 NETTOYAGE:', {
      avant: tasksToUse.length,
      après: uniqueTasks.length,
      doublon_supprimés: tasksToUse.length - uniqueTasks.length
    });
    
    const finalTasks = uniqueTasks;
    
    const totalEstimateToUse =
      totalEstimate ||
      quoteRequestData?.totalEstimate ||
      finalTasks.reduce(
        (sum, task) => sum + Number(task.estimatedCost || 0),
        0
      );
    const timeEstimateToUse =
      timeEstimate ||
      quoteRequestData?.timeEstimate ||
      finalTasks.reduce(
        (sum, task) => sum + Number(task.estimatedHours || 0),
        0
      );

    // Construire la réponse du devis
    const quoteResponse = {
      id: quoteRequestData?.id || `temp-${Date.now()}`, // ID temporaire si pas de quoteRequestData
      title: quoteRequestData?.title || projectTitle || "Projet",
      description:
        quoteRequestData?.description ||
        projectDescription ||
        "Description du projet",
      clientEmail: clientEmail || "",
      clientName: clientName || "Client",
      createdAt: new Date().toISOString(),
      estimates: finalTasks.map((task) => ({
        featureName: task.task,
        explanation: task.description,
        estimatedHours: { min: task.estimatedHours, max: task.estimatedHours },
        fixedPrice: task.estimatedCost,
      })),
      totalPrice: totalEstimateToUse,
      totalHours: timeEstimateToUse,
      aiAnalysis: quoteRequestData?.aiAnalysis || null,
    };

    // Mettre à jour le statut et les informations client de la demande de devis (seulement si quoteRequestId existe)
    if (quoteRequestId && quoteRequestData) {
      try {
        const bddServiceUrl =
          process.env.BDD_SERVICE_URL || "http://localhost:3004";
        const updateData = {
          status: "completed",
          clientEmail: clientEmail,
          clientName: clientName,
        };

        // Si des tâches mises à jour sont fournies, les inclure dans la mise à jour
        if (updatedTasks) {
          updateData.tasksEstimation = finalTasks;
          updateData.totalEstimate = totalEstimate;
          updateData.timeEstimate = timeEstimate;
        }

        await axios.put(
          `${bddServiceUrl}/quote-requests/${quoteRequestId}`,
          updateData
        );
        console.log("✅ QuoteRequest mis à jour");
      } catch (updateError) {
        console.error(
          "❌ Erreur lors de la mise à jour de la demande de devis:",
          updateError.message
        );
        // On continue même si la mise à jour échoue
      }
    }
    console.log("HERE RESPONSE DEVIS:");
    console.log("quoteRequestId:", quoteRequestId);
    console.log("quoteRequestData:", quoteRequestData);
    // Créer un devis final en base de données si on a un quoteRequestId
    if (quoteRequestId && quoteRequestData) {
      try {
        const bddServiceUrl =
          process.env.BDD_SERVICE_URL || "http://localhost:3004";
        const quoteCreationData = {
          quoteRequestId: quoteRequestId,
          clientEmail: clientEmail || "",
          clientName: clientName || "Client",
          updatedTasks: finalTasks,
          totalEstimate: totalEstimateToUse,
          timeEstimate: timeEstimateToUse,
        };

        console.log('📝 Données envoyées pour création Quote:', {
          url: `${bddServiceUrl}/quotes`,
          quoteRequestId: quoteCreationData.quoteRequestId,
          clientEmail: quoteCreationData.clientEmail,
          clientName: quoteCreationData.clientName,
          tasksCount: quoteCreationData.updatedTasks?.length,
          totalEstimate: quoteCreationData.totalEstimate,
          timeEstimate: quoteCreationData.timeEstimate
        });

        const finalQuoteResponse = await axios.post(
          `${bddServiceUrl}/quotes`,
          quoteCreationData
        );
        console.log("✅ Quote créé avec succès - ID:", finalQuoteResponse.data.id);

        // Retourner le devis final avec le vrai ID de la BDD
        quoteResponse.id = finalQuoteResponse.data.id;
        quoteResponse.isFinalized = true;
      } catch (quoteError) {
        console.error("❌ Erreur lors de la création du devis final:");
        console.error("Status:", quoteError.response?.status);
        console.error("Data:", quoteError.response?.data);
        console.error("Message:", quoteError.message);
        // On continue avec le devis temporaire
        quoteResponse.isFinalized = false;
      }
    } else {
      console.log('⚠️ Pas de création Quote - quoteRequestId ou quoteRequestData manquant');
      quoteResponse.isFinalized = false;
    }

    // Retour de la réponse
    res.json(quoteResponse);
  } catch (error) {
    console.error("❌ Erreur générale lors du traitement de la demande de devis:", error);
    next(error);
  }
};

module.exports = {
  generateQuote,
};
