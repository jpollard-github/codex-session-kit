const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const DEFAULT_DOCS = [
  { path: "docs/project-brief.md", role: "project-brief" },
  { path: "docs/current-work.md", role: "current-work" },
  { path: "docs/decisions.md", role: "decisions" },
  { path: "docs/project-memory-snapshot.md", role: "project-memory-snapshot" },
];
const DEFAULT_DOC_PATHS = DEFAULT_DOCS.map((doc) => doc.path);

const DEFAULT_CONFIG_PATH = ".vscode/ai-context.json";
const STATE_FILE_PATH = ".vscode/ai-context-state.json";
const AUTO_START = "<!-- codex-session-kit:auto-start -->";
const AUTO_END = "<!-- codex-session-kit:auto-end -->";
const MAX_SCAN_FILES = 1200;
const MAX_RECENT_FILES = 12;
const STALE_DOC_DAYS = 14;
const INTERNAL_MEMORY_PATHS = new Set([
  ".vscode/ai-context.json",
  ".vscode/ai-context-state.json",
]);
const DEFAULT_ROLE_BY_PATH = new Map(DEFAULT_DOCS.map((doc) => [doc.path, doc.role]));
const AUTO_MANAGED_ROLES = new Set(["project-memory-snapshot"]);

function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "codexSessionKit.showProjectMemoryStatus";
  context.subscriptions.push(statusBarItem);

  const projectMemoryViewProvider = new ProjectMemoryViewProvider(context.extensionPath);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("codexSessionKit.projectMemoryView", projectMemoryViewProvider)
  );

  const refreshStatusBar = async () => {
    const workspaceFolder = getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      statusBarItem.hide();
      projectMemoryViewProvider.refresh();
      return;
    }

    const projectMemory = await resolveProjectMemory(workspaceFolder);
    const branchTracking = await syncProjectMemoryBranchState(workspaceFolder, projectMemory);
    const existingCount = projectMemory.docs.filter((doc) => doc.exists).length;
    const totalCount = projectMemory.docs.length;
    statusBarItem.text = `$(book) Project Memory ${existingCount}/${totalCount}`;
    statusBarItem.tooltip = buildStatusTooltip(projectMemory);
    statusBarItem.show();
    projectMemoryViewProvider.refresh();

    if (branchTracking.shouldWarn) {
      const updateAction = "Prepare Handoff Review";
      const statusAction = "Show Status";
      const choice = await vscode.window.showWarningMessage(
        `Project memory may be stale relative to the current branch. Switched from ${formatBranchName(
          branchTracking.previousBranch
        )} to ${formatBranchName(branchTracking.currentBranch)}.`,
        updateAction,
        statusAction
      );

      if (choice === updateAction) {
        await vscode.commands.executeCommand("codexSessionKit.updateMemoryDocsNow");
      } else if (choice === statusAction) {
        await vscode.commands.executeCommand("codexSessionKit.showProjectMemoryStatus");
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.initializeProjectMemoryDocs", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before initializing project memory docs.");
        return;
      }

      const result = await initializeProjectMemory(workspaceFolder);
      await refreshStatusBar();

      const action = "Open Current Work";
      const message = `Handoff docs ready. Created ${result.createdCount} file${
        result.createdCount === 1 ? "" : "s"
      } and refreshed ${result.updatedCount} snapshot${result.updatedCount === 1 ? "" : "s"}.`;
      const choice = await vscode.window.showInformationMessage(message, action);

      if (choice === action) {
        const summaryPath = path.join(workspaceFolder.uri.fsPath, "docs/current-work.md");
        if (fs.existsSync(summaryPath)) {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.file(summaryPath));
          await vscode.window.showTextDocument(document);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.updateMemoryDocsNow", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before updating memory docs.");
        return;
      }

      const result = await updateMemoryDocsNow(workspaceFolder);
      await refreshStatusBar();

      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: buildHandoffReviewMarkdown(result.review, result.projectMemory),
      });
      await vscode.window.showTextDocument(document, { preview: true });

      const actions = ["Append Suggested Notes", "Show Status"];
      if (result.review.readmeRecommendation.shouldReview) {
        actions.splice(1, 0, "Open README");
      }

      const choice = await vscode.window.showInformationMessage(
        `Snapshot refreshed. Review the suggested handoff before updating human docs.`,
        ...actions
      );

      if (choice === "Append Suggested Notes") {
        const appendResult = await appendSessionSummaryToMemoryDocs(workspaceFolder, result.projectMemory, result.review);
        await refreshStatusBar();
        const followUpActions = ["Show Status"];
        if (appendResult.suggestedCommit) {
          followUpActions.unshift("Copy Suggested Commit");
        }
        if (appendResult.readmePath) {
          followUpActions.push("Open README");
        }
        const followUpChoice = await vscode.window.showInformationMessage(
          appendResult.updatedDocs.length
            ? `Appended suggested notes to ${appendResult.updatedDocs.join(", ")}.`
            : "No matching handoff docs were available for suggested notes.",
          ...followUpActions
        );
        if (followUpChoice === "Copy Suggested Commit" && appendResult.suggestedCommit) {
          await vscode.env.clipboard.writeText(appendResult.suggestedCommit);
          vscode.window.showInformationMessage("Suggested commit message copied to clipboard.");
        } else if (followUpChoice === "Open README" && appendResult.readmePath) {
          const readmeDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(appendResult.readmePath));
          await vscode.window.showTextDocument(readmeDoc);
        } else if (followUpChoice === "Show Status") {
          await vscode.commands.executeCommand("codexSessionKit.showProjectMemoryStatus");
        }
      } else if (choice === "Open README" && result.review.readmeRecommendation.readmePath) {
        const readmeDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.review.readmeRecommendation.readmePath));
        await vscode.window.showTextDocument(readmeDoc);
      } else if (choice === "Show Status") {
        await vscode.commands.executeCommand("codexSessionKit.showProjectMemoryStatus");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.upgradeAiContextConfigToLatestDefaults", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before updating ai-context config.");
        return;
      }

      const configPath = await upgradeAiContextConfigToLatestDefaults(workspaceFolder);
      await refreshStatusBar();

      const action = "Open Config";
      const choice = await vscode.window.showInformationMessage(
        "Updated .vscode/ai-context.json to the latest default role-aware format.",
        action
      );

      if (choice === action) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
        await vscode.window.showTextDocument(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.generateSessionSummary", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before generating a session summary.");
        return;
      }

      const projectMemory = await resolveProjectMemory(workspaceFolder);
      await syncProjectMemoryBranchState(workspaceFolder, projectMemory);
      const summary = generateSessionSummary(workspaceFolder, projectMemory);
      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: buildSessionSummaryMarkdown(summary, projectMemory),
      });
      await vscode.window.showTextDocument(document, { preview: true });

      const appendAction = "Append Suggested Notes";
      const openReadmeAction = summary.readmeRecommendation.shouldReview ? "Open README" : null;
      const statusAction = "Show Status";
      const choice = await vscode.window.showInformationMessage(
        "Session handoff generated.",
        appendAction,
        ...(openReadmeAction ? [openReadmeAction] : []),
        statusAction
      );

      if (choice === appendAction) {
        const result = await appendSessionSummaryToMemoryDocs(workspaceFolder, projectMemory, summary);
        await refreshStatusBar();
        const message =
          result.updatedDocs.length
            ? `Appended suggested notes to ${result.updatedDocs.join(", ")}.`
            : "No matching memory docs were available for suggested summary notes.";
        const actions = [];
        if (result.suggestedCommit) {
          actions.push("Copy Suggested Commit");
        }
        if (result.readmePath) {
          actions.push("Open README");
        }
        actions.push("Show Status");
        const choice = await vscode.window.showInformationMessage(
          message,
          ...actions
        );
        if (choice === "Copy Suggested Commit" && result.suggestedCommit) {
          await vscode.env.clipboard.writeText(result.suggestedCommit);
          vscode.window.showInformationMessage("Suggested commit message copied to clipboard.");
        } else if (choice === "Open README" && result.readmePath) {
          const readmeDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.readmePath));
          await vscode.window.showTextDocument(readmeDoc);
        } else if (choice === "Show Status") {
          await vscode.commands.executeCommand("codexSessionKit.showProjectMemoryStatus");
        }
      } else if (choice === openReadmeAction && summary.readmeRecommendation.readmePath) {
        const readmeDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(summary.readmeRecommendation.readmePath));
        await vscode.window.showTextDocument(readmeDoc);
      } else if (choice === statusAction) {
        await vscode.commands.executeCommand("codexSessionKit.showProjectMemoryStatus");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.openGettingStarted", async () => {
      await openBundledDoc(context.extensionPath, "docs/getting-started.md");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.openGeneralDocumentation", async () => {
      await openBundledDoc(context.extensionPath, "docs/general-documentation.md");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.validateMemoryDocs", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before validating memory docs.");
        return;
      }

      const projectMemory = await resolveProjectMemory(workspaceFolder);
      await syncProjectMemoryBranchState(workspaceFolder, projectMemory);
      const validation = await validateResolvedProjectMemory(workspaceFolder, projectMemory);
      await refreshStatusBar();

      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: buildValidationReport(validation),
      });
      await vscode.window.showTextDocument(document, { preview: true });

      if (validation.summary.issueCount === 0) {
        vscode.window.showInformationMessage("Project memory validation passed. The tracked handoff docs look usable.");
      } else {
        vscode.window.showWarningMessage(
          `Project memory validation found ${validation.summary.issueCount} issue${
            validation.summary.issueCount === 1 ? "" : "s"
          }.`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.startSessionFromProjectMemory", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before starting a project-memory session.");
        return;
      }

      const projectMemory = await resolveProjectMemory(workspaceFolder);
      await updatePromptState(workspaceFolder, "lastStartPromptAt");
      const prompt = buildStartPrompt(projectMemory.docs);
      await vscode.env.clipboard.writeText(prompt);
      await refreshStatusBar();
      vscode.window.showInformationMessage("Start-session prompt copied to clipboard.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.finishSessionAndUpdateProjectMemory", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before finishing a project-memory session.");
        return;
      }

      const projectMemory = await resolveProjectMemory(workspaceFolder);
      await updatePromptState(workspaceFolder, "lastFinishPromptAt");
      const prompt = buildFinishPrompt(projectMemory.docs);
      await vscode.env.clipboard.writeText(prompt);
      await refreshStatusBar();
      vscode.window.showInformationMessage("Finish-session prompt copied to clipboard.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.showProjectMemoryStatus", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace to inspect project memory status.");
        return;
      }

      const projectMemory = await resolveProjectMemory(workspaceFolder);
      await syncProjectMemoryBranchState(workspaceFolder, projectMemory);
      const validation = await validateResolvedProjectMemory(workspaceFolder, projectMemory);
      const lines = [
        `Config: ${projectMemory.configSource}`,
        `Current branch: ${formatBranchName(projectMemory.currentBranch)}`,
        `Last observed branch switch: ${formatTimestamp(projectMemory.state.branchAwareness?.lastSwitchedAt)}`,
        `Last start prompt: ${formatTimestamp(projectMemory.state.lastStartPromptAt)}`,
        `Last finish prompt: ${formatTimestamp(projectMemory.state.lastFinishPromptAt)}`,
        `Validation issues: ${validation.summary.issueCount}`,
        "",
        ...(projectMemory.branchStatus.hasBranchWarning
          ? [
              `WARNING Branch-aware memory drift detected after switching from ${formatBranchName(
                projectMemory.branchStatus.previousBranch
              )} to ${formatBranchName(projectMemory.branchStatus.currentBranch)}.`,
              "",
            ]
          : []),
        ...projectMemory.docs.map(
          (doc) => `${doc.exists ? "OK" : "MISSING"} ${formatDocStatusLabel(doc)} - ${describeDocFreshness(doc, validation.snapshot)}`
        ),
      ];

      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: lines.join("\n"),
      });
      await vscode.window.showTextDocument(document, { preview: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.refreshProjectMemoryView", async () => {
      await refreshStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (workspaceFolder) {
        await markTrackedDocRefreshed(workspaceFolder, document.uri.fsPath);
      }
      refreshStatusBar();
    }),
    vscode.workspace.onDidCreateFiles(async (event) => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (workspaceFolder) {
        for (const file of event.files) {
          await markTrackedDocRefreshed(workspaceFolder, file.fsPath);
        }
      }
      refreshStatusBar();
    }),
    vscode.workspace.onDidDeleteFiles(() => {
      refreshStatusBar();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshStatusBar();
    }),
    vscode.window.onDidChangeWindowState((event) => {
      if (event.focused) {
        refreshStatusBar();
      }
    })
  );

  refreshStatusBar();
}

function deactivate() {}

function getPrimaryWorkspaceFolder() {
  return vscode.workspace.workspaceFolders?.[0] ?? null;
}

async function initializeProjectMemory(workspaceFolder) {
  const projectMemory = await resolveProjectMemory(workspaceFolder);
  const createdFiles = [];
  const workspaceRoot = workspaceFolder.uri.fsPath;

  await ensureDirectory(path.join(workspaceRoot, ".vscode"));

  if (!fs.existsSync(path.join(workspaceRoot, DEFAULT_CONFIG_PATH))) {
    const configBody = buildAiContextConfigBody(projectMemory.docEntries);
    fs.writeFileSync(path.join(workspaceRoot, DEFAULT_CONFIG_PATH), configBody, "utf8");
  }

  for (const doc of projectMemory.docs) {
    if (doc.exists) {
      continue;
    }

    await ensureDirectory(path.dirname(doc.absolutePath));
    fs.writeFileSync(doc.absolutePath, buildInitialDocShell(doc, workspaceFolder.name), "utf8");
    if (isAutoManagedDoc(doc)) {
      await setDocRefreshedAt(workspaceFolder, doc.relativePath, new Date().toISOString());
    }
    createdFiles.push(doc.absolutePath);
  }

  const updateResult = await updateMemoryDocsNow(workspaceFolder);
  return {
    createdCount: createdFiles.length,
    updatedCount: updateResult.updatedCount,
    suggestedCommit: updateResult.suggestedCommit,
  };
}

async function upgradeAiContextConfigToLatestDefaults(workspaceFolder) {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const configPath = path.join(workspaceRoot, DEFAULT_CONFIG_PATH);

  await ensureDirectory(path.dirname(configPath));
  fs.writeFileSync(configPath, buildDefaultAiContextConfigBody(), "utf8");

  return configPath;
}

async function updateMemoryDocsNow(workspaceFolder) {
  const projectMemory = await resolveProjectMemory(workspaceFolder);
  const snapshot = await scanWorkspace(workspaceFolder, projectMemory);
  let updatedCount = 0;

  for (const doc of projectMemory.docs) {
    await ensureDirectory(path.dirname(doc.absolutePath));
    if (!fs.existsSync(doc.absolutePath)) {
      fs.writeFileSync(doc.absolutePath, buildInitialDocShell(doc, workspaceFolder.name), "utf8");
    }

    if (isAutoManagedDoc(doc)) {
      const generatedContent = buildGeneratedDocContent(doc, snapshot);
      upsertAutoSection(doc.absolutePath, generatedContent);
      await setDocRefreshedAt(workspaceFolder, doc.relativePath, new Date().toISOString());
      updatedCount += 1;
    }
  }

  const refreshedProjectMemory = await resolveProjectMemory(workspaceFolder);
  const review = generateSessionSummary(workspaceFolder, refreshedProjectMemory);

  return {
    updatedCount,
    projectMemory: refreshedProjectMemory,
    review,
  };
}

async function resolveProjectMemory(workspaceFolder) {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const extensionConfig = vscode.workspace.getConfiguration("codexSessionKit", workspaceFolder.uri);
  const preferWorkspaceConfig = extensionConfig.get("preferWorkspaceConfig", true);
  const fallbackDocs = extensionConfig.get("docs", []);
  const fallbackDocPaths = extensionConfig.get("docPaths", DEFAULT_DOC_PATHS);
  const configPath = path.join(workspaceRoot, DEFAULT_CONFIG_PATH);
  const state = await readStateFile(workspaceFolder);
  const currentBranch = getGitFacts(workspaceRoot).branch;

  let docEntries = normalizeConfiguredDocs(
    Array.isArray(fallbackDocs) && fallbackDocs.length > 0 ? fallbackDocs : fallbackDocPaths
  );
  let configSource = "Extension settings";

  if (preferWorkspaceConfig && fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const configuredDocs = normalizeConfiguredDocs(parsed.docs, { fallbackToDefault: false });
      if (configuredDocs.length > 0) {
        docEntries = configuredDocs;
        configSource = ".vscode/ai-context.json";
      } else if (Array.isArray(parsed.docPaths) && parsed.docPaths.every((value) => typeof value === "string")) {
        docEntries = normalizeConfiguredDocs(parsed.docPaths);
        configSource = ".vscode/ai-context.json";
      }
    } catch (error) {
      configSource = ".vscode/ai-context.json (invalid JSON, fell back to extension settings)";
    }
  }

  const docs = docEntries.map((entry) => {
    const absolutePath = path.join(workspaceRoot, entry.path);
    const stats = fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : null;
    const stateTimestamp = state.docs?.[entry.path]?.lastRefreshedAt;
    const content = stats ? fs.readFileSync(absolutePath, "utf8") : null;
    return {
      relativePath: entry.path,
      role: entry.role,
      absolutePath,
      exists: Boolean(stats),
      content,
      lastModifiedAt: stats?.mtime.toISOString() ?? null,
      lastRefreshedAt: stateTimestamp ?? stats?.mtime.toISOString() ?? null,
    };
  });

  return {
    configSource,
    currentBranch,
    docEntries,
    docPaths: docEntries.map((entry) => entry.path),
    docs,
    state,
  };
}

function buildStartPrompt(docs) {
  const lines = [
    "Before doing anything, read:",
    ...docs.map((doc) => `- ${formatDocPromptLabel(doc)}`),
    "Use those as the primary source of truth. Only inspect implementation files when needed.",
  ];

  if (docs.some((doc) => doc.role)) {
    lines.push("");
    lines.push("Use the doc roles to prioritize what to read closely and which files to update later.");
  }

  if (docs.some((doc) => !doc.exists)) {
    lines.push("");
    lines.push("If any of those files do not exist yet, call that out and continue with the existing docs.");
  }

  return lines.join("\n");
}

function buildFinishPrompt(docs) {
  return [
    "Review the changes made in this session.",
    "Before updating the memory docs, scan the current folder for changed, added, or deleted files, including files that may have been modified manually outside this chat session.",
    "Write or update a concise handoff so future AI sessions understand what changed, why it changed, what to preserve, and what to do next.",
    `Relevant project memory files: ${docs.map((doc) => doc.relativePath).join(", ")}.`,
    "Incorporate meaningful repo changes from both this chat session and any manual edits discovered during the folder scan.",
    "Only update the files that changed meaningfully.",
    "If the repo has a README.md and user-facing behavior changed materially, update the README too.",
  ].join("\n");
}

function buildAiContextConfigBody(docEntries) {
  return (
    JSON.stringify(
      {
        docs: docEntries.map((doc) => ({
          path: doc.path,
          ...(doc.role ? { role: doc.role } : {}),
        })),
      },
      null,
      2
    ) + "\n"
  );
}

function buildDefaultAiContextConfigBody() {
  return buildAiContextConfigBody(DEFAULT_DOCS);
}

function generateSessionSummary(workspaceFolder, projectMemory) {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const sessionStartedAt = projectMemory.state.lastStartPromptAt;
  const gitFacts = getGitFacts(workspaceRoot);
  const commits = getSessionCommits(workspaceRoot, sessionStartedAt);
  const todoAdditions = getAddedTodoLines(workspaceRoot);
  const decisionSignals = detectDecisionSignals(workspaceRoot, commits, todoAdditions);
  const changedFiles = gitFacts.changedFiles;
  const materialFiles = getMeaningfulChangedFiles(changedFiles);
  const userFacingSignals = detectUserFacingChangeSignals(workspaceRoot, changedFiles);
  const readmeRecommendation = buildReadmeRecommendation(workspaceRoot, userFacingSignals);

  return {
    workspaceName: workspaceFolder.name,
    generatedAt: new Date().toISOString(),
    sessionStartedAt,
    branch: projectMemory.currentBranch,
    changedFiles,
    materialFiles,
    commits,
    decisionSignals,
    todoAdditions,
    whatChanged: buildWhatChangedSummary(materialFiles, commits),
    whyChanged: buildWhyChangedSummary(commits, decisionSignals),
    preserveRules: buildPreserveRules(decisionSignals, todoAdditions),
    nextBestTask: buildNextBestTask(materialFiles, todoAdditions, gitFacts.clean),
    doNotForget: buildDoNotForgetItems(projectMemory, materialFiles, todoAdditions, readmeRecommendation),
    readmeRecommendation,
  };
}

function buildSessionSummaryMarkdown(summary, projectMemory) {
  const trackedDocs = projectMemory.docs.map((doc) => formatDocPromptLabel(doc)).join(", ");

  return [
    "# Session Handoff",
    "",
    "Use this when you want a concise, reusable summary to keep or paste into a future session.",
    "",
    `Workspace: \`${summary.workspaceName}\``,
    `Branch: ${formatBranchName(summary.branch)}`,
    `Tracked memory docs: ${trackedDocs || "none"}`,
    "",
    "## What Changed",
    ...toBullets(summary.whatChanged),
    "",
    "## Why",
    ...toBullets(summary.whyChanged),
    "",
    "## Files Touched",
    ...toBullets(summary.materialFiles.length ? summary.materialFiles : ["No meaningful changed files detected."]),
    "",
    "## Rules Or Decisions To Preserve",
    ...toBullets(summary.preserveRules),
    "",
    "## Next Best Task",
    ...toBullets(summary.nextBestTask),
    "",
    "## Do Not Forget",
    ...toBullets(summary.doNotForget),
    "",
    "## Review Targets",
    ...toBullets(buildSuggestedMemoryDocTargets(projectMemory.docs, summary)),
    "",
    "## Notes",
    ...toBullets([
      summary.commits.length
        ? `Recent commits: ${summary.commits.map((commit) => `\`${commit.shortHash}\` ${commit.subject}`).join("; ")}`
        : "No recent commits detected for this handoff.",
      summary.todoAdditions.length
        ? `TODO-style additions: ${summary.todoAdditions.map((item) => `\`${item.filePath}\` ${item.text}`).join("; ")}`
        : "No added TODO-style lines detected in the current diff.",
      summary.readmeRecommendation.shouldReview
        ? "README review recommended because user-facing behavior may have changed."
        : "README review does not look necessary from current signals.",
    ]),
  ].join("\n");
}

function buildHandoffReviewMarkdown(summary, projectMemory) {
  return [
    "# Handoff Review",
    "",
    "Use this before writing the final handoff. It is a review/checklist view, not the final polished summary.",
    "",
    `Workspace: \`${summary.workspaceName}\``,
    `Branch: ${formatBranchName(summary.branch)}`,
    "",
    "## Review Checklist",
    ...toBullets([
      "Confirm which changed files actually changed behavior.",
      "Decide what future edits must preserve.",
      "Decide whether the next task is obvious enough to capture now.",
      summary.readmeRecommendation.shouldReview
        ? "Review README.md because user-facing behavior may have changed."
        : "README review does not look necessary from current signals.",
    ]),
    "",
    "## Likely Files To Review",
    ...toBullets(summary.materialFiles.length ? summary.materialFiles : ["No meaningful changed files detected."]),
    "",
    "## Candidate Handoff Notes",
    ...toBullets(summary.whatChanged),
    ...toBullets(summary.whyChanged),
    ...toBullets(summary.preserveRules),
    "",
    "## Questions To Answer Before You Append Notes",
    ...toBullets(buildReviewQuestions(summary)),
    "",
    "## If You Want The Cleaner Output",
    "- Run `Project Memory: Generate Session Handoff` for the more polished, reusable handoff document.",
  ].join("\n");
}

async function appendSessionSummaryToMemoryDocs(workspaceFolder, projectMemory, summary) {
  const updatedDocs = [];
  const currentWorkDoc = findDocByRole(projectMemory.docs, "current-work");
  const decisionsDoc = findDocByRole(projectMemory.docs, "decisions");
  const readmePath = summary.readmeRecommendation.readmePath;

  if (currentWorkDoc) {
    await ensureDocExists(workspaceFolder, currentWorkDoc);
    appendBlockBeforeAutoSection(currentWorkDoc.absolutePath, buildCurrentWorkSummaryBlock(summary));
    await setDocRefreshedAt(workspaceFolder, currentWorkDoc.relativePath, new Date().toISOString());
    updatedDocs.push(currentWorkDoc.relativePath);
  }

  if (decisionsDoc && summary.decisionSignals.length > 0) {
    await ensureDocExists(workspaceFolder, decisionsDoc);
    appendBlockBeforeAutoSection(decisionsDoc.absolutePath, buildDecisionCandidatesBlock(summary));
    await setDocRefreshedAt(workspaceFolder, decisionsDoc.relativePath, new Date().toISOString());
    updatedDocs.push(decisionsDoc.relativePath);
  }

  if (summary.readmeRecommendation.shouldReview && currentWorkDoc) {
    appendBlockBeforeAutoSection(
      currentWorkDoc.absolutePath,
      buildReadmeFollowUpBlock(summary.readmeRecommendation)
    );
  }

  return {
    updatedDocs,
    suggestedCommit: buildProjectMemoryCommitSuggestion(summary),
    readmePath,
  };
}

function buildInitialDocShell(doc, workspaceName) {
  if (isAutoManagedDoc(doc)) {
    return [
      `# ${humanizeFileTitle(doc.relativePath)}`,
      "",
      "Machine-generated repo telemetry. Refresh this file when you want a fresh scan of the workspace before writing a handoff.",
      "",
      `${AUTO_START}`,
      `> Auto-generated snapshot for ${workspaceName}. Run \`Project Memory: Prepare Handoff Review\` to refresh the repo scan.`,
      `${AUTO_END}`,
      "",
    ].join("\n");
  }

  return buildHumanDocTemplate(doc);
}

function upsertAutoSection(filePath, generatedContent) {
  const source = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const managedBlock = `${AUTO_START}\n${generatedContent.trim()}\n${AUTO_END}`;

  if (source.includes(AUTO_START) && source.includes(AUTO_END)) {
    const replaced = source.replace(new RegExp(`${escapeRegExp(AUTO_START)}[\\s\\S]*?${escapeRegExp(AUTO_END)}`), managedBlock);
    fs.writeFileSync(filePath, ensureTrailingNewline(replaced), "utf8");
    return;
  }

  const separator = source.trim().length > 0 ? "\n\n" : "";
  fs.writeFileSync(filePath, `${ensureTrailingNewline(source).trimEnd()}${separator}${managedBlock}\n`, "utf8");
}

async function scanWorkspace(workspaceFolder, projectMemory) {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const packageJson = readJsonIfExists(path.join(workspaceRoot, "package.json"));
  const readmeTitle = readMarkdownTitle(path.join(workspaceRoot, "README.md"));
  const tree = scanDirectory(workspaceRoot, 0, []);
  const topDirectories = tree.directories.slice(0, 12);
  const topFiles = tree.files.slice(0, 12);
  const packageFacts = extractPackageFacts(packageJson);
  const gitFacts = getGitFacts(workspaceRoot);
  const openEditors = getOpenEditorPaths(workspaceRoot);
  const recentFiles = findRecentFiles(tree.fileStats);
  const trackedDocs = projectMemory.docs.map((doc) => doc.relativePath);
  const now = new Date().toISOString();

  return {
    workspaceName: workspaceFolder.name,
    workspaceRoot,
    now,
    readmeTitle,
    packageJson,
    packageFacts,
    gitFacts,
    topDirectories,
    topFiles,
    fileCount: tree.fileStats.length,
    extensionCounts: summarizeExtensions(tree.fileStats),
    recentFiles,
    openEditors,
    trackedDocs,
    fileStatsForValidation: tree.fileStats,
    hasTests: tree.fileStats.some((entry) => /(^|\/)(test|tests|__tests__)\//.test(entry.relativePath)),
    largeJsFiles: tree.fileStats
      .filter((entry) => /\.(js|ts|tsx|jsx)$/.test(entry.relativePath) && entry.size > 12000)
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .map((entry) => `${entry.relativePath} (${Math.round(entry.size / 1024)} KB)`),
  };
}

function scanDirectory(rootPath, depth, segments) {
  const ignoredNames = new Set([".git", "node_modules", ".next", "dist", "build", ".DS_Store"]);
  const maxDepth = 3;
  const directories = [];
  const files = [];
  const fileStats = [];
  let scannedCount = 0;

  const visit = (currentPath, currentDepth, currentSegments) => {
    if (scannedCount >= MAX_SCAN_FILES) {
      return;
    }

    const entries = safeReadDir(currentPath);
    for (const entry of entries) {
      if (scannedCount >= MAX_SCAN_FILES) {
        break;
      }

      if (ignoredNames.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join("/");
      let stats;

      try {
        stats = fs.statSync(absolutePath);
      } catch (error) {
        continue;
      }

      if (stats.isDirectory()) {
        if (currentDepth <= maxDepth) {
          directories.push(relativePath + "/");
          visit(absolutePath, currentDepth + 1, currentSegments.concat(entry.name));
        }
        continue;
      }

      scannedCount += 1;
      files.push(relativePath);
      fileStats.push({
        relativePath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    }
  };

  visit(rootPath, depth, segments);
  directories.sort();
  files.sort();
  return { directories, files, fileStats };
}

function safeReadDir(directoryPath) {
  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }
}

function extractPackageFacts(packageJson) {
  if (!packageJson) {
    return null;
  }

  return {
    name: packageJson.name ?? null,
    displayName: packageJson.displayName ?? null,
    version: packageJson.version ?? null,
    description: packageJson.description ?? null,
    main: packageJson.main ?? null,
    scripts: Object.keys(packageJson.scripts ?? {}),
    dependencies: Object.keys(packageJson.dependencies ?? {}),
    devDependencies: Object.keys(packageJson.devDependencies ?? {}),
  };
}

function getGitFacts(workspaceRoot) {
  try {
    const branch = cp.execFileSync("git", ["branch", "--show-current"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const statusOutput = cp.execFileSync("git", ["status", "--short"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const changedFiles = statusOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim());

    return {
      branch: branch || null,
      changedFiles,
      clean: changedFiles.length === 0,
    };
  } catch (error) {
    return {
      branch: null,
      changedFiles: [],
      clean: true,
    };
  }
}

function buildProjectMemoryCommitSuggestion(summary) {
  const context = inferCommitContext(summary.branch, summary.materialFiles ?? summary.changedFiles ?? []);
  const why = Array.isArray(summary.whyChanged) ? summary.whyChanged[0] : null;
  const normalizedWhy = why ? why.replace(/^Likely intent:\s*/i, "").replace(/\.$/, "").trim() : null;

  if (context && normalizedWhy && normalizedWhy !== "Changes inferred from changed files and branch context") {
    return `docs: capture handoff for ${context} (${normalizedWhy})`;
  }

  if (context) {
    return `docs: capture handoff for ${context}`;
  }

  return null;
}

function inferCommitContext(branchName, changedFiles) {
  const branchContext = inferContextFromBranch(branchName);
  if (branchContext) {
    return branchContext;
  }

  const fileContext = inferContextFromChangedFiles(changedFiles);
  return fileContext || null;
}

function inferContextFromBranch(branchName) {
  if (!branchName) {
    return null;
  }

  const segments = branchName.split("/").filter(Boolean);
  const normalized = segments.slice(-1)[0];
  if (!normalized) {
    return null;
  }

  const cleaned = normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (cleaned) {
    return cleaned;
  }

  const fallback = segments
    .join(" ")
    .replace(/\b(wip|feature|feat|fix|bugfix|chore|docs|spike|task|ticket)\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return fallback || null;
}

function inferContextFromChangedFiles(changedFiles) {
  const paths = changedFiles
    .map((line) => line.trim().split(/\s+/).pop())
    .filter(Boolean)
    .filter((value) => !value.startsWith("docs/") && !value.startsWith(".vscode/"));

  if (!paths.length) {
    return null;
  }

  const firstPath = paths[0];
  const segments = firstPath.split("/").filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const primary = segments.length > 1 ? segments[segments.length - 2] : segments[0].replace(path.extname(segments[0]), "");
  const cleaned = primary.replace(/[_-]+/g, " ").trim().toLowerCase();
  return cleaned || null;
}

function getSessionCommits(workspaceRoot, sessionStartedAt) {
  const args = [
    "log",
    "--date=iso-strict",
    "--pretty=format:%H%x1f%h%x1f%ad%x1f%s%x1e",
  ];

  if (sessionStartedAt) {
    args.push(`--since=${sessionStartedAt}`);
  } else {
    args.push("-5");
  }

  try {
    const output = cp.execFileSync("git", args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split("\x1e")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [hash, shortHash, date, subject] = entry.split("\x1f");
        return {
          hash,
          shortHash,
          date,
          subject,
        };
      });
  } catch (error) {
    return [];
  }
}

function getAddedTodoLines(workspaceRoot) {
  const diffOutputs = [getGitDiffOutput(workspaceRoot, ["diff", "--no-color", "--unified=0"]), getGitDiffOutput(workspaceRoot, ["diff", "--cached", "--no-color", "--unified=0"])];
  const todoPattern = /^\+\s*(?:\/\/|#|\/\*+|\*|-)?\s*(TODO|FIXME|HACK|XXX)\b[:\-\s]*(.*)$/i;
  const results = [];
  let currentFilePath = null;

  for (const output of diffOutputs) {
    for (const line of output.split("\n")) {
      if (line.startsWith("+++ b/")) {
        currentFilePath = line.slice(6).trim();
        continue;
      }

      if (!line.startsWith("+") || line.startsWith("+++")) {
        continue;
      }

      const match = line.match(todoPattern);
      if (!match || !currentFilePath) {
        continue;
      }

      results.push({
        filePath: currentFilePath,
        kind: match[1].toUpperCase(),
        text: `${match[1].toUpperCase()}: ${(match[2] || "").trim()}`.trim(),
      });
    }
  }

  return dedupeByKey(results, (item) => `${item.filePath}:${item.text}`);
}

function getGitDiffOutput(workspaceRoot, args) {
  try {
    return cp.execFileSync("git", args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    return "";
  }
}

function detectDecisionSignals(workspaceRoot, commits, todoAdditions) {
  const commitSignals = commits
    .filter((commit) => /\b(decision|decide|adopt|choose|migrate|switch|replace|standardize|introduce|remove|deprecate|refactor)\b/i.test(commit.subject))
    .map((commit) => ({
      summary: commit.subject,
      signal: `commit ${commit.shortHash} on ${formatTimestamp(commit.date)}`,
    }));

  const diffSignals = getAddedDecisionLines(workspaceRoot).map((item) => ({
    summary: item.text,
    signal: `decision-like line added in ${item.filePath}`,
  }));

  const todoSignals = todoAdditions
    .filter((item) => /decision|migrate|replace|remove|refactor/i.test(item.text))
    .map((item) => ({
      summary: item.text,
      signal: `TODO added in ${item.filePath}`,
    }));

  return dedupeByKey(commitSignals.concat(diffSignals, todoSignals), (item) => `${item.summary}:${item.signal}`).slice(0, 8);
}

function getAddedDecisionLines(workspaceRoot) {
  const diffOutputs = [getGitDiffOutput(workspaceRoot, ["diff", "--no-color", "--unified=0"]), getGitDiffOutput(workspaceRoot, ["diff", "--cached", "--no-color", "--unified=0"])];
  const results = [];
  let currentFilePath = null;

  for (const output of diffOutputs) {
    for (const line of output.split("\n")) {
      if (line.startsWith("+++ b/")) {
        currentFilePath = line.slice(6).trim();
        continue;
      }

      if (!line.startsWith("+") || line.startsWith("+++") || !currentFilePath) {
        continue;
      }

      const text = line.slice(1).trim();
      if (!/\b(decision|decide|adopt|choose|migrate|switch|replace|standardize|deprecate)\b/i.test(text)) {
        continue;
      }

      results.push({
        filePath: currentFilePath,
        text,
      });
    }
  }

  return dedupeByKey(results, (item) => `${item.filePath}:${item.text}`);
}

function getOpenEditorPaths(workspaceRoot) {
  const uris = vscode.window.visibleTextEditors
    .map((editor) => editor.document.uri)
    .filter((uri) => uri.scheme === "file" && uri.fsPath.startsWith(workspaceRoot));

  return Array.from(new Set(uris.map((uri) => path.relative(workspaceRoot, uri.fsPath).split(path.sep).join("/")))).sort();
}

function findRecentFiles(fileStats) {
  return [...fileStats]
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    .slice(0, MAX_RECENT_FILES)
    .map((entry) => entry.relativePath);
}

function summarizeExtensions(fileStats) {
  const counts = new Map();
  for (const entry of fileStats) {
    const ext = path.extname(entry.relativePath) || "[no extension]";
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext, count]) => `${ext}: ${count}`);
}

function buildGeneratedDocContent(doc, snapshot) {
  const fileName = path.basename(doc.relativePath);
  const header = "> Auto-generated repo telemetry. This section is managed by Codex Session Kit.";

  const sectionMap = {
    "project-memory-snapshot": buildProjectMemorySnapshot(snapshot),
    "project-memory-snapshot.md": buildProjectMemorySnapshot(snapshot),
  };

  const body = sectionMap[doc.role] ?? sectionMap[fileName] ?? buildGenericSnapshot(snapshot);
  return `${header}\n\n${body}`;
}

function buildProjectMemorySnapshot(snapshot) {
  return [
    "## Snapshot",
    "",
    "### Project Signals",
    ...toBullets(buildProjectIdentity(snapshot)),
    "",
    "### Workspace State",
    ...toBullets([
      `Workspace: \`${snapshot.workspaceName}\``,
      snapshot.readmeTitle ? `README title: ${snapshot.readmeTitle}` : null,
      snapshot.packageFacts?.version ? `Version: \`${snapshot.packageFacts.version}\`` : null,
      snapshot.gitFacts.branch ? `Active branch: \`${snapshot.gitFacts.branch}\`` : null,
      snapshot.gitFacts.clean ? "Working tree appears clean." : `Working tree has ${snapshot.gitFacts.changedFiles.length} changed file(s).`,
    ]),
    "",
    "### Likely Files To Review",
    ...toBullets([
      ...getMeaningfulChangedFiles(snapshot.gitFacts.changedFiles).slice(0, 10).map((item) => `Changed: \`${item}\``),
      ...snapshot.recentFiles.slice(0, 5).map((item) => `Recent: \`${item}\``),
    ]),
    "",
    "### Repo Shape",
    ...toBullets(buildIntegrationPoints(snapshot)),
    "",
    "### Scan Notes",
    "",
    ...toBullets([
      `Tracked handoff docs: ${snapshot.trackedDocs.map((item) => `\`${item}\``).join(", ")}`,
      snapshot.packageFacts?.main ? `Primary entry point appears to be \`${snapshot.packageFacts.main}\`.` : null,
      snapshot.hasTests ? "A test directory appears to exist." : "No obvious test directory detected.",
      snapshot.largeJsFiles.length ? `Larger code files: ${snapshot.largeJsFiles.join(", ")}` : null,
    ]),
  ].join("\n");
}

function buildGenericSnapshot(snapshot) {
  return [
    "## Snapshot",
    "",
    ...toBullets([
      `Workspace: \`${snapshot.workspaceName}\``,
      `Scanned files: ${snapshot.fileCount}`,
      snapshot.gitFacts.branch ? `Branch: \`${snapshot.gitFacts.branch}\`` : "Branch unavailable.",
    ]),
  ].join("\n");
}

function buildProjectIdentity(snapshot) {
  const facts = [];
  if (snapshot.packageFacts?.displayName) {
    facts.push(`Display name: ${snapshot.packageFacts.displayName}`);
  }
  if (snapshot.packageFacts?.description) {
    facts.push(snapshot.packageFacts.description);
  } else if (snapshot.readmeTitle) {
    facts.push(`README suggests the project is "${snapshot.readmeTitle}".`);
  }
  if (snapshot.packageFacts?.name) {
    facts.push(`Package id: \`${snapshot.packageFacts.name}\``);
  }
  if (facts.length === 0) {
    facts.push("No package or README metadata was available, so this summary is based only on file layout.");
  }
  return facts;
}

function buildIntegrationPoints(snapshot) {
  const points = [];
  if (snapshot.packageFacts?.main) {
    points.push(`Primary entry point appears to be \`${snapshot.packageFacts.main}\`.`);
  }
  if (snapshot.packageFacts?.dependencies?.length) {
    points.push(`Runtime dependencies detected: ${snapshot.packageFacts.dependencies.slice(0, 8).map((dep) => `\`${dep}\``).join(", ")}.`);
  }
  if (snapshot.topDirectories.some((item) => item.startsWith("docs/"))) {
    points.push("The repo keeps durable docs in `docs/`, which are part of the intended workflow.");
  }
  if (snapshot.topDirectories.some((item) => item.startsWith("media/"))) {
    points.push("Static media/assets are stored in `media/`.");
  }
  return points.length ? points : ["No obvious integration points were detected from the shallow scan."];
}

function buildArchitectureNotes(snapshot) {
  const notes = [];
  if (snapshot.topDirectories.some((item) => item.startsWith("src/"))) {
    notes.push("Implementation code appears to live under `src/`.");
  }
  if (snapshot.topDirectories.some((item) => item.startsWith(".vscode/"))) {
    notes.push("Workspace-specific configuration is present under `.vscode/`.");
  }
  if (snapshot.topDirectories.some((item) => item.startsWith("docs/"))) {
    notes.push("Documentation is stored as first-class repo content under `docs/`.");
  }
  if (!snapshot.hasTests) {
    notes.push("A shallow scan did not find an obvious test directory.");
  }
  return notes.length ? notes : ["The scan did not find strong structural signals beyond the file list."];
}

function buildRefactorSignals(snapshot) {
  const signals = [];
  if (!snapshot.hasTests) {
    signals.push("Add tests or validation coverage if this repo is expected to evolve over time.");
  }
  if (snapshot.largeJsFiles.length) {
    signals.push("One or more larger JS/TS files may be worth splitting if responsibilities keep growing.");
  }
  if (snapshot.gitFacts.changedFiles.some((line) => line.includes("README.md"))) {
    signals.push("README is changing alongside implementation; ensure durable docs stay aligned with user-facing docs.");
  }
  if (snapshot.openEditors.length >= 4) {
    signals.push("Several files are open right now, which can indicate work spread across multiple concerns.");
  }
  return signals.length ? signals : ["No strong refactor signals were detected from the current shallow scan."];
}

function buildStatusTooltip(projectMemory) {
  const lines = [
    `Current branch: ${formatBranchName(projectMemory.currentBranch)}`,
    ...(projectMemory.branchStatus?.hasBranchWarning
      ? [
          `Branch warning: switched from ${formatBranchName(projectMemory.branchStatus.previousBranch)} to ${formatBranchName(
            projectMemory.branchStatus.currentBranch
          )}`,
        ]
      : []),
    `Last start prompt: ${formatTimestamp(projectMemory.state.lastStartPromptAt)}`,
    `Last finish prompt: ${formatTimestamp(projectMemory.state.lastFinishPromptAt)}`,
    "",
    ...projectMemory.docs.map((doc) => `${doc.exists ? "Exists" : "Missing"}: ${formatDocStatusLabel(doc)}`),
  ];
  return lines.join("\n");
}

async function validateProjectMemory(workspaceFolder) {
  const projectMemory = await resolveProjectMemory(workspaceFolder);
  await syncProjectMemoryBranchState(workspaceFolder, projectMemory);
  return validateResolvedProjectMemory(workspaceFolder, projectMemory);
}

async function validateResolvedProjectMemory(workspaceFolder, projectMemory) {
  const snapshot = await scanWorkspace(workspaceFolder, projectMemory);
  const docs = projectMemory.docs.map((doc) => validateDoc(doc, snapshot));
  const branchStatus = getBranchStatus(projectMemory);
  const repoIssues = [];

  if (branchStatus.hasBranchWarning) {
    repoIssues.push({
      severity: "warning",
      kind: "branch-switch-stale",
      message: `Project memory may be stale after switching from \`${branchStatus.previousBranch}\` to \`${branchStatus.currentBranch}\`.`,
    });
  }

  const issueCount = docs.reduce((count, doc) => count + doc.issues.length, 0) + repoIssues.length;
  const readmeRecommendation = buildReadmeRecommendation(workspaceFolder.uri.fsPath, detectUserFacingChangeSignals(workspaceFolder.uri.fsPath, snapshot.gitFacts.changedFiles));

  return {
    workspaceName: workspaceFolder.name,
    snapshot,
    docs,
    repoIssues,
    branchStatus,
    readmeRecommendation,
    summary: {
      issueCount,
      docsWithIssues: docs.filter((doc) => doc.issues.length > 0).length,
      staleDocs: docs.filter((doc) => doc.flags.isStale).length,
      missingDocs: docs.filter((doc) => doc.flags.isMissing).length,
      placeholderDocs: docs.filter((doc) => doc.flags.isPlaceholderOnly).length,
      malformedDocs: docs.filter((doc) => doc.flags.hasMalformedManagedSection).length,
      branchSwitchWarnings: repoIssues.length,
    },
  };
}

function validateDoc(doc, snapshot) {
  const issues = [];
  const flags = {
    isMissing: false,
    isStale: false,
    isPlaceholderOnly: false,
    hasMalformedManagedSection: false,
  };

  if (!doc.exists) {
    flags.isMissing = true;
    issues.push({ severity: "error", kind: "missing", message: "Configured memory doc is missing." });
    return { ...doc, issues, flags };
  }

  const content = doc.content ?? "";
  const hasAutoStart = content.includes(AUTO_START);
  const hasAutoEnd = content.includes(AUTO_END);
  const shouldHaveManagedSection = isAutoManagedDoc(doc);

  if (shouldHaveManagedSection && hasAutoStart !== hasAutoEnd) {
    flags.hasMalformedManagedSection = true;
    issues.push({
      severity: "warning",
      kind: "malformed-managed-section",
      message: "Managed auto-generated markers are incomplete or malformed.",
    });
  }

  if (shouldHaveManagedSection && !hasAutoStart && !hasAutoEnd) {
    flags.hasMalformedManagedSection = true;
    issues.push({
      severity: "warning",
      kind: "missing-managed-section",
      message: "Managed auto-generated section is missing.",
    });
  }

  const humanNotes = extractHumanNotes(content);
  if (looksLikePlaceholderHumanNotes(humanNotes)) {
    flags.isPlaceholderOnly = true;
    issues.push({
      severity: "warning",
      kind: "placeholder-only",
      message: "Human notes still look like starter template text.",
    });
  }

  const staleness = getDocStaleness(doc, snapshot);
  if (staleness.isStale) {
    flags.isStale = true;
    issues.push({ severity: "warning", kind: "stale", message: staleness.reason });
  }

  return { ...doc, issues, flags };
}

function extractHumanNotes(content) {
  if (!content) {
    return "";
  }

  let cleaned = content;
  if (cleaned.includes(AUTO_START) && cleaned.includes(AUTO_END)) {
    cleaned = cleaned.replace(new RegExp(`${escapeRegExp(AUTO_START)}[\\s\\S]*?${escapeRegExp(AUTO_END)}`), "");
  }

  return cleaned.trim();
}

function looksLikePlaceholderHumanNotes(humanNotes) {
  if (!humanNotes) {
    return true;
  }

  const normalized = humanNotes.toLowerCase().replace(/\s+/g, " ").trim();
  return getPlaceholderPhraseGroups().some((placeholderPhrases) => {
    const hasOnlyPlaceholderText = placeholderPhrases.every((phrase) => normalized.includes(phrase));
    const withoutPlaceholder = placeholderPhrases.reduce((value, phrase) => value.replace(phrase, ""), normalized).trim();
    return hasOnlyPlaceholderText && withoutPlaceholder.length < 30;
  });
}

function getDocStaleness(doc, snapshot) {
  const relevantTimestamp = parseTimestamp(isAutoManagedDoc(doc) ? doc.lastRefreshedAt : doc.lastModifiedAt ?? doc.lastRefreshedAt);
  if (!relevantTimestamp) {
    return { isStale: true, reason: isAutoManagedDoc(doc) ? "Snapshot has never been refreshed." : "Human notes have never been updated." };
  }

  if (Date.now() - relevantTimestamp > STALE_DOC_DAYS * 24 * 60 * 60 * 1000) {
    return {
      isStale: true,
      reason: isAutoManagedDoc(doc)
        ? `Snapshot has not been refreshed in more than ${STALE_DOC_DAYS} days.`
        : `Human notes have not been reviewed in more than ${STALE_DOC_DAYS} days.`,
    };
  }

  const newestRepoChange = getNewestRepoChangeTimestamp(snapshot);
  if (newestRepoChange && relevantTimestamp < newestRepoChange.timestamp) {
    return {
      isStale: true,
      reason: isAutoManagedDoc(doc)
        ? `Snapshot is older than repo changes in \`${newestRepoChange.relativePath}\`.`
        : `Human notes may need review because code changed later in \`${newestRepoChange.relativePath}\`.`,
    };
  }

  return { isStale: false, reason: null };
}

function getNewestRepoChangeTimestamp(snapshot) {
  const trackedDocs = new Set(snapshot.trackedDocs);
  const candidates = snapshot.fileStatsForValidation ?? [];
  const filtered = candidates.filter(
    (entry) => !trackedDocs.has(entry.relativePath) && !INTERNAL_MEMORY_PATHS.has(entry.relativePath)
  );

  return filtered.reduce((latest, entry) => {
    const timestamp = parseTimestamp(entry.mtime);
    if (!timestamp) {
      return latest;
    }
    if (!latest || timestamp > latest.timestamp) {
      return { relativePath: entry.relativePath, timestamp };
    }
    return latest;
  }, null);
}

function buildValidationReport(validation) {
  const lines = [
    "# Project Memory Validation",
    "",
    `Workspace: \`${validation.workspaceName}\``,
    `Issues found: ${validation.summary.issueCount}`,
    "",
    "## Summary",
    `- Missing docs: ${validation.summary.missingDocs}`,
    `- Needs review: ${validation.summary.staleDocs}`,
    `- Placeholder-only docs: ${validation.summary.placeholderDocs}`,
    `- Malformed managed sections: ${validation.summary.malformedDocs}`,
    `- Branch-switch warnings: ${validation.summary.branchSwitchWarnings}`,
    `- README review recommended: ${validation.readmeRecommendation.shouldReview ? "yes" : "no"}`,
    "",
  ];

  if (validation.summary.issueCount === 0) {
    lines.push("## Result", "", "- All tracked memory docs passed the current validation checks.");
    return lines.join("\n");
  }

  if (validation.repoIssues.length > 0) {
    lines.push("## Repo Findings", "");
    for (const issue of validation.repoIssues) {
      lines.push(`- ${issue.severity.toUpperCase()}: ${issue.message}`);
    }
    lines.push("");
  }

  lines.push("## Findings", "");
  for (const doc of validation.docs) {
    if (doc.issues.length === 0) {
      continue;
    }
    lines.push(`### ${formatDocStatusLabel(doc)}`);
    lines.push(`- Freshness: ${describeDocFreshness(doc, validation.snapshot)}`);
    for (const issue of doc.issues) {
      lines.push(`- ${issue.severity.toUpperCase()}: ${issue.message}`);
    }
    lines.push("");
  }

  lines.push("## Guidance", "");
  lines.push("- Use `Project Memory: Prepare Handoff Review` to refresh the snapshot and review the suggested handoff.");
  lines.push("- Add or expand human notes when a doc still contains starter prompts.");
  if (validation.readmeRecommendation.shouldReview) {
    lines.push(`- Review README.md because ${validation.readmeRecommendation.reasons.join("; ")}.`);
  }
  lines.push("- Re-run validation after updating the docs.");
  return lines.join("\n");
}

function isAutoManagedDoc(doc) {
  return AUTO_MANAGED_ROLES.has(doc.role) || path.basename(doc.relativePath) === "project-memory-snapshot.md";
}

function buildHumanDocTemplate(doc) {
  const sectionsByRole = {
    "project-brief": [
      "## Repo Purpose",
      "- What does this repo do for users or the team?",
      "",
      "## How To Work In This Repo",
      "- How do you run, test, or validate changes locally?",
      "",
      "## Important Constraints",
      "- What should AI or future-you avoid changing casually?",
      "",
      "## Architecture Rules Worth Preserving",
      "- What design assumptions or boundaries matter most?",
    ],
    "current-work": [
      "## Active Work",
      "- What changed recently that future-you should know before editing?",
      "",
      "## Next Best Task",
      "- What is the most useful follow-up from here?",
      "",
      "## Risks Or Watchouts",
      "- What could be easy to break or misunderstand?",
    ],
    decisions: [
      "## Decision Log",
      "- Record only durable decisions with context and consequences.",
      "",
      "## Candidate Decisions To Confirm",
      "- Promote items here only after they are real choices, not guesses.",
    ],
  };

  const sections = sectionsByRole[doc.role] ?? [
    "## Notes",
    "- Add durable context here.",
  ];

  return [`# ${humanizeFileTitle(doc.relativePath)}`, "", ...sections, ""].join("\n");
}

function getPlaceholderPhraseGroups() {
  return [
    [
      "## repo purpose",
      "what does this repo do for users or the team?",
      "## important constraints",
      "what should ai or future-you avoid changing casually?",
    ],
    [
      "## active work",
      "what changed recently that future-you should know before editing?",
      "## next best task",
      "what is the most useful follow-up from here?",
    ],
    [
      "## decision log",
      "record only durable decisions with context and consequences.",
      "## candidate decisions to confirm",
      "promote items here only after they are real choices, not guesses.",
    ],
  ];
}

function getMeaningfulChangedFiles(changedFiles) {
  return changedFiles
    .map((line) => line.trim().split(/\s+/).pop())
    .filter(Boolean)
    .filter((value) => !INTERNAL_MEMORY_PATHS.has(value));
}

function buildWhatChangedSummary(materialFiles, commits) {
  if (materialFiles.length === 0) {
    return ["No meaningful changed files detected yet."];
  }

  const grouped = summarizePaths(materialFiles);
  const commitHint = commits.length ? `Recent commit theme: ${commits[0].subject}.` : null;
  return [
    `Likely work areas: ${grouped.join(", ")}.`,
    commitHint,
  ].filter(Boolean);
}

function buildWhyChangedSummary(commits, decisionSignals) {
  if (commits.length > 0) {
    return [`Likely intent: ${commits[0].subject}.`];
  }
  if (decisionSignals.length > 0) {
    return [`Likely intent: ${decisionSignals[0].summary}.`];
  }
  return ["Likely intent: Changes inferred from changed files and branch context."];
}

function buildPreserveRules(decisionSignals, todoAdditions) {
  const items = [];
  for (const signal of decisionSignals.slice(0, 3)) {
    items.push(`${signal.summary} (${signal.signal})`);
  }
  for (const todo of todoAdditions.slice(0, 2)) {
    items.push(`${todo.text} in ${todo.filePath}`);
  }
  return items.length ? items : ["No durable rules were inferred confidently. Review the touched files before editing further."];
}

function buildNextBestTask(materialFiles, todoAdditions, isClean) {
  if (todoAdditions.length > 0) {
    return [`Resolve or triage the new TODO-style follow-ups in ${todoAdditions.map((item) => item.filePath).join(", ")}.`];
  }
  if (materialFiles.length > 0) {
    return [`Write a short human handoff for ${summarizePaths(materialFiles).join(", ")} and confirm what should not break next.`];
  }
  return [isClean ? "No immediate handoff task detected." : "Review the working tree and capture the meaningful change before moving on."];
}

function buildDoNotForgetItems(projectMemory, materialFiles, todoAdditions, readmeRecommendation) {
  const items = [];
  if (projectMemory.branchStatus?.hasBranchWarning) {
    items.push(
      `This branch changed from ${formatBranchName(projectMemory.branchStatus.previousBranch)} to ${formatBranchName(
        projectMemory.branchStatus.currentBranch
      )}; make sure the handoff matches the current branch.`
    );
  }
  if (materialFiles.length > 0) {
    items.push(`Capture the why behind changes in ${materialFiles.slice(0, 5).join(", ")} before ending the session.`);
  }
  if (todoAdditions.length > 0) {
    items.push("New TODO-style lines were added; confirm whether they represent debt, scope cuts, or next tasks.");
  }
  if (readmeRecommendation.shouldReview) {
    items.push("README.md may need an update because user-facing behavior appears to have changed.");
  }
  return items.length ? items : ["No special follow-up was inferred from the current signals."];
}

function buildReviewQuestions(summary) {
  const questions = [];
  if (summary.materialFiles.length > 0) {
    questions.push(`Which of these files actually changed behavior versus internal cleanup: ${summary.materialFiles.slice(0, 5).join(", ")}?`);
  }
  questions.push("What should future-you preserve if this area is edited again?");
  questions.push("What is the next best task if someone re-enters this repo tomorrow?");
  if (summary.readmeRecommendation.shouldReview) {
    questions.push("Did the user-facing setup, commands, or workflow change enough to update README.md?");
  }
  return questions;
}

function detectUserFacingChangeSignals(workspaceRoot, changedFiles) {
  const signals = [];
  const normalizedPaths = getMeaningfulChangedFiles(changedFiles);
  const packageJson = readJsonIfExists(path.join(workspaceRoot, "package.json"));

  if (normalizedPaths.some((file) => file === "package.json")) {
    signals.push("package metadata or command surface changed");
  }
  if (normalizedPaths.some((file) => /(^|\/)(src|app|pages|components|public|media)\//.test(file))) {
    signals.push("runtime or UI-facing files changed");
  }
  if (packageJson?.description) {
    signals.push("package description may need to stay aligned with behavior");
  }

  return dedupeByKey(signals, (item) => item);
}

function buildReadmeRecommendation(workspaceRoot, signals) {
  const readmePath = path.join(workspaceRoot, "README.md");
  const shouldReview = fs.existsSync(readmePath) && signals.length > 0;

  return {
    shouldReview,
    readmePath: shouldReview ? readmePath : null,
    reasons: shouldReview ? signals : [],
  };
}

function summarizePaths(paths) {
  const groups = new Set();
  for (const item of paths) {
    const clean = item.replace(/^[A-Z?MDRCU!\s]+/, "").trim();
    const segments = clean.split("/").filter(Boolean);
    if (segments.length > 1) {
      groups.add(segments[segments.length - 2]);
    } else if (segments[0]) {
      groups.add(segments[0].replace(path.extname(segments[0]), ""));
    }
  }
  return Array.from(groups).slice(0, 4);
}

function describeDocFreshness(doc, snapshot) {
  if (!doc.exists) {
    return "missing";
  }
  if (isAutoManagedDoc(doc)) {
    const newestRepoChange = getNewestRepoChangeTimestamp(snapshot);
    if (newestRepoChange && parseTimestamp(doc.lastRefreshedAt) < newestRepoChange.timestamp) {
      return `snapshot older than repo changes in ${newestRepoChange.relativePath}`;
    }
    return "snapshot looks current";
  }

  const staleness = getDocStaleness(doc, snapshot);
  return staleness.isStale ? staleness.reason : "human notes look current enough";
}

function docStatusSummary(doc) {
  if (!doc.exists) {
    return "missing";
  }
  if (isAutoManagedDoc(doc)) {
    return doc.lastRefreshedAt ? `snapshot updated ${formatRelativeTimestamp(doc.lastRefreshedAt)}` : "snapshot not refreshed yet";
  }
  return doc.lastModifiedAt ? `edited ${formatRelativeTimestamp(doc.lastModifiedAt)}` : "present";
}

async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

async function readStateFile(workspaceFolder) {
  const statePath = path.join(workspaceFolder.uri.fsPath, STATE_FILE_PATH);
  if (!fs.existsSync(statePath)) {
    return {
      lastStartPromptAt: null,
      lastFinishPromptAt: null,
      branchAwareness: buildDefaultBranchAwarenessState(),
      docs: {},
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      lastStartPromptAt: typeof parsed.lastStartPromptAt === "string" ? parsed.lastStartPromptAt : null,
      lastFinishPromptAt: typeof parsed.lastFinishPromptAt === "string" ? parsed.lastFinishPromptAt : null,
      branchAwareness: normalizeBranchAwarenessState(parsed.branchAwareness),
      docs: parsed.docs && typeof parsed.docs === "object" ? parsed.docs : {},
    };
  } catch (error) {
    return {
      lastStartPromptAt: null,
      lastFinishPromptAt: null,
      branchAwareness: buildDefaultBranchAwarenessState(),
      docs: {},
    };
  }
}

async function writeStateFile(workspaceFolder, state) {
  const statePath = path.join(workspaceFolder.uri.fsPath, STATE_FILE_PATH);
  await ensureDirectory(path.dirname(statePath));
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function updatePromptState(workspaceFolder, fieldName) {
  const state = await readStateFile(workspaceFolder);
  state[fieldName] = new Date().toISOString();
  await writeStateFile(workspaceFolder, state);
}

async function setDocRefreshedAt(workspaceFolder, relativePath, isoTimestamp) {
  const state = await readStateFile(workspaceFolder);
  state.docs = state.docs ?? {};
  state.docs[relativePath] = {
    ...(state.docs[relativePath] ?? {}),
    lastRefreshedAt: isoTimestamp,
  };
  await writeStateFile(workspaceFolder, state);
}

async function markTrackedDocRefreshed(workspaceFolder, absolutePath) {
  if (!absolutePath.startsWith(workspaceFolder.uri.fsPath)) {
    return;
  }

  const projectMemory = await resolveProjectMemory(workspaceFolder);
  const relativePath = path.relative(workspaceFolder.uri.fsPath, absolutePath).split(path.sep).join("/");
  const trackedDoc = projectMemory.docs.find((doc) => doc.relativePath === relativePath);
  if (!trackedDoc) {
    return;
  }

  const timestamp = fs.existsSync(absolutePath) ? fs.statSync(absolutePath).mtime.toISOString() : new Date().toISOString();
  await setDocRefreshedAt(workspaceFolder, relativePath, timestamp);
}

async function updateBranchTracking(workspaceFolder, currentBranch) {
  const state = await readStateFile(workspaceFolder);
  const branchAwareness = normalizeBranchAwarenessState(state.branchAwareness);
  state.branchAwareness = branchAwareness;

  if (!currentBranch) {
    if (state.branchAwareness !== branchAwareness) {
      await writeStateFile(workspaceFolder, state);
    }
    return { shouldWarn: false, state };
  }

  if (!branchAwareness.lastSeenBranch) {
    branchAwareness.lastSeenBranch = currentBranch;
    await writeStateFile(workspaceFolder, state);
    return { shouldWarn: false, state };
  }

  if (branchAwareness.lastSeenBranch === currentBranch) {
    return { shouldWarn: false, state };
  }

  const previousBranch = branchAwareness.lastSeenBranch;
  const switchedAt = new Date().toISOString();
  const transitionKey = `${previousBranch}->${currentBranch}`;
  const shouldWarn = branchAwareness.lastWarnedTransitionKey !== transitionKey;

  state.branchAwareness = {
    lastSeenBranch: currentBranch,
    previousBranch,
    lastSwitchedAt: switchedAt,
    lastWarnedTransitionKey: transitionKey,
  };

  await writeStateFile(workspaceFolder, state);

  return {
    shouldWarn,
    previousBranch,
    currentBranch,
    switchedAt,
    state,
  };
}

async function syncProjectMemoryBranchState(workspaceFolder, projectMemory) {
  const branchTracking = await updateBranchTracking(workspaceFolder, projectMemory.currentBranch);
  if (branchTracking.state) {
    projectMemory.state = branchTracking.state;
  }
  projectMemory.branchStatus = getBranchStatus(projectMemory);
  return branchTracking;
}

function formatTimestamp(isoTimestamp) {
  if (!isoTimestamp) {
    return "never";
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return date.toLocaleString();
}

class ProjectMemoryViewProvider {
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(element) {
    if (element) {
      return [];
    }

    const heroItems = [
      createHeroItem(
        "Codex Session Kit",
        "Durable AI handoffs for real repositories",
        "Open the general guide and philosophy for this extension.",
        "codexSessionKit.openGeneralDocumentation",
        path.join(this.extensionPath, "media", "codex-session-kit.svg")
      ),
      createSectionItem("Start Here", "Quick onboarding and reference"),
      createCommandItem("Open Getting Started", "Set up the extension and run your first workflow", "codexSessionKit.openGettingStarted", "rocket"),
      createCommandItem("Open General Documentation", "Read the workflow philosophy and feature guide", "codexSessionKit.openGeneralDocumentation", "book"),
    ];

    const workspaceFolder = getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      return [
        ...heroItems,
        createSectionItem("Workspace Needed", "Open a folder to activate project memory commands"),
        createInfoItem("No workspace open", "Open a repository folder to initialize memory docs and status", "folder-opened"),
      ];
    }

    const projectMemory = await resolveProjectMemory(workspaceFolder);
    await syncProjectMemoryBranchState(workspaceFolder, projectMemory);
    const validation = await validateResolvedProjectMemory(workspaceFolder, projectMemory);
    const actions = [
      ...heroItems,
      createSectionItem("Daily Workflow", "Start, review, hand off, and finish"),
      createCommandItem(
        "Start Session From Project Memory",
        `Copy the start-session prompt${formatOptionalSuffix(projectMemory.state.lastStartPromptAt, "last used")}`,
        "codexSessionKit.startSessionFromProjectMemory",
        "play"
      ),
      createCommandItem(
        "Generate Session Handoff",
        "Create a concise handoff from changed files, commits, decisions, and TODOs",
        "codexSessionKit.generateSessionSummary",
        "note"
      ),
      createCommandItem(
        "Prepare Handoff Review",
        "Refresh the machine snapshot and suggest what the human docs should say next",
        "codexSessionKit.updateMemoryDocsNow",
        "sync"
      ),
      createCommandItem(
        "Finish Session And Update Project Memory",
        `Copy the finish-session prompt${formatOptionalSuffix(projectMemory.state.lastFinishPromptAt, "last used")}`,
        "codexSessionKit.finishSessionAndUpdateProjectMemory",
        "check"
      ),
      createSectionItem("Health & Status", "Keep memory trustworthy"),
      ...(validation.summary.issueCount > 0
        ? [
            createInfoItem(
              `Validation: ${validation.summary.issueCount} issue${validation.summary.issueCount === 1 ? "" : "s"}`,
              buildValidationSummaryLabel(validation),
              "warning"
            ),
          ]
        : [createInfoItem("Validation: Healthy", "The tracked handoff docs look usable", "check")]),
      createInfoItem(`Branch: ${formatBranchName(projectMemory.currentBranch)}`, buildBranchStatusSummary(projectMemory), "git-branch"),
      createCommandItem("Show Project Memory Status", "Open a status summary for the configured memory docs", "codexSessionKit.showProjectMemoryStatus", "list-tree"),
      createCommandItem("Validate Memory Docs", "Check whether the handoff docs still look usable", "codexSessionKit.validateMemoryDocs", "pass"),
      createSectionItem("Setup & Maintenance", "Initialize, migrate, and tune"),
      createCommandItem("Initialize Handoff Docs", "Create the default handoff docs and starter prompts", "codexSessionKit.initializeProjectMemoryDocs", "new-file"),
      createCommandItem(
        "Upgrade AI Context Config To Latest Defaults",
        "Rewrite .vscode/ai-context.json to the latest default role-aware format",
        "codexSessionKit.upgradeAiContextConfigToLatestDefaults",
        "settings-gear"
      ),
      createSectionItem("Tracked Memory Docs", `${projectMemory.docs.filter((doc) => doc.exists).length}/${projectMemory.docs.length} present`),
    ];

    return [...actions, ...projectMemory.docs.map((doc) => createDocItem(doc))];
  }

  getTreeItem(element) {
    return element;
  }
}

function createCommandItem(label, description, command, iconId) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.command = { command, title: label };
  item.iconPath = new vscode.ThemeIcon(iconId);
  return item;
}

function createHeroItem(label, description, tooltip, command, iconPath) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.tooltip = tooltip;
  item.command = { command, title: label };
  item.iconPath = {
    light: iconPath,
    dark: iconPath,
  };
  return item;
}

function createSectionItem(label, description) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.iconPath = new vscode.ThemeIcon("chevron-right");
  return item;
}

function createInfoItem(label, description, iconId) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.iconPath = new vscode.ThemeIcon(iconId);
  return item;
}

function buildBranchStatusSummary(projectMemory) {
  const branchStatus = projectMemory.branchStatus;
  if (branchStatus?.hasBranchWarning) {
    return `Project memory may need review after switching from ${formatBranchName(branchStatus.previousBranch)} to ${formatBranchName(
      branchStatus.currentBranch
    )}.`;
  }

  return projectMemory.currentBranch ? "Branch-aware handoff status looks healthy." : "Git branch unavailable for this workspace.";
}

function createDocItem(doc) {
  const item = new vscode.TreeItem(doc.relativePath, vscode.TreeItemCollapsibleState.None);
  item.description = doc.exists ? docStatusSummary(doc) : "missing";
  item.tooltip = `${doc.absolutePath}${doc.role ? `\nRole: ${doc.role}` : ""}\nFreshness: ${docStatusSummary(doc)}\nLast modified: ${formatTimestamp(
    doc.lastModifiedAt
  )}`;
  item.iconPath = new vscode.ThemeIcon(doc.exists ? "file" : "warning");

  if (doc.exists) {
    item.command = {
      command: "vscode.open",
      title: "Open Project Memory Doc",
      arguments: [vscode.Uri.file(doc.absolutePath)],
    };
  }

  return item;
}

async function openBundledDoc(extensionPath, relativeDocPath) {
  const absolutePath = path.join(extensionPath, relativeDocPath);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
  await vscode.window.showTextDocument(document, { preview: true });
}

function buildSuggestedMemoryDocTargets(docs, summary) {
  const targets = [];
  const currentWorkDoc = findDocByRole(docs, "current-work");
  const decisionsDoc = findDocByRole(docs, "decisions");
  const briefDoc = findDocByRole(docs, "project-brief");

  if (currentWorkDoc) {
    targets.push(`Append the working-summary block to ${formatDocPromptLabel(currentWorkDoc)}.`);
  }
  if (decisionsDoc && summary.decisionSignals.length > 0) {
    targets.push(`Append candidate decision follow-ups to ${formatDocPromptLabel(decisionsDoc)}.`);
  }
  if (briefDoc && summary.readmeRecommendation.shouldReview) {
    targets.push(`Review ${formatDocPromptLabel(briefDoc)} and README.md together because user-facing behavior may have changed.`);
  }
  if (targets.length === 0) {
    targets.push("No matching handoff docs were configured for automatic append suggestions.");
  }

  return targets;
}

function findDocByRole(docs, role) {
  return docs.find((doc) => doc.role === role) ?? null;
}

async function ensureDocExists(workspaceFolder, doc) {
  if (fs.existsSync(doc.absolutePath)) {
    return;
  }

  await ensureDirectory(path.dirname(doc.absolutePath));
  fs.writeFileSync(doc.absolutePath, buildInitialDocShell(doc, workspaceFolder.name), "utf8");
}

function appendBlockBeforeAutoSection(filePath, block) {
  const source = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const normalizedBlock = ensureTrailingNewline(block).trimEnd();

  if (source.includes(AUTO_START) && source.includes(AUTO_END)) {
    const updated = source.replace(
      new RegExp(`\\n*${escapeRegExp(AUTO_START)}`),
      `\n\n${normalizedBlock}\n\n${AUTO_START}`
    );
    fs.writeFileSync(filePath, ensureTrailingNewline(updated), "utf8");
    return;
  }

  const separator = source.trim().length ? "\n\n" : "";
  fs.writeFileSync(filePath, `${ensureTrailingNewline(source).trimEnd()}${separator}${normalizedBlock}\n`, "utf8");
}

function buildCurrentWorkSummaryBlock(summary) {
  return [
    `## Last Meaningful Change - ${formatDateOnly(summary.generatedAt)}`,
    `- Branch: \`${formatBranchName(summary.branch)}\``,
    `- What changed: ${summary.whatChanged.join(" ")}`,
    `- Why: ${summary.whyChanged.join(" ")}`,
    `- Files touched: ${summary.materialFiles.length ? summary.materialFiles.join(", ") : "No meaningful changed files detected."}`,
    `- Rules to preserve: ${summary.preserveRules.join(" ")}`,
    `- Next best task: ${summary.nextBestTask.join(" ")}`,
    `- Do not forget: ${summary.doNotForget.join(" ")}`,
  ].join("\n");
}

function buildDecisionCandidatesBlock(summary) {
  const lines = [`## Candidate Decisions To Confirm - ${formatDateOnly(summary.generatedAt)}`];

  for (const signal of summary.decisionSignals) {
    lines.push(`- Candidate: ${signal.summary}`);
    lines.push(`  Signal: ${signal.signal}`);
    lines.push("  Follow-up: Confirm whether this should become a durable decision log entry.");
  }

  return lines.join("\n");
}

function buildReadmeFollowUpBlock(readmeRecommendation) {
  return [
    `## README Follow-Up - ${formatDateOnly(new Date().toISOString())}`,
    `- Review README.md because ${readmeRecommendation.reasons.join("; ")}.`,
    "- Update user-facing setup, workflow, or behavior notes if those changes are now material.",
  ].join("\n");
}

function buildDefaultBranchAwarenessState() {
  return {
    lastSeenBranch: null,
    previousBranch: null,
    lastSwitchedAt: null,
    lastWarnedTransitionKey: null,
  };
}

function normalizeBranchAwarenessState(branchAwareness) {
  const defaults = buildDefaultBranchAwarenessState();
  if (!branchAwareness || typeof branchAwareness !== "object") {
    return defaults;
  }

  return {
    lastSeenBranch: typeof branchAwareness.lastSeenBranch === "string" ? branchAwareness.lastSeenBranch : null,
    previousBranch: typeof branchAwareness.previousBranch === "string" ? branchAwareness.previousBranch : null,
    lastSwitchedAt: typeof branchAwareness.lastSwitchedAt === "string" ? branchAwareness.lastSwitchedAt : null,
    lastWarnedTransitionKey:
      typeof branchAwareness.lastWarnedTransitionKey === "string" ? branchAwareness.lastWarnedTransitionKey : null,
  };
}

function getBranchStatus(projectMemory) {
  const currentBranch = projectMemory.currentBranch ?? null;
  const branchAwareness = normalizeBranchAwarenessState(projectMemory.state?.branchAwareness);
  const switchedAt = parseTimestamp(branchAwareness.lastSwitchedAt);

  if (!currentBranch || !branchAwareness.previousBranch || !switchedAt || branchAwareness.lastSeenBranch !== currentBranch) {
    return {
      hasBranchWarning: false,
      currentBranch,
      previousBranch: branchAwareness.previousBranch,
      switchedAt: branchAwareness.lastSwitchedAt,
    };
  }

  const docsNeedRefresh = projectMemory.docs.some((doc) => {
    const relevantTimestamp = parseTimestamp(isAutoManagedDoc(doc) ? doc.lastRefreshedAt : doc.lastModifiedAt ?? doc.lastRefreshedAt);
    return !relevantTimestamp || relevantTimestamp < switchedAt;
  });

  return {
    hasBranchWarning: docsNeedRefresh,
    currentBranch,
    previousBranch: branchAwareness.previousBranch,
    switchedAt: branchAwareness.lastSwitchedAt,
  };
}

function normalizeConfiguredDocs(configuredDocs, options = {}) {
  const { fallbackToDefault = true } = options;
  const entries = Array.isArray(configuredDocs) ? configuredDocs : [];
  const normalized = [];
  const seenPaths = new Set();

  for (const entry of entries) {
    const normalizedEntry = normalizeDocEntry(entry);
    if (!normalizedEntry || seenPaths.has(normalizedEntry.path)) {
      continue;
    }

    seenPaths.add(normalizedEntry.path);
    normalized.push(normalizedEntry);
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return fallbackToDefault ? DEFAULT_DOCS.map((doc) => ({ ...doc })) : [];
}

function normalizeDocEntry(entry) {
  if (typeof entry === "string") {
    const pathValue = entry.trim();
    if (!pathValue) {
      return null;
    }

    return {
      path: pathValue,
      role: inferDocRole(pathValue),
    };
  }

  if (!entry || typeof entry !== "object" || typeof entry.path !== "string") {
    return null;
  }

  const pathValue = entry.path.trim();
  if (!pathValue) {
    return null;
  }

  return {
    path: pathValue,
    role: normalizeDocRole(entry.role) ?? inferDocRole(pathValue),
  };
}

function normalizeDocRole(role) {
  if (typeof role !== "string") {
    return null;
  }

  const normalized = role.trim();
  return normalized || null;
}

function inferDocRole(relativePath) {
  return DEFAULT_ROLE_BY_PATH.get(relativePath) ?? path.basename(relativePath, path.extname(relativePath)) ?? null;
}

function formatDocPromptLabel(doc) {
  return doc.role ? `${doc.relativePath} (${doc.role})` : doc.relativePath;
}

function formatDocStatusLabel(doc) {
  return doc.role ? `${doc.relativePath} [role: ${doc.role}]` : doc.relativePath;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function readMarkdownTitle(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function humanizeFileTitle(relativePath) {
  const fileName = path.basename(relativePath, path.extname(relativePath));
  return fileName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toBullets(items) {
  return items.filter(Boolean).map((item) => `- ${item}`);
}

function dedupeByKey(items, getKey) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function formatOptionalSuffix(isoTimestamp, label) {
  return isoTimestamp ? ` (${label} ${formatRelativeTimestamp(isoTimestamp)})` : "";
}

function formatBranchName(branchName) {
  return branchName || "unknown branch";
}

function formatDateOnly(isoTimestamp) {
  if (!isoTimestamp) {
    return "unknown-date";
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown-date";
  }

  return date.toISOString().slice(0, 10);
}

function formatRelativeTimestamp(isoTimestamp) {
  if (!isoTimestamp) {
    return "never";
  }

  const timestamp = new Date(isoTimestamp).getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return formatTimestamp(isoTimestamp);
}

function buildValidationSummaryLabel(validation) {
  const parts = [];
  if (validation.summary.branchSwitchWarnings > 0) {
    parts.push(`${validation.summary.branchSwitchWarnings} branch`);
  }
  if (validation.summary.missingDocs > 0) {
    parts.push(`${validation.summary.missingDocs} missing`);
  }
  if (validation.summary.staleDocs > 0) {
    parts.push(`${validation.summary.staleDocs} review`);
  }
  if (validation.summary.placeholderDocs > 0) {
    parts.push(`${validation.summary.placeholderDocs} starter`);
  }
  if (validation.summary.malformedDocs > 0) {
    parts.push(`${validation.summary.malformedDocs} malformed`);
  }
  if (validation.readmeRecommendation?.shouldReview) {
    parts.push("README review");
  }
  return parts.join(", ");
}

function parseTimestamp(isoTimestamp) {
  if (!isoTimestamp) {
    return null;
  }

  const timestamp = new Date(isoTimestamp).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

module.exports = {
  activate,
  deactivate,
};
