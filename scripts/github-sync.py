#!/usr/bin/env python3
"""Keep this editor and its GitHub copy in step, using the version in src/version.ts.

  python3 scripts/github-sync.py status          # compare versions
  python3 scripts/github-sync.py push            # send this copy to GitHub (needs GITHUB_PERSONAL_ACCESS_TOKEN)
  python3 scripts/github-sync.py pull [--apply]  # bring the GitHub copy here (dry run unless --apply)

Repository metadata (.git), dependencies and .env files are never sent or overwritten.
"""
import base64, io, os, re, subprocess, sys, tarfile
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "bundlezone2223/veguto-editor-sync-code"
API = f"https://api.github.com/repos/{REPO}"
SKIP = (".git/", "node_modules/", ".jj/")
# Dashboard update records live only on GitHub; push keeps them and pull leaves them there.
KEEP_REMOTE = ("history/",)
TOKEN = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
H = {"Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {})}


def version_of(text):
    m = re.search(r'APP_VERSION\s*=\s*["\']([\d.]+)["\']', text or "")
    return m.group(1) if m else None


def cmp(a, b):
    pa, pb = [int(x) for x in a.split(".")], [int(x) for x in b.split(".")]
    n = max(len(pa), len(pb)); pa += [0] * (n - len(pa)); pb += [0] * (n - len(pb))
    return (pa > pb) - (pa < pb)


def local_version():
    return version_of(open(os.path.join(ROOT, "src/version.ts")).read())


def remote_version():
    r = requests.get(f"{API}/contents/src/version.ts", headers={**H, "Accept": "application/vnd.github.raw+json"})
    if r.status_code == 404: return None
    r.raise_for_status(); return version_of(r.text)


def local_files():
    out = subprocess.run(["rg", "--files", "--hidden", "-g", "!.git", "-g", "!node_modules", "-g", "!.env*", "-g", "!.jj"],
                         capture_output=True, text=True, cwd=ROOT).stdout.split()
    return [f for f in out if not f.startswith(SKIP)]


def status():
    lv, rv = local_version(), remote_version()
    state = "github-older" if rv is None else {0: "same", -1: "site-older", 1: "github-older"}[cmp(lv, rv)]
    print(f"site={lv} github={rv} -> {state}"); return state


def push(force=False):
    if not TOKEN: sys.exit("GITHUB_PERSONAL_ACCESS_TOKEN is missing")
    if status() == "site-older" and not force: sys.exit("GitHub is newer; pull first (or --force)")
    tree = []
    for f in local_files():
        b = requests.post(f"{API}/git/blobs", headers=H, json={"content": base64.b64encode(open(os.path.join(ROOT, f), "rb").read()).decode(), "encoding": "base64"})
        b.raise_for_status(); tree.append({"path": f, "mode": "100644", "type": "blob", "sha": b.json()["sha"]})
    ref = requests.get(f"{API}/git/ref/heads/main", headers=H)
    parents = [ref.json()["object"]["sha"]] if ref.ok else []
    if ref.ok:
        old = requests.get(f"{API}/git/trees/{parents[0]}?recursive=1", headers=H); old.raise_for_status()
        tree += [{"path": e["path"], "mode": e["mode"], "type": "blob", "sha": e["sha"]} for e in old.json()["tree"] if e["type"] == "blob" and e["path"].startswith(KEEP_REMOTE)]
    t = requests.post(f"{API}/git/trees", headers=H, json={"tree": tree}); t.raise_for_status()
    c = requests.post(f"{API}/git/commits", headers=H, json={"message": f"Veguto editor {local_version()}", "tree": t.json()["sha"], "parents": parents}); c.raise_for_status()
    sha = c.json()["sha"]
    r = requests.patch(f"{API}/git/refs/heads/main", headers=H, json={"sha": sha}) if ref.ok else requests.post(f"{API}/git/refs", headers=H, json={"ref": "refs/heads/main", "sha": sha})
    r.raise_for_status(); print(f"pushed {len(tree)} files as {local_version()}")


def pull(apply=False):
    r = requests.get(f"{API}/tarball/main", headers=H); r.raise_for_status()
    remote = {}
    with tarfile.open(fileobj=io.BytesIO(r.content)) as tar:
        for m in tar.getmembers():
            if not m.isfile(): continue
            path = m.name.split("/", 1)[1] if "/" in m.name else m.name
            if path.startswith(SKIP + KEEP_REMOTE) or os.path.basename(path).startswith(".env"): continue
            remote[path] = tar.extractfile(m).read()
    local = set(local_files())
    changed = [p for p, d in remote.items() if p not in local or open(os.path.join(ROOT, p), "rb").read() != d]
    removed = sorted(local - set(remote))
    print(f"github {version_of(remote.get('src/version.ts', b'').decode())}: {len(changed)} changed/new, {len(removed)} only here")
    for p in changed: print("  ~", p)
    for p in removed: print("  -", p)
    if not apply: print("dry run; add --apply to write"); return
    for p in changed:
        full = os.path.join(ROOT, p); os.makedirs(os.path.dirname(full), exist_ok=True)
        open(full, "wb").write(remote[p])
    for p in removed: os.remove(os.path.join(ROOT, p))
    print("applied")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    flags = sys.argv[2:]
    {"status": status, "push": lambda: push("--force" in flags), "pull": lambda: pull("--apply" in flags)}[cmd]()
