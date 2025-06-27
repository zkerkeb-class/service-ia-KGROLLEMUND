const fs = require("fs");
const {
  analyzeDocumentWithAI,
} = require("../services/documentAnalyzerService");
const { saveQuote } = require("../services/databaseService");

const analyzeDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Aucun fichier fourni" });
    }

    // Vérifier que le fichier est un PDF
    if (req.file.mimetype !== "application/pdf") {
      // Supprimer le fichier non supporté
      fs.unlink(req.file.path, () => {});
      return res
        .status(400)
        .json({
          message: "Seuls les fichiers PDF sont supportés pour l'analyse",
        });
    }

    // Extraire les métadonnées supplémentaires
    const sector = req.body.sector || "";
    const specialties = req.body.specialties
      ? JSON.parse(req.body.specialties)
      : [];
    const yearsOfExperience = req.body.yearsOfExperience || 0;
    const userId = req.body.userId; // ID de l'utilisateur pour sauvegarder l'analyse
    const projectTitle = req.body.projectTitle || "";
    const projectDescription = req.body.projectDescription || "";
    const isSubscribed = req.body.isSubscribed === 'true'; // Statut d'abonnement

    try {
      // Analyser le document avec l'IA
      const analysisResult = await analyzeDocumentWithAI({
        filePath: req.file.path,
        fileType: req.file.mimetype,
        fileName: req.file.originalname,
        metadata: {
          sector,
          specialties,
          yearsOfExperience,
          projectTitle,
          projectDescription,
          isSubscribed, // Inclure le statut d'abonnement
        },
      });

      // Créer une demande de devis avec l'analyse si userId fourni
      if (userId) {
        try {
          const quoteRequestData = {
            userId,
            title: projectTitle || analysisResult.title || "Projet analysé",
            description:
              projectDescription ||
              analysisResult.description ||
              analysisResult.summary ||
              "Analyse de cahier des charges",
            documentUrl: null, // TODO: implémenter le stockage des fichiers
            documentType: req.file.mimetype,
            aiAnalysis: analysisResult,
            tasksEstimation: analysisResult.tasksBreakdown || [],
            totalEstimate: analysisResult.totalEstimatedCost || null,
            timeEstimate: analysisResult.totalEstimatedHours || null,
            status: "analysed",
          };

          console.log("📊 Tentative de sauvegarde de la demande de devis:", {
            userId,
            title: quoteRequestData.title,
            hasAnalysis: !!quoteRequestData.aiAnalysis,
            tasksCount: quoteRequestData.tasksEstimation?.length || 0,
          });

          const quoteRequest = await saveQuote(quoteRequestData);
          console.log(
            "✅ Demande de devis créée avec succès:",
            quoteRequest.id
          );

          // Ajouter l'ID de la demande de devis à la réponse
          analysisResult.quoteRequestId = quoteRequest.id;

          // Sauvegarder aussi dans la table Analysis pour l'historique
          try {
            const { saveAnalysis } = require("../services/databaseService");
            await saveAnalysis({
              userId,
              fileName: req.file.originalname,
              fileType: req.file.mimetype,
              analysisResult: analysisResult,
            });
            console.log("✅ Analyse sauvegardée dans la table Analysis");
          } catch (analysisError) {
            console.error(
              "❌ Erreur lors de la sauvegarde de l'analyse:",
              analysisError.message
            );
            // On continue même si ça échoue
          }
        } catch (saveError) {
          console.error(
            "❌ Erreur lors de la création de la demande de devis:",
            saveError.message
          );
          console.error("Détails de l'erreur:", saveError);
          // On continue même si la sauvegarde échoue
        }
      } else {
        console.warn("⚠️ Pas d'userId fourni, aucune sauvegarde en BDD");
      }

      // Supprimer le fichier après l'analyse
      fs.unlink(req.file.path, (err) => {
        if (err) {
          console.error("Erreur lors de la suppression du fichier:", err);
        }
      });

      // Retourner les résultats de l'analyse
      res.json(analysisResult);
    } catch (analysisError) {
      // Nettoyer le fichier en cas d'erreur
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }

      // Vérifier le type d'erreur pour renvoyer un message approprié
      if (
        analysisError.message.includes("PDF contient des références corrompues")
      ) {
        return res.status(400).json({
          message:
            "Le PDF téléchargé est corrompu et ne peut pas être analysé. Veuillez essayer avec un autre fichier PDF.",
          error: "corrupted_pdf",
        });
      } else if (analysisError.message.includes("Quota OpenAI dépassé")) {
        return res.status(429).json({
          message:
            "Le service d'analyse a atteint sa limite de requêtes. Veuillez réessayer dans quelques minutes.",
          error: "quota_exceeded",
        });
      } else {
        console.error("Erreur lors de l'analyse du document:", analysisError);
        return res.status(500).json({
          message: "Une erreur est survenue lors de l'analyse du document",
          error: analysisError.message,
        });
      }
    }
  } catch (error) {
    console.error("Erreur lors de l'analyse du document:", error);

    // Nettoyer le fichier en cas d'erreur
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }

    // Vérifier si c'est une erreur liée au quota OpenAI
    if (error.message && error.message.includes("Quota OpenAI dépassé")) {
      return res.status(429).json({
        message:
          "Le service d'analyse a atteint sa limite de requêtes. Veuillez réessayer dans quelques minutes.",
        error: "quota_exceeded",
      });
    }

    res.status(500).json({
      message: "Une erreur est survenue lors du traitement de la demande",
      error: error.message,
    });
  }
};

module.exports = {
  analyzeDocument,
};
