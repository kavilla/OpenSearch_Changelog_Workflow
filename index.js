import { CHANGESET_PATH } from "./config/constants.js";

import { extractChangelogEntries } from "./utils/changelogParser.js";
import {
  prepareChangesetEntryMap,
  prepareChangesetEntriesContent,
} from "./utils/formattingUtils.js";
import { CategoryWithSkipOptionError } from "./utils/customErrors.js";
import {
  extractPullRequestData,
  createOrUpdateFile,
  updatePRLabel,
} from "./utils/githubUtils.js";

async function run() {
  // Get Pull Request data
  const { owner, repo, prNumber, prDescription, prLink, branchRef } =
    await extractPullRequestData();

  // Extract the changelog entries from the PR description
  const changesetEntries = extractChangelogEntries(prDescription);

  // Create a map of changeset entries
  const entryMap = prepareChangesetEntryMap(changesetEntries, prNumber, prLink);

  // Check if the "skip" option is present in the changeset entries
  const skipLabel = "skip-changelog";
  if (entryMap["skip"]) {
    if (Object.keys(entryMap).length > 1) {
      throw new CategoryWithSkipOptionError();
    } else {
      console.log("No changeset file created or updated.");
      try {
        // Add the "skip-changelog" label to the PR
        await updatePRLabel(owner, repo, prNumber, skipLabel, true);
        return;
      } catch (error) {
        console.error(`Error updating label "${skipLabel}" for PR #${prNumber}: ${error.message}`);
      }
    }
  } else {
    try {
      // Check if the "skip-changelog" label is present on the PR and remove it
      await updatePRLabel(owner, repo, prNumber, skipLabel, false);
    } catch (error) {
      console.error(`Error updating label "${skipLabel}" for PR #${prNumber}: ${error.message}`);
    }
  }

  // Prepare some parameters for creating or updating the changeset file
  const changesetEntriesContent = Buffer.from(
    prepareChangesetEntriesContent(entryMap)
  ).toString("base64");
  const changesetFileName = `${prNumber}.yml`;
  const changesetFilePath = `${CHANGESET_PATH}/${changesetFileName}`;
  const message = `Add changeset for PR #${prNumber}`;

  // Create or update the changeset file using Github API
  await createOrUpdateFile(
    owner,
    repo,
    changesetFilePath,
    changesetEntriesContent,
    message,
    branchRef
  );
}

run();
