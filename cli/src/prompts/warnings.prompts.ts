import inquirer from "inquirer";

export async function promptForRedWarning(message: string): Promise<boolean> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "confirm",
      message,
      validate: (input: any) =>
        input.toUpperCase() === "CONFIRM" ? true : "Type 'CONFIRM' to proceed",
    },
  ]);

  return answers.confirm.toUpperCase() === "CONFIRM";
}

export async function promptForAmberWarning(message: string): Promise<boolean> {
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message,
      default: false,
    },
  ]);

  return answers.confirm;
}
