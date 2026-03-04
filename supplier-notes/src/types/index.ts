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
}

export interface Task {
  id: string;
  projectId: string;
  supplierId: string | null;
  noteId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  owner: string;
  dueDate: string;
  description: string;
  createdAt: number;
  isFollowUp?: boolean;
  linkedFollowUpId?: string;
}

export interface FollowUp {
  id: string;
  supplierId: string | null;
  projectId: string;
  text: string;
  status: 'open' | 'resolved';
  createdAt: number;
  linkedTaskId?: string;
}

export interface Decision {
  id: string;
  projectId: string;
  supplierId: string | null;
  noteId: string;
  text: string;
  createdAt: number;
}

export type RightPanelTab = 'tasks' | 'decisions' | 'transcript';
export type TaskStatus = 'open' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type ActiveView = 'notes' | 'dashboard';
export type DashboardSection = 'tasks' | 'decisions' | 'followups';
