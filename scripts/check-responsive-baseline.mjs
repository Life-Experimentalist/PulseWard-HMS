import { readFileSync } from "node:fs";
import path from "node:path";

const portals = [
  {
    name: "admin-console",
    htmlPath: "apps/admin-console/index.html",
    cssPath: "apps/admin-console/src/styles.css",
  },
  {
    name: "clinician-portal",
    htmlPath: "apps/clinician-portal/index.html",
    cssPath: "apps/clinician-portal/src/styles.css",
  },
  {
    name: "operations-dashboard",
    htmlPath: "apps/operations-dashboard/index.html",
    cssPath: "apps/operations-dashboard/src/styles.css",
  },
  {
    name: "patient-portal",
    htmlPath: "apps/patient-portal/index.html",
    cssPath: "apps/patient-portal/src/styles.css",
  },
];

function readWorkspaceFile(relativePath) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function countMatches(source, regex) {
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}

const failures = [];

for (const portal of portals) {
  const html = readWorkspaceFile(portal.htmlPath);
  const css = readWorkspaceFile(portal.cssPath);

  const hasViewportMeta =
    /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width/i.test(html);
  const mediaQueryCount = countMatches(css, /@media\s*\(/g);
  const maxWidthMediaCount = countMatches(css, /@media\s*\(\s*max-width\s*:/g);

  if (!hasViewportMeta) {
    failures.push(`${portal.name}: missing responsive viewport meta in ${portal.htmlPath}`);
  }

  if (mediaQueryCount === 0) {
    failures.push(`${portal.name}: missing any media queries in ${portal.cssPath}`);
  }

  if (maxWidthMediaCount === 0) {
    failures.push(`${portal.name}: missing max-width media query in ${portal.cssPath}`);
  }

  console.log(
    `${portal.name}: viewport=${
      hasViewportMeta ? "ok" : "missing"
    }, mediaQueries=${mediaQueryCount}, maxWidthQueries=${maxWidthMediaCount}`
  );
}

if (failures.length > 0) {
  console.error("Responsive baseline check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Responsive baseline check passed for all web portals.");
