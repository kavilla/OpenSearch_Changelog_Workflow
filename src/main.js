import {
  CHANGESET_PATH,
  FAILED_CHANGESET_LABEL,
  SKIP_LABEL,
} from "./config/constants.js";

import {
  forkedFileServices,
  forkedAuthServices,
  labelServices,
  commentServices,
  authServices,
} from "./services/index.js";

import {
  extractPullRequestData,
  processChangelogLine,
  extractChangelogEntries,
  getChangesetEntriesMap,
  getChangesetFileContent,
  isSkipEntry,
  formatPostComment,
} from "./utils/index.js";

async function run() {
  // Initialize Octokit client with the GitHub token
  const octokit = authServices.getOctokitClient();

  // Define the path to the changeset file
  const changesetFilePath = (prNumber) => `${CHANGESET_PATH}/${prNumber}.yml`;

  // Define variables to store the extracted pull request data
  let baseOwner,
    baseRepo,
    baseBranch,
    headOwner,
    headRepo,
    headBranch,
    prNumber,
    prDescription,
    prLink;

  // Define variable to store the GitHub App installation id
  let githubAppInstallationId = null;

  try {
    // Step 0 - Extract information from the payload
    ({
      baseOwner,
      baseRepo,
      baseBranch,
      headOwner,
      headRepo,
      headBranch,
      prNumber,
      prDescription,
      prLink,
    } = extractPullRequestData());

    // Get the GitHub App installation ID from the forked repository
    const { data: githubAppInstallationInfo } =
      await forkedAuthServices.getGitHubAppInstallationInfoFromForkedRepo(
        headOwner,
        headRepo
      );
    const { installationId } = githubAppInstallationInfo;
    console.log(installationId)
    if (!installationId){
      console.log(githubAppInstallationId);
    }

    // Step 1 - Parse changelog entries and validate
    const changelogEntries = extractChangelogEntries(
      prDescription,
      processChangelogLine
    );
    const changesetEntriesMap = getChangesetEntriesMap(
      changelogEntries,
      prNumber,
      prLink
    );

    // Step 2 - Handle "skip" option

    if (isSkipEntry(changesetEntriesMap)) {
      await labelServices.addLabel(
        octokit,
        baseOwner,
        baseRepo,
        prNumber,
        SKIP_LABEL
      );
      const commitMessage = `Changeset file for PR #${prNumber} deleted`;
      // Delete of changeset file in forked repo if one was previously created
      await forkedFileServices.deleteFileInForkedRepoByPath(
        headOwner,
        headRepo,
        headBranch,
        changesetFilePath(prNumber),
        commitMessage
      );

      // Clear 'failed changeset' label if exists
      await labelServices.removeLabel(
        octokit,
        baseOwner,
        baseRepo,
        prNumber,
        FAILED_CHANGESET_LABEL
      );
      return;
    }

    // Step 3 - Add or update the changeset file in head repo

    const changesetFileContent = getChangesetFileContent(changesetEntriesMap);
    const commitMessage = `Changeset file for PR #${prNumber} created/updated`;
    await forkedFileServices.createOrUpdateFileInForkedRepoByPath(
      headOwner,
      headRepo,
      headBranch,
      changesetFilePath(prNumber),
      changesetFileContent,
      commitMessage
    );

    // Step 4 - Remove "Skip-Changelog" and "failed changeset" labels if they exist
    await labelServices.removeLabel(
      octokit,
      baseOwner,
      baseRepo,
      prNumber,
      SKIP_LABEL
    );
    await labelServices.removeLabel(
      octokit,
      baseOwner,
      baseRepo,
      prNumber,
      FAILED_CHANGESET_LABEL
    );
  } catch (error) {

    const postComment = formatPostComment({ input: error, type: "ERROR" });

    // Add error comment to PR
    await commentServices.postComment(
      octokit,
      baseOwner,
      baseRepo,
      prNumber,
      postComment
    );
    // Add failed changeset label
    await labelServices.addLabel(
      octokit,
      baseOwner,
      baseRepo,
      prNumber,
      FAILED_CHANGESET_LABEL
    );
    // Clear skip label if exists
    await labelServices.removeLabel(
      octokit,
      baseOwner,
      baseRepo,
      prNumber,
      SKIP_LABEL
    );

    // Delete changeset file if one was previously created
    if (
      error.name !== "MissingChangelogPullRequestBridgeUrlDomainError" &&
      error.name !== "MissingChangelogPullRequestBridgeUrlDomainError" &&
      error.name !== "MissingChangelogPullRequestBridgeApiKeyError" &&
      error.name !== "UnauthorizedRequestToPullRequestBridgeServiceError"
    ) {
      const commitMessage = `Changeset file for PR #${prNumber} deleted`;
      await forkedFileServices.deleteFileInForkedRepoByPath(
        headOwner,
        headRepo,
        headBranch,
        changesetFilePath(prNumber),
        commitMessage
      );
    }
    throw new Error("Changeset creation workflow failed.");
  }
}

run();
