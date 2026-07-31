/* ==========================================================================
   CONTACT  ·  contact.html
   --------------------------------------------------------------------------
   Two ways to reach the same address, because people differ: a form for
   someone with a brief to describe, and a one-click copy for someone who
   would rather write from their own mail client.

   THE FORM POSTS WITHOUT LEAVING THE PAGE
   A plain <form action="…"> works and needs no JavaScript, but it navigates
   away to the service's own thank-you page — the visitor leaves the site at
   the exact moment they decided to stay. Posting with fetch keeps them here
   and lets the button report what actually happened.

   The markup keeps `action` and `method` anyway, so if this module fails to
   load the form still submits the old way. Degraded, not broken.

   IT ALWAYS WORKS, EVEN WITH NO SERVICE AT ALL

   A form that posts to a third party has a dependency, and dependencies fail:
   the endpoint can be mistyped, the account can lapse, the free tier can run
   out mid-month. None of that should ever cost a message.

   So every failure path ends in the same place — a `mailto:` built from what
   the visitor typed, offered as one click. It needs no account, no key and no
   network, it cannot 404, and the words they already wrote are carried into
   it rather than lost. The hosted service is the convenience; this is the
   floor underneath it.

   That also means the form is usable before any endpoint exists, which is
   what makes it safe to ship the page ahead of the Formspree setup.
   ========================================================================== */

/* The placeholder that ships in the markup. Anything containing this is not a
   real endpoint yet. */
import { t } from "./i18n.js?v=74";
import { initSelects } from "./select.js?v=74";

const UNSET = "YOUR_FORM_ID";

export function initContact(root) {
  if (!root) return null;

  initCopy(root);
  initForm(root);
  return true;
}

/* --- Copy the address ---------------------------------------------------- */
function initCopy(root) {
  const button = root.querySelector("[data-copy]");
  if (!button) return;

  const value = button.dataset.copy;
  const label = button.querySelector("[data-copy-label]") || button;
  const original = label.textContent;
  let reset = 0;

  button.addEventListener("click", async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      // Clipboard access is refused outside a secure context, and on an older
      // browser it does not exist at all. Selecting the text is the fallback
      // that always works — the visitor finishes the copy themselves.
      ok = selectFallback(button);
    }

    label.textContent = ok ? "Copied" : "Press Ctrl+C";
    button.classList.toggle("is-done", ok);

    clearTimeout(reset);
    reset = setTimeout(() => {
      label.textContent = original;
      button.classList.remove("is-done");
    }, 2000);
  });
}

/* --- Turning a rejection into a sentence ---------------------------------
 * Formspree answers a refused submission with JSON in one of two shapes:
 *
 *   { "errors": [ { "message": "…", "field": "email" }, … ] }   validation
 *   { "error": "…" }                                            everything else
 *
 * Both are read. The full response also goes to the console, because the
 * author debugging their own form needs more than the visitor does.
 */
async function describe(res) {
  let data = null;
  try { data = await res.clone().json(); } catch { /* not JSON */ }

  console.error("[contact] rejected:", res.status, data ?? await res.text().catch(() => ""));

  if (data) {
    if (Array.isArray(data.errors) && data.errors.length) {
      return data.errors
        .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
        .join(" · ");
    }
    if (data.error) return data.error;
  }

  // No usable body. The status code is still worth saying, because 404 means
  // "that form does not exist" and the author can act on that immediately.
  // 404 means the endpoint id is wrong. The visitor does not care why, but the
  // author reading their own console does — so the console line above carries
  // the detail and this stays plain.
  if (res.status === 404) return t("contact.unknownForm", "The mail service didn't recognise this form.");
  return `${t("contact.refused", "The mail service refused the message")} (${res.status}).`;
}

function selectFallback(button) {
  const target = document.querySelector("[data-copy-source]");
  if (!target) return false;
  const range = document.createRange();
  range.selectNodeContents(target);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return false;   // the visitor still has to press the keys
}

/* --- Asking for the company name only when there is one -------------------
 * Closed and un-required to begin with, and both flip together. That pairing
 * is the whole point: a required field nobody can see makes the form
 * impossible to submit and the browser cannot explain why, because it cannot
 * focus what it cannot show. One function owns both so they can never
 * disagree. */
function initConditional(form) {
  const wrap = form.querySelector("[data-company-field]");
  if (!wrap) return;

  const input = wrap.querySelector("input");
  const field = wrap.querySelector("[data-field]");

  function sync() {
    const isCompany = form.querySelector("[data-kind]:checked")?.value === "Empresa";

    // A class, not `hidden`: the element has to keep a box for its height to
    // be animatable at all, and display:none cannot be transitioned.
    wrap.classList.toggle("is-open", isCompany);

    // Which means it must be taken out of reach by hand. `inert` covers all of
    // it at once — not focusable, not clickable, not read out — where hiding
    // it visually alone would leave a field the keyboard still lands in and a
    // screen reader still announces, at zero height.
    wrap.inert = !isCompany;

    input.required = isCompany;
    if (!isCompany) {
      input.value = "";
      clearError(field);
    }
  }

  form.querySelectorAll("[data-kind]").forEach((radio) => {
    radio.addEventListener("change", sync);
  });
  sync();
}

/* --- Saying what is wrong, in words ---------------------------------------
 * The browser already knows a field is invalid and precisely why — that is
 * what the ValidityState flags are. What it is bad at is SAYING so: the native
 * bubble is the OS's styling on a dark page, it appears on one field at a
 * time, and it vanishes on the next keystroke.
 *
 * So the rules stay in the markup and are read from there. Nothing about which
 * fields are required or what shape they take is duplicated in this file, and
 * adding a field to the HTML needs no change here.
 */
function messageFor(input) {
  const v = input.validity;
  if (v.valid) return "";

  if (v.valueMissing) {
    return input.type === "email"
      ? t("contact.errEmailMissing", "I need an email to be able to reply.")
      : t("contact.errRequired", "This one is needed.");
  }

  // typeMismatch on an email, patternMismatch on the phone. Both are "you
  // typed something, but not the shape I can use" — and both are worth
  // explaining rather than just labelling as wrong.
  if (v.typeMismatch && input.type === "email") {
    return t("contact.errEmail", "That does not look like an email. Check the @ and what follows it.");
  }
  if (v.patternMismatch && input.type === "tel") {
    return t("contact.errPhone", "That does not look like a phone number. Digits, spaces and a leading + only.");
  }
  if (v.tooShort) {
    return t("contact.errShort", "A little more than that, please.");
  }

  return t("contact.errGeneric", "Something here is not quite right.");
}

function fieldOf(input) {
  return input.closest("[data-field]");
}

/* The element the message should be announced against. Normally the input
   itself — but where a native control has been replaced by a custom one (the
   dropdowns, see select.js) the real <select> is hidden from assistive
   technology, so attaching the error to it would be attaching it to nothing.
   The replacement marks itself with data-field-control. */
function controlOf(field) {
  return field.querySelector("[data-field-control]") || field.querySelector(".field__input");
}

function showError(field, message) {
  if (!field) return;
  const slot = field.querySelector("[data-field-error]");
  if (slot) slot.textContent = message;
  field.classList.add("is-invalid");
  const input = controlOf(field);
  // The message is tied to the input for anyone using a screen reader, which
  // otherwise reaches the field and hears nothing about why it was rejected.
  if (input && slot) {
    input.setAttribute("aria-invalid", "true");
    if (!slot.id) slot.id = "err-" + (input.id || input.name);
    input.setAttribute("aria-describedby", slot.id);
  }
}

function clearError(field) {
  if (!field) return;
  const slot = field.querySelector("[data-field-error]");
  if (slot) slot.textContent = "";
  field.classList.remove("is-invalid");
  const input = controlOf(field);
  if (input) {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
}

function checkField(input) {
  const field = fieldOf(input);
  const message = messageFor(input);
  if (message) showError(field, message);
  else clearError(field);
  return !message;
}

function initValidation(form) {
  // Taken over only now, at runtime. Left in the markup this attribute would
  // disable validation for a visitor whose JavaScript never arrives.
  form.noValidate = true;

  const inputs = () => [...form.elements].filter(
    (el) => el.willValidate && el.name && el.name !== "_gotcha"
  );

  for (const input of inputs()) {
    // On blur, not on every keystroke: telling someone their email is invalid
    // while they are still on the third character is both true and useless.
    input.addEventListener("blur", () => {
      if (input.value !== "" || input.required) checkField(input);
    });

    // Once a field is marked, correcting it clears the mark immediately —
    // waiting for another blur would leave the error showing over text that is
    // already fixed.
    input.addEventListener("input", () => {
      if (fieldOf(input)?.classList.contains("is-invalid")) checkField(input);
    });
    input.addEventListener("change", () => {
      if (fieldOf(input)?.classList.contains("is-invalid")) checkField(input);
    });
  }

  /* Returns true when everything passes. Checks EVERY field rather than
     stopping at the first: showing one error, then another after the fix, then
     a third, is the slowest possible way to fill in a form. */
  return function validate() {
    let firstBad = null;
    for (const input of inputs()) {
      if (!checkField(input) && !firstBad) firstBad = input;
    }
    if (firstBad) {
      firstBad.focus();
      firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return !firstBad;
  };
}

/* --- The form ------------------------------------------------------------ */
function initForm(root) {
  const form = root.querySelector("[data-contact-form]");
  if (!form) return;

  // Before validation: the dropdowns hand their error target over to the
  // custom button they build, and initValidation reads that.
  initSelects(form);
  initConditional(form);
  const validate = initValidation(form);

  const status = form.querySelector("[data-form-status]");
  const button = form.querySelector("[data-form-submit]");
  const idle = button ? button.textContent : "";

  // One source for the address: the copy button already carries it, so it is
  // never written twice and cannot fall out of step.
  const address = root.querySelector("[data-copy]")?.dataset.copy || "";

  /* `action` is an optional {label, href} appended as a real link. A dead end
     that offers no way forward is just an apology. */
  function say(message, state, action) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;        // CSS colours it from this

    if (action) {
      status.append(" ");
      const link = document.createElement("a");
      link.className = "contact__status-link";
      link.href = action.href;
      link.textContent = action.label;
      status.append(link);
    }
  }

  /* The floor. Composes a message in whatever mail client the visitor uses,
     already filled in with what they typed. encodeURIComponent throughout
     because a brief will contain line breaks, accents and ampersands, all of
     which would otherwise truncate the URL. */
  function mailtoFallback() {
    const data = new FormData(form);
    const name = (data.get("name") || "").toString().trim();
    const from = (data.get("email") || "").toString().trim();
    const body = (data.get("message") || "").toString().trim();

    const subject = name
      ? `${t("contact.mailSubject", "Portfolio enquiry")}: ${name}`
      : t("contact.mailSubject", "Portfolio enquiry");

    // Blank line, rule, then who it is from — so the mail arrives reading like
    // a letter rather than a dump of form fields.
    const lines = [body, "", "--", name, from].filter(Boolean);
    const text = lines.join("\n");

    return `mailto:${address}?subject=${encodeURIComponent(subject)}`
         + `&body=${encodeURIComponent(text)}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Before anything is sent. The status line stays empty here — every
    // problem is already named under the field it belongs to, and a second
    // "there are errors" message at the bottom only adds noise.
    if (!validate()) {
      say("", "");
      return;
    }

    const action = form.getAttribute("action") || "";
    if (!action || action.includes(UNSET)) {
      say(t("contact.notConnected", "The form isn't connected to a mail service yet."), "error",
          { label: t("contact.emailInstead", "Send it by email instead →"), href: mailtoFallback() });
      return;
    }

    if (button) { button.disabled = true; button.textContent = t("contact.sending", "Sending…"); }
    say("", "");

    try {
      const res = await fetch(action, {
        method: form.getAttribute("method") || "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },   // Formspree answers in JSON
      });

      if (res.ok) {
        form.reset();
        say(t("contact.sent", "Sent. I'll come back to you shortly."), "ok");
        return;
      }

      /* The request reached the service and it refused. That refusal has a
         reason, and hiding it behind a generic "didn't go through" leaves
         nobody — visitor or author — able to act on it. Formspree replies with
         JSON describing what was wrong, so it is read and shown. */
      say(await describe(res), "error",
          { label: t("contact.emailInstead", "Send it by email instead →"), href: mailtoFallback() });
    } catch (err) {
      // The request never completed: offline, DNS, a blocked request. Nothing
      // was submitted, and the typed message is still in the fields.
      console.error("[contact] request failed:", err);
      say(t("contact.unreachable", "Couldn't reach the mail service."), "error",
          { label: t("contact.emailInstead", "Send it by email instead →"), href: mailtoFallback() });
    } finally {
      if (button) { button.disabled = false; button.textContent = idle; }
    }
  });
}
