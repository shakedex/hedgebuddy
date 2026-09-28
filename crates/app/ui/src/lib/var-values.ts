//! Editor-side values and validation for the nine variable types (main spec §5). Mirrors core's rules
//! (crates/core/src/variable.rs) so a value the editor accepts is a value `set_var` accepts too.

import type { VarType } from "@/api/tools.gen";

/** The nine types, in the order the spec lists them. */
export const VAR_TYPES: VarType[] = ["string", "secret", "int", "float", "bool", "path", "url", "string[]", "path[]"];

/** What an editor holds: numbers are edited as text so a half-typed "1." is not lost. */
export type EditValue = string | boolean | string[];

export function emptyEdit(type: VarType): EditValue {
  if (type === "bool") return false;
  if (type === "string[]" || type === "path[]") return [];
  return "";
}

export function toEdit(type: VarType, value: unknown): EditValue {
  if (value === null || value === undefined) return emptyEdit(type);
  if (type === "bool") return value === true;
  if (type === "string[]" || type === "path[]") return Array.isArray(value) ? value.map(String) : [];
  return String(value);
}

export function fromEdit(type: VarType, edit: EditValue): unknown {
  if (type === "int") return Number.parseInt(String(edit).trim(), 10);
  if (type === "float") return Number(String(edit).trim());
  // path and url are validated trimmed (validateValue below); save what was validated, not the raw text,
  // so " https://x.com" (which passes here) doesn't reach core as a value it rejects.
  if (type === "path" || type === "url") return (edit as string).trim();
  if (type === "path[]") return (edit as string[]).map((p) => p.trim());
  return edit;
}

/** Why a value cannot be saved, or null. Same rules as core. */
export function validateValue(type: VarType, edit: EditValue): string | null {
  const text = typeof edit === "string" ? edit.trim() : "";
  switch (type) {
    case "int":
      return /^-?\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? null : "Enter a whole number.";
    case "float":
      return text !== "" && Number.isFinite(Number(text)) ? null : "Enter a number.";
    case "path":
      return text !== "" ? null : "Enter a folder or file path.";
    case "url":
      return /^https?:\/\//.test(text) ? null : "Start the address with http:// or https://.";
    case "path[]":
      return (edit as string[]).every((p) => p.trim() !== "") ? null : "Fill in or remove the empty folder.";
    default:
      return null;
  }
}

/** Main spec §5: variable names are ^[A-Z][A-Z0-9_]*$. */
export function validateName(name: string): string | null {
  return /^[A-Z][A-Z0-9_]*$/.test(name) ? null : "Use capital letters, digits and underscores, starting with a letter.";
}

/** The short text a list row shows for a value. */
export function summarize(type: VarType, value: unknown): string {
  if (type === "secret") return value === null || value === undefined ? "not set" : "••••••••";
  if (value === null || value === undefined) return "not set";
  if (type === "bool") return value ? "on" : "off";
  if (type === "path[]") return `${(value as unknown[]).length} ${(value as unknown[]).length === 1 ? "folder" : "folders"}`;
  if (type === "string[]") return (value as unknown[]).join(", ");
  return String(value);
}
