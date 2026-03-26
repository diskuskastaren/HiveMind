import { useState } from 'react';
import {
  X,
  LayoutDashboard,
  FolderOpen,
  FileText,
  CheckCircle2,
  Mic,
  Bot,
  Video,
  Keyboard,
  Database,
} from 'lucide-react';
import { useStore } from '../store/store';

type HelpSection =
  | 'overview'
  | 'projects'
  | 'notes'
  | 'tasks'
  | 'transcription'
  | 'ai'
  | 'teams'
  | 'shortcuts'
  | 'settings';

const SECTIONS: { id: HelpSection; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',      label: 'Overview',                    icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'projects',      label: 'Projects & Suppliers',        icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'notes',         label: 'Notes',                       icon: <FileText className="w-4 h-4" /> },
  { id: 'tasks',         label: 'Tasks, Decisions & Follow-ups', icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: 'transcription', label: 'Transcription & Recording',   icon: <Mic className="w-4 h-4" /> },
  { id: 'ai',            label: 'AI & Summarization',          icon: <Bot className="w-4 h-4" /> },
  { id: 'teams',         label: 'Teams Integration',           icon: <Video className="w-4 h-4" /> },
  { id: 'shortcuts',     label: 'Keyboard Shortcuts',          icon: <Keyboard className="w-4 h-4" /> },
  { id: 'settings',      label: 'Settings & Data',             icon: <Database className="w-4 h-4" /> },
];

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-5 mb-1.5">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
      {children}
    </p>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-3.5 py-2.5">
      <span className="mt-0.5 text-blue-500 dark:text-blue-400 flex-shrink-0 text-xs font-bold uppercase tracking-wider">Tip</span>
      <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">{children}</p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono text-gray-700 dark:text-gray-200">
      {children}
    </kbd>
  );
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed list-disc list-inside">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

// ── Section content ──────────────────────────────────────────────────────────

function OverviewSection() {
  return (
    <div className="space-y-3">
      <Heading>Welcome to Combobulator</Heading>
      <P>
        Combobulator is a desktop meeting-notes app built for teams that work closely with
        external suppliers and partners. It keeps your notes, tasks, decisions, and follow-ups
        organised by project and supplier, so nothing falls through the cracks between meetings.
      </P>

      <SubHeading>The three main views</SubHeading>
      <div className="space-y-2.5">
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-0.5">Notes</p>
          <P>Your day-to-day writing surface. Open a supplier tab, create a note, and write freely using the rich-text editor. The right panel gives you per-note tasks, decisions, and a live transcript.</P>
        </div>
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-0.5">Tasks</p>
          <P>A consolidated workspace for tasks, decisions, and follow-ups across all suppliers in the active project. Filter, sort, and manage everything without leaving your notes.</P>
        </div>
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3.5">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-0.5">Dashboard</p>
          <P>A quick-glance home screen. See project stats, pinned suppliers, recent notes, and jump back into where you left off.</P>
        </div>
      </div>

      <SubHeading>Getting started in 3 steps</SubHeading>
      <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400 list-decimal list-inside leading-relaxed">
        <li>Create a <strong className="text-gray-800 dark:text-gray-200">Project</strong> in the left sidebar (click the + next to "Projects").</li>
        <li>Add one or more <strong className="text-gray-800 dark:text-gray-200">Suppliers</strong> to that project. Each supplier gets its own tab.</li>
        <li>Open a supplier tab and create a <strong className="text-gray-800 dark:text-gray-200">Note</strong> to start writing.</li>
      </ol>
    </div>
  );
}

function ProjectsSection() {
  return (
    <div className="space-y-3">
      <Heading>Projects & Suppliers</Heading>
      <P>
        Projects are the top-level containers for your work. Every supplier, note, task, and
        decision lives inside a project. Switch between projects using the sidebar.
      </P>

      <SubHeading>Creating a project</SubHeading>
      <P>Click the <strong className="text-gray-800 dark:text-gray-200">+</strong> icon next to "Projects" in the sidebar. Give it a name and pick a colour. The colour appears throughout the UI to help you visually separate projects.</P>

      <SubHeading>Suppliers</SubHeading>
      <P>
        Suppliers represent the external companies or teams you meet with. Each supplier sits
        under a project and gets its own note stream, colour label, and optional template.
      </P>
      <Ul items={[
        'Add a supplier by clicking + in the sidebar under your project.',
        'Pin frequently-used suppliers to the top of the list.',
        'Assign a colour to make supplier tabs easy to identify at a glance.',
        'Use templates to pre-populate new notes with your preferred structure.',
        'Suppliers can be archived when a relationship ends — their data is preserved.',
      ]} />

      <SubHeading>Internal notes tab</SubHeading>
      <P>
        Every project also has an <strong className="text-gray-800 dark:text-gray-200">Internal</strong> tab for notes that don't belong to any specific supplier — team-internal meeting notes, reference material, or working documents.
      </P>

      <Tip>Pinned suppliers always appear at the top of your sidebar list so the ones you use most are one click away.</Tip>
    </div>
  );
}

function NotesSection() {
  return (
    <div className="space-y-3">
      <Heading>Notes</Heading>
      <P>
        Notes are rich-text documents tied to a supplier (or the Internal tab). Each note has a
        title, body, optional attachments, and can carry its own transcript. Notes are listed
        newest-first in the sidebar under each supplier.
      </P>

      <SubHeading>Editor basics</SubHeading>
      <Ul items={[
        'The toolbar at the top provides formatting: bold, italic, headings, lists, tables, code blocks, links, and images.',
        'Type / to open the slash-command menu for quick insertion of blocks.',
        'Use @ to mention a supplier name inline.',
        'Paste images directly into the editor or use the attachment button.',
        'Tables support add/remove row and column via right-click context menu.',
      ]} />

      <SubHeading>Organising notes</SubHeading>
      <Ul items={[
        'Rename a note by clicking its title in the editor header.',
        'Archive old notes using the menu on the note list item — they stay searchable.',
        'Delete a note permanently from the same menu.',
        'Use Ctrl+Shift+F to search across all notes in the project.',
      ]} />

      <SubHeading>Attachments</SubHeading>
      <P>
        Attach files to any note using the paperclip button in the editor toolbar. Attachments
        are stored alongside your data and can be downloaded from the note at any time.
      </P>

      <SubHeading>Right panel</SubHeading>
      <P>
        Open the right panel with <Kbd>Ctrl+]</Kbd> to see tasks and decisions linked to the
        current note, and to start or review a transcript.
      </P>

      <Tip>Use the Global Search (<Kbd>Ctrl+Shift+F</Kbd>) to find content across all suppliers and all notes at once.</Tip>
    </div>
  );
}

function TasksSection() {
  return (
    <div className="space-y-3">
      <Heading>Tasks, Decisions & Follow-ups</Heading>
      <P>
        These three item types capture actionable outcomes from your meetings. They can be
        created inline while writing, from selected text, or from the Tasks view.
      </P>

      <SubHeading>Tasks</SubHeading>
      <P>
        Tasks track work items with a Kanban-style status (To Do → In Progress → Done), an
        optional priority, owner, and due date. Create a task by:
      </P>
      <Ul items={[
        'Selecting text in the editor and pressing Alt+T.',
        'Using the + button in the Tasks view.',
        'Clicking "Add task" inside the right panel.',
      ]} />

      <SubHeading>Decisions</SubHeading>
      <P>
        Decisions record agreed outcomes or choices made during a meeting. Select text and
        press <Kbd>Alt+D</Kbd>, or use the Decisions section in the right panel.
      </P>

      <SubHeading>Follow-ups</SubHeading>
      <P>
        Follow-ups are lightweight reminders tied to a supplier — things to check or ask next
        time. Select text and press <Kbd>Alt+F</Kbd>, or use the follow-ups tray at the bottom
        of the notes view.
      </P>

      <SubHeading>Tasks view</SubHeading>
      <P>
        Switch to the <strong className="text-gray-800 dark:text-gray-200">Tasks</strong> tab in the top bar to see all tasks, decisions, and follow-ups across every supplier in the current project. Use the section tabs (Tasks / Decisions / Follow-ups) to switch between them, and the filter controls to narrow by status or supplier.
      </P>

      <Tip>Select any text in the editor and use the floating action buttons to instantly create a task, decision, or follow-up from that text.</Tip>
    </div>
  );
}

function TranscriptionSection() {
  return (
    <div className="space-y-3">
      <Heading>Transcription & Recording</Heading>
      <P>
        Combobulator can transcribe meetings in real time using your microphone or system audio.
        Transcripts are saved inside the note they were started from and can be reviewed or
        exported at any time.
      </P>

      <SubHeading>Starting a recording</SubHeading>
      <ol className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 list-decimal list-inside leading-relaxed">
        <li>Open the note you want to transcribe.</li>
        <li>Open the right panel (<Kbd>Ctrl+]</Kbd>) and click the Transcript tab.</li>
        <li>Choose an audio mode (Microphone or System audio) and click Start.</li>
      </ol>

      <SubHeading>Audio modes</SubHeading>
      <div className="space-y-2 mt-1">
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-0.5">Microphone</p>
          <P>Uses your browser's built-in speech recognition. No API cost. Works offline. Best for capturing your own voice only.</P>
        </div>
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-0.5">System audio</p>
          <P>Captures all audio playing on your computer (including remote participants). Transcribed via Groq Whisper. Requires a Groq API key in Settings.</P>
        </div>
      </div>

      <SubHeading>During a recording</SubHeading>
      <Ul items={[
        'A red "Recording" badge appears in the top bar. Click it to jump back to the active note.',
        'Transcription is chunked automatically (default: every 60 seconds).',
        'You can keep writing notes in the editor while recording continues in the background.',
        'Auto-stop kicks in after a configurable number of hours (default: 4 hours).',
      ]} />

      <SubHeading>After a recording</SubHeading>
      <P>
        The full transcript is saved to the note. You can use the AI Summarize feature to
        generate a structured summary from the transcript text.
      </P>

      <Tip>Configure the default audio mode and chunk interval under Settings → Recording so every session starts with your preferred setup.</Tip>
    </div>
  );
}

function AiSection() {
  return (
    <div className="space-y-3">
      <Heading>AI & Summarization</Heading>
      <P>
        Combobulator integrates with OpenAI (GPT models) and Groq (Whisper transcription) to
        generate note summaries and transcribe audio. You bring your own API keys — no usage
        is proxied through Combobulator's servers.
      </P>

      <SubHeading>Setting up API keys</SubHeading>
      <P>Go to <strong className="text-gray-800 dark:text-gray-200">Settings → AI & Summarization</strong> and paste in your keys:</P>
      <Ul items={[
        'OpenAI API key — used for GPT-based note summaries.',
        'Groq API key — used for Whisper transcription (system audio mode only).',
      ]} />
      <P>Use the "Test connection" button to verify each key before using it.</P>

      <SubHeading>Generating a summary</SubHeading>
      <P>
        With an OpenAI key configured, the Summarize button becomes available in the note
        editor toolbar. Click it to generate a structured summary of the current note. The
        summary is inserted directly into your note as editable text.
      </P>

      <SubHeading>Choosing a model</SubHeading>
      <P>
        Four GPT models are available. The Settings screen shows an estimated cost for a
        typical one-hour meeting for each model so you can make an informed choice:
      </P>
      <Ul items={[
        'GPT-4o mini — fastest and cheapest, suitable for most meeting notes.',
        'GPT-4o — highest quality output, best for complex or technical meetings.',
        'GPT-4 Turbo — good balance of quality and speed.',
        'o1-mini — reasoning model, useful for analytical summaries.',
      ]} />

      <SubHeading>Custom summary instructions</SubHeading>
      <P>
        In Settings → AI & Summarization you can add custom instructions appended to every
        summarization request — for example specifying a preferred output format, language,
        or focus area.
      </P>

      <Tip>GPT-4o mini is recommended as the default. Switch to GPT-4o for notes where accuracy and structure matter most.</Tip>
    </div>
  );
}

function TeamsSection() {
  return (
    <div className="space-y-3">
      <Heading>Teams Integration</Heading>
      <P>
        Combobulator can detect when a Microsoft Teams meeting starts and prompt you to begin
        recording, keeping your notes and transcripts in sync with your calendar.
      </P>

      <SubHeading>Enabling Teams integration</SubHeading>
      <P>Go to <strong className="text-gray-800 dark:text-gray-200">Settings → Teams</strong> and toggle Teams integration on. Combobulator will monitor for Teams activity in the background.</P>

      <SubHeading>How it works</SubHeading>
      <Ul items={[
        'When a Teams meeting is detected, a prompt appears asking if you want to start recording.',
        'Accepting opens the transcript panel and begins system audio capture automatically.',
        'The recording is linked to whichever note is currently active.',
        'You can dismiss the prompt without starting a recording.',
      ]} />

      <SubHeading>Disabling Teams integration</SubHeading>
      <P>
        If you don't use Microsoft Teams, keep this setting off to avoid background monitoring
        overhead. All other features work independently of Teams.
      </P>

      <Tip>Make sure system audio capture permission is granted in your OS settings for Teams audio to be captured correctly.</Tip>
    </div>
  );
}

function ShortcutsSection() {
  const shortcuts: [string, string][] = [
    ['Ctrl+K',         'Open command palette'],
    ['Ctrl+N',         'Create new note'],
    ['Ctrl+Shift+F',   'Global search'],
    ['Ctrl+,',         'Open settings'],
    ['Ctrl+]',         'Toggle right panel'],
    ['Ctrl+1 – 9',     'Switch to supplier tab by position'],
    ['Ctrl+W',         'Close current tab'],
    ['Alt+T',          'Create task from selected text'],
    ['Alt+D',          'Create decision from selected text'],
    ['Alt+F',          'Create follow-up from selected text'],
    ['Tab',            'Indent list item'],
    ['Shift+Tab',      'Outdent list item'],
    ['Escape',         'Close any open overlay or modal'],
  ];

  return (
    <div className="space-y-3">
      <Heading>Keyboard Shortcuts</Heading>
      <P>These shortcuts work from anywhere in the app unless a modal is open.</P>

      <div className="mt-3 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {shortcuts.map(([key, desc], i) => (
          <div
            key={key}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${
              i % 2 === 0
                ? 'bg-white dark:bg-gray-900'
                : 'bg-gray-50/60 dark:bg-gray-800/60'
            }`}
          >
            <span className="text-gray-600 dark:text-gray-400">{desc}</span>
            <Kbd>{key}</Kbd>
          </div>
        ))}
      </div>

      <SubHeading>Editor shortcuts</SubHeading>
      <P>Standard rich-text shortcuts work inside the note editor:</P>
      <div className="mt-2 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {([
          ['Ctrl+B', 'Bold'],
          ['Ctrl+I', 'Italic'],
          ['Ctrl+U', 'Underline'],
          ['Ctrl+Z', 'Undo'],
          ['Ctrl+Shift+Z', 'Redo'],
          ['/', 'Slash-command menu (at start of line)'],
        ] as [string, string][]).map(([key, desc], i) => (
          <div
            key={key}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${
              i % 2 === 0
                ? 'bg-white dark:bg-gray-900'
                : 'bg-gray-50/60 dark:bg-gray-800/60'
            }`}
          >
            <span className="text-gray-600 dark:text-gray-400">{desc}</span>
            <Kbd>{key}</Kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsSection() {
  return (
    <div className="space-y-3">
      <Heading>Settings & Data</Heading>
      <P>
        Access settings at any time with <Kbd>Ctrl+,</Kbd> or through the gear icon in the
        sidebar footer.
      </P>

      <SubHeading>Appearance</SubHeading>
      <P>Choose between Light, Dark, and a bonus theme. You can also cycle themes using the palette icon in the sidebar footer.</P>

      <SubHeading>Data storage</SubHeading>
      <P>
        All data is stored locally on your machine in a single JSON file
        (<code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">Combobulator-data.json</code>).
        No data is sent to external servers except when you use the AI features (which go
        directly to OpenAI / Groq using your own API keys).
      </P>

      <SubHeading>Custom data directory</SubHeading>
      <P>
        By default data is saved in your system's app-data folder. You can point Combobulator
        at a custom directory under <strong className="text-gray-800 dark:text-gray-200">Settings → Data & Storage</strong>
        — useful if you want to store data on a synced drive (e.g. OneDrive or Dropbox).
      </P>

      <SubHeading>Export & backup</SubHeading>
      <Ul items={[
        'Export all data to a JSON file from Settings → Data & Storage.',
        'Import a previously exported file to restore or migrate data.',
        'Exports include all projects, suppliers, notes, tasks, decisions, and follow-ups.',
        'Image attachments are stored separately in an "images" folder next to the data file.',
      ]} />

      <SubHeading>Clearing data</SubHeading>
      <P>
        The "Clear all data" option in Settings → Data & Storage permanently deletes
        everything. This cannot be undone. Export a backup first if you might need the data.
      </P>

      <SubHeading>Auto-updates</SubHeading>
      <P>
        Combobulator checks for updates automatically. When an update is available you'll see
        a prompt to install it. You can also check manually from Settings → Data & Storage.
      </P>

      <Tip>Keep a regular export backup, especially before major updates or if you're moving your data to a new machine.</Tip>
    </div>
  );
}

// ── Modal shell ──────────────────────────────────────────────────────────────

export function HelpModal() {
  const toggleHelp = useStore((s) => s.toggleHelp);
  const [activeSection, setActiveSection] = useState<HelpSection>('overview');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      toggleHelp();
    }
  };

  const content: Record<HelpSection, React.ReactNode> = {
    overview:      <OverviewSection />,
    projects:      <ProjectsSection />,
    notes:         <NotesSection />,
    tasks:         <TasksSection />,
    transcription: <TranscriptionSection />,
    ai:            <AiSection />,
    teams:         <TeamsSection />,
    shortcuts:     <ShortcutsSection />,
    settings:      <SettingsSection />,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={toggleHelp} />

      {/* Modal panel */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex w-[740px] h-[85vh] overflow-hidden">

        {/* Left nav */}
        <div className="w-52 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col py-5 flex-shrink-0">
          <div className="px-5 pb-4">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Help Guide</span>
          </div>
          <nav className="flex flex-col gap-0.5 px-2 flex-1 overflow-y-auto">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors text-left w-full ${
                  activeSection === section.id
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="flex-shrink-0 mt-0.5">{section.icon}</span>
                <span className="leading-snug">{section.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {SECTIONS.find((s) => s.id === activeSection)?.label}
            </h2>
            <button
              onClick={toggleHelp}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6">
            {content[activeSection]}
          </div>
        </div>
      </div>
    </div>
  );
}
