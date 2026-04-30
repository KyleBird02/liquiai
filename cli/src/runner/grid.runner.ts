import {
  getServices,
  getGridCSVGenerator,
  getGithubService,
} from "./server-proxy";
import { promptForAmberWarning } from "../prompts/warnings.prompts";
import preflightFixer from "./preflight-fixer";

export interface GridRunnerArgs {
  app: string;
  sprint: string;
  author: string;
  grid: string;
  action: "new" | "update";
  dryRun: boolean;
  interactive: boolean;
  groupChangesets: boolean;
  groupFiles: boolean;
}

export async function runGridRunner(args: GridRunnerArgs): Promise<void> {
  console.log(`✓ Grid ${args.grid} loaded`);

  // Find grid by name
  const servicesModule = await getServices();
  const gridService = servicesModule.gridService;

  const gridCSVModule = await getGridCSVGenerator();
  const gridCsvGen = gridCSVModule.gridCSVGenerator;

  const all = await gridService.getAllGrids();
  const found = all.find(
    (g: any) => g.grid_name === args.grid || String(g.id) === String(args.grid),
  );
  if (!found) {
    console.error(`Grid ${args.grid} not found`);
    process.exit(1);
  }

  const gridId = found.id;
  // Get grid config
  const gridConfig = await gridService.getGridConfig(gridId);
  if (!gridConfig) {
    console.error(`Grid ${args.grid} not found (no config)`);
    process.exit(1);
  }

  const gridName = gridConfig.grid.grid_name;
  const isNewGrid = args.action === "new";

  // Build CSV files similar to server route
  const csvFiles: Array<{ tableName: string; path: string; content: string }> =
    [];

  if (isNewGrid) {
    const gridPath = gridCsvGen.generateGridCSVPath(
      gridName,
      args.app,
      args.sprint,
      false,
    );
    const attributesPath = gridCsvGen
      .generateGridCSVPath(gridName, args.app, args.sprint, false)
      .replace(`grid_${gridName}.csv`, `grid_attributes_${gridName}.csv`);

    csvFiles.push({
      tableName: "grid",
      path: gridPath,
      content: gridCsvGen.generateGridTableCSV(gridConfig.grid),
    });
    csvFiles.push({
      tableName: "grid_attributes",
      path: attributesPath,
      content: gridCsvGen.generateGridAttributesCSV(gridConfig.columns),
    });
  } else {
    // For update, CLI currently has no proposed columns; compute diff vs itself -> no changes
    const updateCsv = gridCsvGen.generateGridAttributesUpdateCSV(
      gridConfig.columns,
      gridConfig.columns,
    );
    if (updateCsv.changedRowCount === 0) {
      console.log("No grid attribute changes detected");
      return;
    }
    const updatePath = gridCsvGen.generateGridCSVPath(
      gridName,
      args.app,
      args.sprint,
      true,
    );
    csvFiles.push({
      tableName: "grid_attributes",
      path: updatePath,
      content: updateCsv.csv,
    });
  }

  const changesetId = `grid-${gridId}-${Date.now()}`;
  const servicesModule2 = await getServices();
  const liquibaseGenerator = servicesModule2.liquibaseGenerator;
  const changeset = liquibaseGenerator.generateGridChangesetDefinition(
    gridName,
    changesetId,
    args.author,
    args.app,
    args.sprint,
    csvFiles,
    isNewGrid,
    `Grid config ${args.action} for ${gridName}`,
  );

  console.log(`✓ Changeset generated: ${changeset.id}`);

  // Print preview
  console.log("\n=== Changeset Preview ===");
  console.log(changeset.xmlContent);

  if (args.dryRun) {
    console.log("\n✓ Dry run complete");
    return;
  }

  // Run LLM review
  let reviewed = await liquibaseGenerator.reviewChangesets([changeset]);
  let reviews = reviewed[0].reviews || [];
  let errors = reviews.filter((r: any) => r.severity === "high");
  let warnings = reviews.filter(
    (r: any) => r.severity === "medium" || r.severity === "low",
  );

  // Attempt auto-fixes
  const { changesets: fixed, fixes } = await preflightFixer.applyAutoFixes([
    changeset,
  ]);
  if (fixes.length > 0) {
    console.log("Applied auto-fixes:");
    fixes.forEach((f) => console.log(`  - ${f}`));
    reviewed = await liquibaseGenerator.reviewChangesets(fixed as any);
    reviews = reviewed[0].reviews || [];
    errors = reviews.filter((r: any) => r.severity === "high");
    warnings = reviews.filter(
      (r: any) => r.severity === "medium" || r.severity === "low",
    );
  }

  if (errors.length > 0) {
    console.error("✗ Preflight failed:");
    errors.forEach((e: any) => console.error(`  - ${e.message}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("⚠ Warnings:");
    warnings.forEach((w: any) => console.warn(`  - ${w.message}`));
    if (args.interactive) {
      const confirm = await promptForAmberWarning("Continue anyway?");
      if (!confirm) {
        console.error("Aborted by user");
        process.exit(1);
      }
    }
  }

  // Prepare PR files
  const branch = `migration/${args.app}/${args.sprint}/${changeset.id}`.replace(
    /[^a-zA-Z0-9_\-/]/g,
    "-",
  );

  let existingXml = "";
  try {
    const githubModule = await getGithubService();
    const githubService = githubModule.githubService;
    existingXml = await githubService.fetchChangesetXml(args.app);
  } catch (e) {
    existingXml = `<?xml version="1.0" encoding="UTF-8"?>\n<databaseChangeLog>\n</databaseChangeLog>`;
  }

  const newXml = liquibaseGenerator.appendToChangesetXml(
    existingXml,
    [changeset.xmlContent],
    changeset.comment || null,
  );

  const files: any[] = [
    {
      path: `${args.app}/changeset.xml`,
      message: `Add ${changeset.id} changeset`,
      content: newXml,
    },
  ];
  if (changeset.sqlFiles && Array.isArray(changeset.sqlFiles)) {
    for (const f of changeset.sqlFiles)
      files.push({
        path: f.path,
        message: `Add CSV ${f.path}`,
        content: f.content,
      });
  }

  const prInput = {
    branch,
    title: `${args.app}/${args.sprint}: Grid ${args.grid} ${args.action}`,
    description: `Grid configuration ${args.action} for ${args.grid}`,
    files,
  };

  const githubModule = await getGithubService();
  const githubService = githubModule.githubService;
  const pr = await githubService.createPullRequest(prInput);
  console.log(`✓ PR created: ${pr.prUrl}`);
}
