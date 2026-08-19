"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  ListChecks,
  Link2,
  Undo2,
  Redo2,
} from "lucide-react";
import clsx from "clsx";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function notesToHtml(notes: string) {
  const t = notes.trim();
  if (!t) return "";
  if (t.startsWith("<")) return t;
  return t
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function isEmptyNotesHtml(html: string) {
  return html
    .replace(/<p><\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim()
    .length === 0;
}

export function NotesEditor({
  value,
  onChange,
  placeholder = "Notes — lists, checklists, and links",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: notesToHtml(value),
    editorProps: {
      attributes: {
        class: "notes-editor-content",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(isEmptyNotesHtml(html) ? "" : html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = notesToHtml(value);
    const current = isEmptyNotesHtml(editor.getHTML()) ? "" : editor.getHTML();
    const incoming = isEmptyNotesHtml(next) ? "" : next;
    if (current === incoming) return;
    editor.commands.setContent(next || "", { emitUpdate: false });
  }, [value, editor]);

  function setLink() {
    if (!editor) return;
    const prev = String(editor.getAttributes("link").href ?? "");
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  if (!editor) {
    return <div className="notes-editor skel" style={{ minHeight: "8rem" }} />;
  }

  return (
    <div className="notes-editor">
      <div className="notes-editor-toolbar" role="toolbar" aria-label="Notes formatting">
        <ToolbarBtn
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </ToolbarBtn>
        <span className="notes-editor-sep" />
        <ToolbarBtn
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          label="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={15} />
        </ToolbarBtn>
        <span className="notes-editor-sep" />
        <ToolbarBtn label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={15} />
        </ToolbarBtn>
        <ToolbarBtn label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={15} />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx("notes-editor-btn", active && "is-active")}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
