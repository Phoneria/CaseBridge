export type UserRole = "individual" | "lawyer";
export type CaseStatus =
  | "Draft"
  | "Gathering evidence"
  | "Under AI review"
  | "Report ready"
  | "Published"
  | "Lawyer responses received"
  | "Lawyer selected"
  | "Closed";

export type Jurisdiction = {
  code: string;
  name: string;
  languages: string[];
  legalSystem: string;
  categories: string[];
  verification: string;
  knowledgeStatus: "Available" | "Preview";
  crossBorder: boolean;
};

export type CaseRecord = {
  id: string;
  title: string;
  category: string;
  jurisdictions: string[];
  status: CaseStatus;
  completion: number;
  responses: number;
  updated: string;
  summary: string;
  urgency: "Low" | "Medium" | "High";
  evidence: string[];
  languages: string[];
  budget: string;
  crossBorder: boolean;
};

export type Lawyer = {
  id: string;
  name: string;
  initials: string;
  country: string;
  jurisdictions: string[];
  languages: string[];
  specialties: string[];
  experience: number;
  verified: boolean;
  responseTime: string;
};
