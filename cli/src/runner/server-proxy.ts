export async function getServices(): Promise<any> {
  // Use dynamic import to load ES modules from compiled server dist
  return import("../../../server/dist/services/index.js");
}

export async function getGithubService(): Promise<any> {
  return import("../../../server/dist/services/github.js");
}

export async function getGridCSVGenerator(): Promise<any> {
  return import("../../../server/dist/services/grid-csv.js");
}

export async function getLLMFactory(): Promise<any> {
  return import("../../../server/dist/services/llm.js");
}

export async function getPRDescriptionService(): Promise<any> {
  return import("../../../server/dist/services/pr-description.js");
}
