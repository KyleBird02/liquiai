import { Octokit } from "@octokit/rest";
import { GitHubPRInput, GitHubFileChange } from "../types/index";
import dotenv from "dotenv";

dotenv.config();

/**
 * GitHub service for interacting with the Liquibase repository
 * Handles fetching changeset.xml, parsing changeset IDs, and creating PRs
 */
class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }

    this.owner = process.env.GITHUB_REPO_OWNER || "";
    this.repo = process.env.GITHUB_REPO_NAME || "";

    if (!this.owner || !this.repo) {
      throw new Error(
        "GITHUB_REPO_OWNER and GITHUB_REPO_NAME environment variables are required",
      );
    }

    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Get applications (root directories containing a changeset.xml)
   */
  async getApplications(): Promise<string[]> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: "",
      });

      if (!Array.isArray(response.data)) {
        return [];
      }

      // Filter only directories, and ideally only those that have a changeset.xml
      // For speed, just return directories except .github, etc.
      const directories = response.data
        .filter((item) => item.type === "dir" && !item.name.startsWith("."))
        .map((item) => item.name);

      return directories;
    } catch (error: any) {
      console.error("Failed to fetch applications:", error);
      return [];
    }
  }

  /**
   * Get sprints (subdirectories within an application)
   */
  async getSprints(application: string): Promise<string[]> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: application,
      });

      if (!Array.isArray(response.data)) {
        return [];
      }

      // Return directories that start with "sprint" or similar
      const directories = response.data
        .filter((item) => item.type === "dir")
        .map((item) => item.name);

      return directories;
    } catch (error: any) {
      console.error(`Failed to fetch sprints for ${application}:`, error);
      return [];
    }
  }

  /**
   * Fetch changeset.xml from GitHub for a specific application

   * Returns the XML content as a string
   */
  async fetchChangesetXml(
    application: string,
    branch?: string,
  ): Promise<string> {
    try {
      const getOptions: any = {
        owner: this.owner,
        repo: this.repo,
        path: `${application}/changeset.xml`,
      };

      if (branch) {
        const branchExists = await this.branchExists(branch);
        if (branchExists) {
          getOptions.ref = branch;
        }
      }

      const response = await this.octokit.repos.getContent(getOptions);

      if (Array.isArray(response.data)) {
        throw new Error("Expected a file, got a directory");
      }

      if (response.data.type !== "file") {
        throw new Error("changeset.xml is not a file");
      }

      const content = response.data.content;
      if (!content) {
        return "";
      }

      // Decode base64 content from GitHub API
      return Buffer.from(content, "base64").toString("utf-8");
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(
          `changeset.xml not found for application '${application}'`,
        );
      }
      throw new Error(`Failed to fetch changeset.xml: ${error.message}`);
    }
  }

  /**
   * Parse changeset.xml and extract the last changeset ID
   * Returns the numeric suffix that should be incremented
   */
  parseLastChangesetId(xmlContent: string): number {
    // Match <changeset id="trade-123" ...> pattern
    // Extract all IDs and find the one with the highest numeric suffix
    const idPattern = /id="([^"]+)-(\d+)"/g;
    let maxNumber = 0;
    let match;

    while ((match = idPattern.exec(xmlContent)) !== null) {
      const number = parseInt(match[2], 10);
      if (number > maxNumber) {
        maxNumber = number;
      }
    }

    return maxNumber;
  }

  /**
   * Extract application prefix from existing changeset IDs
   * e.g., if last ID is "trade-123", returns "trade"
   */
  extractApplicationPrefix(xmlContent: string): string {
    // Match the last changeset id and extract the prefix
    const idPattern = /id="([^"]+)-\d+"/g;
    let lastPrefix = "";
    let match;

    while ((match = idPattern.exec(xmlContent)) !== null) {
      lastPrefix = match[1];
    }

    return lastPrefix;
  }

  /**
   * Generate the next changeset ID for a given application
   */
  getNextChangesetId(applicationPrefix: string, lastNumber: number): string {
    return `${applicationPrefix}-${lastNumber + 1}`;
  }

  /**
   * Create a PR in the Liquibase repository
   * Commits all files and opens a PR with auto-generated title and description
   */
  async createPullRequest(
    input: GitHubPRInput,
  ): Promise<{ prUrl: string; prNumber: number }> {
    try {
      // 1. Get the main branch reference
      const baseRef = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: "heads/main",
      });

      const baseSha = baseRef.data.object.sha;

      // 2. Create a new branch if it doesn't exist
      const branchExists = await this.branchExists(input.branch);
      let branchSha = baseSha;

      if (!branchExists) {
        await this.octokit.git.createRef({
          owner: this.owner,
          repo: this.repo,
          ref: `refs/heads/${input.branch}`,
          sha: baseSha,
        });
      } else {
        // If it exists, get the latest SHA for that branch
        const branchRef = await this.octokit.git.getRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${input.branch}`,
        });
        branchSha = branchRef.data.object.sha;
      }

      // 3. Create or update files
      let parentSha = branchSha;

      for (const file of input.files) {
        // Create blob for file content
        const blobResponse = await this.octokit.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: file.content || "",
          encoding: "utf-8",
        });

        const blobSha = blobResponse.data.sha;

        // Get current tree (we'll build on it)
        const tree: any[] = [];

        // For each file, create a tree entry
        tree.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobSha,
        });

        // Create tree
        const treeResponse = await this.octokit.git.createTree({
          owner: this.owner,
          repo: this.repo,
          tree: tree,
          base_tree: parentSha,
        });

        // Create commit
        const commitResponse = await this.octokit.git.createCommit({
          owner: this.owner,
          repo: this.repo,
          message: file.message,
          tree: treeResponse.data.sha,
          parents: [parentSha],
        });

        parentSha = commitResponse.data.sha;

        // Update branch reference to point to new commit
        await this.octokit.git.updateRef({
          owner: this.owner,
          repo: this.repo,
          ref: `heads/${input.branch}`,
          sha: commitResponse.data.sha,
        });
      }

      // 4. Create pull request or get existing
      try {
        const prResponse = await this.octokit.pulls.create({
          owner: this.owner,
          repo: this.repo,
          title: input.title,
          body: input.description,
          head: input.branch,
          base: "main",
        });

        return {
          prUrl: prResponse.data.html_url,
          prNumber: prResponse.data.number,
        };
      } catch (prError: any) {
        // If a PR already exists for this branch, just return it
        if (
          prError.message &&
          prError.message.includes("A pull request already exists")
        ) {
          const existingPrs = await this.octokit.pulls.list({
            owner: this.owner,
            repo: this.repo,
            head: `${this.owner}:${input.branch}`,
            state: "open",
          });

          if (existingPrs.data.length > 0) {
            return {
              prUrl: existingPrs.data[0].html_url,
              prNumber: existingPrs.data[0].number,
            };
          }
        }
        throw prError;
      }
    } catch (error: any) {
      // We only clean up the branch if we just created it and failed, but since we are
      // allowing existing branches now, we should probably not delete the branch globally
      // if it had prior history. We'll leave it alone on failure for safety.
      throw new Error(`Failed to create PR: ${error.message}`);
    }
  }

  /**
   * Check if branch already exists
   */
  async branchExists(branch: string): Promise<boolean> {
    try {
      await this.octokit.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<{
    limit: number;
    remaining: number;
    reset: number;
  }> {
    const response = await this.octokit.rateLimit.get();
    const core = response.data.rate;

    return {
      limit: core.limit,
      remaining: core.remaining,
      reset: core.reset,
    };
  }
}

export const githubService = new GitHubService();
