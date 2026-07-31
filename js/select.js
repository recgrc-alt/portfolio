/* ==========================================================================
   SELECT  ·  a dropdown the page actually owns
   --------------------------------------------------------------------------
   WHY THIS EXISTS AT ALL
   A native <select> can be styled down to the last pixel — except for the one
   part anybody notices. The list that drops open is drawn by the operating
   system, not the page: its background, its typeface and that blue highlight
   row come from the OS, and no CSS reaches inside it. On a black page it
   arrives as somebody else's interface.

   So the list is rebuilt here. Everything else is not.

   THE NATIVE SELECT STAYS
   It is still in the form, still the element the browser validates, still what
   gets submitted, and still what `form.elements` iterates. It is only made
   invisible and hidden from assistive technology, while the custom button
   takes over as the thing people see and screen readers announce. Nothing
   downstream — validation, the mailto fallback, Formspree — knows any of this
   happened, and with JavaScript switched off the plain select is simply there,
   OS colours and all, working.

   KEYBOARD
   The whole point of a custom widget is that it is easy to build one that only
   works with a mouse. Arrow keys move, Home/End jump, typing letters jumps to
   a matching option, Enter picks, Escape closes without changing anything.
   ========================================================================== */

const OPEN = "is-open";

export function initSelects(root = document) {
  return [...root.querySelectorAll("select[data-select]")].map(upgrade);
}

function upgrade(native) {
  // Belt and braces: never build twice over the same element.
  if (native.dataset.upgraded) return null;
  native.dataset.upgraded = "1";

  const wrap = document.createElement("div");
  wrap.className = "select";

  const button = document.createElement("button");
  button.type = "button";              // never submits the form
  button.className = "select__button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  // The message under the field is attached to whatever carries this, so the
  // error lands on the control people can actually see.
  button.setAttribute("data-field-control", "");

  const value = document.createElement("span");
  value.className = "select__value";
  button.append(value);

  const list = document.createElement("ul");
  list.className = "select__list";
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;

  // The wrapper takes the select's place and the select moves inside it, so
  // the three parts are one subtree. Left as a sibling, the absolutely
  // positioned native would resolve against some outer element instead of
  // this one, and `closest(".select")` from the control would find nothing.
  native.replaceWith(wrap);
  wrap.append(native, button, list);

  // Out of sight and out of the accessibility tree, but still in the form.
  native.classList.add("select__native");
  native.setAttribute("aria-hidden", "true");
  native.tabIndex = -1;

  /* The label belongs to the native select through `for`, which now points at
     something hidden. Naming the button from the same text keeps it announced. */
  const label = native.id
    ? document.querySelector(`label[for="${native.id}"]`)
    : null;
  if (label) {
    if (!label.id) label.id = `${native.id}-label`;
    button.setAttribute("aria-labelledby", `${label.id} ${button.id || (button.id = `${native.id}-btn`)}`);
  }

  let options = [];
  let active = -1;       // which row the keyboard is on
  let open = false;

  /* --- Building the rows from the real select --------------------------- */
  function build() {
    list.textContent = "";
    options = [...native.options].map((opt, i) => {
      const li = document.createElement("li");
      li.className = "select__option";
      li.setAttribute("role", "option");
      li.id = `${native.id || "sel"}-opt-${i}`;
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      // The empty-valued first entry is a prompt, not a choice.
      if (opt.value === "") li.classList.add("select__option--placeholder");
      li.addEventListener("click", () => choose(i));
      list.append(li);
      return li;
    });
    paint();
  }

  /* --- Reflecting the native select's state ----------------------------- */
  function paint() {
    const i = native.selectedIndex;
    const opt = native.options[i];
    value.textContent = opt ? opt.textContent : "";
    value.classList.toggle("is-placeholder", !opt || opt.value === "");
    options.forEach((li, n) => li.setAttribute("aria-selected", n === i ? "true" : "false"));
  }

  function choose(i) {
    native.selectedIndex = i;
    // Dispatched so validation and anything else listening reacts exactly as
    // it would to a real change. Without this the field would stay marked
    // invalid after being corrected.
    native.dispatchEvent(new Event("change", { bubbles: true }));
    paint();
    close();
    button.focus();
  }

  function setActive(i) {
    if (!options.length) return;
    active = Math.max(0, Math.min(options.length - 1, i));
    options.forEach((li, n) => li.classList.toggle("is-active", n === active));
    list.setAttribute("aria-activedescendant", options[active].id);
    options[active].scrollIntoView({ block: "nearest" });
  }

  /* --- Opening and closing ---------------------------------------------- */
  function openList() {
    if (open) return;
    open = true;
    wrap.classList.add(OPEN);
    button.setAttribute("aria-expanded", "true");
    setActive(native.selectedIndex < 0 ? 0 : native.selectedIndex);
    list.focus();
    requestAnimationFrame(() => document.addEventListener("pointerdown", onOutside));
  }

  function close() {
    if (!open) return;
    open = false;
    wrap.classList.remove(OPEN);
    button.setAttribute("aria-expanded", "false");
    list.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", onOutside);
  }

  function onOutside(event) {
    if (!wrap.contains(event.target)) close();
  }

  /* --- Keyboard ---------------------------------------------------------- */
  button.addEventListener("click", () => (open ? close() : openList()));
  button.addEventListener("keydown", (e) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  });

  let typed = "";
  let typedReset = 0;

  list.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive(active + 1); break;
      case "ArrowUp":   e.preventDefault(); setActive(active - 1); break;
      case "Home":      e.preventDefault(); setActive(0); break;
      case "End":       e.preventDefault(); setActive(options.length - 1); break;
      case "Enter":
      case " ":         e.preventDefault(); choose(active); break;
      case "Tab":       close(); break;
      case "Escape":
        e.preventDefault();
        close();
        button.focus();
        break;
      default:
        // Type-ahead. Letters accumulate for a second so "bra" reaches Branding
        // rather than jumping to B, then R, then A.
        if (e.key.length !== 1) return;
        clearTimeout(typedReset);
        typed += e.key.toLowerCase();
        typedReset = setTimeout(() => { typed = ""; }, 1000);
        const hit = options.findIndex((li) =>
          li.textContent.toLowerCase().startsWith(typed)
        );
        if (hit >= 0) setActive(hit);
    }
  });

  build();

  /* The options carry data-i18n, so the translator rewrites the NATIVE ones on
     a language switch and the copies here would be left in the old language.
     Rebuilt from the source of truth instead of translated twice. */
  document.addEventListener("languagechange", () => {
    // After the translator has had its turn on this tick.
    requestAnimationFrame(build);
  });

  return { build, close };
}
