import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import type { NoteSection } from '../types';
import { cn } from '@/lib/utils';
import { IconButton } from './common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { deleteNoteSectionWithUndo } from './undoableActions';

const DRAG_TYPE = 'application/x-hivemind-note-tab';

/** Inline field for a tab's name: Enter or leaving the field saves, Escape cancels. */
function TabNameInput({ initialValue, onCommit, onDone }: { initialValue: string; onCommit: (value: string) => void; onDone: () => void }) {
  const [value, setValue] = useState(initialValue);
  const finished = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const text = value.trim();
    if (save && text && text !== initialValue) onCommit(text);
    onDone();
  };
  return (
    <input
      ref={inputRef}
      aria-label="Tab name"
      value={value}
      size={Math.max(6, Math.min(value.length + 1, 40))}
      maxLength={80}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="my-1 h-6 rounded-md border border-input bg-background px-1.5 text-ui text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

type MenuAction = { key: string; label: string; icon: React.ReactNode; disabled?: boolean; destructive?: boolean; run: () => void };

/**
 * The tab bar of a note with tabs: switch, add, rename (double-click), reorder (drag, or the
 * tab menu) and delete (with Undo). Rendered only when the note has two or more tabs.
 */
export function NoteSectionTabs({ noteId, sections, activeId, onSelected }: {
  noteId: string;
  sections: NoteSection[];
  activeId: string;
  /** Called after a tab was chosen with the mouse or keyboard (to move focus to the text). */
  onSelected?: () => void;
}) {
  const setActiveSection = useStore((s) => s.setActiveSection);
  const addNoteSection = useStore((s) => s.addNoteSection);
  const updateNoteSection = useStore((s) => s.updateNoteSection);
  const moveNoteSection = useStore((s) => s.moveNoteSection);
  const renamingId = useStore((s) => s.renamingSectionId);
  const setRenaming = useStore((s) => s.setRenamingSection);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  // "Rename" chosen in a menu starts once the menu has closed: an open menu keeps the focus.
  const pendingRename = useRef<string | null>(null);
  const onMenuCloseAutoFocus = (event: Event) => {
    if (!pendingRename.current) return;
    event.preventDefault();
    setRenaming(pendingRename.current);
    pendingRename.current = null;
  };

  // The bar scrolls sideways (wheel, trackpad, keyboard) without a visible scrollbar; faded
  // edges show that there are more tabs, and a menu lists them all once they don't fit.
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const updateOverflow = () => {
    const list = listRef.current;
    if (!list) return;
    const left = list.scrollLeft > 1;
    const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(list);
    for (const child of Array.from(list.children)) observer.observe(child);
    // A vertical mouse wheel scrolls the bar sideways.
    const onWheel = (event: WheelEvent) => {
      if (list.scrollWidth <= list.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY;
    };
    list.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      list.removeEventListener('wheel', onWheel);
    };
  }, [sections, renamingId]);

  // Keep the tab being shown in view when the bar scrolls.
  useEffect(() => {
    tabRefs.current.get(activeId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const select = (id: string, focusTab = false) => {
    setActiveSection(noteId, id);
    if (focusTab) requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  };

  const actionsFor = (section: NoteSection, index: number): MenuAction[] => [
    { key: 'rename', label: 'Rename', icon: <Pencil />, run: () => { select(section.id); pendingRename.current = section.id; } },
    { key: 'left', label: 'Move left', icon: <ArrowLeft />, disabled: index === 0, run: () => moveNoteSection(noteId, section.id, index - 1) },
    { key: 'right', label: 'Move right', icon: <ArrowRight />, disabled: index === sections.length - 1, run: () => moveNoteSection(noteId, section.id, index + 1) },
    { key: 'delete', label: 'Delete tab', icon: <Trash2 />, destructive: true, run: () => deleteNoteSectionWithUndo(noteId, section.id) },
  ];

  const onTabKeyDown = (event: React.KeyboardEvent, index: number, section: NoteSection) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = sections[(index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length];
      select(next.id, true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      select(sections[event.key === 'Home' ? 0 : sections.length - 1].id, true);
    } else if (event.key === 'F2') {
      event.preventDefault();
      setRenaming(section.id);
    } else if (event.key === 'Enter' && section.id === activeId) {
      event.preventDefault();
      onSelected?.();
    }
  };

  return (
    <div className="-mx-1 flex min-w-0 items-end gap-1 border-b">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Note tabs"
        onScroll={updateOverflow}
        className="flex min-w-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={fadeMask(overflow)}
      >
        {sections.map((section, index) => {
          const active = section.id === activeId;
          const renaming = renamingId === section.id;
          const actions = actionsFor(section, index);
          return (
            <ContextMenu key={section.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'group/tab relative flex shrink-0 items-center rounded-t-md transition-colors',
                    dragOverId === section.id && 'bg-accent/70',
                  )}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverId(section.id);
                  }}
                  onDragLeave={() => setDragOverId((id) => (id === section.id ? null : id))}
                  onDrop={(event) => {
                    const draggedId = event.dataTransfer.getData(DRAG_TYPE);
                    setDragOverId(null);
                    if (!draggedId || draggedId === section.id) return;
                    event.preventDefault();
                    moveNoteSection(noteId, draggedId, index);
                  }}
                >
                  {renaming ? (
                    <TabNameInput
                      initialValue={section.title}
                      onCommit={(title) => updateNoteSection(noteId, section.id, { title })}
                      onDone={() => {
                        setRenaming(null);
                        requestAnimationFrame(() => tabRefs.current.get(section.id)?.focus());
                      }}
                    />
                  ) : (
                    <button
                      ref={(node) => {
                        if (node) tabRefs.current.set(section.id, node);
                        else tabRefs.current.delete(section.id);
                      }}
                      type="button"
                      role="tab"
                      id={`note-tab-${section.id}`}
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      title={section.title.length > 28 ? section.title : 'Double-click to rename · drag to reorder'}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_TYPE, section.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragOverId(null)}
                      onClick={(event) => {
                        if (!active) select(section.id);
                        // The second click of a double-click (rename) keeps the focus here.
                        if (event.detail < 2) onSelected?.();
                      }}
                      onDoubleClick={() => setRenaming(section.id)}
                      onKeyDown={(event) => onTabKeyDown(event, index, section)}
                      className={cn(
                        'relative flex h-8 max-w-56 items-center px-2.5 text-ui whitespace-nowrap outline-none transition-colors',
                        'focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                        'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full',
                        active
                          ? 'font-medium text-foreground after:bg-primary'
                          : 'text-subtle-foreground hover:text-foreground after:bg-transparent',
                      )}
                    >
                      <span className="truncate">{section.title}</span>
                    </button>
                  )}
                  {active && !renaming && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Options for tab ${section.title}`}
                          className="-ml-1.5 flex h-5 w-0 shrink-0 items-center justify-center overflow-hidden rounded text-muted-foreground opacity-0 transition-[width,opacity] group-hover/tab:mr-1 group-hover/tab:w-5 group-hover/tab:opacity-100 hover:bg-accent hover:text-foreground focus-visible:mr-1 focus-visible:w-5 focus-visible:opacity-100 data-[state=open]:mr-1 data-[state=open]:w-5 data-[state=open]:bg-accent data-[state=open]:opacity-100 [&_svg]:size-3.5 [&_svg]:shrink-0"
                        >
                          <ChevronDown />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={onMenuCloseAutoFocus}>
                        {actions.map((action) => (
                          <MenuEntry key={action.key} action={action} kind="dropdown" />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44" onCloseAutoFocus={onMenuCloseAutoFocus}>
                {actions.map((action) => (
                  <MenuEntry key={action.key} action={action} kind="context" />
                ))}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      {(overflow.left || overflow.right) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="All tabs" size="icon-xs" className="mb-1 shrink-0">
              <List />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            {sections.map((section) => (
              <DropdownMenuItem key={section.id} onSelect={() => { select(section.id); onSelected?.(); }}>
                <Check className={cn(section.id !== activeId && 'invisible')} />
                <span className="truncate">{section.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <IconButton
        label="Add tab"
        size="icon-xs"
        className="mb-1 shrink-0"
        onClick={() => addNoteSection(noteId, { afterId: sections[sections.length - 1]?.id })}
      >
        <Plus />
      </IconButton>
    </div>
  );
}

/** Fades the edge(s) of the tab bar that have more tabs beyond them. */
function fadeMask({ left, right }: { left: boolean; right: boolean }): React.CSSProperties | undefined {
  if (!left && !right) return undefined;
  const mask = `linear-gradient(to right, ${left ? 'transparent, #000 1.5rem' : '#000'}, ${right ? '#000 calc(100% - 1.5rem), transparent' : '#000'})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

function MenuEntry({ action, kind }: { action: MenuAction; kind: 'dropdown' | 'context' }) {
  const Item = kind === 'dropdown' ? DropdownMenuItem : ContextMenuItem;
  const Separator = kind === 'dropdown' ? DropdownMenuSeparator : ContextMenuSeparator;
  return (
    <>
      {action.destructive && <Separator />}
      <Item disabled={action.disabled} variant={action.destructive ? 'destructive' : 'default'} onSelect={action.run}>
        {action.icon}
        {action.label}
      </Item>
    </>
  );
}
