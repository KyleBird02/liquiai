import { Command } from "commander";
import { runSchemaRunner } from "../runner/schema.runner";
import { promptForMissingSchemaArgs } from "../prompts/schema.prompts";

export const schemaCommand = new Command()
  .name("schema")
  .description("Generate schema migration changesets")
  .option("--app <name>", "Target application (e.g. trade-service)")
  .option("--sprint <name>", "Target sprint (e.g. sprint-42)")
  .option("--author <name>", "Changeset author")
  .option(
    "--change <description>",
    "Natural language description of schema change",
  )
  .option(
    "--dry-run",
    "Generate files and print to stdout, no PR raised",
    false,
  )
  .option("--no-interactive", "Skip confirmation prompts (CI mode)", false)
  .option("--no-group-changesets", "Do not group changesets", false)
  .option("--no-group-files", "Do not group SQL files", false)
  .action(async (options) => {
    try {
      const prompted = await promptForMissingSchemaArgs(options);
      const args = {
        app: prompted.app,
        sprint: prompted.sprint,
        author: prompted.author,
        change: prompted.change,
        dryRun: options.dryRun || false,
        interactive: options.interactive !== false,
        groupChangesets: options.groupChangesets !== false,
        groupFiles: options.groupFiles !== false,
      };
      await runSchemaRunner(args);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
