import { Command } from "commander";
import { runGridRunner } from "../runner/grid.runner";
import { promptForMissingGridArgs } from "../prompts/grid.prompts";

export const gridCommand = new Command()
  .name("grid")
  .description("Generate grid config migration changesets")
  .option("--app <name>", "Target application (e.g. trade-service)")
  .option("--sprint <name>", "Target sprint (e.g. sprint-42)")
  .option("--author <name>", "Changeset author")
  .option("--grid <name>", "Grid name (e.g. tradeGrid)")
  .option("--action <type>", "Action: new or update", "new")
  .option(
    "--dry-run",
    "Generate files and print to stdout, no PR raised",
    false,
  )
  .option("--no-interactive", "Skip confirmation prompts (CI mode)", false)
  .option("--no-group-changesets", "Do not group changesets", false)
  .option("--no-group-files", "Do not group CSV files", false)
  .action(async (options) => {
    try {
      const prompted = await promptForMissingGridArgs(options);
      const args = {
        app: prompted.app,
        sprint: prompted.sprint,
        author: prompted.author,
        grid: prompted.grid,
        action: prompted.action,
        dryRun: options.dryRun || false,
        interactive: options.interactive !== false,
        groupChangesets: options.groupChangesets !== false,
        groupFiles: options.groupFiles !== false,
      };
      await runGridRunner(args);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
