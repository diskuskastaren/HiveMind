import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import CharacterCount from '@tiptap/extension-character-count';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Mention from '@tiptap/extension-mention';
import { useStore, INTERNAL_TAB_ID } from '../store/store';
import { format } from 'date-fns';
import { TEMPLATES } from '../utils/templates';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Code2,
  Minus,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  Link2,
  Unlink2,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
  ClipboardList,
  Download,
  FileDown,
  Undo2,
  Redo2,
  Plus,
  X,
  Mic,
  Paperclip,
  Search,
  CalendarDays,
  Users,
  MoreHorizontal,
  ChevronDown,
  CornerUpRight,
  Gavel,
  Mail,
  SquareCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ColorDot, EntityChip } from './common';
import type { Attachment } from '../types';
import { exportNoteMarkdown, exportEmailSummary, downloadFile } from '../utils/export';
import { CollapsibleExtension } from './editor/CollapsibleExtension';
import { SlashCommandExtension } from './editor/SlashCommandExtension';
import { FindReplaceExtension, FindReplacePanel } from './editor/FindReplace';
import { createMentionSuggestion, type MentionItem } from './editor/MentionSuggestion';

const TAB_CHAR = '\u00A0\u00A0\u00A0\u00A0';

const ToolbarBtn = ({
  active,
  onClick,
  children,
  title,
  shortcut,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  shortcut?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={title}
        aria-pressed={active}
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4',
          active && 'bg-accent text-foreground',
        )}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent className="flex items-center gap-2">
      {title}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </TooltipContent>
  </Tooltip>
);

const ToolbarSep = () => <span className="mx-1 h-4.5 w-px bg-border" />;

const DateTimeEditor = ({ noteId, createdAt }: { noteId: string; createdAt: number }) => {
  const [editing, setEditing] = useState(false);
  const updateNote = useStore((s) => s.updateNote);
  const inputRef = useRef<HTMLInputElement>(null);

  const toInputValue = (ts: number) => format(new Date(ts), "yyyy-MM-dd'T'HH:mm");

  const handleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.showPicker?.(), 50);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTs = new Date(e.target.value).getTime();
    if (!isNaN(newTs)) updateNote(noteId, { createdAt: newTs });
  };

  const handleBlur = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="datetime-local"
        aria-label="Meeting date and time"
        defaultValue={toInputValue(createdAt)}
        onChange={handleChange}
        onBlur={handleBlur}
        autoFocus
        className="h-7 shrink-0 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    );
  }

  return (
    <Button variant="ghost" size="xs" onClick={handleClick} title="Click to edit date & time" className="text-subtle-foreground">
      <CalendarDays />
      {format(new Date(createdAt), 'EEE d MMM yyyy · HH:mm')}
    </Button>
  );
};

const electronImages = typeof window !== 'undefined' && (window as any).electronImages;

const ImagePaste = Extension.create({
  name: 'imagePaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(_view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;
            for (const item of Array.from(items)) {
              if (!item.type.startsWith('image/')) continue;
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) return true;
              const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
              file.arrayBuffer().then(async (buf) => {
                let src: string;
                if (electronImages) {
                  const filename = await electronImages.save(buf, ext);
                  src = filename ? `app-image://${filename}` : '';
                } else {
                  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                  src = `data:${item.type};base64,${b64}`;
                }
                if (!src) return;
                const { state, dispatch } = _view;
                const node = state.schema.nodes.image.create({ src });
                dispatch(state.tr.replaceSelectionWith(node));
              });
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

const IndentHandler = Extension.create({
  name: 'indentHandler',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.can().sinkListItem('listItem')) return editor.commands.sinkListItem('listItem');
        if (editor.can().sinkListItem('taskItem')) return editor.commands.sinkListItem('taskItem');
        return editor.commands.insertContent(TAB_CHAR);
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.can().liftListItem('listItem')) return editor.commands.liftListItem('listItem');
        if (editor.can().liftListItem('taskItem')) return editor.commands.liftListItem('taskItem');
        return true;
      },
    };
  },
});

export function NoteEditor() {
  const activeNoteId = useStore((s) => s.activeNoteId);
  const note = useStore((s) => s.notes.find((n) => n.id === s.activeNoteId));
  const activeTabId = useStore((s) => s.activeTabId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const allProjects = useStore((s) => s.projects);
  const allSuppliers = useStore((s) => s.suppliers);
  const supplier = useStore((s) => s.suppliers.find((x) => x.id === s.activeTabId));
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const updateNote = useStore((s) => s.updateNote);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const addTask = useStore((s) => s.addTask);
  const addDecision = useStore((s) => s.addDecision);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const setRightPanelTab = useStore((s) => s.setRightPanelTab);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useStore((s) => s.toggleRightPanel);
  const isRecording = useStore((s) => s.transcriptRecording);

  // Keep refs in sync for use inside the mention suggestion closure
  const suppliersRef = useRef(allSuppliers);
  suppliersRef.current = allSuppliers;
  const projectsRef = useRef(allProjects);
  projectsRef.current = allProjects;

  const switchingRef = useRef(false);
  const noteIdRef = useRef(activeNoteId);
  const titleRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const selectionTextRef = useRef('');

  const [selectionText, setSelectionText] = useState('');
    const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  useEffect(() => {
    noteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start typing… (type / for commands, @ to mention)' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: { class: 'tiptap-link', rel: 'noopener noreferrer' },
      }),
      Typography,
      Superscript,
      Subscript,
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          ...createMentionSuggestion((query) => {
            const items: MentionItem[] = [
              ...suppliersRef.current.map((s) => ({
                id: s.id,
                label: s.name,
                type: 'supplier' as const,
                color: s.color,
              })),
              ...projectsRef.current
                .filter((p) => !p.archived)
                .map((p) => ({
                  id: p.id,
                  label: p.name,
                  type: 'project' as const,
                  color: p.color,
                })),
            ];
            return items
              .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 8);
          }),
          command: ({ editor, range, props: item }: any) => {
            const nodeAfter = editor.view.state.selection.$to.nodeAfter;
            const overrideSpace = nodeAfter?.text?.startsWith(' ');
            const to = overrideSpace ? range.to + 1 : range.to;
            editor
              .chain()
              .focus()
              .insertContentAt({ from: range.from, to }, [
                {
                  type: 'mention',
                  attrs: {
                    id: (item as MentionItem).id,
                    label: (item as MentionItem).label,
                  },
                },
                { type: 'text', text: ' ' },
              ])
              .run();
          },
        },
      }),
      IndentHandler,
      ImagePaste,
      SlashCommandExtension,
      CollapsibleExtension,
      FindReplaceExtension,
    ],
    content: note?.content || '',
    onUpdate: ({ editor }) => {
      if (!switchingRef.current && noteIdRef.current) {
        updateNote(noteIdRef.current, { content: editor.getHTML() });
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = from !== to ? editor.state.doc.textBetween(from, to, ' ') : '';
      setSelectionText(text);
      selectionTextRef.current = text;
    },
  });

  useEffect(() => {
    if (editor && note && !editor.isDestroyed) {
      const storeContent = note.content || '';
      if (editor.getHTML() !== storeContent) {
        switchingRef.current = true;
        editor.commands.setContent(storeContent);
        requestAnimationFrame(() => {
          switchingRef.current = false;
        });
      }
    }
  }, [activeNoteId, editor, note?.content]);

  useEffect(() => {
    if (activeNoteId && note && !note.title) {
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [activeNoteId]);

  // Ctrl+F to open/close find & replace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace((prev) => {
          if (!prev) {
            // Pre-fill with current selection if any
            const sel = selectionTextRef.current;
            if (sel) setFindTerm(sel);
          }
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Alt+T/D/F selection shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (!selectionText || !activeNoteId || !activeTabId || !activeProjectId) return;
      const supplierId = activeTabId === INTERNAL_TAB_ID ? null : activeTabId;

      if (e.key === 't') {
        e.preventDefault();
        addTask({
          projectId: activeProjectId,
          supplierId,
          noteId: activeNoteId,
          title: selectionText.trim(),
          status: 'open',
          priority: 'medium',
          owner: '',
          dueDate: '',
          description: '',
        });
        setRightPanelTab('tasks');
      }
      if (e.key === 'd') {
        e.preventDefault();
        addDecision({
          projectId: activeProjectId,
          supplierId,
          noteId: activeNoteId,
          text: selectionText.trim(),
        });
        setRightPanelTab('decisions');
      }
      if (e.key === 'f') {
        e.preventDefault();
        addFollowUp({
          projectId: activeProjectId,
          supplierId,
          text: selectionText.trim(),
          status: 'open',
        });
        setRightPanelTab('followups');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionText, activeNoteId, activeTabId, activeProjectId, addTask, addDecision, addFollowUp, setRightPanelTab]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (activeNoteId) updateNote(activeNoteId, { title: e.target.value });
    },
    [activeNoteId, updateNote],
  );

  const handleAttendeesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (activeNoteId) updateNote(activeNoteId, { attendees: e.target.value });
    },
    [activeNoteId, updateNote],
  );

  const handleLinkClick = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      setShowLinkInput(false);
      return;
    }
    const currentHref = editor.getAttributes('link').href || '';
    setLinkUrl(currentHref);
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 30);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) {
      const href = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')
        ? url
        : `https://${url}`;
      editor.chain().focus().setLink({ href }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const createTaskFromSelection = () => {
    if (!selectionText || !activeNoteId || !activeTabId || !activeProjectId) return;
    const supplierId = activeTabId === INTERNAL_TAB_ID ? null : activeTabId;
    addTask({
      projectId: activeProjectId,
      supplierId,
      noteId: activeNoteId,
      title: selectionText.trim(),
      status: 'open',
      priority: 'medium',
      owner: '',
      dueDate: '',
      description: '',
    });
    setRightPanelTab('tasks');
  };

  const createDecisionFromSelection = () => {
    if (!selectionText || !activeNoteId || !activeTabId || !activeProjectId) return;
    const supplierId = activeTabId === INTERNAL_TAB_ID ? null : activeTabId;
    addDecision({
      projectId: activeProjectId,
      supplierId,
      noteId: activeNoteId,
      text: selectionText.trim(),
    });
    setRightPanelTab('decisions');
  };

  const createFollowUpFromSelection = () => {
    if (!selectionText || !activeTabId || !activeProjectId) return;
    const supplierId = activeTabId === INTERNAL_TAB_ID ? null : activeTabId;
    addFollowUp({
      projectId: activeProjectId,
      supplierId,
      text: selectionText.trim(),
      status: 'open',
    });
    setRightPanelTab('followups');
  };

  const applyTemplate = (key: string) => {
    if (!editor || !activeNoteId) return;
    const content = TEMPLATES[key]?.content || '';
    editor.commands.setContent(content);
    updateNote(activeNoteId, { content });
  };

  const electronAttachments = typeof window !== 'undefined' && (window as any).electronAttachments;

  const handlePickFiles = async () => {
    if (!activeNoteId || !electronAttachments?.pick) return;
    const filePaths: string[] = await electronAttachments.pick();
    for (const filePath of filePaths) {
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      addAttachment(activeNoteId, {
        id: crypto.randomUUID(),
        fileName,
        filePath,
        attachedAt: Date.now(),
      });
    }
  };

  const handleOpenAttachment = (att: Attachment) => {
    if (electronAttachments) electronAttachments.open(att.filePath);
  };

  const handleRemoveAttachment = (att: Attachment) => {
    if (!activeNoteId) return;
    removeAttachment(activeNoteId, att.id);
  };

  const wordCount = editor?.storage.characterCount?.words() ?? 0;
  const isInTable = editor?.isActive('table') ?? false;

  if (!note) return null;

  const exportProjectNames = () =>
    note.projectIds
      .map((id) => allProjects.find((p) => p.id === id)?.name || '')
      .filter(Boolean)
      .join(', ');
  const exportSupplierName = () => (activeTabId === INTERNAL_TAB_ID ? 'Internal' : supplier?.name || '');

  const bubbleBtn = (active: boolean) =>
    cn(
      'flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5',
      active && 'bg-accent text-foreground',
    );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-10 pt-9 pb-24">
          {/* Header */}
          <div className="flex flex-col gap-3">
            <input
              ref={titleRef}
              type="text"
              aria-label="Meeting title"
              placeholder="Meeting title…"
              value={note.title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  editor?.commands.focus('start');
                }
              }}
              className="w-full border-none bg-transparent text-display font-semibold tracking-tight outline-none placeholder:text-border-strong"
            />
            <div className="-ml-2 flex flex-wrap items-center gap-1.5 text-ui text-muted-foreground">
              <DateTimeEditor noteId={note.id} createdAt={note.createdAt} />
              <label className="flex h-6 min-w-40 flex-1 items-center gap-1.5 rounded-md px-2 text-subtle-foreground focus-within:bg-accent/60 [&_svg]:size-3.5">
                <Users className="shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  aria-label="Attendees"
                  placeholder="Attendees…"
                  value={note.attendees}
                  onChange={handleAttendeesChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      editor?.commands.focus('start');
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {note.projectIds.map((pid) => {
                const p = allProjects.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <EntityChip key={pid} color={p.color} className="group/chip h-6">
                    {p.name}
                    {note.projectIds.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Unlink from ${p.name}`}
                        className="-mr-1 hidden text-muted-foreground group-hover/chip:inline hover:text-foreground"
                        onClick={() => updateNote(note.id, { projectIds: note.projectIds.filter((id) => id !== pid) })}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </EntityChip>
                );
              })}
              {note.supplierIds.length > 1 &&
                note.supplierIds.map((sid) => {
                  const s = allSuppliers.find((x) => x.id === sid);
                  if (!s) return null;
                  return (
                    <EntityChip key={sid} color={s.color} className="group/chip h-6">
                      {s.name}
                      <button
                        type="button"
                        aria-label={`Unlink from ${s.name}`}
                        className="-mr-1 hidden text-muted-foreground group-hover/chip:inline hover:text-foreground"
                        onClick={() => updateNote(note.id, { supplierIds: note.supplierIds.filter((id) => id !== sid) })}
                      >
                        <X className="size-3" />
                      </button>
                    </EntityChip>
                  );
                })}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-2xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Plus className="size-3" />
                    Project
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Link to project</DropdownMenuLabel>
                  {allProjects
                    .filter((p) => !p.archived)
                    .map((p) => {
                      const linked = note.projectIds.includes(p.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={p.id}
                          checked={linked}
                          onCheckedChange={() =>
                            updateNote(note.id, {
                              projectIds: linked ? note.projectIds.filter((id) => id !== p.id) : [...note.projectIds, p.id],
                            })
                          }
                        >
                          <ColorDot color={p.color} />
                          {p.name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-2xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Plus className="size-3" />
                    Supplier
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Link to supplier</DropdownMenuLabel>
                  {allSuppliers.map((s) => {
                    const linked = note.supplierIds.includes(s.id);
                    return (
                      <DropdownMenuCheckboxItem
                        key={s.id}
                        checked={linked}
                        onCheckedChange={() =>
                          updateNote(note.id, {
                            supplierIds: linked ? note.supplierIds.filter((id) => id !== s.id) : [...note.supplierIds, s.id],
                          })
                        }
                      >
                        <ColorDot color={s.color} />
                        {s.name}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Toolbar */}
          {editor && (
            <div className="sticky top-0 z-10 -mx-2 bg-background/95 px-2 py-2 backdrop-blur-sm">
              <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-card p-1 shadow-xs">
                <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold" shortcut="Ctrl B">
                  <Bold />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic" shortcut="Ctrl I">
                  <Italic />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline" shortcut="Ctrl U">
                  <UnderlineIcon />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
                  <Strikethrough />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
                  <Highlighter />
                </ToolbarBtn>
                <ToolbarSep />
                <ToolbarBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
                  <Heading1 />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
                  <Heading2 />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
                  <Heading3 />
                </ToolbarBtn>
                <ToolbarSep />
                <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
                  <List />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
                  <ListOrdered />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">
                  <CheckSquare />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
                  <Quote />
                </ToolbarBtn>
                <ToolbarBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
                  <Code2 />
                </ToolbarBtn>
                <ToolbarSep />
                <ToolbarBtn active={editor.isActive('link')} onClick={handleLinkClick} title={editor.isActive('link') ? 'Remove link' : 'Add link'}>
                  {editor.isActive('link') ? <Unlink2 /> : <Link2 />}
                </ToolbarBtn>
                <ToolbarBtn
                  active={isInTable}
                  onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                  title="Insert table"
                >
                  <TableIcon />
                </ToolbarBtn>
                {isInTable && (
                  <>
                    <ToolbarBtn onClick={() => (editor.chain().focus() as any).addRowAfter().run()} title="Add row below">
                      <Rows3 />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={() => (editor.chain().focus() as any).deleteRow().run()} title="Delete row">
                      <Rows3 className="opacity-50" />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={() => (editor.chain().focus() as any).addColumnAfter().run()} title="Add column right">
                      <Columns3 />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={() => (editor.chain().focus() as any).deleteColumn().run()} title="Delete column">
                      <Columns3 className="opacity-50" />
                    </ToolbarBtn>
                    <ToolbarBtn onClick={() => (editor.chain().focus() as any).deleteTable().run()} title="Delete table">
                      <Trash2 />
                    </ToolbarBtn>
                  </>
                )}
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="More formatting"
                          className="flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent [&_svg]:size-4"
                        >
                          <MoreHorizontal />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>More formatting</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <DropdownMenuCheckboxItem checked={editor.isActive('code')} onCheckedChange={() => editor.chain().focus().toggleCode().run()}>
                      <Code />
                      Inline code
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={editor.isActive('superscript')} onCheckedChange={() => editor.chain().focus().toggleSuperscript().run()}>
                      <SuperscriptIcon />
                      Superscript
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={editor.isActive('subscript')} onCheckedChange={() => editor.chain().focus().toggleSubscript().run()}>
                      <SubscriptIcon />
                      Subscript
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => editor.chain().focus().setHorizontalRule().run()}>
                      <Minus />
                      Divider
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => editor.chain().focus().undo().run()}>
                      <Undo2 />
                      Undo
                      <DropdownMenuShortcut>Ctrl Z</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => editor.chain().focus().redo().run()}>
                      <Redo2 />
                      Redo
                      <DropdownMenuShortcut>Ctrl Shift Z</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <span className="flex-1" />

                {editor.isEmpty && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="xs" className="text-subtle-foreground">
                        <ClipboardList />
                        Template
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Insert template</DropdownMenuLabel>
                      {Object.entries(TEMPLATES).map(([key, t]) => (
                        <DropdownMenuItem key={key} onSelect={() => applyTemplate(key)}>
                          {t.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <ToolbarBtn active={showFindReplace} onClick={() => setShowFindReplace((v) => !v)} title="Find & replace" shortcut="Ctrl F">
                  <Search />
                </ToolbarBtn>
                <ToolbarBtn onClick={handlePickFiles} title="Attach file">
                  <Paperclip />
                </ToolbarBtn>
                <ToolbarBtn
                  onClick={() => {
                    if (!rightPanelOpen) toggleRightPanel();
                    setRightPanelTab('transcript');
                  }}
                  title={isRecording ? 'Recording in progress — open transcript' : 'Record meeting transcript'}
                >
                  <span className="relative flex">
                    <Mic className={isRecording ? 'text-recording' : undefined} />
                    {isRecording && <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-recording" />}
                  </span>
                </ToolbarBtn>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="xs" className="text-subtle-foreground">
                      <Download />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onSelect={() => {
                        const md = exportNoteMarkdown(note, exportSupplierName(), exportProjectNames());
                        downloadFile(md, `${note.title || 'note'}.md`);
                      }}
                    >
                      <FileDown />
                      Markdown
                      <DropdownMenuShortcut>.md</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        const email = exportEmailSummary(note, exportSupplierName(), exportProjectNames(), tasks, decisions);
                        downloadFile(email, `${note.title || 'note'}-summary.txt`);
                      }}
                    >
                      <Mail />
                      Email summary
                      <DropdownMenuShortcut>.txt</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Link input row */}
              {showLinkInput && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-xs">
                  <Link2 className="size-3.5 shrink-0 text-primary" />
                  <input
                    ref={linkInputRef}
                    value={linkUrl}
                    aria-label="Link URL"
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyLink();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowLinkInput(false);
                        setLinkUrl('');
                        editor.commands.focus();
                      }
                    }}
                    placeholder="https://…"
                    className="flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground"
                  />
                  <Button
                    size="xs"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyLink();
                    }}
                  >
                    Set link
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Cancel"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowLinkInput(false);
                      setLinkUrl('');
                      editor.commands.focus();
                    }}
                  >
                    <X />
                  </Button>
                </div>
              )}

              {/* Find & Replace panel */}
              {showFindReplace && (
                <FindReplacePanel
                  editor={editor}
                  onClose={() => setShowFindReplace(false)}
                  findTerm={findTerm}
                  setFindTerm={setFindTerm}
                  replaceTerm={replaceTerm}
                  setReplaceTerm={setReplaceTerm}
                />
              )}
            </div>
          )}

          {/* Attachments */}
          {note.attachments && note.attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              {note.attachments.map((att) => (
                <span key={att.id} className="group/att inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-ui">
                  <button type="button" onClick={() => handleOpenAttachment(att)} className="max-w-56 truncate hover:underline" title={`Open ${att.fileName}`}>
                    {att.fileName}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att)}
                    aria-label="Remove attachment"
                    className="hidden text-muted-foreground group-hover/att:inline hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Editor */}
          <div className="relative">
            {editor && (
              <BubbleMenu
                editor={editor}
                tippyOptions={{ duration: 100, placement: 'top-start', maxWidth: 'none' }}
                shouldShow={({ state }) => {
                  const { selection } = state;
                  if (selection.empty) return false;
                  if ((selection as any).node) return false;
                  return true;
                }}
              >
                <div role="toolbar" aria-label="Selection actions" className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    className={bubbleBtn(false)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      createTaskFromSelection();
                    }}
                  >
                    <SquareCheck />
                    Task <Kbd className="h-4 bg-transparent px-0 text-2xs">Alt T</Kbd>
                  </button>
                  <button
                    type="button"
                    className={bubbleBtn(false)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      createDecisionFromSelection();
                    }}
                  >
                    <Gavel />
                    Decision <Kbd className="h-4 bg-transparent px-0 text-2xs">Alt D</Kbd>
                  </button>
                  <button
                    type="button"
                    className={bubbleBtn(false)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      createFollowUpFromSelection();
                    }}
                  >
                    <CornerUpRight />
                    Follow-up <Kbd className="h-4 bg-transparent px-0 text-2xs">Alt F</Kbd>
                  </button>
                  <span className="mx-0.5 h-4 w-px bg-border" />
                  <button
                    type="button"
                    aria-label="Bold"
                    className={bubbleBtn(editor.isActive('bold'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().toggleBold().run();
                    }}
                  >
                    <Bold />
                  </button>
                  <button
                    type="button"
                    aria-label="Italic"
                    className={bubbleBtn(editor.isActive('italic'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().toggleItalic().run();
                    }}
                  >
                    <Italic />
                  </button>
                  <button
                    type="button"
                    aria-label="Underline"
                    className={bubbleBtn(editor.isActive('underline'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().toggleUnderline().run();
                    }}
                  >
                    <UnderlineIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Strikethrough"
                    className={bubbleBtn(editor.isActive('strike'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().toggleStrike().run();
                    }}
                  >
                    <Strikethrough />
                  </button>
                  <button
                    type="button"
                    aria-label="Highlight"
                    className={bubbleBtn(editor.isActive('highlight'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().toggleHighlight().run();
                    }}
                  >
                    <Highlighter />
                  </button>
                  <button
                    type="button"
                    aria-label="Inline code"
                    className={bubbleBtn(editor.isActive('code'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      editor.chain().focus().toggleCode().run();
                    }}
                  >
                    <Code />
                  </button>
                  <button
                    type="button"
                    aria-label={editor.isActive('link') ? 'Remove link' : 'Add link'}
                    className={bubbleBtn(editor.isActive('link'))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleLinkClick();
                    }}
                  >
                    <Link2 />
                  </button>
                </div>
              </BubbleMenu>
            )}

            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Footer: word count + autosave */}
      <div className="flex h-8 shrink-0 items-center justify-end gap-3 border-t px-4 text-2xs text-muted-foreground tabular-nums select-none">
        {wordCount > 0 && <span>{wordCount} words</span>}
        <span>Saved · {format(new Date(note.updatedAt), 'HH:mm:ss')}</span>
      </div>
    </div>
  );
}
