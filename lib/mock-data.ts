import type { CaseRecord, Jurisdiction, Lawyer } from "./types";

export const jurisdictions: Jurisdiction[] = [
  { code: "TR", name: "Turkey", languages: ["Turkish", "English"], legalSystem: "Civil law", categories: ["Employment", "Consumer rights", "Contract", "Family", "Immigration"], verification: "Bar association registry", knowledgeStatus: "Available", crossBorder: true },
  { code: "DE", name: "Germany", languages: ["German", "English"], legalSystem: "Civil law", categories: ["Employment", "Consumer rights", "Contract", "Data privacy"], verification: "Regional bar registry", knowledgeStatus: "Available", crossBorder: true },
  { code: "GB", name: "United Kingdom", languages: ["English"], legalSystem: "Common law", categories: ["Contract", "Corporate", "Employment", "International trade"], verification: "SRA / Bar Standards Board", knowledgeStatus: "Available", crossBorder: true },
  { code: "US", name: "United States", languages: ["English", "Spanish"], legalSystem: "Common law", categories: ["Contract", "Corporate", "IP", "Employment"], verification: "State bar registry", knowledgeStatus: "Available", crossBorder: true },
  { code: "FR", name: "France", languages: ["French", "English"], legalSystem: "Civil law", categories: ["Consumer rights", "Employment", "Contract"], verification: "National bar directory", knowledgeStatus: "Preview", crossBorder: true },
  { code: "EU", name: "European Union", languages: ["Multiple"], legalSystem: "Supranational", categories: ["Data privacy", "Consumer rights", "Competition"], verification: "National regulator", knowledgeStatus: "Available", crossBorder: true },
  { code: "INT", name: "International", languages: ["Multiple"], legalSystem: "Treaty / arbitration", categories: ["International trade", "Contract", "Corporate"], verification: "Jurisdiction-specific", knowledgeStatus: "Preview", crossBorder: true },
];

export const cases: CaseRecord[] = [
  {
    id: "CB-1048", title: "Unpaid salary and termination dispute", category: "Employment",
    jurisdictions: ["Turkey"], status: "Report ready", completion: 92, responses: 0,
    updated: "Today, 09:42", summary: "Employment ended after three months of delayed salary payments. Written notice and message history are available.",
    urgency: "High", evidence: ["Employment contract", "Salary statements", "WhatsApp messages", "Termination email"],
    languages: ["Turkish", "English"], budget: "$500–$1,500", crossBorder: false,
  },
  {
    id: "CB-1031", title: "Cross-border e-commerce refund dispute", category: "Consumer rights",
    jurisdictions: ["Turkey", "Germany"], status: "Published", completion: 100, responses: 3,
    updated: "Yesterday", summary: "A German retailer has not refunded a high-value order returned from Turkey within the stated period.",
    urgency: "Medium", evidence: ["Invoice", "Order confirmation", "Email conversation", "Payment record"],
    languages: ["Turkish", "German", "English"], budget: "$1,500–$3,000", crossBorder: true,
  },
  {
    id: "CB-0994", title: "International software contract dispute", category: "Contract",
    jurisdictions: ["United Kingdom", "United States"], status: "Lawyer responses received", completion: 100, responses: 5,
    updated: "12 Jul 2026", summary: "A software delivery disagreement involving milestones, acceptance criteria and unpaid invoices.",
    urgency: "Medium", evidence: ["Software services agreement", "Invoices", "Project communication", "Delivery records"],
    languages: ["English"], budget: "$5,000–$15,000", crossBorder: true,
  },
];

export const lawyers: Lawyer[] = [
  { id: "aylin", name: "Aylin Demir", initials: "AD", country: "Turkey", jurisdictions: ["Turkey", "European Union"], languages: ["Turkish", "English", "German"], specialties: ["Employment", "Cross-border disputes"], experience: 12, verified: true, responseTime: "< 4 hours" },
  { id: "jonas", name: "Jonas Weber", initials: "JW", country: "Germany", jurisdictions: ["Germany", "European Union"], languages: ["German", "English"], specialties: ["Consumer rights", "E-commerce"], experience: 9, verified: true, responseTime: "< 8 hours" },
  { id: "amelia", name: "Amelia Clarke", initials: "AC", country: "United Kingdom", jurisdictions: ["United Kingdom", "International"], languages: ["English", "French"], specialties: ["Commercial contracts", "Arbitration"], experience: 15, verified: true, responseTime: "< 1 day" },
  { id: "marcus", name: "Marcus Reed", initials: "MR", country: "United States", jurisdictions: ["United States", "United Kingdom"], languages: ["English", "Spanish"], specialties: ["Technology", "Intellectual property"], experience: 11, verified: true, responseTime: "< 6 hours" },
  { id: "selin", name: "Selin Kaya", initials: "SK", country: "Turkey", jurisdictions: ["Turkey", "Germany"], languages: ["Turkish", "German", "English"], specialties: ["Immigration", "Family"], experience: 7, verified: false, responseTime: "< 1 day" },
  { id: "camille", name: "Camille Laurent", initials: "CL", country: "France", jurisdictions: ["France", "European Union"], languages: ["French", "English", "Spanish"], specialties: ["Data privacy", "Consumer rights"], experience: 10, verified: true, responseTime: "< 12 hours" },
];

export const legalCategories = ["Employment", "Consumer rights", "Family", "Immigration", "Criminal", "Contract", "Corporate", "Intellectual property", "Real estate", "Insurance", "Tax", "Personal injury", "Data privacy", "E-commerce", "International trade", "Other"];
