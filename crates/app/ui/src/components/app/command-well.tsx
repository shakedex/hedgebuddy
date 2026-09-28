import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/toast";

/** How long the Copy button reads "Copied" before reverting (Design direction 5C: "Command wells"). */
const COPIED_MS = 1500;

/**
 * Inserts a break opportunity after each space and path separator, so a long command wraps at its natural
 * joints instead of splitting mid-word (Design direction 5C: "wraps at spaces and separators… never
 * mid-word"). Unlike `wrapPath` (`change-preview-dialog.tsx`), which only breaks at path separators, a
 * command well's text is also space-separated arguments (`claude mcp add hedgebuddy -- "…" mcp`).
 */
function wrapCommand(text: string): React.ReactNode {
  const parts = text.split(/(?<=[\\/\s])/);
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    nodes.push(part);
    if (i < parts.length - 1) nodes.push(<wbr key={i} />);
  });
  return nodes;
}

/**
 * A copyable command in a `bg-well` box (spec §6.6, §7; Design direction 5C: "Command wells"): mono, wraps at
 * its natural joints (never mid-word), with a right-aligned Copy button. After copying, the button reads
 * "Copied" for 1.5 s and a toast confirms it; a clipboard failure toasts the error instead of the button ever
 * silently doing nothing.
 */
export function CommandWell({ label = "Copy", text, copyText }: {
  /** The Copy button's own word before/after copying — "Copy" by default, "Copy JSON" for the JSON config well. */
  label?: string;
  /** The command shown, wrapped at spaces and separators. */
  text: string;
  /** What actually lands on the clipboard, if it should differ from the displayed `text`. Defaults to `text`. */
  copyText?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText ?? text);
      toast("Copied");
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // The raw DOMException text ("Write permission denied", say) means nothing to the operator; tell them
      // what to do instead of repeating the browser's own words.
      showError(new Error("Couldn't copy. Select the text and copy it yourself."));
    }
  };

  return (
    <div className="well flex items-start gap-2 p-2">
      <code className="min-w-0 flex-1 overflow-x-auto py-0.5 font-mono text-xs whitespace-pre-wrap text-foreground-strong select-text">
        {wrapCommand(text)}
      </code>
      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void handleCopy()}>
        <Copy aria-hidden strokeWidth={1.75} />
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}
