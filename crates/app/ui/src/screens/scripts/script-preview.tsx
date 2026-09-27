import { useScriptSource } from "@/api/queries";
import { ErrorPanel } from "@/components/app/error-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Rust's `str::lines`: no trailing empty entry for a final newline. */
function lines(source: string): string[] {
  const out = source.split("\n");
  if (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
}

/** The manifest docstring's line range (opening triple-quote through its closing one), muted a touch further
 *  per the design direction ("no syntax colours beyond muting the manifest docstring lines"). A light
 *  heuristic — this is cosmetic, not a parser — good enough for the shape every script here actually has. */
function docstringRange(ls: string[]): [number, number] | null {
  const start = ls.findIndex((l) => l.trim().startsWith('"""') || l.trim().startsWith("'''"));
  if (start === -1) return null;
  const quote = ls[start].trim().slice(0, 3);
  for (let i = start + 1; i < ls.length; i++) {
    if (ls[i].includes(quote)) return [start, i];
  }
  return null;
}

/**
 * The read-only script preview (design direction, 5B): a well with line numbers in muted tabular mono, the
 * code in mono, no soft wrap (a horizontal scrollbar carries long lines instead), no syntax colour beyond a
 * further-muted manifest docstring.
 */
export function ScriptPreview({ name, profile }: { name: string; profile: string }) {
  const query = useScriptSource(name, profile);

  if (query.isPending) {
    return (
      <div className="well flex flex-col gap-1.5 p-2" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} title="Couldn't load the source" />;
  }
  if (!query.data) return null;

  const ls = lines(query.data.source);
  const docRange = docstringRange(ls);
  const inDocstring = (i: number) => docRange !== null && i >= docRange[0] && i <= docRange[1];

  return (
    <div className="well max-h-[420px] overflow-auto">
      <table className="min-w-full border-collapse">
        <tbody>
          {ls.map((line, i) => (
            <tr key={i} className={cn(inDocstring(i) && "opacity-60")}>
              <td className="readout w-10 shrink-0 py-px pr-3 pl-2 text-right align-top text-xs text-muted-foreground/70 select-none">{i + 1}</td>
              <td className="py-px pr-3 align-top font-mono text-xs whitespace-pre text-foreground">{line.length > 0 ? line : " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
