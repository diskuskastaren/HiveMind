import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ChevronRight } from 'lucide-react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      setCollapsible: () => ReturnType;
    };
  }
}

function CollapsibleView({ node, updateAttributes }: any) {
  const { title, open } = node.attrs as { title: string; open: boolean };
  return (
    <NodeViewWrapper className="my-2">
      <div className="overflow-hidden rounded-lg border">
        <div
          contentEditable={false}
          className="flex cursor-pointer items-center gap-2 bg-muted/60 px-3 py-2 select-none"
          onClick={() => updateAttributes({ open: !open })}
        >
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          <input
            value={title}
            onChange={(e) => {
              e.stopPropagation();
              updateAttributes({ title: e.target.value });
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Section title…"
            className="flex-1 cursor-text border-none bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          />
        </div>
        {open && (
          <div className="px-3 py-2">
            <NodeViewContent />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const CollapsibleExtension = Node.create({
  name: 'collapsible',
  group: 'block',
  content: 'block+',
  defining: true,

  attrs: {
    title: { default: 'Section' },
    open: { default: true },
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleView);
  },

  parseHTML() {
    return [{ tag: 'div[data-type="collapsible"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'collapsible',
        'data-title': node.attrs.title,
        'data-open': node.attrs.open ? 'true' : 'false',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCollapsible:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { title: 'Section', open: true },
            content: [{ type: 'paragraph' }],
          }),
    };
  },
});
