import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { config } from "../../config.js";

const BLANK_TEMPLATE_NAME = "blank";
const EXCLUDED_ENTRIES = new Set(["node_modules", ".expo", ".git", ".DS_Store"]);
const SCAFFOLD_TIMEOUT_MS = 5 * 60 * 1000;

export interface TemplateSource {
  name: string;
  describe(): string;
  scaffold(destPath: string, projectName: string): Promise<void>;
}

function blankTemplate(): TemplateSource {
  return {
    name: BLANK_TEMPLATE_NAME,
    describe: () => "Boş Expo projesi (npx create-expo-app)",
    async scaffold(destPath, _projectName) {
      await execa("npx", ["create-expo-app", destPath, "--yes"], {
        timeout: SCAFFOLD_TIMEOUT_MS,
      });
    },
  };
}

function copyTemplate(name: string): TemplateSource {
  const sourceDir = path.join(config.templatesRoot, name);
  return {
    name,
    describe: () => `"${name}" base'inden kopyalanır`,
    async scaffold(destPath, projectName) {
      fs.cpSync(sourceDir, destPath, {
        recursive: true,
        filter: (src) => !EXCLUDED_ENTRIES.has(path.basename(src)),
      });

      const packageJsonPath = path.join(destPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        pkg.name = projectName;
        fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
      }

      await execa("npm", ["install"], { cwd: destPath, timeout: SCAFFOLD_TIMEOUT_MS });
    },
  };
}

/** Names of custom templates dropped into templates/ (each subfolder = one template). */
export function listCustomTemplateNames(): string[] {
  if (!fs.existsSync(config.templatesRoot)) return [];
  return fs
    .readdirSync(config.templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export function listAllTemplates(): TemplateSource[] {
  return [blankTemplate(), ...listCustomTemplateNames().map(copyTemplate)];
}

export function getTemplate(name: string): TemplateSource | undefined {
  if (name === BLANK_TEMPLATE_NAME) return blankTemplate();
  if (listCustomTemplateNames().includes(name)) return copyTemplate(name);
  return undefined;
}

/**
 * Picks a default when the user didn't specify one: the single custom template
 * if exactly one exists, otherwise the blank create-expo-app fallback.
 */
export function resolveDefaultTemplate(): TemplateSource {
  const custom = listCustomTemplateNames();
  if (custom.length === 1 && custom[0] !== undefined) return copyTemplate(custom[0]);
  return blankTemplate();
}
