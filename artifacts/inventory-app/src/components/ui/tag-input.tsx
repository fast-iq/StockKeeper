import { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  defaultValue?: string | null;
  name: string;
  placeholder?: string;
  className?: string;
}

export function TagInput({
  defaultValue,
  name,
  placeholder,
  className,
}: TagInputProps) {
  const [tags, setTags] = useState<string[]>(
    defaultValue
      ? defaultValue
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  );
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setInput("");
  };

  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 min-h-10 p-2 rounded-md border border-input bg-background cursor-text transition-colors focus-within:border-ring",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <input type="hidden" name={name} value={tags.join(",")} />
      {tags.map((tag, i) => (
        <span
          key={i}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium border border-primary/25"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            className="hover:text-destructive transition-colors ml-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input.trim() && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-24 bg-transparent outline-none text-sm placeholder:text-muted-foreground py-0.5"
      />
    </div>
  );
}
