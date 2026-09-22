/* ==========================================================================
   PROJECT TEAM  ·  who else worked on it, and what it was made with
   --------------------------------------------------------------------------
   A narrow rail that sits beside the opening text of a case study, holding two
   short blocks: the people who worked on the project alongside him, and the
   toolkit it was built with.

   IT TOOK THE PLACE OF A PICTURE. This column used to hold a render — on The
   Treasure Within, a voxel capture of the galleon. A single decorative image
   beside the introduction was the weakest use of the most valuable column on
   the page: it repeated what the hero video already showed, and it answered
   none of the questions somebody actually opens a case study with. Who made
   this, and what with. Those two answers now live there instead.

   "BUILT WITH" MOVED, IT WAS NOT COPIED. There was already one further down
   the page, inside project-craft. Two lists of the same tools on one page is
   not emphasis, it is a page that has not decided; so the list was taken from
   there and rebuilt here, next to the credit it belongs with. The way into
   the live project now sits under the introduction, beside this rail, and
   project-craft survives only as the fallback for long process writing.

   AND THE MARKS ARE NOW INLINE. The old list fetched assets/icons/<tool>.svg,
   one request per tool, and drew each pill only once its icon arrived. The
   marks in tool-icons.js are the same logos held as data, which the work list
   has used all along — so this is six fewer requests on every project page,
   and the rail is complete on its first frame instead of assembling itself.

   Both blocks are optional. A project with no team and no stack builds
   nothing, and the section it belongs to falls back to a single column.
   ========================================================================== */

import { t } from "./i18n.js?v=289";
import { toolMark } from "./tool-icons.js?v=289";

/* The site's small-caps meta label. Borrowed BY NAME from the header rather
   than reinvented, because "the same style as Category and Year" is the
   requirement, and the surest way to keep two things identical is for there to
   be only one of them. */
const LABEL_CLASS = "project-head__label";

function block(labelText) {
  const box = document.createElement("div");
  box.className = "project-team__block";

  const label = document.createElement("h2");
  label.className = LABEL_CLASS;
  label.textContent = labelText;
  box.append(label);

  return box;
}

/* --- The people ----------------------------------------------------------
 * `team` is an array of { name, role }. An array and not a string, because a
 * string is what the old `partners` field was — "Daniel Costa (Assets 3D)" —
 * and a name welded to a role inside one line cannot be typeset as two
 * different things, cannot be read out as two facts, and cannot grow to a
 * second person without a parser.
 */
function people(team) {
  const box = block(t("project.team", "Team"));

  const list = document.createElement("ul");
  list.className = "project-team__people";

  for (const person of team) {
    if (!person || !person.name) continue;

    const li = document.createElement("li");
    li.className = "project-team__person";

    const name = document.createElement("span");
    name.className = "project-team__name";
    name.textContent = person.name;
    li.append(name);

    if (person.role) {
      const role = document.createElement("span");
      role.className = "project-team__role";
      /* THE BRACKETS ARE IN THE STYLESHEET, not here. They are punctuation
         doing a typographic job — "this is the subordinate half" — so they
         belong with the type, and keeping them out of the data means the role
         can be reused anywhere else without arriving pre-punctuated. */
      role.textContent = person.role;
      li.append(role);
    }

    list.append(li);
  }

  box.append(list);
  return list.children.length ? box : null;
}

/* --- The toolkit ---------------------------------------------------------
 * Mark on the left, name on the right, one per row, stacked. The row is a
 * flex line rather than a two-column grid on purpose: a grid would align every
 * name to the widest mark, and these marks are all the same width already, so
 * the grid would only add a rule that has to be kept true.
 */
function toolkit(stack) {
  const box = block(t("project.builtWith", "Built with"));

  const list = document.createElement("ul");
  list.className = "project-team__tools";

  for (const tool of stack) {
    const li = document.createElement("li");
    li.className = "project-team__tool";

    /* Null for anything with no mark. The row still builds — a tool that was
       used is worth naming whether or not a logo exists for it — and the
       stylesheet reserves the mark's width either way, so one unmarked tool
       cannot pull its own name out of the column the others form. */
    const mark = toolMark(tool);
    if (mark) li.append(mark);
    else li.classList.add("is-unmarked");

    const name = document.createElement("span");
    name.className = "project-team__toolname";
    name.textContent = tool;
    li.append(name);

    list.append(li);
  }

  box.append(list);
  return list.children.length ? box : null;
}

/**
 * @param {object} project the project record, already in one language
 * @returns {HTMLElement|null} the rail, or null when there is nothing to say
 */
export function buildTeamRail(project) {
  const team = Array.isArray(project.team) ? project.team : [];
  const stack = Array.isArray(project.techStack) ? project.techStack : [];

  const blocks = [
    team.length ? people(team) : null,
    stack.length ? toolkit(stack) : null,
  ].filter(Boolean);

  if (!blocks.length) return null;

  /* <aside>, because that is what this is: material related to the text beside
     it and not part of its argument. It gives the rail a landmark role, which
     is the only reason a reader on a screen reader can skip past it or jump
     straight to it. */
  const rail = document.createElement("aside");
  rail.className = "project-team";
  rail.append(...blocks);
  return rail;
}
