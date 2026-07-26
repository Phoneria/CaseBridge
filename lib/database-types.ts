import type { CaseStatus, UserRole } from "./types";

export type UserRow = { id: string; role: UserRole; full_name: string; email: string; country: string; language: string; created_at: string };
export type LawyerProfileRow = { id: string; user_id: string; bio: string; years_experience: number; verification_status: "pending"|"verified"|"rejected"; license_number: string; bar_association: string; jurisdictions: string[]; practice_areas: string[]; languages: string[]; subscription_plan: "starter"|"professional"|"international" };
export type CaseRow = { id: string; user_id: string; title: string; description: string; case_type: "local"|"cross-border"|"international"; primary_jurisdiction: string|null; secondary_jurisdictions: string[]; is_cross_border: boolean; status: CaseStatus; urgency: "low"|"medium"|"high"; preferred_language: string; budget_range: string; published_at: string|null; created_at: string };
export type CaseAnswerRow = { id: string; case_id: string; question: string; answer: string; answer_type: "text"|"boolean"|"date"|"file" };
export type DocumentRow = { id: string; case_id: string; file_name: string; file_url: string; document_type: string; processing_status: "queued"|"processing"|"complete"|"error"; relevance_level: "high"|"medium"|"low"|"unknown"; extracted_text: string|null; created_at: string };
export type CaseReportRow = { id: string; case_id: string; summary: string; legal_issues: unknown[]; evidence_analysis: unknown[]; missing_evidence: unknown[]; possible_next_steps: string[]; deadline_warnings: unknown[]; recommended_lawyer_profile: unknown; disclaimer: string; created_at: string };
export type LawyerOfferRow = { id: string; case_id: string; lawyer_id: string; message: string; proposed_fee: string; availability: string; status: "pending"|"accepted"|"declined"; created_at: string };
export type ConversationRow = { id: string; case_id: string; user_id: string; lawyer_id: string; created_at: string };
export type MessageRow = { id: string; conversation_id: string; sender_id: string; content: string; file_url: string|null; created_at: string; read_at: string|null };
