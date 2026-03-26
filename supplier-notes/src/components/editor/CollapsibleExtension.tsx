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
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div
          contentEditable={false}
          className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer select-none"
          onClick={() => updateAttributes({ open: !open })}
        >
          <ChevronRight
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          <input
            value={title}
            onChange={(e) => {
              e.stopPropagation();
              updateAttributes({ title: e.target.value });
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Section title…"
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-gray-700 dark:text-gray-300 placeholder-gray-400 cursor-text"
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
