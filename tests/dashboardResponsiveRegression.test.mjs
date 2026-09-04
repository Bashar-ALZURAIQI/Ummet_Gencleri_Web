import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const adminDashboardPath = path.join(rootDir, 'src', 'pages', 'AdminDashboard.tsx');
const chartsPath = path.join(rootDir, 'src', 'components', 'Charts.tsx');
const sidebarLayoutPath = path.join(rootDir, 'src', 'components', 'SidebarLayout.tsx');

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('1. StatsTab root does not force horizontal overflow and uses w-full min-w-0', () => {
  const adminSrc = readSource(adminDashboardPath);
  const statsTabMatch = adminSrc.match(/function StatsTab\([\s\S]*?return \(\s*<div className="([^"]+)"/);
  assert.ok(statsTabMatch, 'StatsTab return root element must be found');
  const rootClasses = statsTabMatch[1];
  assert.ok(rootClasses.includes('w-full'), 'StatsTab root must include w-full');
  assert.ok(rootClasses.includes('min-w-0'), 'StatsTab root must include min-w-0');
  assert.ok(rootClasses.includes('max-w-full'), 'StatsTab root must include max-w-full');
});

test('2. analytics grid containers use w-full and min-w-0', () => {
  const adminSrc = readSource(adminDashboardPath);
  const statsTabBody = adminSrc.slice(adminSrc.indexOf('function StatsTab('), adminSrc.indexOf('/* ---------------- Suggestions & Feedback Tab'));

  // Multi-column analytics grid containers must be guarded with w-full and min-w-0
  assert.match(statsTabBody, /className="grid\s+w-full\s+min-w-0\s+gap-6\s+lg:grid-cols-3"/, '3-col analytics grid must have w-full and min-w-0');
  assert.match(statsTabBody, /className="grid\s+w-full\s+min-w-0\s+gap-6\s+lg:grid-cols-2"/, '2-col analytics grid must have w-full and min-w-0');
});

test('3. chart cards use min-w-0 and responsive padding', () => {
  const adminSrc = readSource(adminDashboardPath);
  const statsTabBody = adminSrc.slice(adminSrc.indexOf('function StatsTab('), adminSrc.indexOf('/* ---------------- Suggestions & Feedback Tab'));

  // Chart cards must have min-w-0 so child charts can shrink inside grid items
  assert.match(statsTabBody, /card\s+min-w-0\s+p-4\s+sm:p-6\s+lg:col-span-2/, 'Dual-series line chart card must have min-w-0 and responsive padding');
  assert.match(statsTabBody, /card\s+min-w-0\s+p-4\s+sm:p-6(?!\s+lg:col-span-2)/, 'Category and donut cards must have min-w-0');
});

test('4. chart wrappers use w-full and min-w-0', () => {
  const chartsSrc = readSource(chartsPath);

  // LineChart wrapper
  assert.match(chartsSrc, /export function LineChart[\s\S]*?return \(\s*<div className="w-full min-w-0 max-w-full"/, 'LineChart root wrapper must be w-full min-w-0 max-w-full');

  // BarChart flex container
  assert.match(chartsSrc, /export default function BarChart[\s\S]*?className="flex w-full min-w-0 items-end justify-between/, 'BarChart container must be flex w-full min-w-0');
});

test('5. SVG and chart components can shrink within parent', () => {
  const chartsSrc = readSource(chartsPath);

  // LineChart SVG has preserveAspectRatio and is fluid
  assert.match(chartsSrc, /<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full/);

  // DonutChart SVG shrink-0 with responsive container
  assert.match(chartsSrc, /export function DonutChart[\s\S]*?className="flex w-full min-w-0 flex-col items-center/, 'DonutChart container must be w-full min-w-0');
});

test('6. participation-by-category chart does not require fixed desktop width and bar columns use min-w-0', () => {
  const chartsSrc = readSource(chartsPath);

  // Each bar column in BarChart must have min-w-0
  assert.match(chartsSrc, /className="flex min-w-0 flex-1 flex-col items-center/, 'BarChart column must have min-w-0 to allow shrinking below text width');
});

test('7. long labels cannot force viewport wider in BarChart', () => {
  const chartsSrc = readSource(chartsPath);

  // Label span must have truncate or line-clamp-2 and text-center w-full
  assert.match(chartsSrc, /<span className="w-full text-center text-\[10px\][^"]*(truncate|line-clamp-2)[^"]*"[^>]*>\{d\.label\}<\/span>/, 'BarChart labels must be constrained with w-full text-center and truncate/line-clamp-2');
});

test('8. four stat cards collapse appropriately on small screens and use min-w-0', () => {
  const adminSrc = readSource(adminDashboardPath);
  const statsTabBody = adminSrc.slice(adminSrc.indexOf('function StatsTab('), adminSrc.indexOf('/* ---------------- Suggestions & Feedback Tab'));

  // Grid definition
  assert.match(statsTabBody, /grid gap-4 sm:grid-cols-2 lg:grid-cols-4/, 'Stat cards grid must use mobile-first single column collapsing');

  // Stat card item has min-w-0
  assert.match(statsTabBody, /className=\{`card min-w-0 p-5 \$\{affordance\.cursorClass\}`\}/, 'Stat cards must include min-w-0');
});

test('9. dual-series chart remains readable on small screens with wrapped legend and contained month labels', () => {
  const chartsSrc = readSource(chartsPath);

  // Legend wrapper must wrap on small viewports
  assert.match(chartsSrc, /flex flex-wrap items-center justify-end gap-2 sm:gap-4 text-xs/, 'LineChart legend must use flex-wrap');

  // Month labels wrapper must have min-w-0 and labels must not push width
  assert.match(chartsSrc, /<span key=\{i\} className="min-w-0 truncate text-center">\{lbl\}<\/span>/, 'LineChart xLabels must use min-w-0 truncate text-center');
});

test('10. donut/event distribution remains contained and legend uses min-w-0', () => {
  const chartsSrc = readSource(chartsPath);

  // Donut legend container
  assert.match(chartsSrc, /className="w-full min-w-0 space-y-2/, 'DonutChart legend container must have w-full min-w-0');
  // Donut legend item
  assert.match(chartsSrc, /className="flex min-w-0 items-center justify-between gap-2 text-sm"/, 'DonutChart legend row must have min-w-0');
});

test('11. latest suggestions and messages rows remain within mobile width with flex-1 min-w-0', () => {
  const adminSrc = readSource(adminDashboardPath);
  const statsTabBody = adminSrc.slice(adminSrc.indexOf('function StatsTab('), adminSrc.indexOf('/* ---------------- Suggestions & Feedback Tab'));

  // Contact message text container must have flex-1 min-w-0
  assert.match(statsTabBody, /<div className="min-w-0 flex-1">\s*<div className="truncate text-sm font-bold text-navy-900">\{m\?\.subject/, 'Contact message text block must be flex-1 min-w-0');
});

test('12. desktop breakpoints remain intact across StatsTab', () => {
  const adminSrc = readSource(adminDashboardPath);
  const statsTabBody = adminSrc.slice(adminSrc.indexOf('function StatsTab('), adminSrc.indexOf('/* ---------------- Suggestions & Feedback Tab'));

  // Ensure desktop classes exist
  assert.match(statsTabBody, /lg:grid-cols-4/);
  assert.match(statsTabBody, /lg:grid-cols-3/);
  assert.match(statsTabBody, /lg:grid-cols-2/);
  assert.match(statsTabBody, /lg:col-span-2/);
});

test('13. SidebarLayout is not modified', () => {
  const status = execSync('git status --porcelain src/components/SidebarLayout.tsx', { cwd: rootDir }).toString().trim();
  assert.equal(status, '', 'SidebarLayout.tsx must remain completely untouched');
});

test('14. no horizontal page overflow classes introduced in StatsTab or Charts', () => {
  const adminSrc = readSource(adminDashboardPath);
  const chartsSrc = readSource(chartsPath);
  const statsTabBody = adminSrc.slice(adminSrc.indexOf('function StatsTab('), adminSrc.indexOf('/* ---------------- Suggestions & Feedback Tab'));

  // Check that no forced desktop fixed min-widths exist
  assert.equal(/min-w-\[\d{3,4}px\]/.test(statsTabBody), false, 'StatsTab must not use fixed pixel min-widths');
  assert.equal(/min-w-\[\d{3,4}px\]/.test(chartsSrc), false, 'Charts must not use fixed pixel min-widths');
});
