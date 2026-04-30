import inquirer from "inquirer";

export interface PromptedSchemaArgs {
  app: string;
  sprint: string;
  author: string;
  change: string;
}

export async function promptForMissingSchemaArgs(
  options: any,
): Promise<PromptedSchemaArgs> {
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

  if (!options.change) {
    questions.push({
      type: "input",
      name: "change",
      message: "Describe the schema change:",
      validate: (input: any) =>
        input ? true : "Change description is required",
    });
  }

  const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

  return {
    app: options.app || answers.app,
    sprint: options.sprint || answers.sprint,
    author: options.author || answers.author,
    change: options.change || answers.change,
  };
}
