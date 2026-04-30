declare module "inquirer" {
  const inquirer: any;
  export default inquirer;
}

declare module "../../server/src/services" {
  const services: any;
  export = services;
}

declare module "../../server/src/services/github" {
  const github: any;
  export = github;
}

declare module "../../server/src/services/grid-csv" {
  const csv: any;
  export = csv;
}

declare module "../../server/src/services/llm" {
  const llm: any;
  export = llm;
}
