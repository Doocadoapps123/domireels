"use client";
import { useState } from "react";
import { IconCheck, IconCopy } from "./Icons";

export default function CopyButton({ text, label = "Copy", className = "btn btn-ghost btn-sm" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <IconCheck size={18} /> : <IconCopy size={18} />} {done ? "Copied" : label}
    </button>
  );
}
