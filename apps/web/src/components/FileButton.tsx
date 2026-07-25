"use client";

import { Paperclip, ImagePlus } from "lucide-react";

export function FileButton({
  label = "Choose file",
  accept,
  onChange,
  icon = "file",
  multiple = false,
}: {
  label?: string;
  accept?: string;
  onChange: (files: FileList | null) => void;
  icon?: "file" | "image";
  multiple?: boolean;
}) {
  const Icon = icon === "image" ? ImagePlus : Paperclip;
  return (
    <label className="btn secondary" style={{ width: "fit-content", cursor: "pointer" }}>
      <Icon size={16} />
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          onChange(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
