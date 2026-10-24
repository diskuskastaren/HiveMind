import { ReactRenderer } from '@tiptap/react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type MentionItem = {
  id: string;
  label: string;
  type: 'supplier' | 'project';
  color: string;
};

export type MentionListRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type MentionListProps = {
  items: MentionItem[];
  command: (item: MentionItem) => void;
};

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
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
      <div className="flex max-h-60 w-56 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.id}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui transition-colors ${
              index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/60'
            }`}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="flex-1 truncate">{item.label}</span>
            <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
          </button>
        ))}
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';

export function createMentionSuggestion(getSuggestions: (query: string) => MentionItem[]) {
  return {
    items: ({ query }: { query: string }) => getSuggestions(query),

    render: () => {
      let renderer: ReactRenderer<MentionListRef, MentionListProps> | null = null;
      let container: HTMLDivElement | null = null;

      const destroy = () => {
        renderer?.destroy();
        renderer = null;
        container?.remove();
        container = null;
      };

      return {
        onStart(props: any) {
          container = document.createElement('div');
          container.style.position = 'fixed';
          container.style.zIndex = '9999';
          document.body.appendChild(container);

          renderer = new ReactRenderer(MentionList, {
            props: { items: props.items, command: props.command },
            editor: props.editor,
          });

          container.appendChild(renderer.element);

          const rect = props.clientRect?.();
          if (rect && container) {
            container.style.top = `${rect.bottom + 4}px`;
            container.style.left = `${rect.left}px`;
          }
        },

        onUpdate(props: any) {
          if (!renderer || !container) return;
          renderer.updateProps({ items: props.items, command: props.command });
          const rect = props.clientRect?.();
          if (rect) {
            container.style.top = `${rect.bottom + 4}px`;
            container.style.left = `${rect.left}px`;
          }
        },

        onKeyDown(props: any) {
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
  };
}
