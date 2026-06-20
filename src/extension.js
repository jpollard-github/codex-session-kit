const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const DEFAULT_DOC_PATHS = [
  "docs/repo-summary.md",
  "docs/architecture.md",
  "docs/current-work.md",
  "docs/refactor-roadmap.md",
  "docs/decisions.md",
];

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

function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "codexSessionKit.showProjectMemoryStatus";
  context.subscriptions.push(statusBarItem);

  const projectMemoryViewProvider = new ProjectMemoryViewProvider();
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
    const existingCount = projectMemory.docs.filter((doc) => doc.exists).length;
    const totalCount = projectMemory.docs.length;
    statusBarItem.text = `$(book) Project Memory ${existingCount}/${totalCount}`;
    statusBarItem.tooltip = buildStatusTooltip(projectMemory);
    statusBarItem.show();
    projectMemoryViewProvider.refresh();
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

      const action = "Open Repo Summary";
      const message = `Project memory ready. Created ${result.createdCount} file${
        result.createdCount === 1 ? "" : "s"
      } and refreshed ${result.updatedCount} doc${result.updatedCount === 1 ? "" : "s"}.`;
      const choice = await vscode.window.showInformationMessage(message, action);

      if (choice === action) {
        const summaryPath = path.join(workspaceFolder.uri.fsPath, "docs/repo-summary.md");
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
      vscode.window.showInformationMessage(
        `Updated ${result.updatedCount} memory doc${result.updatedCount === 1 ? "" : "s"} from workspace signals.`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexSessionKit.validateMemoryDocs", async () => {
      const workspaceFolder = getPrimaryWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showWarningMessage("Open a folder or workspace before validating memory docs.");
        return;
      }

      const validation = await validateProjectMemory(workspaceFolder);
      await refreshStatusBar();

      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: buildValidationReport(validation),
      });
      await vscode.window.showTextDocument(document, { preview: true });

      if (validation.summary.issueCount === 0) {
        vscode.window.showInformationMessage("Project memory validation passed. No missing, stale, or placeholder issues found.");
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
      const validation = await validateResolvedProjectMemory(workspaceFolder, projectMemory);
      const lines = [
        `Config: ${projectMemory.configSource}`,
        `Last start prompt: ${formatTimestamp(projectMemory.state.lastStartPromptAt)}`,
        `Last finish prompt: ${formatTimestamp(projectMemory.state.lastFinishPromptAt)}`,
        `Validation issues: ${validation.summary.issueCount}`,
        "",
        ...projectMemory.docs.map(
          (doc) =>
            `${doc.exists ? "OK" : "MISSING"} ${doc.relativePath} - last refreshed: ${formatTimestamp(
              doc.lastRefreshedAt
            )}`
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
    const configBody = JSON.stringify({ docPaths: projectMemory.docPaths }, null, 2) + "\n";
    fs.writeFileSync(path.join(workspaceRoot, DEFAULT_CONFIG_PATH), configBody, "utf8");
  }

  for (const doc of projectMemory.docs) {
    if (doc.exists) {
      continue;
    }

    await ensureDirectory(path.dirname(doc.absolutePath));
    fs.writeFileSync(doc.absolutePath, buildInitialDocShell(doc.relativePath, workspaceFolder.name), "utf8");
    await setDocRefreshedAt(workspaceFolder, doc.relativePath, new Date().toISOString());
    createdFiles.push(doc.absolutePath);
  }

  const updateResult = await updateMemoryDocsNow(workspaceFolder);
  return {
    createdCount: createdFiles.length,
    updatedCount: updateResult.updatedCount,
  };
}

async function updateMemoryDocsNow(workspaceFolder) {
  const projectMemory = await resolveProjectMemory(workspaceFolder);
  const snapshot = await scanWorkspace(workspaceFolder, projectMemory);
  let updatedCount = 0;

  for (const doc of projectMemory.docs) {
    await ensureDirectory(path.dirname(doc.absolutePath));
    if (!fs.existsSync(doc.absolutePath)) {
      fs.writeFileSync(doc.absolutePath, buildInitialDocShell(doc.relativePath, workspaceFolder.name), "utf8");
    }

    const generatedContent = buildGeneratedDocContent(doc.relativePath, snapshot);
    upsertAutoSection(doc.absolutePath, generatedContent);
    await setDocRefreshedAt(workspaceFolder, doc.relativePath, new Date().toISOString());
    updatedCount += 1;
  }

  return { updatedCount };
}

async function resolveProjectMemory(workspaceFolder) {
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const extensionConfig = vscode.workspace.getConfiguration("codexSessionKit", workspaceFolder.uri);
  const preferWorkspaceConfig = extensionConfig.get("preferWorkspaceConfig", true);
  const fallbackDocPaths = extensionConfig.get("docPaths", DEFAULT_DOC_PATHS);
  const configPath = path.join(workspaceRoot, DEFAULT_CONFIG_PATH);
  const state = await readStateFile(workspaceFolder);

  let docPaths = fallbackDocPaths;
  let configSource = "Extension settings";

  if (preferWorkspaceConfig && fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (Array.isArray(parsed.docPaths) && parsed.docPaths.every((value) => typeof value === "string")) {
        docPaths = parsed.docPaths;
        configSource = ".vscode/ai-context.json";
      }
    } catch (error) {
      configSource = ".vscode/ai-context.json (invalid JSON, fell back to extension settings)";
    }
  }

  const uniqueDocPaths = Array.from(new Set(docPaths));
  const docs = uniqueDocPaths.map((relativePath) => {
    const absolutePath = path.join(workspaceRoot, relativePath);
    const stats = fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : null;
    const stateTimestamp = state.docs?.[relativePath]?.lastRefreshedAt;
    const content = stats ? fs.readFileSync(absolutePath, "utf8") : null;
    return {
      relativePath,
      absolutePath,
      exists: Boolean(stats),
      content,
      lastModifiedAt: stats?.mtime.toISOString() ?? null,
      lastRefreshedAt: stateTimestamp ?? stats?.mtime.toISOString() ?? null,
    };
  });

  return {
    configSource,
    docPaths: uniqueDocPaths,
    docs,
    state,
  };
}

function buildStartPrompt(docs) {
  const lines = [
    "Before doing anything, read:",
    ...docs.map((doc) => `- ${doc.relativePath}`),
    "Use those as the primary source of truth. Only inspect implementation files when needed.",
  ];

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
    "Update the relevant docs in /docs so future AI sessions understand the current state, architecture, decisions, and next work.",
    `Relevant project memory files: ${docs.map((doc) => doc.relativePath).join(", ")}.`,
    "Incorporate meaningful repo changes from both this chat session and any manual edits discovered during the folder scan.",
    "Only update the files that changed meaningfully.",
  ].join("\n");
}

function buildInitialDocShell(relativePath, workspaceName) {
  return [
    `# ${humanizeFileTitle(relativePath)}`,
    "",
    "These notes mix auto-generated repo facts with human-maintained context.",
    "",
    "## Human Notes",
    "- Add durable context here that should survive automatic refreshes.",
    "",
    `${AUTO_START}`,
    `> Auto-generated snapshot for ${workspaceName}. Run \`Project Memory: Update Memory Docs Now\` to refresh.`,
    `${AUTO_END}`,
    "",
  ].join("\n");
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
    .map((entry) => `${entry.relativePath} (${formatTimestamp(entry.mtime)})`);
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

function buildGeneratedDocContent(relativePath, snapshot) {
  const generatedAt = formatTimestamp(snapshot.now);
  const fileName = path.basename(relativePath);
  const header = `> Auto-generated snapshot. Refreshed ${generatedAt}. This section is managed by Codex Session Kit.`;

  const sectionMap = {
    "repo-summary.md": buildRepoSummarySnapshot(snapshot),
    "architecture.md": buildArchitectureSnapshot(snapshot),
    "current-work.md": buildCurrentWorkSnapshot(snapshot),
    "refactor-roadmap.md": buildRefactorRoadmapSnapshot(snapshot),
    "decisions.md": buildDecisionsSnapshot(snapshot),
  };

  const body = sectionMap[fileName] ?? buildGenericSnapshot(snapshot);
  return `${header}\n\n${body}`;
}

function buildRepoSummarySnapshot(snapshot) {
  return [
    "## Auto Snapshot",
    "",
    "### What this project appears to be",
    ...toBullets(buildProjectIdentity(snapshot)),
    "",
    "### Repo signals",
    ...toBullets([
      `Workspace: \`${snapshot.workspaceName}\``,
      snapshot.readmeTitle ? `README title: ${snapshot.readmeTitle}` : null,
      snapshot.packageFacts?.version ? `Version: \`${snapshot.packageFacts.version}\`` : null,
      snapshot.packageFacts?.main ? `Extension/main entry: \`${snapshot.packageFacts.main}\`` : null,
      `Tracked memory docs: ${snapshot.trackedDocs.map((item) => `\`${item}\``).join(", ")}`,
    ]),
    "",
    "### Key files and directories",
    ...toBullets([
      ...snapshot.topDirectories.slice(0, 8).map((item) => `Directory: \`${item}\``),
      ...snapshot.topFiles.slice(0, 6).map((item) => `File: \`${item}\``),
    ]),
    "",
    "### Package scripts",
    ...toBullets(snapshot.packageFacts?.scripts?.length ? snapshot.packageFacts.scripts.map((item) => `\`${item}\``) : ["No package scripts detected."]),
  ].join("\n");
}

function buildArchitectureSnapshot(snapshot) {
  return [
    "## Auto Snapshot",
    "",
    "### Top-level structure",
    ...toBullets(snapshot.topDirectories.length ? snapshot.topDirectories.slice(0, 12).map((item) => `\`${item}\``) : ["No top-level directories detected."]),
    "",
    "### File mix",
    ...toBullets(snapshot.extensionCounts.length ? snapshot.extensionCounts : ["No files detected."]),
    "",
    "### Likely integration points",
    ...toBullets(buildIntegrationPoints(snapshot)),
    "",
    "### Architectural notes from scan",
    ...toBullets(buildArchitectureNotes(snapshot)),
  ].join("\n");
}

function buildCurrentWorkSnapshot(snapshot) {
  return [
    "## Auto Snapshot",
    "",
    "### Current repo activity",
    ...toBullets([
      snapshot.gitFacts.branch ? `Active git branch: \`${snapshot.gitFacts.branch}\`` : "Git branch unavailable.",
      snapshot.gitFacts.clean ? "Working tree appears clean." : `Working tree has ${snapshot.gitFacts.changedFiles.length} changed file(s).`,
    ]),
    "",
    "### Changed files",
    ...toBullets(snapshot.gitFacts.changedFiles.length ? snapshot.gitFacts.changedFiles : ["No git changes detected."]),
    "",
    "### Open editors",
    ...toBullets(snapshot.openEditors.length ? snapshot.openEditors.map((item) => `\`${item}\``) : ["No visible editors detected."]),
    "",
    "### Recently modified files",
    ...toBullets(snapshot.recentFiles.length ? snapshot.recentFiles : ["No recent files detected."]),
  ].join("\n");
}

function buildRefactorRoadmapSnapshot(snapshot) {
  return [
    "## Auto Snapshot",
    "",
    "### Potential refactor signals",
    ...toBullets(buildRefactorSignals(snapshot)),
    "",
    "### Large code files",
    ...toBullets(snapshot.largeJsFiles.length ? snapshot.largeJsFiles : ["No unusually large JS/TS files detected from the scan threshold."]),
    "",
    "### Testing and maintenance gaps",
    ...toBullets([
      snapshot.hasTests ? "A test directory appears to exist." : "No obvious test directory detected.",
      snapshot.gitFacts.clean ? "Working tree is clean, which lowers short-term drift risk." : "There are local changes, so docs may need a refresh before handoff.",
    ]),
  ].join("\n");
}

function buildDecisionsSnapshot(snapshot) {
  return [
    "## Auto Snapshot",
    "",
    "### Durable facts worth confirming",
    ...toBullets([
      snapshot.packageFacts?.name ? `Package name: \`${snapshot.packageFacts.name}\`` : null,
      snapshot.packageFacts?.displayName ? `Display name: ${snapshot.packageFacts.displayName}` : null,
      snapshot.packageFacts?.description ? `Description: ${snapshot.packageFacts.description}` : null,
      snapshot.gitFacts.branch ? `Current branch during scan: \`${snapshot.gitFacts.branch}\`` : null,
    ]),
    "",
    "### Suggested human follow-up",
    ...toBullets([
      "Promote important implementation choices from current work into explicit decision log entries.",
      "Use this file for decisions and consequences that cannot be inferred safely from code scanning alone.",
    ]),
  ].join("\n");
}

function buildGenericSnapshot(snapshot) {
  return [
    "## Auto Snapshot",
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
    `Last start prompt: ${formatTimestamp(projectMemory.state.lastStartPromptAt)}`,
    `Last finish prompt: ${formatTimestamp(projectMemory.state.lastFinishPromptAt)}`,
    "",
    ...projectMemory.docs.map(
      (doc) => `${doc.exists ? "Exists" : "Missing"}: ${doc.relativePath} (${formatTimestamp(doc.lastRefreshedAt)})`
    ),
  ];
  return lines.join("\n");
}

async function validateProjectMemory(workspaceFolder) {
  const projectMemory = await resolveProjectMemory(workspaceFolder);
  return validateResolvedProjectMemory(workspaceFolder, projectMemory);
}

async function validateResolvedProjectMemory(workspaceFolder, projectMemory) {
  const snapshot = await scanWorkspace(workspaceFolder, projectMemory);
  const docs = projectMemory.docs.map((doc) => validateDoc(doc, snapshot));
  const issueCount = docs.reduce((count, doc) => count + doc.issues.length, 0);

  return {
    workspaceName: workspaceFolder.name,
    snapshot,
    docs,
    summary: {
      issueCount,
      docsWithIssues: docs.filter((doc) => doc.issues.length > 0).length,
      staleDocs: docs.filter((doc) => doc.flags.isStale).length,
      missingDocs: docs.filter((doc) => doc.flags.isMissing).length,
      placeholderDocs: docs.filter((doc) => doc.flags.isPlaceholderOnly).length,
      malformedDocs: docs.filter((doc) => doc.flags.hasMalformedManagedSection).length,
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

  if (hasAutoStart !== hasAutoEnd) {
    flags.hasMalformedManagedSection = true;
    issues.push({
      severity: "warning",
      kind: "malformed-managed-section",
      message: "Managed auto-generated markers are incomplete or malformed.",
    });
  }

  if (!hasAutoStart && !hasAutoEnd) {
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
  const placeholderPhrases = [
    "these notes mix auto-generated repo facts with human-maintained context.",
    "## human notes",
    "add durable context here that should survive automatic refreshes.",
  ];
  const hasOnlyPlaceholderText = placeholderPhrases.every((phrase) => normalized.includes(phrase));
  const withoutPlaceholder = placeholderPhrases.reduce((value, phrase) => value.replace(phrase, ""), normalized).trim();
  return hasOnlyPlaceholderText && withoutPlaceholder.length < 20;
}

function getDocStaleness(doc, snapshot) {
  const refreshedAt = parseTimestamp(doc.lastRefreshedAt);
  if (!refreshedAt) {
    return { isStale: true, reason: "Doc has never been refreshed." };
  }

  if (Date.now() - refreshedAt > STALE_DOC_DAYS * 24 * 60 * 60 * 1000) {
    return { isStale: true, reason: `Doc has not been refreshed in more than ${STALE_DOC_DAYS} days.` };
  }

  const newestRepoChange = getNewestRepoChangeTimestamp(snapshot);
  if (newestRepoChange && refreshedAt < newestRepoChange.timestamp) {
    return {
      isStale: true,
      reason: `Doc was last refreshed before newer repo changes in \`${newestRepoChange.relativePath}\`.`,
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
    `Checked: ${formatTimestamp(validation.snapshot.now)}`,
    `Issues found: ${validation.summary.issueCount}`,
    "",
    "## Summary",
    `- Missing docs: ${validation.summary.missingDocs}`,
    `- Stale docs: ${validation.summary.staleDocs}`,
    `- Placeholder-only docs: ${validation.summary.placeholderDocs}`,
    `- Malformed managed sections: ${validation.summary.malformedDocs}`,
    "",
  ];

  if (validation.summary.issueCount === 0) {
    lines.push("## Result", "", "- All tracked memory docs passed the current validation checks.");
    return lines.join("\n");
  }

  lines.push("## Findings", "");
  for (const doc of validation.docs) {
    if (doc.issues.length === 0) {
      continue;
    }
    lines.push(`### ${doc.relativePath}`);
    lines.push(`- Last refreshed: ${formatTimestamp(doc.lastRefreshedAt)}`);
    for (const issue of doc.issues) {
      lines.push(`- ${issue.severity.toUpperCase()}: ${issue.message}`);
    }
    lines.push("");
  }

  lines.push("## Guidance", "");
  lines.push("- Use `Project Memory: Update Memory Docs Now` to refresh managed sections.");
  lines.push("- Add or expand human notes when a doc still contains starter text.");
  lines.push("- Re-run validation after updating the docs.");
  return lines.join("\n");
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
      docs: {},
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      lastStartPromptAt: typeof parsed.lastStartPromptAt === "string" ? parsed.lastStartPromptAt : null,
      lastFinishPromptAt: typeof parsed.lastFinishPromptAt === "string" ? parsed.lastFinishPromptAt : null,
      docs: parsed.docs && typeof parsed.docs === "object" ? parsed.docs : {},
    };
  } catch (error) {
    return {
      lastStartPromptAt: null,
      lastFinishPromptAt: null,
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
  constructor() {
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

    const workspaceFolder = getPrimaryWorkspaceFolder();
    if (!workspaceFolder) {
      return [new vscode.TreeItem("Open a workspace to use Codex Session Kit", vscode.TreeItemCollapsibleState.None)];
    }

    const projectMemory = await resolveProjectMemory(workspaceFolder);
    const validation = await validateResolvedProjectMemory(workspaceFolder, projectMemory);
    const actions = [
      ...(validation.summary.issueCount > 0
        ? [
            createInfoItem(
              `Validation: ${validation.summary.issueCount} issue${validation.summary.issueCount === 1 ? "" : "s"}`,
              buildValidationSummaryLabel(validation),
              "warning"
            ),
          ]
        : [createInfoItem("Validation: Healthy", "No missing, stale, or placeholder issues detected", "check")]),
      createCommandItem(
        "Start Session From Project Memory",
        `Copy the start-session prompt${formatOptionalSuffix(projectMemory.state.lastStartPromptAt, "last used")}`,
        "codexSessionKit.startSessionFromProjectMemory",
        "play"
      ),
      createCommandItem(
        "Finish Session And Update Project Memory",
        `Copy the finish-session prompt${formatOptionalSuffix(projectMemory.state.lastFinishPromptAt, "last used")}`,
        "codexSessionKit.finishSessionAndUpdateProjectMemory",
        "check"
      ),
      createCommandItem(
        "Update Memory Docs Now",
        "Scan the workspace and refresh managed memory sections",
        "codexSessionKit.updateMemoryDocsNow",
        "sync"
      ),
      createCommandItem(
        "Initialize Project Memory",
        "Create any missing config and memory docs, then populate them",
        "codexSessionKit.initializeProjectMemoryDocs",
        "new-file"
      ),
      createCommandItem(
        "Show Project Memory Status",
        "Open a status summary for the configured memory docs",
        "codexSessionKit.showProjectMemoryStatus",
        "list-tree"
      ),
      createCommandItem(
        "Validate Memory Docs",
        "Check for missing, stale, malformed, or placeholder memory docs",
        "codexSessionKit.validateMemoryDocs",
        "pass"
      ),
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

function createInfoItem(label, description, iconId) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = description;
  item.iconPath = new vscode.ThemeIcon(iconId);
  return item;
}

function createDocItem(doc) {
  const item = new vscode.TreeItem(doc.relativePath, vscode.TreeItemCollapsibleState.None);
  item.description = doc.exists ? `updated ${formatRelativeTimestamp(doc.lastRefreshedAt)}` : "missing";
  item.tooltip = `${doc.absolutePath}\nLast refreshed: ${formatTimestamp(doc.lastRefreshedAt)}\nLast modified: ${formatTimestamp(
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function formatOptionalSuffix(isoTimestamp, label) {
  return isoTimestamp ? ` (${label} ${formatRelativeTimestamp(isoTimestamp)})` : "";
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
  if (validation.summary.missingDocs > 0) {
    parts.push(`${validation.summary.missingDocs} missing`);
  }
  if (validation.summary.staleDocs > 0) {
    parts.push(`${validation.summary.staleDocs} stale`);
  }
  if (validation.summary.placeholderDocs > 0) {
    parts.push(`${validation.summary.placeholderDocs} placeholder`);
  }
  if (validation.summary.malformedDocs > 0) {
    parts.push(`${validation.summary.malformedDocs} malformed`);
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
