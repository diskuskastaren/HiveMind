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
        {/* Kept in the document when collapsed (hidden), so the editor's content stays intact. */}
        <div className={open ? 'px-3 py-2' : 'hidden'}>
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const CollapsibleExtension = Node.create({
  name: 'collapsible',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      title: {
        default: 'Section',
        parseHTML: (element) => element.getAttribute('data-title') ?? 'Section',
        renderHTML: (attributes) => ({ 'data-title': attributes.title }),
      },
      open: {
        default: true,
        // Before these attributes were registered, every section was saved without a title and as
        // closed, so its content could not be seen. Open those, keep the others as saved.
        parseHTML: (element) => element.getAttribute('data-open') !== 'false' || !element.hasAttribute('data-title'),
        renderHTML: (attributes) => ({ 'data-open': attributes.open ? 'true' : 'false' }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleView);
  },

  parseHTML() {
    return [{ tag: 'div[data-type="collapsible"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'collapsible' }, HTMLAttributes), 0];
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
