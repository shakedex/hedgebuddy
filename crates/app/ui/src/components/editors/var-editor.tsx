import type { VarType } from "@/api/tools.gen";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { EditValue } from "@/lib/var-values";
import { cn } from "@/lib/utils";
import { ListEditor } from "./list-editor";
import { PathEditor } from "./path-editor";
import { SecretEditor, type SecretState } from "./secret-editor";

/**
 * One field per variable type (spec §7). Delegates path, path[]/string[] and secret to their own editors;
 * everything else is a plain `Input` (int/float right-aligned tabular mono) or a `Switch`. The reason a value
 * cannot be saved sits under the field via `validateValue`, wired here through `aria-describedby`.
 */
export function VarEditor({ id, type, value, onChange, error, secret, onSecretChange, reveal }: {
  id: string;
  type: VarType;
  value: EditValue;
  onChange: (value: EditValue) => void;
  error: string | null;
  /** Only for `type === "secret"`: its own edit state, setter and the screen's `reveal()` (Step 2). */
  secret?: SecretState;
  onSecretChange?: (state: SecretState) => void;
  reveal?: () => Promise<string>;
}) {
  const errorId = `${id}-error`;

  if (type === "secret") {
    if (!secret || !onSecretChange || !reveal) return null;
    return <SecretEditor id={id} state={secret} onChange={onSecretChange} reveal={reveal} error={error} />;
  }

  if (type === "path") {
    return <PathEditor id={id} value={value as string} onChange={onChange} error={error} />;
  }

  if (type === "string[]" || type === "path[]") {
    return <ListEditor id={id} type={type} items={value as string[]} onChange={onChange} error={error} />;
  }

  if (type === "bool") {
    const checked = value === true;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Switch id={id} checked={checked} onCheckedChange={onChange} />
          <span className="text-sm text-foreground">{checked ? "On" : "Off"}</span>
        </div>
        {error && (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  const numeric = type === "int" || type === "float";
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id={id}
        className={cn(type === "url" && "font-mono", numeric && "readout font-mono text-right")}
        inputMode={type === "int" ? "numeric" : type === "float" ? "decimal" : undefined}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
