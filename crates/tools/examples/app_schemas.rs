//! Prints every app-only command's input and output JSON Schema as
//! `{command: {input, output}}`, for `crates/app/ui/scripts/gen-tools.ts`.

fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&hedgebuddy_tools::app::schemas()).expect("schemas serialize")
    );
}
