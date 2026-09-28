import { useClaudeDesktopStatus } from "@/api/queries";
import { wrapPath } from "@/components/app/change-preview-dialog";
import { CommandWell } from "@/components/app/command-well";
import { Readout } from "@/components/app/readout";
import { Skeleton } from "@/components/ui/skeleton";

function PanelSkeleton() {
  return (
    <section className="surface flex flex-col gap-3 p-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-28 rounded-sm" />
      <Skeleton className="h-8 w-full rounded-md" />
    </section>
  );
}

/**
 * The Claude Code and Other MCP clients panels (spec §6.6): the command to add HedgeBuddy from Claude Code,
 * and the same server described as stdio for any other MCP-speaking client, plus a JSON config to paste. Both
 * read from `claude_desktop_status` — its `binary`, `claude_code_command` and `client_json` already account
 * for a build with no bundled command.
 */
export function ClientsPanel() {
  const query = useClaudeDesktopStatus();

  if (query.isPending) {
    return (
      <>
        <PanelSkeleton />
        <PanelSkeleton />
      </>
    );
  }
  // The shared `claude_desktop_status` failure is shown once, by `ConnectScreen` — these panels simply
  // don't render while that's the case (review round 2, minor: "one ErrorPanel per failed query").
  if (query.isError && !query.isSuccess) return null;

  const data = query.data;
  if (!data) return null;
  const noBinary = data.binary === null;

  return (
    <>
      <section className="surface @container flex flex-col gap-3 p-3">
        <h2 className="micro-label">Claude Code</h2>
        <CommandWell text={data.claude_code_command} />
      </section>

      <section className="surface @container flex flex-col gap-3 p-3">
        <h2 className="micro-label">Other MCP clients</h2>
        <div className="flex flex-col gap-1.5">
          <Readout label="COMMAND">
            {data.binary ? (
              <>
                {wrapPath(data.binary)} mcp
              </>
            ) : (
              "hedgebuddy mcp"
            )}
          </Readout>
          <Readout label="TRANSPORT">stdio</Readout>
        </div>
        <CommandWell label="Copy JSON" text={data.client_json} />
        {noBinary && (
          <p className="text-xs text-muted-foreground">Uses hedgebuddy from PATH. Install the app build that bundles it, or add it to PATH.</p>
        )}
      </section>
    </>
  );
}
