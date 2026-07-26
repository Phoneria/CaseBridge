export type AnalysisStage = { label: string; detail: string };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const aiService = {
  async analyzeCase() {
    await delay(700);
    return { jurisdiction: "Turkey", secondaryJurisdiction: null, confidence: "Preliminary" };
  },
  async generateFollowUpQuestions(category: string) {
    await delay(500);
    if (category === "Employment") {
      return [
        "Was there a written employment contract?",
        "When did the employment relationship end?",
        "Did you receive a written termination notice?",
        "Were any salary payments missing?",
        "Do you have messages or emails from the employer?",
      ];
    }
    return ["Was there a written agreement?", "What date did the dispute begin?", "Have you sent a formal notice?", "Is any court or authority already involved?"];
  },
  async analyzeDocuments() {
    await delay(800);
    return { processed: 4, relevant: 4, missing: 2 };
  },
  async generateCaseReport() {
    await delay(900);
    return { reportId: "RPT-1048", status: "ready" };
  },
  async detectJurisdiction() {
    await delay(400);
    return ["Turkey"];
  },
  async recommendLawyerTypes() {
    await delay(400);
    return ["Employment lawyer licensed in Turkey", "Turkish and English language support"];
  },
};

export const analysisStages: AnalysisStage[] = [
  { label: "Reading case description", detail: "Organizing events, parties and requested outcome" },
  { label: "Reviewing uploaded documents", detail: "Classifying documents and extracting relevant dates" },
  { label: "Identifying possible jurisdictions", detail: "Checking country connections and legal scope" },
  { label: "Detecting missing evidence", detail: "Comparing available material with common case needs" },
  { label: "Evaluating possible legal paths", detail: "Mapping potential options without reaching conclusions" },
  { label: "Preparing case report", detail: "Building a plain-language preliminary assessment" },
  { label: "Matching lawyer specializations", detail: "Identifying suitable licenses and experience" },
];
