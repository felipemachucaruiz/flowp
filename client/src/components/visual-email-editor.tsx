import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Color from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Palette,
  Highlighter,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Code,
  Quote,
} from "lucide-react";

interface VisualEmailEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const PRESET_COLORS = [
  "#000000", "#374151", "#6B7280", "#9CA3AF",
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#22C55E", "#10B981", "#14B8A6", "#06B6D4",
  "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
  "#FFFFFF", "#F3F4F6", "#E5E7EB", "#D1D5DB",
];

const HIGHLIGHT_COLORS = [
  "#FEF08A", "#FDE68A", "#FED7AA", "#FECACA",
  "#BBF7D0", "#A7F3D0", "#99F6E4", "#A5F3FC",
  "#BAE6FD", "#BFDBFE", "#C7D2FE", "#DDD6FE",
  "#E9D5FF", "#F5D0FE", "#FBCFE8", "#FECDD3",
];

function ColorPicker({ 
  colors, 
  onSelect, 
  currentColor,
  title 
}: { 
  colors: string[]; 
  onSelect: (color: string) => void;
  currentColor?: string;
  title: string;
}) {
  const [customColor, setCustomColor] = useState("#6E51CD");

  return (
    <div className="p-3 w-64">
      <Label className="text-xs font-medium mb-2 block">{title}</Label>
      <div className="grid grid-cols-8 gap-1 mb-3">
        {colors.map((color) => (
          <button
            key={color}
            className={`w-6 h-6 rounded border-2 transition-all ${
              currentColor === color ? "border-primary scale-110" : "border-transparent hover:border-gray-300"
            }`}
            style={{ backgroundColor: color }}
            onClick={() => onSelect(color)}
            data-testid={`color-${color}`}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type="color"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="w-10 h-8 p-0 border-0 cursor-pointer"
        />
        <Input
          type="text"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="flex-1 h-8 text-xs font-mono"
          placeholder="#000000"
        />
        <Button size="sm" variant="outline" onClick={() => onSelect(customColor)}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function ToolbarButton({ 
  icon: Icon, 
  label, 
  isActive, 
  onClick,
  disabled 
}: { 
  icon: any; 
  label: string; 
  isActive?: boolean; 
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={isActive}
          onPressedChange={onClick}
          disabled={disabled}
          className="h-8 w-8 p-0"
          data-testid={`toolbar-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Icon className="h-4 w-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function VisualEmailEditor({ content, onChange }: VisualEmailEditorProps) {
  const { t } = useI18n();
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextStyle,
      Color,
      Underline,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          style: "color: #6E51CD; text-decoration: underline;",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          style: "max-width: 100%; height: auto; border-radius: 8px;",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: content || "<p>Start designing your email template...</p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4",
      },
    },
  });

  const setLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    
    if (linkUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl })
      .run();
    
    setLinkUrl("");
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imageUrl) return;
    editor.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl("");
  }, [editor, imageUrl]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="border-b bg-muted/50 p-2 flex flex-wrap gap-1 items-center">
        <ToolbarButton
          icon={Undo}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton
          icon={Redo}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Toggle size="sm" className="h-8 px-2 gap-1" data-testid="toolbar-heading">
              <Type className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              >
                <Heading1 className="h-4 w-4 mr-2" />
                Heading 1
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <Heading2 className="h-4 w-4 mr-2" />
                Heading 2
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <Heading3 className="h-4 w-4 mr-2" />
                Heading 3
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => editor.chain().focus().setParagraph().run()}
              >
                <Type className="h-4 w-4 mr-2" />
                Paragraph
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={Bold}
          label="Bold"
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Italic"
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          label="Underline"
          isActive={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="Strikethrough"
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Toggle size="sm" className="h-8 w-8 p-0" data-testid="toolbar-text-color">
              <Palette className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <ColorPicker
              colors={PRESET_COLORS}
              title="Text Color"
              onSelect={(color) => editor.chain().focus().setColor(color).run()}
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Toggle 
              size="sm" 
              className="h-8 w-8 p-0"
              pressed={editor.isActive("highlight")}
              data-testid="toolbar-highlight"
            >
              <Highlighter className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <ColorPicker
              colors={HIGHLIGHT_COLORS}
              title="Highlight Color"
              onSelect={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
            />
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={AlignLeft}
          label="Align Left"
          isActive={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarButton
          icon={AlignCenter}
          label="Align Center"
          isActive={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarButton
          icon={AlignRight}
          label="Align Right"
          isActive={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={List}
          label="Bullet List"
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Numbered List"
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          icon={Quote}
          label="Quote"
          isActive={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={Code}
          label="Code"
          isActive={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Toggle 
              size="sm" 
              className="h-8 w-8 p-0"
              pressed={editor.isActive("link")}
              data-testid="toolbar-link"
            >
              <LinkIcon className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <Label className="text-xs font-medium">Insert Link</Label>
              <Input
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="h-8"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={setLink} className="flex-1">
                  Insert Link
                </Button>
                {editor.isActive("link") && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => editor.chain().focus().unsetLink().run()}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Toggle size="sm" className="h-8 w-8 p-0" data-testid="toolbar-image">
              <ImageIcon className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <Label className="text-xs font-medium">Insert Image</Label>
              <Input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="h-8"
              />
              <Button size="sm" onClick={addImage} className="w-full">
                Insert Image
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="bg-white dark:bg-gray-900">
        <EditorContent 
          editor={editor} 
          className="[&_.ProseMirror]:min-h-[300px] [&_.ProseMirror]:p-4 [&_.ProseMirror]:focus:outline-none [&_.ProseMirror_p]:my-2 [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-4 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:my-3 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-6 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-sm"
        />
      </div>
    </div>
  );
}
