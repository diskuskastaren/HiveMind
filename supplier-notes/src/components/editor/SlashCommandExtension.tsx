import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code2,
  Quote,
  Table,
  Minus,
  ChevronRight,
} from 'lucide-react';

type CommandItem = {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: any; range: any }) => void;
};

function getItems({ query }: { query: string }): CommandItem[] {
  const items: CommandItem[] = [
    {
      title: 'Heading 1',
      description: 'Large section heading',
      icon: <Heading1 className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: <Heading2 className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: <Heading3 className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    },
    {
      title: 'Bullet List',
      description: 'Unordered list',
      icon: <List className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Numbered List',
      description: 'Ordered list',
      icon: <ListOrdered className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Task List',
      description: 'Checklist with checkboxes',
      icon: <CheckSquare className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: 'Code Block',
      description: 'Code with monospace font',
      icon: <Code2 className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: 'Quote',
      description: 'Block quotation',
      icon: <Quote className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: 'Table',
      description: 'Insert a 3×3 table',
      icon: <Table className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      title: 'Divider',
      description: 'Horizontal separator',
      icon: <Minus className="w-4 h-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: 'Collapsible',
      description: 'Expandable section',
      icon: <ChevronRight className="w-4 h-4" />,
      command: ({ editor, range }) =>
        (editor.chain().focus().deleteRange(range) as any).setCollapsible().run(),
    },
  ];

  return items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  );
}

export type SlashCommandListRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type SlashCommandListProps = {
  items: CommandItem[];
  command: (item: CommandItem) => void;
};

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 w-64 overflow-y-auto max-h-80">
        {items.map((item, index) => (
          <button
            key={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
              index === selectedIndex
                ? 'bg-gray-100 dark:bg-gray-700'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {item.icon}
            </span>
            <div>
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {item.title}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    );
  },
);

SlashCommandList.displayName = 'SlashCommandList';

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: true,

        items: getItems,

        command: ({ editor, range, props }) => {
          (props as CommandItem).command({ editor, range });
        },

        render: () => {
          let renderer: ReactRenderer<SlashCommandListRef, SlashCommandListProps> | null = null;
          let container: HTMLDivElement | null = null;

          const destroy = () => {
            renderer?.destroy();
            renderer = null;
            container?.remove();
            container = null;
          };

          return {
            onStart(props) {
              container = document.createElement('div');
              container.style.position = 'fixed';
              container.style.zIndex = '9999';
              document.body.appendChild(container);

              renderer = new ReactRenderer(SlashCommandList, {
                props: { items: props.items as CommandItem[], command: props.command },
                editor: props.editor,
              });

              container.appendChild(renderer.element);

              const rect = props.clientRect?.();
              if (rect && container) {
                container.style.top = `${rect.bottom + 4}px`;
                container.style.left = `${rect.left}px`;
              }
            },

            onUpdate(props) {
              if (!renderer || !container) return;
              renderer.updateProps({ items: props.items as CommandItem[], command: props.command });
              const rect = props.clientRect?.();
              if (rect) {
                container.style.top = `${rect.bottom + 4}px`;
                container.style.left = `${rect.left}px`;
              }
            },

            onKeyDown(props) {
              if (!renderer) return false;
              if (props.event.key === 'Escape') {
                destroy();
                return true;
              }
              return renderer.ref?.onKeyDown(props.event) ?? false;
            },

            onExit() {
              destroy();
            },
          };
        },
      }),
    ];
  },
});
