import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
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
  Heading2,
  Quote,
  Code,
  Minus,
  ClipboardList,
  Download,
  FileDown,
  Undo2,
  Redo2,
  Plus,
  X,
  Mic,
  Paperclip,
} from 'lucide-react';
import type { Attachment } from '../types';
import { exportNoteMarkdown, exportEmailSummary, downloadFile } from '../utils/export';

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
                  // Fallback for browser dev mode: use base64
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
        if (editor.can().sinkListItem('listItem')) {
          return editor.commands.sinkListItem('listItem');
        }
        if (editor.can().sinkListItem('taskItem')) {
          return editor.commands.sinkListItem('taskItem');
        }
        return editor.commands.insertContent(TAB_CHAR);
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.can().liftListItem('listItem')) {
          return editor.commands.liftListItem('listItem');
        }
        if (editor.can().liftListItem('taskItem')) {
          return editor.commands.liftListItem('taskItem');
        }
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

  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);

  const switchingRef = useRef(false);
  const noteIdRef = useRef(activeNoteId);
  const titleRef = useRef<HTMLInputElement>(null);
  const [selectionText, setSelectionText] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  useEffect(() => {
    noteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: 'Start typing your meeting notes…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Underline,
      IndentHandler,
      Image.configure({ inline: false, allowBase64: true }),
      ImagePaste,
    ],
    content: note?.content || '',
    onUpdate: ({ editor }) => {
      if (!switchingRef.current && noteIdRef.current) {
        updateNote(noteIdRef.current, { content: editor.getHTML() });
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        setSelectionText(editor.state.doc.textBetween(from, to, ' '));
      } else {
        setSelectionText('');
      }
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
        addDecision({ projectId: activeProjectId, supplierId, noteId: activeNoteId, text: selectionText.trim() });
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
    addDecision({ projectId: activeProjectId, supplierId, noteId: activeNoteId, text: selectionText.trim() });
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
                      onClick={() => updateNote(note.id, { projectIds: note.projectIds.filter((id) => id !== pid) })}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              );
            })}
            <div className="relative">
              <button
                onClick={() => { setShowProjectPicker(!showProjectPicker); setShowSupplierPicker(false); }}
                className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                title="Link note to another project"
              >
                <Plus className="w-3 h-3" />
              </button>
              {showProjectPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProjectPicker(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    <p className="px-3 pt-1 pb-0.5 text-xs text-gray-400 dark:text-gray-500 font-medium">Link to project</p>
                    {allProjects.filter((p) => !p.archived).map((p) => {
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
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
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

          {/* Supplier badges (shown when note is linked to multiple suppliers) */}
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
                      onClick={() => updateNote(note.id, { supplierIds: note.supplierIds.filter((id) => id !== sid) })}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Link to more suppliers button */}
          <div className="relative">
            <button
              onClick={() => { setShowSupplierPicker(!showSupplierPicker); setShowProjectPicker(false); }}
              className="text-xs text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
              title="Link note to another supplier"
            >
              + supplier
            </button>
            {showSupplierPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSupplierPicker(false)} />
                <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px] max-h-[220px] overflow-y-auto">
                  <p className="px-3 pt-1 pb-0.5 text-xs text-gray-400 dark:text-gray-500 font-medium">Link to supplier</p>
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
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
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
          <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
            <Bold className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
            <Italic className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
            <Highlighter className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">
            <Heading2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
            <List className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
            <ListOrdered className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">
            <CheckSquare className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
            <Quote className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Code">
            <Code className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
            <Minus className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </ToolbarBtn>

          <div className="flex-1" />

          {/* Attach email file */}
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
            title={isRecording ? 'Recording in progress — click to open transcript' : 'Record meeting transcript'}
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

          {/* Template — only show when the note is empty */}
          {editor?.isEmpty && <div className="relative">
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
          </div>}

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
                      const projectNames = note.projectIds.map((id) => allProjects.find((p) => p.id === id)?.name || '').filter(Boolean).join(', ');
                      const supplierName = activeTabId === INTERNAL_TAB_ID ? 'Internal' : (supplier?.name || '');
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
                      const projectNames = note.projectIds.map((id) => allProjects.find((p) => p.id === id)?.name || '').filter(Boolean).join(', ');
                      const supplierName = activeTabId === INTERNAL_TAB_ID ? 'Internal' : (supplier?.name || '');
                      const email = exportEmailSummary(note, supplierName, projectNames, tasks, decisions);
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

      {/* Selection actions row — always rendered to prevent layout shift */}
      {editor && (
        <div className="px-8 h-8 flex items-center gap-1 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className={selectionText ? 'flex items-center gap-1' : 'invisible flex items-center gap-1'}>
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

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 pb-16">
        <EditorContent editor={editor} />
      </div>

      {/* Autosave indicator */}
      <div className="absolute bottom-2 right-2 text-xs text-gray-300 dark:text-gray-600 select-none pointer-events-none">
        Auto-saved · {format(new Date(note.updatedAt), 'HH:mm:ss')}
      </div>
    </div>
  );
}
