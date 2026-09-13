const target = new URL(process.argv[2] || process.env.DEPLOYMENT_URL || "https://shooktoberfest.com");
const routes = ["/", "/leaderboard", "/tee-times", "/photos", "/hall-of-fame", "/score", "/register", "/login?next=/me", "/admin", "/admin/reset-scores"];
const failures = [];

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  const text = await response.text();
  return { response, text };
}

const home = await fetchText(new URL("/", target));
if (!home.response.ok) failures.push(`/ returned ${home.response.status}`);
if (!home.text.includes('class="simple-home"')) failures.push("/ is not rendering the locked simple-home markup");
if (!home.text.includes("Shooktoberfest") || !home.text.includes("Northwest Chicago")) failures.push("/ is missing locked homepage content");

const stylesheetPaths = [...home.text.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
if (!stylesheetPaths.length) failures.push("/ did not include a stylesheet");

const stylesheets = await Promise.all(stylesheetPaths.map(path => fetchText(new URL(path, target))));
for (const [index, stylesheet] of stylesheets.entries()) {
  if (!stylesheet.response.ok) failures.push(`${stylesheetPaths[index]} returned ${stylesheet.response.status}`);
}
const compiledCss = stylesheets.map(stylesheet => stylesheet.text).join("\n");
for (const selector of [".simple-home", ".simple-hero", ".simple-included", ".simple-timeline", ".menu-popout"]) {
  if (!compiledCss.includes(selector)) failures.push(`compiled CSS is missing ${selector}`);
}

for (const route of routes.slice(1)) {
  const { response, text } = await fetchText(new URL(route, target));
  if (!response.ok) failures.push(`${route} returned ${response.status}`);
  if (!text.includes("<main") || text.includes("Application error")) failures.push(`${route} did not render a valid page`);
}

if (failures.length) {
  console.error(`\nDEPLOYMENT DESIGN CHECK FAILED for ${target.origin}\n`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Deployment design check passed for ${target.origin}: locked markup, compiled CSS, and ${routes.length} routes are present.`);
