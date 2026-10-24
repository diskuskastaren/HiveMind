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
      icon: <Heading1 className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: <Heading2 className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: <Heading3 className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    },
    {
      title: 'Bullet List',
      description: 'Unordered list',
      icon: <List className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Numbered List',
      description: 'Ordered list',
      icon: <ListOrdered className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Task List',
      description: 'Checklist with checkboxes',
      icon: <CheckSquare className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: 'Code Block',
      description: 'Code with monospace font',
      icon: <Code2 className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: 'Quote',
      description: 'Block quotation',
      icon: <Quote className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: 'Table',
      description: 'Insert a 3×3 table',
      icon: <Table className="size-4" />,
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
      icon: <Minus className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: 'Collapsible',
      description: 'Expandable section',
      icon: <ChevronRight className="size-4" />,
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
      <div className="flex max-h-80 w-64 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.title}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
              index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/60'
            }`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-subtle-foreground">
              {item.icon}
            </span>
            <div>
              <div className="text-ui font-medium">
                {item.title}
              </div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
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
