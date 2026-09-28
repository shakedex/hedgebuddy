import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * A secret's edit state: one value on screen is the value Save writes. `changed` false means "keep the
 * stored secret" (spec §4.3's ruling: `set_var` omits the value to keep the current one) — so an unopened,
 * untouched secret field never sends anything, and clearing the field after typing reverts to this state
 * rather than saving an empty secret by accident. `revealed` holds a value fetched by the screen's
 * `reveal()`, or the typed `value` once revealed while already `changed` (never a fresh fetch either way)
 * — kept only here, never in the query cache, and cleared again by Hide.
 */
export type SecretState = { changed: boolean; value: string; revealed: string | null };

export const EMPTY_SECRET: SecretState = { changed: false, value: "", revealed: null };

/**
 * Masked until Reveal (spec §7). Reveal fetches the stored value only while unchanged; once the operator has
 * typed a replacement, Reveal just un-masks what they typed (there's nothing stored left to look at). A
 * fetch in flight loses to anything typed in the meantime — the typed value always wins.
 */
export function SecretEditor({ id, state, onChange, reveal, error, canRevealStored = true }: {
  id: string;
  state: SecretState;
  onChange: (state: SecretState) => void;
  /** Fetches the current stored secret (`get_var` with `reveal: true`), supplied by the screen. */
  reveal: () => Promise<string>;
  error?: string | null;
  /** Whether there is a stored value worth fetching once (i.e. before anything is typed). False for a brand
   *  new secret, or one just retyped from another type: with nothing stored, Reveal would otherwise hit the
   *  server for a value that was never there. Once the operator types, Reveal always shows that instead — no
   *  fetch needed — so the button reappears regardless of this flag. */
  canRevealStored?: boolean;
}) {
  const [revealing, setRevealing] = useState(false);
  const revealed = state.revealed !== null;
  const showToggle = revealed || state.changed || canRevealStored;
  const errorId = `${id}-error`;

  // toggle() awaits reveal() before applying its result; if the operator typed in the meantime, `state` (a
  // prop) has moved on, but toggle's own closure hasn't. This ref always has the latest state to check
  // against, so a fetch that's no longer wanted doesn't clobber what's now on screen.
  const stateRef = useRef(state);
  stateRef.current = state;
  // A second, synchronous guard against a rapid double-click firing two overlapping fetches: `revealing`
  // (state) only updates on the next render, so two clicks in the same tick would both see it as false.
  const revealingRef = useRef(false);

  const onInput = (text: string) => {
    if (text === "") {
      // Cleared back to nothing: go back to "keep the stored secret", not "save an empty one".
      onChange(EMPTY_SECRET);
      return;
    }
    onChange({ ...state, changed: true, value: text });
  };

  const toggle = async () => {
    if (revealingRef.current) return;
    if (revealed) {
      onChange({ ...state, revealed: null });
      return;
    }
    if (state.changed) {
      // Nothing stored is worth fetching — show what's about to be saved instead.
      onChange({ ...state, revealed: state.value });
      return;
    }
    revealingRef.current = true;
    setRevealing(true);
    try {
      const fetched = await reveal();
      if (stateRef.current.changed) return; // typed while the fetch was in flight — that wins
      onChange({ ...stateRef.current, revealed: fetched });
    } catch (e) {
      showError(e);
    } finally {
      revealingRef.current = false;
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
          // A masked placeholder implies something is actually stored to reveal; with nothing stored (brand
          // new, just retyped from another type, or a secret the store itself reports missing), there's
          // nothing behind the dots, so this stays blank instead of implying otherwise.
          placeholder={canRevealStored ? "••••••••" : undefined}
          spellCheck={false}
          autoComplete="new-password"
          // `changed` wins regardless of `revealed`: once the operator has typed, that's the value on
          // screen (masked or not, depending on `revealed`) — `state.revealed`'s fetched text is only
          // shown while nothing's been typed yet.
          value={state.changed ? state.value : (state.revealed ?? "")}
          onChange={(e) => onInput(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        {/* Always rendered, reserving its width, rather than mounted only once `showToggle` is true — that
            would shrink the input by the button's own width right as the operator's first keystroke makes
            it appear. `invisible` keeps the space without the button being seen, clicked or announced. */}
        <Button
          type="button" variant="ghost" size="sm"
          className={cn("min-w-[88px] justify-center aria-disabled:pointer-events-none aria-disabled:opacity-45", !showToggle && "invisible")}
          onClick={toggle} aria-disabled={revealing || !showToggle} aria-busy={revealing}
          aria-hidden={!showToggle} tabIndex={showToggle ? undefined : -1}
        >
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
