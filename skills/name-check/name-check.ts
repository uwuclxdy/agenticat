#!/usr/bin/env bun
// name-check availability helper (companion to skills/name-check/SKILL.md).
//
// deterministic, keyless registry lookups only. the fuzzy web-collision axis
// ("is there a product/company with this name in the same space") is the agent's
// job via WebSearch; this script never scrapes a search engine.
//
// cross-platform: runs under bun on linux / mac / windows. zero deps (native fetch).
//
// usage/flags: run `bun name-check.ts --help` (see the HELP const below), or --list for registry ids.

const VERSION = "1.0.0";
const UA = `agenticat-name-check/${VERSION} (+https://github.com/uwuclxdy/agenticat)`;
const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_TLDS = ["com", "dev", "io", "app", "ai"];

type Status = "free" | "taken" | "unknown";
interface Result {
  status: Status;
  url?: string;
  note?: string;
}
type NameReport = Record<string, Result> & { domains?: Record<string, Result> };

// one GET with a hard timeout. follows redirects (rdap.org + github need it).
async function get(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctrl.signal, redirect: "follow" });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

// 200 -> taken (link), 404 -> free, anything else -> unknown with the code.
function httpResult(status: number, link: string): Result {
  if (status === 200) return { status: "taken", url: link };
  if (status === 404) return { status: "free" };
  return { status: "unknown", note: `http ${status}` };
}

// crates.io public sparse-index path. CDN-served, unthrottled, no auth, unlike
// the JSON API at /api/v1/crates/<n> which 503/500-rate-limits parallel fan-out.
// layout matches cargo's own index lookup: 1/2-char names get a length bucket,
// 3-char names go under first char, 4+ split first2 / chars3-4 / full.
function crateIndexPath(name: string): string {
  const n = name.toLowerCase();
  if (n.length <= 2) return `${n.length}/${n}`;
  if (n.length === 3) return `3/${n[0]}/${n}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n}`;
}

type Check = (name: string, timeoutMs: number) => Promise<Result>;
interface RegistryDef {
  id: string; // canonical id, also the short table header
  aliases: string[];
  link: (name: string) => string;
  check: Check;
}

// crates.io 403s without a UA (empirically confirmed); github doesn't, but the
// global UA in get() is harmless there and still needed for crates.io.
const REGISTRIES: RegistryDef[] = [
  {
    id: "npm",
    aliases: ["npmjs", "node"],
    link: (n) => `https://www.npmjs.com/package/${n}`,
    check: async (n, t) => httpResult((await get(`https://registry.npmjs.org/${encodeURI(n)}`, t)).status, `https://www.npmjs.com/package/${n}`),
  },
  {
    id: "pypi",
    aliases: ["python", "pip"],
    link: (n) => `https://pypi.org/project/${n}/`,
    check: async (n, t) => httpResult((await get(`https://pypi.org/pypi/${encodeURIComponent(n)}/json`, t)).status, `https://pypi.org/project/${n}/`),
  },
  {
    id: "crates",
    aliases: ["crate", "crates.io", "rust"],
    link: (n) => `https://crates.io/crates/${n}`,
    check: async (n, t) => httpResult((await get(`https://index.crates.io/${crateIndexPath(n)}`, t, { Accept: "text/plain" })).status, `https://crates.io/crates/${n}`),
  },
  {
    id: "rubygems",
    aliases: ["gem", "ruby"],
    link: (n) => `https://rubygems.org/gems/${n}`,
    check: async (n, t) => httpResult((await get(`https://rubygems.org/api/v1/gems/${encodeURIComponent(n)}.json`, t)).status, `https://rubygems.org/gems/${n}`),
  },
  {
    id: "hackage",
    aliases: ["haskell", "cabal"],
    link: (n) => `https://hackage.haskell.org/package/${n}`,
    check: async (n, t) => httpResult((await get(`https://hackage.haskell.org/package/${encodeURIComponent(n)}`, t, { Accept: "text/html" })).status, `https://hackage.haskell.org/package/${n}`),
  },
  {
    id: "go",
    aliases: ["golang"],
    link: (n) => `https://pkg.go.dev/${n}`,
    check: async (n, t) => httpResult((await get(`https://proxy.golang.org/${encodeURI(n)}/@latest`, t)).status, `https://pkg.go.dev/${n}`),
  },
  {
    id: "docker",
    aliases: ["dockerhub", "container"],
    // library/ is the official-images namespace; that is what a bare name maps to.
    link: (n) => `https://hub.docker.com/_/${n}`,
    check: async (n, t) => httpResult((await get(`https://hub.docker.com/v2/repositories/library/${encodeURIComponent(n)}/`, t)).status, `https://hub.docker.com/_/${n}`),
  },
  {
    id: "homebrew",
    aliases: ["brew", "homebrew-formula"],
    link: (n) => `https://formulae.brew.sh/formula/${n}`,
    check: async (n, t) => {
      try {
        const f = await get(`https://formulae.brew.sh/api/formula/${encodeURIComponent(n)}.json`, t);
        if (f.status === 200) return { status: "taken", url: `https://formulae.brew.sh/formula/${n}` };
        const c = await get(`https://formulae.brew.sh/api/cask/${encodeURIComponent(n)}.json`, t);
        if (c.status === 200) return { status: "taken", url: `https://formulae.brew.sh/cask/${n}`, note: "cask" };
        if (f.status === 404 && c.status === 404) return { status: "free" };
        return { status: "unknown", note: `formula ${f.status}, cask ${c.status}` };
      } catch (e) {
        return { status: "unknown", note: errMsg(e) };
      }
    },
  },
  {
    id: "aur",
    aliases: ["arch", "archlinux"],
    link: (n) => `https://aur.archlinux.org/packages/${n}`,
    check: async (n, t) => {
      try {
        const r = await get(`https://aur.archlinux.org/rpc/?v=5&type=info&arg=${encodeURIComponent(n)}`, t);
        if (r.status !== 200) return { status: "unknown", note: `http ${r.status}` };
        const count = JSON.parse(r.text).resultcount | 0;
        return count > 0 ? { status: "taken", url: `https://aur.archlinux.org/packages/${n}` } : { status: "free" };
      } catch (e) {
        return { status: "unknown", note: errMsg(e) };
      }
    },
  },
  {
    id: "nuget",
    aliases: ["dotnet", ".net"],
    link: (n) => `https://www.nuget.org/packages/${n}`,
    // search returns near-matches; only an exact (case-insensitive) id counts as taken.
    check: async (n, t) => {
      try {
        const r = await get(`https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(n)}&prerelease=true&take=5`, t);
        if (r.status !== 200) return { status: "unknown", note: `http ${r.status}` };
        const data = JSON.parse(r.text).data as { id?: string }[] | undefined;
        const exact = (data ?? []).some((p) => (p.id ?? "").toLowerCase() === n.toLowerCase());
        return exact ? { status: "taken", url: `https://www.nuget.org/packages/${n}` } : { status: "free" };
      } catch (e) {
        return { status: "unknown", note: errMsg(e) };
      }
    },
  },
  {
    id: "github",
    aliases: ["gh", "git"],
    link: (n) => `https://github.com/${n}`,
    // bare github.com/<name> 200 = a user/org/repo owns that handle; 404 = free.
    check: async (n, t) => httpResult((await get(`https://github.com/${encodeURIComponent(n)}`, t, { Accept: "text/html" })).status, `https://github.com/${n}`),
  },
];

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 80 ? m.slice(0, 80) + "…" : m;
}

// rdap 200 = registered. a 404 is usually free, but some ccTLD bootstraps lag
// (github.io reads free via rdap despite being live), so confirm a 404 with a
// DoH A-record lookup: answers = taken, NXDOMAIN = free.
async function checkDomain(name: string, tld: string, timeoutMs: number): Promise<Result> {
  const fqdn = `${name}.${tld}`;
  const url = `https://${fqdn}`;
  try {
    const r = await get(`https://rdap.org/domain/${encodeURIComponent(fqdn)}`, timeoutMs, { Accept: "application/rdap+json" });
    if (r.status === 200) return { status: "taken", url };
    if (r.status !== 404) return { status: "unknown", url, note: `rdap ${r.status}` };
  } catch (e) {
    return { status: "unknown", url, note: `rdap: ${errMsg(e)}` };
  }
  try {
    const d = await get(`https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=A`, timeoutMs);
    if (d.status !== 200) return { status: "free", url, note: `rdap 404, doh ${d.status}` };
    const j = JSON.parse(d.text) as { Status?: number; Answer?: unknown[] };
    if ((j.Answer ?? []).length > 0) return { status: "taken", url, note: "dns-confirmed (rdap lag)" };
    return { status: "free", url };
  } catch (e) {
    return { status: "free", url, note: `rdap 404, doh: ${errMsg(e)}` };
  }
}

function resolveRegistryIds(spec: string[] | undefined): string[] {
  if (!spec || spec.length === 0) return REGISTRIES.map((r) => r.id);
  const byAlias = new Map<string, string>();
  for (const r of REGISTRIES) {
    byAlias.set(r.id, r.id);
    for (const a of r.aliases) byAlias.set(a, r.id);
  }
  const out: string[] = [];
  for (const raw of spec.flatMap((s) => s.split(",")).map((s) => s.trim().toLowerCase())) {
    if (!raw || raw === "domain") continue; // "domain" is handled separately via includeDomain, not a registry id
    const id = byAlias.get(raw);
    if (id) {
      if (!out.includes(id)) out.push(id);
    } else if (!out.includes(raw)) {
      console.error(`name-check: unknown registry "${raw}" — see --list for known ids/aliases`);
      out.push(raw);
    }
  }
  return out;
}

async function checkName(name: string, ids: string[], includeDomain: boolean, tlds: string[], timeoutMs: number): Promise<NameReport> {
  const defById = new Map(REGISTRIES.map((r) => [r.id, r]));
  const entries = await Promise.all(
    ids.map(async (id) => {
      const def = defById.get(id);
      const result = def === undefined ? ({ status: "unknown", note: "unknown registry" } as Result) : await def.check(name, timeoutMs).catch((e): Result => ({ status: "unknown", note: errMsg(e) }));
      return [id, result] as const;
    }),
  );
  const report = Object.fromEntries(entries) as NameReport;
  if (includeDomain) {
    const domains = await Promise.all(tlds.map(async (tld) => [tld, await checkDomain(name, tld, timeoutMs)] as const));
    report.domains = Object.fromEntries(domains);
  }
  return report;
}

function printList(): void {
  console.log("registries (id | aliases):");
  for (const r of REGISTRIES) console.log(`  ${r.id.padEnd(9)} ${r.aliases.join(", ") || "-"}`);
  console.log(`  domain    (tlds: ${DEFAULT_TLDS.join(", ")})`);
}

const SYM: Record<Status, string> = { free: "✓", taken: "✗", unknown: "?" };

function renderTable(reports: Record<string, NameReport>, ids: string[], includeDomain: boolean): void {
  const nameW = Math.max(4, ...Object.keys(reports).map((n) => n.length));
  const colW = ids.map((id) => Math.max(id.length, 2));
  const head =
    "name".padEnd(nameW) +
    "  " +
    ids.map((id, i) => id.slice(0, Math.max(colW[i], id.length)).padEnd(Math.max(colW[i], id.length))).join(" ") +
    (includeDomain ? "  domains" : "");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const [name, report] of Object.entries(reports)) {
    let line = name.padEnd(nameW) + "  ";
    line += ids.map((id, i) => (SYM[report[id]?.status ?? "unknown"]).padEnd(Math.max(colW[i], id.length))).join(" ");
    if (includeDomain && report.domains) {
      const cells = Object.entries(report.domains).map(([tld, r]) => `${tld}${SYM[r.status]}`);
      line += "  " + (cells.join(" ").length > 22 ? cells.slice(0, 3).join(" ") + ` +${cells.length - 3}` : cells.join(" "));
    }
    console.log(line);
  }
  console.log("\nlegend: ✗ taken  ✓ free  ? unknown");

  const taken: string[] = [];
  for (const [name, report] of Object.entries(reports)) {
    for (const [id, r] of Object.entries(report)) {
      if (id === "domains") continue;
      if (r.status === "taken" || r.status === "unknown") taken.push(`  ${name.padEnd(nameW)}  ${id.padEnd(9)} ${r.status}${r.url ? "  " + r.url : ""}${r.note ? "  (" + r.note + ")" : ""}`);
    }
    if (report.domains) {
      for (const [tld, r] of Object.entries(report.domains)) {
        if (r.status === "taken") taken.push(`  ${name.padEnd(nameW)}  domain.${tld.padEnd(4)} taken  ${r.url}${r.note ? "  (" + r.note + ")" : ""}`);
      }
    }
  }
  if (taken.length > 0) {
    console.log("\ntaken / unknown:");
    console.log(taken.join("\n"));
  }
}

function parseArgs(argv: string[]): { names: string[]; registry: string[] | undefined; tld: string[] | undefined; timeout: number; table: boolean } {
  const names: string[] = [];
  let registry: string[] | undefined;
  let tld: string[] | undefined;
  let timeout = DEFAULT_TIMEOUT;
  let table = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.includes("=") ? a.split("=") : null;
    const key = eq ? eq[0] : a;
    const next = () => {
      if (eq) return eq[1];
      i++;
      return argv[i];
    };
    switch (key) {
      case "--registry":
        registry = (next() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--tld":
        tld = (next() ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        break;
      case "--timeout": {
        const n = Number(next());
        if (Number.isFinite(n) && n > 0) timeout = n * 1000;
        break;
      }
      case "--table":
        table = true;
        break;
      case "--list":
        printList();
        process.exit(0);
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(0);
      default:
        if (a.startsWith("-")) {
          console.error(`unknown option: ${a}\n${HELP}`);
          process.exit(2);
        }
        names.push(a);
    }
  }
  return { names, registry, tld, timeout, table };
}

const HELP = `name-check ${VERSION}: registry availability lookups.

usage:
  bun name-check.ts <name> [<name>...] [options]

options:
  --registry a,b,c   check only these ids/aliases (default: all). see --list.
  --tld com,io,...   domain tlds to probe (default: ${DEFAULT_TLDS.join(",")})
  --timeout <sec>    per-request timeout (default ${DEFAULT_TIMEOUT / 1000})
  --table            human matrix (default: compact json)
  --list             list registry ids + aliases
  -h, --help

report only. never registers, publishes, or renames anything.`;

// bun exposes `process` as a global; declare the slice we touch so the file
// type-checks standalone (this repo ships no tsconfig / @types/node).
declare const process: { argv: string[]; exit(code?: number): never };
export {};

async function main(): Promise<void> {
  const { names, registry, tld, timeout, table } = parseArgs(process.argv.slice(2));
  if (names.length === 0) {
    console.error(`no names given.\n${HELP}`);
    process.exit(2);
  }
  const ids = resolveRegistryIds(registry);
  const includeDomain = registry === undefined || registry.some((r) => r === "domain");
  const tlds = tld && tld.length > 0 ? tld : DEFAULT_TLDS;
  const reports: Record<string, NameReport> = {};
  for (const name of names) reports[name] = await checkName(name, ids, includeDomain, tlds, timeout);

  if (table) renderTable(reports, ids, includeDomain);
  else console.log(JSON.stringify(reports, null, 2));
}

await main();
