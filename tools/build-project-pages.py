# -*- coding: utf-8 -*-
"""
Builds one static HTML page per project, at the site root: <id>.html

WHY
---
project.html is a single template that serves nineteen case studies through
?id=, and it builds all of its content with JavaScript from data/projects.*.json.
Google runs JavaScript and eventually sees that content. The crawlers behind
the AI assistants generally do not: measured on the live site, a project page
gives them 281 characters, which is the navigation and the footer.

So each project also gets its own file, with its own URL, its own <title> and
description, and the text of the case study already written into the HTML.

HOW IT STAYS HONEST
-------------------
The text baked in is the same text the page renders, taken from the same JSON.
It is not a second, different page written for robots: project-page.js calls
root.replaceChildren() when it renders, so the moment the JavaScript runs, the
plain version is replaced by the designed one. Same content, better clothes.
That is progressive enhancement, not cloaking.

WHY AT THE ROOT AND NOT IN A FOLDER
-----------------------------------
Every path in project.html is relative (css/, js/, assets/, vendor/). A file in
a subfolder would need all of them rewritten, including the import map, and the
import map is covered by a Content-Security-Policy hash: changing it by one
character without recomputing the hash stops all JavaScript on that page. At
the root, the template is copied with only the head tags and the <main>
touched, so the import map stays byte for byte identical and the hash keeps
working.

RUN IT
------
    python tools/build-project-pages.py

after changing any project text, and commit what it writes.
"""
import html
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://rogerioedgar.com"
TEMPLATE = os.path.join(ROOT, "project.html")
DATA = os.path.join(ROOT, "data", "projects.en.json")

# Files at the root that are not projects and must never be overwritten.
RESERVED = {"index", "work", "project", "contact", "404"}


def esc(t):
    return html.escape(t or "", quote=True)


def fallback_markup(p, cats):
    """The case study as plain semantic HTML, indented to sit inside <main>."""
    out = []
    add = out.append
    pad = "    "

    add(f'{pad}<article class="project-plain">')
    add(f"{pad}  <h1>{esc(p['title'])}</h1>")

    meta = []
    if p.get("year"):
        meta.append(str(p["year"]))
    if cats.get(p.get("category")):
        meta.append(cats[p["category"]])
    if p.get("role"):
        meta.append(p["role"])
    if meta:
        add(f"{pad}  <p>{esc(' &middot; '.join(meta))}</p>".replace("&amp;middot;", "&middot;"))
    if p.get("partners"):
        add(f"{pad}  <p>With {esc(p['partners'])}</p>")

    if p.get("description"):
        add(f"{pad}  <p>{esc(p['description'])}</p>")
    for par in p.get("body") or []:
        add(f"{pad}  <p>{esc(par)}</p>")

    for c in p.get("chapters") or []:
        title = (c.get("title") or "").strip()
        if not title:
            continue
        add(f"{pad}  <section>")
        add(f"{pad}    <h2>{esc(title)}</h2>")
        if c.get("sub"):
            add(f"{pad}    <p>{esc(c['sub'])}</p>")
        for par in c.get("body") or []:
            add(f"{pad}    <p>{esc(par)}</p>")
        add(f"{pad}  </section>")

    stack = p.get("techStack") or []
    if stack:
        add(f"{pad}  <p>Built with: {esc(', '.join(stack))}</p>")

    team = p.get("team") or []
    if team:
        add(f"{pad}  <section>")
        add(f"{pad}    <h2>Credits</h2>")
        add(f"{pad}    <ul>")
        for m in team:
            role = f" &ndash; {esc(m['role'])}" if m.get("role") else ""
            add(f"{pad}      <li>{esc(m.get('name', ''))}{role}</li>")
        add(f"{pad}    </ul>")
        add(f"{pad}  </section>")

    for link in p.get("links") or []:
        if link.get("url"):
            add(f'{pad}  <p><a href="{esc(link["url"])}" rel="noopener">'
                f'{esc(link.get("label", "Open the project"))}</a></p>')

    add(f'{pad}  <p><a href="work.html">All projects</a></p>')
    add(f"{pad}</article>")
    return "\n".join(out)


def build():
    tpl = io.open(TEMPLATE, encoding="utf-8", newline="").read()
    data = json.load(io.open(DATA, encoding="utf-8"))
    cats = {c["id"]: c["label"] for c in data.get("categories", [])}

    OLD_TITLE = "Project &middot; Rogério Edgar".replace("&middot;", "·")
    OLD_DESC = ("A case study by Rogério Edgar: how one project was actually built, "
                "what went wrong, and what came out of it.")

    for token, count in ((f"<title>{OLD_TITLE}</title>", 1), (OLD_DESC, 3),
                         ('<main class="content" data-project-page></main>', 1),
                         (f'href="{SITE}/project.html"', 1),
                         (f'content="{SITE}/project.html"', 1),
                         (f'content="{OLD_TITLE}"', 2)):
        if tpl.count(token) != count:
            sys.exit(f"template mudou: esperava {count}x {token!r}, "
                     f"encontrei {tpl.count(token)}")

    written = []
    for p in data["projects"]:
        pid = p["id"]
        if pid in RESERVED or not re.fullmatch(r"[a-z0-9-]+", pid):
            sys.exit(f"id de projeto inseguro para um ficheiro: {pid!r}")

        title = f"{p['title']} · Rogério Edgar"
        desc = (p.get("description") or OLD_DESC).strip()
        if len(desc) > 300:
            desc = desc[:297].rsplit(" ", 1)[0] + "..."
        url = f"{SITE}/{pid}.html"

        s = tpl
        s = s.replace(f"<title>{OLD_TITLE}</title>", f"<title>{esc(title)}</title>", 1)
        s = s.replace(OLD_DESC, esc(desc))                      # all four copies
        s = s.replace(f'content="{OLD_TITLE}"', f'content="{esc(title)}"')
        s = s.replace(f'href="{SITE}/project.html"', f'href="{url}"', 1)
        s = s.replace(f'content="{SITE}/project.html"', f'content="{url}"', 1)
        s = s.replace(
            '<main class="content" data-project-page></main>',
            f'<main class="content" data-project-page data-project="{pid}">\n'
            f"{fallback_markup(p, cats)}\n  </main>",
            1)

        out = os.path.join(ROOT, f"{pid}.html")
        io.open(out, "w", encoding="utf-8", newline="").write(s)
        written.append((f"{pid}.html", len(s)))

    return written


if __name__ == "__main__":
    for name, size in build():
        print(f"  {name:<28} {size/1024:6.1f} KB")
    print(f"\n{len(build())} paginas escritas na raiz do site")
