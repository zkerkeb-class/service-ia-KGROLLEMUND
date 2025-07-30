const { generateQuote } = require('../src/controllers/quoteController');
const { bddAPI } = require('../src/services/databaseService');
const pdfService = require('../src/services/pdfService');

jest.mock('../src/services/databaseService', () => ({
  bddAPI: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('../src/services/pdfService', () => ({
  createPdf: jest.fn(),
}));

describe('generateQuote', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {
        clientEmail: 'test@example.com',
        clientName: 'Test Client',
        updatedTasks: [{ id: 1, name: 'Task 1', hours: 10, cost: 100 }],
        totalEstimate: 100,
        timeEstimate: 10,
        projectTitle: 'Test Project',
        projectDescription: 'Test Description',
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

  it('devrait générer un devis avec succès', async () => {
    bddAPI.post.mockResolvedValue({ data: { id: 'quote123' } });

    await generateQuote(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      isFinalized: false,
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('devrait retourner 404 si la demande de devis n\'est pas trouvée', async () => {
    req.body.quoteRequestId = 'nonexistent';
    bddAPI.get.mockResolvedValue({ data: null });

    await generateQuote(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Demande de devis non trouvée" });
    expect(next).not.toHaveBeenCalled();
  });

  it('devrait retourner une erreur 400 si les données sont invalides', async () => {
    req.body.updatedTasks = null;
    await generateQuote(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Les tâches du projet sont requises pour générer le devis" });
  });
  
  it('devrait retourner un devis non finalisé quand la création du devis échoue', async () => {
    const error = new Error('Erreur inattendue');
    bddAPI.post.mockRejectedValue(error);
    req.body.quoteRequestId = 'quote123';
    bddAPI.get.mockResolvedValue({ data: { id: 'quote123' } });

    await generateQuote(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        isFinalized: false
    }));
  });
}); 