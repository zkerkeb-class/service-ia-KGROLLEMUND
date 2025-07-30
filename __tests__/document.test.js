const { analyzeDocument } = require('../src/controllers/documentController');
const { analyzeDocumentWithAI } = require('../src/services/documentAnalyzerService');
const { saveQuote } = require('../src/services/databaseService');
const fs = require('fs');

jest.mock('../src/services/documentAnalyzerService', () => ({
  analyzeDocumentWithAI: jest.fn(),
}));

jest.mock('../src/services/databaseService', () => ({
  saveQuote: jest.fn(),
}));

jest.mock('fs', () => ({
  unlink: jest.fn((path, callback) => callback()),
}));

describe('analyzeDocument', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      file: {
        path: 'path/to/file.pdf',
        mimetype: 'application/pdf',
        originalname: 'file.pdf',
      },
      body: {
        userId: 'user123',
        projectTitle: 'Test Project',
      },
    };
    res = {
      json: jest.fn(),
      status: jest.fn(() => res),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('devrait analyser un document avec succès et créer une demande de devis', async () => {
    const analysisResult = { title: 'Analyzed Title', tasksBreakdown: [] };
    const savedQuote = { id: 'quote123' };
    analyzeDocumentWithAI.mockResolvedValue(analysisResult);
    saveQuote.mockResolvedValue(savedQuote);

    await analyzeDocument(req, res, next);

    expect(analyzeDocumentWithAI).toHaveBeenCalled();
    expect(saveQuote).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ...analysisResult, quoteRequestId: 'quote123' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devrait retourner 400 si aucun fichier n\'est fourni', async () => {
    req.file = null;

    await analyzeDocument(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Aucun fichier fourni' });
  });

  it('devrait retourner 400 si le fichier n\'est pas un PDF', async () => {
    req.file.mimetype = 'image/png';

    await analyzeDocument(req, res, next);

    expect(fs.unlink).toHaveBeenCalledWith(req.file.path, expect.any(Function));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Seuls les fichiers PDF sont supportés pour l\'analyse' });
  });

  it('devrait retourner 500 si l\'analyse IA échoue', async () => {
    const error = new Error('AI Error');
    analyzeDocumentWithAI.mockRejectedValue(error);

    await analyzeDocument(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
        message: "Une erreur est survenue lors de l'analyse du document",
        error: "AI Error"
    });
  });

  it('devrait retourner le résultat de l\'analyse même si la sauvegarde échoue', async () => {
    const analysisResult = { title: 'Analyzed Title' };
    analyzeDocumentWithAI.mockResolvedValue(analysisResult);
    saveQuote.mockRejectedValue(new Error('DB Error'));

    await analyzeDocument(req, res, next);

    expect(res.json).toHaveBeenCalledWith(analysisResult);
  });
}); 