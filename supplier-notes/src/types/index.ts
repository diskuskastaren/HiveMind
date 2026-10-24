export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  pinned: boolean;
  defaultTemplate: string | null;
  color: string;
  projectIds: string[];
  createdAt: number;
}

export interface Transcript {
  id: string;
  rawText: string;
  summary?: string;
  duration: number;
  recordedAt: number;
  analysis?: MeetingAnalysis;
}

export type MeetingSuggestionKind = 'task' | 'decision' | 'question' | 'commitment' | 'followup' | 'change';
export interface MeetingSuggestion {
  id: string;
  kind: MeetingSuggestionKind;
  text: string;
  owner: string;
  dueDate: string;
  priority: Priority;
  sourceQuote: string;
  timestampSeconds: number | null;
  status: 'pending' | 'accepted' | 'rejected';
  linkedEntityId?: string;
  projectId?: string;
  saveAs?: 'task' | 'decision' | 'followup';
}
export interface MeetingAnalysis {
  sourceHash: string;
  analyzedAt: number;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  suggestions: MeetingSuggestion[];
}

export interface Attachment {
  id: string;
  fileName: string;
  filePath: string;
  attachedAt: number;
}

export interface Note {
  id: string;
  projectIds: string[];
  supplierIds: string[];
  internal?: boolean;
  archived?: boolean;
  title: string;
  content: string;
  attendees: string;
  createdAt: number;
  updatedAt: number;
  transcripts?: Transcript[];
  attachments?: Attachment[];
}

export interface TaskUpdate {
  id: string;
  timestamp: number;
  text: string;
}

export interface Task {
  id: string;
  projectId: string;
  supplierId: string | null;
  noteId: string | null;
  title: string;
  status: TaskStatus;
  priority: Priority;
  owner: string;
  dueDate: string;
  description: string;
  createdAt: number;
  isFollowUp?: boolean;
  linkedFollowUpId?: string;
  attachments?: Attachment[];
  updates?: TaskUpdate[];
  sourceTranscriptId?: string;
  sourceSuggestionId?: string;
  sourceQuote?: string;
}

export interface FollowUp {
  id: string;
  supplierId: string | null;
  projectId: string;
  text: string;
  status: 'open' | 'resolved';
  createdAt: number;
  linkedTaskId?: string;
  sourceTranscriptId?: string;
  sourceSuggestionId?: string;
  sourceQuote?: string;
  noteId?: string | null;
}

export interface Decision {
  id: string;
  projectId: string;
  supplierId: string | null;
  noteId: string | null;
  text: string;
  createdAt: number;
  updatedAt?: number;
  status?: 'active' | 'superseded' | 'revoked';
  supersedesId?: string | null;
  rationale?: string;
  comments?: string;
  relatedTaskIds?: string[];
  projectName?: string;
  supplierName?: string;
  sourceNoteTitle?: string;
  history?: Array<{
    id: string;
    timestamp: number;
    action: 'created' | 'edited' | 'superseded' | 'revoked';
    text: string;
    status: 'active' | 'superseded' | 'revoked';
    comment?: string;
  }>;
  sourceTranscriptId?: string;
  sourceSuggestionId?: string;
  sourceQuote?: string;
}

export type RightPanelTab = 'tasks' | 'decisions' | 'followups' | 'transcript';
export type TaskStatus = 'open' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type ActiveView = 'notes' | 'tasks' | 'dashboard';
export type DashboardSection = 'tasks' | 'decisions' | 'followups';
