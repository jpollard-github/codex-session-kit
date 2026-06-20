const fs = require("fs");
const path = require("path");

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const readmePath = path.join(root, "README.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function isPublicGithubRepo(repository) {
  if (!repository) {
    return false;
  }

  const url = typeof repository === "string" ? repository : repository.url;
  return typeof url === "string" && /github\.com[:/][^/]+\/[^/]+/i.test(url);
}

function getReadmeImageSources(readme) {
  const matches = [...readme.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)];
  return matches.map((match) => match[1]);
}

function isHttpsUrl(value) {
  return /^https:\/\//i.test(value);
}

function isRelativePath(value) {
  return !/^(https?:)?\/\//i.test(value) && !value.startsWith("data:");
}

function main() {
  const pkg = readJson(packageJsonPath);
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : "";
  const errors = [];
  const warnings = [];

  if (pkg.publisher === "local-dev") {
    errors.push("package.json still uses publisher \"local-dev\". Set this to your real Marketplace publisher id before publishing.");
  }

  if (!pkg.icon) {
    errors.push("package.json is missing an icon field.");
  } else if (!exists(pkg.icon)) {
    errors.push(`package.json icon path does not exist: ${pkg.icon}`);
  } else if (path.extname(pkg.icon).toLowerCase() === ".svg") {
    errors.push("Marketplace publishing does not allow an SVG extension icon. Use a PNG instead.");
  }

  if (!pkg.displayName) {
    warnings.push("package.json is missing displayName. Marketplace listings are better with a clear displayName.");
  }

  if (!pkg.description) {
    warnings.push("package.json is missing description.");
  }

  if (!pkg.repository) {
    warnings.push("package.json is missing repository. This is strongly recommended for Marketplace publishing.");
  }

  if (!pkg.homepage) {
    warnings.push("package.json is missing homepage.");
  }

  if (!exists("LICENSE") && !exists("LICENSE.md") && !exists("LICENSE.txt")) {
    warnings.push("No LICENSE file found at the repo root. VS Code Marketplace presentation is better when a license file is included.");
  }

  if (!exists("CHANGELOG.md")) {
    warnings.push("No CHANGELOG.md found at the repo root.");
  }

  const readmeImages = getReadmeImageSources(readme);
  const relativeImages = readmeImages.filter(isRelativePath);
  const insecureImages = readmeImages.filter((src) => !isRelativePath(src) && !isHttpsUrl(src));

  if (insecureImages.length > 0) {
    errors.push(`README.md contains non-https image URLs: ${insecureImages.join(", ")}`);
  }

  if (relativeImages.length > 0 && !isPublicGithubRepo(pkg.repository)) {
    errors.push(
      "README.md contains relative image paths but package.json does not point to a public GitHub repository. " +
        "vsce needs a public GitHub repository or explicit base image URLs to rewrite relative README images for the Marketplace."
    );
  }

  if (errors.length > 0) {
    console.error("Publish preflight failed:\n");
    for (const error of errors) {
      console.error(`- ERROR: ${error}`);
    }
    if (warnings.length > 0) {
      console.error("\nWarnings:");
      for (const warning of warnings) {
        console.error(`- WARN: ${warning}`);
      }
    }
    process.exit(1);
  }

  console.log("Publish preflight passed.");
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`- WARN: ${warning}`);
    }
  }
}

main();
