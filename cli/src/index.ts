#!/usr/bin/env node

// 1. Initialize dotenv BEFORE importing your commands
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { program } from "commander";
import { schemaCommand } from "./commands/schema.command";
import { gridCommand } from "./commands/grid.command";

const pkg = require("../package.json");

program.version(pkg.version).description("Liquibase migration tool CLI agent");

program.addCommand(schemaCommand);
program.addCommand(gridCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
