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
} from 'lucide-react';
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
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) => (
  <button
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    title={title}
    className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${active ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
  >
    {children}
  </button>
);

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
        defaultValue={toInputValue(createdAt)}
        onChange={handleChange}
        onBlur={handleBlur}
        autoFocus
        className="flex-shrink-0 text-sm text-gray-500 border-none outline-none bg-transparent cursor-text"
      />
    );
  }

  return (
    <button
      onClick={handleClick}
      title="Click to edit date & time"
      className="flex-shrink-0 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors cursor-pointer"
    >
      {format(new Date(createdAt), 'EEEE, MMM d yyyy · HH:mm')}
    </button>
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
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
  };

  const applyTemplate = (key: string) => {
    if (!editor || !activeNoteId) return;
    const content = TEMPLATES[key]?.content || '';
    editor.commands.setContent(content);
    updateNote(activeNoteId, { content });
    setShowTemplateMenu(false);
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-6 pb-2 flex-shrink-0">
        <input
          ref={titleRef}
          type="text"
          placeholder="Meeting title…"
          value={note.title}
          onChange={handleTitleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault();
              editor?.commands.focus('start');
            }
          }}
          className="w-full text-2xl font-bold text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 border-none outline-none bg-transparent"
        />
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400 dark:text-gray-500 flex-wrap">
          <DateTimeEditor noteId={note.id} createdAt={note.createdAt} />

          {/* Project badges */}
          <div className="flex items-center gap-1 flex-wrap">
            {note.projectIds.map((pid) => {
              const p = allProjects.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <span
                  key={pid}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded group"
                  style={{ backgroundColor: p.color + '20', color: p.color }}
                >
                  {p.name}
                  {note.projectIds.length > 1 && (
                    <button
                      className="opacity-0 group-hover:opacity-100 hover:opacity-100 ml-0.5"
                      title={`Unlink from ${p.name}`}
                      onClick={() =>
                        updateNote(note.id, {
                          projectIds: note.projectIds.filter((id) => id !== pid),
                        })
                      }
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              );
            })}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProjectPicker(!showProjectPicker);
                  setShowSupplierPicker(false);
                }}
                className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                title="Link note to another project"
              >
                <Plus className="w-3 h-3" />
              </button>
              {showProjectPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProjectPicker(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    <p className="px-3 pt-1 pb-0.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
                      Link to project
                    </p>
                    {allProjects
                      .filter((p) => !p.archived)
                      .map((p) => {
                        const linked = note.projectIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                            onClick={() => {
                              updateNote(note.id, {
                                projectIds: linked
                                  ? note.projectIds.filter((id) => id !== p.id)
                                  : [...note.projectIds, p.id],
                              });
                              setShowProjectPicker(false);
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="flex-1">{p.name}</span>
                            {linked && <span className="text-xs text-blue-500">✓</span>}
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Supplier badges */}
          {note.supplierIds.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              {note.supplierIds.map((sid) => {
                const s = allSuppliers.find((x) => x.id === sid);
                if (!s) return null;
                return (
                  <span
                    key={sid}
                    className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border group"
                    style={{ borderColor: s.color + '60', color: s.color }}
                  >
                    {s.name}
                    <button
                      className="opacity-0 group-hover:opacity-100 ml-0.5"
                      title={`Unlink from ${s.name}`}
                      onClick={() =>
                        updateNote(note.id, {
                          supplierIds: note.supplierIds.filter((id) => id !== sid),
                        })
                      }
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Link to more suppliers */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSupplierPicker(!showSupplierPicker);
                setShowProjectPicker(false);
              }}
              className="text-xs text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
              title="Link note to another supplier"
            >
              + supplier
            </button>
            {showSupplierPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSupplierPicker(false)} />
                <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px] max-h-[220px] overflow-y-auto">
                  <p className="px-3 pt-1 pb-0.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
                    Link to supplier
                  </p>
                  {allSuppliers.map((s) => {
                    const linked = note.supplierIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                        onClick={() => {
                          updateNote(note.id, {
                            supplierIds: linked
                              ? note.supplierIds.filter((id) => id !== s.id)
                              : [...note.supplierIds, s.id],
                          });
                          setShowSupplierPicker(false);
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="flex-1">{s.name}</span>
                        {linked && <span className="text-xs text-blue-500">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <input
            type="text"
            placeholder="Attendees…"
            value={note.attendees}
            onChange={handleAttendeesChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editor?.commands.focus('start');
              }
            }}
            className="flex-1 border-none outline-none bg-transparent text-gray-600 dark:text-gray-400 placeholder-gray-300 dark:placeholder-gray-600 min-w-[120px]"
          />
        </div>
      </div>

      {/* Toolbar */}
      {editor && (
        <div className="px-8 py-1 flex items-center gap-0.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex-wrap">
          {/* Text formatting */}
          <ToolbarBtn
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            title="Highlight"
          >
            <Highlighter className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('superscript')}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            title="Superscript"
          >
            <SuperscriptIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('subscript')}
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            title="Subscript"
          >
            <SubscriptIcon className="w-4 h-4" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Headings */}
          <ToolbarBtn
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Lists & blocks */}
          <ToolbarBtn
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="Task list"
          >
            <CheckSquare className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            <Quote className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline code"
          >
            <Code className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code block"
          >
            <Code2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Divider"
          >
            <Minus className="w-4 h-4" />
          </ToolbarBtn>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Link */}
          <ToolbarBtn
            active={editor.isActive('link')}
            onClick={handleLinkClick}
            title={editor.isActive('link') ? 'Remove link' : 'Add link'}
          >
            {editor.isActive('link') ? (
              <Unlink2 className="w-4 h-4" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
          </ToolbarBtn>

          {/* Table */}
          <ToolbarBtn
            active={isInTable}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            title="Insert table"
          >
            <TableIcon className="w-4 h-4" />
          </ToolbarBtn>

          {/* Table operations — visible only when cursor is inside a table */}
          {isInTable && (
            <>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
              <ToolbarBtn
                active={false}
                onClick={() => (editor.chain().focus() as any).addRowAfter().run()}
                title="Add row below"
              >
                <Rows3 className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                active={false}
                onClick={() => (editor.chain().focus() as any).deleteRow().run()}
                title="Delete row"
              >
                <Rows3 className="w-4 h-4 opacity-50" />
              </ToolbarBtn>
              <ToolbarBtn
                active={false}
                onClick={() => (editor.chain().focus() as any).addColumnAfter().run()}
                title="Add column right"
              >
                <Columns3 className="w-4 h-4" />
              </ToolbarBtn>
              <ToolbarBtn
                active={false}
                onClick={() => (editor.chain().focus() as any).deleteColumn().run()}
                title="Delete column"
              >
                <Columns3 className="w-4 h-4 opacity-50" />
              </ToolbarBtn>
              <ToolbarBtn
                active={false}
                onClick={() => (editor.chain().focus() as any).deleteTable().run()}
                title="Delete table"
              >
                <Trash2 className="w-4 h-4" />
              </ToolbarBtn>
            </>
          )}

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* History */}
          <ToolbarBtn
            active={false}
            onClick={() => editor.chain().focus().undo().run()}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={false}
            onClick={() => editor.chain().focus().redo().run()}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </ToolbarBtn>

          <div className="flex-1" />

          {/* Find */}
          <button
            onClick={() => setShowFindReplace((v) => !v)}
            title="Find & Replace (Ctrl+F)"
            className={`p-1.5 rounded transition-colors ${
              showFindReplace
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Attach file */}
          <button
            onClick={handlePickFiles}
            title="Attach file"
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Transcript / Record */}
          <button
            onClick={() => {
              if (!rightPanelOpen) toggleRightPanel();
              setRightPanelTab('transcript');
            }}
            title={
              isRecording
                ? 'Recording in progress — click to open transcript'
                : 'Record meeting transcript'
            }
            className={`p-1.5 rounded transition-colors relative ${
              isRecording
                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Mic className="w-4 h-4" />
            {isRecording && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          {/* Template — only when editor is empty */}
          {editor.isEmpty && (
            <div className="relative">
              <button
                onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
                title="Apply template"
              >
                <ClipboardList className="w-4 h-4" />
              </button>
              {showTemplateMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTemplateMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    {Object.entries(TEMPLATES).map(([key, t]) => (
                      <button
                        key={key}
                        className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300"
                        onClick={() => applyTemplate(key)}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
              title="Export note"
            >
              <Download className="w-4 h-4" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2"
                    onClick={() => {
                      const projectNames = note.projectIds
                        .map((id) => allProjects.find((p) => p.id === id)?.name || '')
                        .filter(Boolean)
                        .join(', ');
                      const supplierName =
                        activeTabId === INTERNAL_TAB_ID ? 'Internal' : supplier?.name || '';
                      const md = exportNoteMarkdown(note, supplierName, projectNames);
                      downloadFile(md, `${note.title || 'note'}.md`);
                      setShowExportMenu(false);
                    }}
                  >
                    <FileDown className="w-3.5 h-3.5" /> Markdown
                  </button>
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2"
                    onClick={() => {
                      const projectNames = note.projectIds
                        .map((id) => allProjects.find((p) => p.id === id)?.name || '')
                        .filter(Boolean)
                        .join(', ');
                      const supplierName =
                        activeTabId === INTERNAL_TAB_ID ? 'Internal' : supplier?.name || '';
                      const email = exportEmailSummary(
                        note,
                        supplierName,
                        projectNames,
                        tasks,
                        decisions,
                      );
                      downloadFile(email, `${note.title || 'note'}-summary.txt`);
                      setShowExportMenu(false);
                    }}
                  >
                    <FileDown className="w-3.5 h-3.5" /> Email summary
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Link input row */}
      {editor && showLinkInput && (
        <div className="px-8 py-1.5 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-900/20 flex-shrink-0">
          <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
                editor.commands.focus();
              }
            }}
            placeholder="https://..."
            className="flex-1 text-sm bg-transparent border-none outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              applyLink();
            }}
            className="text-xs px-2.5 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            Set link
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setShowLinkInput(false);
              setLinkUrl('');
              editor.commands.focus();
            }}
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Find & Replace panel */}
      {editor && showFindReplace && (
        <FindReplacePanel
          editor={editor}
          onClose={() => setShowFindReplace(false)}
          findTerm={findTerm}
          setFindTerm={setFindTerm}
          replaceTerm={replaceTerm}
          setReplaceTerm={setReplaceTerm}
        />
      )}

      {/* Selection actions row */}
      {editor && (
        <div className="px-8 h-8 flex items-center gap-1 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div
            className={selectionText ? 'flex items-center gap-1' : 'invisible flex items-center gap-1'}
          >
            <button
              onClick={createTaskFromSelection}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
              title="Alt+T"
            >
              + Task
            </button>
            <button
              onClick={createDecisionFromSelection}
              className="text-xs px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
              title="Alt+D"
            >
              + Decision
            </button>
            <button
              onClick={createFollowUpFromSelection}
              className="text-xs px-2 py-1 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
              title="Alt+F"
            >
              + Follow-up
            </button>
          </div>
        </div>
      )}

      {/* Attachments strip */}
      {note.attachments && note.attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-8 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <Paperclip className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          {note.attachments.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 dark:bg-white/10 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
            >
              <button
                onClick={() => handleOpenAttachment(att)}
                className="max-w-[220px] truncate text-left hover:underline"
                title={`Open ${att.fileName}`}
              >
                {att.fileName}
              </button>
              <button
                onClick={() => handleRemoveAttachment(att)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5 flex-shrink-0"
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-8 pb-16 relative">
        {/* Bubble menu — floating toolbar on text selection */}
        {editor && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 100, placement: 'top-start' }}
            shouldShow={({ state }) => {
              const { selection } = state;
              if (selection.empty) return false;
              if ((selection as any).node) return false;
              return true;
            }}
          >
            <div className="flex items-center gap-0.5 px-1.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleBold().run();
                }}
                className={`p-1.5 rounded transition-colors text-xs font-bold ${editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Bold"
              >
                B
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleItalic().run();
                }}
                className={`p-1.5 rounded transition-colors text-xs italic ${editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Italic"
              >
                I
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleUnderline().run();
                }}
                className={`p-1.5 rounded transition-colors text-xs underline ${editor.isActive('underline') ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Underline"
              >
                U
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleStrike().run();
                }}
                className={`p-1.5 rounded transition-colors text-xs line-through ${editor.isActive('strike') ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Strikethrough"
              >
                S
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleHighlight().run();
                }}
                className={`p-1.5 rounded transition-colors text-xs font-mono ${editor.isActive('highlight') ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Highlight"
              >
                H
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleCode().run();
                }}
                className={`p-1.5 rounded transition-colors text-xs font-mono ${editor.isActive('code') ? 'bg-gray-200 dark:bg-gray-600 text-pink-600 dark:text-pink-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Code"
              >
                {'<>'}
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleLinkClick();
                }}
                className={`p-1.5 rounded transition-colors ${editor.isActive('link') ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title={editor.isActive('link') ? 'Remove link' : 'Add link'}
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} />
      </div>

      {/* Footer: autosave + word count */}
      <div className="absolute bottom-2 right-2 text-xs text-gray-300 dark:text-gray-600 select-none pointer-events-none flex items-center gap-2">
        {wordCount > 0 && <span>{wordCount} words</span>}
        <span>Auto-saved · {format(new Date(note.updatedAt), 'HH:mm:ss')}</span>
      </div>
    </div>
  );
}
