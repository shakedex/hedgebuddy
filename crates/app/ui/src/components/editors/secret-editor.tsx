import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/toast";

/**
 * A secret's edit state. `changed` false means "keep the stored secret" (spec §4.3's ruling: `set_var` omits
 * the value to keep the current one), so an unopened, untouched secret field never sends anything. `revealed`
 * holds the value fetched by the screen's `reveal()` (a `get_var` call with `reveal: true`) — kept only here,
 * never in the query cache, and cleared again by Hide.
 */
export type SecretState = { changed: boolean; value: string; revealed: string | null };

export const EMPTY_SECRET: SecretState = { changed: false, value: "", revealed: null };

/**
 * Masked until Reveal (spec §7). Typing sets `changed` and the new value; while revealed, typing keeps
 * editing in plain text so what's typed stays visible until Hide masks it again.
 */
export function SecretEditor({ id, state, onChange, reveal, error }: {
  id: string;
  state: SecretState;
  onChange: (state: SecretState) => void;
  /** Fetches the current stored secret (`get_var` with `reveal: true`), supplied by the screen. */
  reveal: () => Promise<string>;
  error?: string | null;
}) {
  const [revealing, setRevealing] = useState(false);
  const revealed = state.revealed !== null;
  const errorId = `${id}-error`;

  const onInput = (text: string) => onChange({ changed: true, value: text, revealed: revealed ? text : null });

  const toggle = async () => {
    if (revealed) {
      onChange({ ...state, revealed: null });
      return;
    }
    setRevealing(true);
    try {
      const value = await reveal();
      onChange({ ...state, revealed: value });
    } catch (e) {
      showError(e);
    } finally {
      setRevealing(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          className="font-mono"
          placeholder="••••••••"
          value={revealed ? (state.revealed ?? "") : state.value}
          onChange={(e) => onInput(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <Button type="button" variant="ghost" size="sm" onClick={toggle} disabled={revealing} aria-busy={revealing}>
          {revealing ? "Revealing…" : revealed ? "Hide" : "Reveal"}
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
