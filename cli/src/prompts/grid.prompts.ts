import inquirer from "inquirer";

export interface PromptedGridArgs {
  app: string;
  sprint: string;
  author: string;
  grid: string;
  action: "new" | "update";
}

export async function promptForMissingGridArgs(
  options: any,
): Promise<PromptedGridArgs> {
  const questions = [];

  if (!options.app) {
    questions.push({
      type: "input",
      name: "app",
      message: "Target application (e.g. trade-service):",
      validate: (input: any) => (input ? true : "Application is required"),
    });
  }

  if (!options.sprint) {
    questions.push({
      type: "input",
      name: "sprint",
      message: "Target sprint (e.g. sprint-42):",
      validate: (input: any) => (input ? true : "Sprint is required"),
    });
  }

  if (!options.author) {
    questions.push({
      type: "input",
      name: "author",
      message: "Changeset author:",
      validate: (input: any) => (input ? true : "Author is required"),
    });
  }

  if (!options.grid) {
    questions.push({
      type: "input",
      name: "grid",
      message: "Grid name (e.g. tradeGrid):",
      validate: (input: any) => (input ? true : "Grid name is required"),
    });
  }

  if (!options.action) {
    questions.push({
      type: "list",
      name: "action",
      message: "Action:",
      choices: ["new", "update"],
    });
  }

  const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

  return {
    app: options.app || answers.app,
    sprint: options.sprint || answers.sprint,
    author: options.author || answers.author,
    grid: options.grid || answers.grid,
    action: options.action || answers.action,
  };
}
