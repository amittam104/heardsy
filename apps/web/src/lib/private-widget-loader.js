/* Heardsy Private Feedback Widget loader. Served as /private-widget.js; see
   docs/private-widget.md. Plain ES5-ish on purpose: it runs on pages we do
   not control, next to the public widget if both are installed. */
(function () {
  var w = window;
  var d = document;
  if (w.__heardsyPrivateWidget) return;
  w.__heardsyPrivateWidget = true;

  var script = d.currentScript || d.querySelector('script[src*="/private-widget.js"]');
  if (!script) return;
  var src = new URL(script.src, location.href);
  var origin = src.origin;
  var ds = script.dataset;
  var workspace = ds.workspace || src.searchParams.get("workspace");
  if (!workspace) {
    console.warn("Heardsy private widget: add data-workspace to the script tag.");
    return;
  }
  // A srcdoc preview has no location origin of its own; window.origin has it.
  var hostOrigin = w.origin && w.origin !== "null" ? w.origin : location.origin;
  var preview = ds.preview === "true" && hostOrigin === origin;
  var HEX = /^#[0-9a-f]{3,8}$/i;
  var MAX_METADATA = 8192;
  // Appearance, in rising priority: defaults, the workspace's saved settings
  // from /private-widget.json, data-* attributes, then
  // window.heardsyPrivate("config", { appearance: {...} }).
  var saved = {};
  var attrs = {
    theme: ds.theme,
    accent: ds.accent,
    launcher: ds.launcher === "false" ? "hidden" : ds.launcher === "true" ? "icon" : ds.launcher,
    launcherLabel: ds.launcherLabel,
    position: ds.position,
    size: ds.size,
  };
  var live = {};
  var VALID = {
    theme: /^(dark|light|auto)$/,
    accent: HEX,
    launcher: /^(icon|label|hidden)$/,
    launcherLabel: /^[^]{1,24}$/,
    position: /^bottom-(left|right)$/,
    size: /^(small|medium|large)$/,
  };
  var DEFAULTS = { theme: "dark", accent: "#6e8bff", launcher: "icon", launcherLabel: "Feedback", position: "bottom-right", size: "medium" };
  var SIZES = { small: [360, 560], medium: [420, 640], large: [520, 720] };
  var cfg = {};
  var light = false;
  var dark = w.matchMedia ? w.matchMedia("(prefers-color-scheme: dark)") : null;
  // What the app told us about the reporter. Reset clears all of it.
  var contact = null;
  var metadata = null;
  var canSubmit = true;
  var isOpen = false;
  var frame = null;
  var ready = false;
  var mounted = false;
  var busy = false;
  var opener = null;

  // Phosphor chat bubble and close, bold weight.
  var CHAT =
    "M120,128a16,16,0,1,1-16-16A16,16,0,0,1,120,128Zm32-16a16,16,0,1,0,16,16A16,16,0,0,0,152,112Zm84,16A108,108,0,0,1,78.77,224.15L46.34,235A20,20,0,0,1,21,209.66l10.81-32.43A108,108,0,1,1,236,128Zm-24,0A84,84,0,1,0,55.27,170.06a12,12,0,0,1,1,9.81l-9.93,29.79,29.79-9.93a12.1,12.1,0,0,1,3.8-.62,12,12,0,0,1,6,1.62A84,84,0,0,0,212,128Z";
  var CLOSE = "M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z";
  function svg(cls, path) {
    return '<svg class="' + cls + '" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="' + path + '"/></svg>';
  }

  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box}" +
    ".l{position:fixed;bottom:20px;right:20px;z-index:2147483001;width:var(--lh);height:var(--lh);padding:0;border:0;border-radius:999px;cursor:pointer;" +
    "background:var(--a);color:var(--ai);display:grid;place-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 6px 20px rgba(0,0,0,.24);" +
    "font:600 14px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.01em;transition:transform .15s ease-out;-webkit-tap-highlight-color:transparent}" +
    ".lt .l{right:auto;left:20px}" +
    ".l:hover{transform:translateY(-1px)}.l:active{transform:scale(.96)}" +
    ".l:focus-visible{outline:2px solid var(--a);outline-offset:3px}" +
    ".l svg{grid-area:1/1;width:24px;height:24px;transition:opacity .2s ease-out,transform .3s ease-out}" +
    ".l .x{width:20px;height:20px;opacity:0;transform:rotate(45deg)}" +
    ".l .t{display:none}" +
    ".pl .l{width:auto;display:flex;align-items:center;gap:8px;padding:0 18px 0 15px}" +
    ".pl .l svg{width:20px;height:20px}.pl .l .x{display:none}.pl .l .t{display:block}" +
    ".pl.o .l{width:var(--lh);padding:0;justify-content:center}.pl.o .l .c,.pl.o .l .t{display:none}.pl.o .l .x{display:block}" +
    ".nl .l{display:none}" +
    ".o .l{background:#161618;color:#ededf0;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(255,255,255,.08),0 6px 20px rgba(0,0,0,.28)}" +
    ".lg.o .l{background:#fff;color:#141416;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 6px 20px rgba(0,0,0,.12)}" +
    ".o .l .c{opacity:0;transform:rotate(-45deg) scale(.8)}.o .l .x{opacity:1;transform:none}" +
    // Small, Medium or Large, never bigger than the window allows.
    ".p{position:fixed;bottom:calc(var(--lh) + 32px);right:20px;z-index:2147483000;width:min(var(--pw),calc(100vw - 40px));height:min(var(--ph),calc(100vh - var(--lh) - 56px));" +
    "border-radius:14px;overflow:hidden;background:#0d0d0f;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 16px 48px rgba(0,0,0,.36);" +
    "opacity:0;visibility:hidden;pointer-events:none;transform:translateY(8px) scale(.98);transform-origin:100% 100%;" +
    "transition:transform .2s ease-in,opacity .15s ease-in,visibility 0s linear .2s}" +
    ".lt .p{right:auto;left:20px;transform-origin:0 100%}" +
    ".lg .p{background:#f7f5f0;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 16px 48px rgba(0,0,0,.16)}" +
    ".o .p{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:transform .25s ease-out,opacity .15s ease-out,visibility 0s}" +
    ".nl .p{bottom:20px;height:min(var(--ph),calc(100vh - 40px))}" +
    "iframe{display:block;width:100%;height:100%;border:0;background:#0d0d0f;color-scheme:dark}" +
    ".lg iframe{background:#f7f5f0;color-scheme:light}" +
    "@media (max-width:480px){.p,.o .p,.nl .p{inset:0;width:auto;height:auto;border-radius:0}.o .l{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.l,.l svg,.p,.o .p{transition:opacity .15s linear,visibility 0s linear .15s;transform:none}}";

  var host = d.createElement("div");
  host.setAttribute("data-heardsy-private-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
  var wrap = d.createElement("div");
  var style = d.createElement("style");
  style.textContent = css;
  var panel = d.createElement("div");
  panel.className = "p";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Send feedback");
  var launcher = d.createElement("button");
  launcher.type = "button";
  launcher.className = "l";
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = svg("c", CHAT) + svg("x", CLOSE);
  var label = d.createElement("span");
  label.className = "t";
  launcher.appendChild(label);
  wrap.appendChild(style);
  wrap.appendChild(panel);
  wrap.appendChild(launcher);
  root.appendChild(wrap);

  function pick(k) {
    var sources = [live, attrs, saved];
    for (var i = 0; i < 3; i++) {
      var v = sources[i][k];
      if (v != null && VALID[k].test(String(v))) return String(v);
    }
    return DEFAULTS[k];
  }

  function ink(hex) {
    var h = hex.slice(1);
    if (h.length < 6) h = h.replace(/./g, "$&$&");
    var n = parseInt(h.slice(0, 6), 16);
    return (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150 ? "#0d0d0f" : "#fff";
  }

  // Everything the frame shows that the host may override: the saved
  // wording and logo plus whatever appearance the app passed in.
  function appearance() {
    var out = {};
    for (var k in live) out[k] = live[k];
    out.theme = light ? "light" : "dark";
    out.accent = cfg.accent;
    return out;
  }

  function apply() {
    cfg = {};
    for (var k in VALID) cfg[k] = pick(k);
    light = cfg.theme === "light" || (cfg.theme === "auto" && !!dark && !dark.matches);
    var size = SIZES[cfg.size];
    var pill = cfg.launcher === "label";
    var s = wrap.style;
    s.setProperty("--a", cfg.accent);
    s.setProperty("--ai", ink(cfg.accent));
    s.setProperty("--lh", pill ? "44px" : "52px");
    s.setProperty("--pw", size[0] + "px");
    s.setProperty("--ph", size[1] + "px");
    wrap.classList.toggle("lt", cfg.position === "bottom-left");
    wrap.classList.toggle("lg", light);
    wrap.classList.toggle("nl", cfg.launcher === "hidden");
    wrap.classList.toggle("pl", pill);
    label.textContent = cfg.launcherLabel;
    launcher.setAttribute("aria-label", (isOpen ? "Close " : "Open ") + cfg.launcherLabel.toLowerCase());
    sync();
  }

  function post(msg) {
    if (frame && frame.contentWindow && ready) frame.contentWindow.postMessage(msg, origin);
  }

  function sync() {
    post({ type: "heardsy-private:config", contact: contact, metadata: metadata, canSubmit: canSubmit, appearance: appearance() });
  }

  function ensureFrame() {
    if (frame) return;
    frame = d.createElement("iframe");
    frame.title = "Send feedback";
    var p = new URLSearchParams({ workspace: workspace, host: hostOrigin, theme: light ? "light" : "dark", accent: cfg.accent });
    frame.src = origin + "/private-widget?" + p.toString();
    panel.appendChild(frame);
  }

  function setOpen(next) {
    if (!mounted) return;
    if (next) ensureFrame();
    if (next === isOpen) return;
    isOpen = next;
    wrap.classList.toggle("o", isOpen);
    launcher.setAttribute("aria-expanded", String(isOpen));
    launcher.setAttribute("aria-label", (isOpen ? "Close " : "Open ") + cfg.launcherLabel.toLowerCase());
    if (isOpen) {
      opener = d.activeElement !== host && d.activeElement !== d.body ? d.activeElement : null;
      post({ type: "heardsy-private:open" });
      if (ready) frame.focus({ preventScroll: true });
    } else if (d.activeElement === host) {
      if (cfg.launcher !== "hidden") launcher.focus();
      else if (opener && opener.isConnected && opener.focus) opener.focus();
      else host.blur();
    }
  }

  launcher.addEventListener("click", function () {
    setOpen(!isOpen);
  });
  launcher.addEventListener("pointerenter", function () {
    if (mounted) ensureFrame();
  });

  w.addEventListener("message", function (e) {
    if (e.origin !== origin || !frame || e.source !== frame.contentWindow) return;
    var m = e.data || {};
    if (m.type === "heardsy-private:ready") {
      ready = true;
      sync();
      if (isOpen) {
        post({ type: "heardsy-private:open" });
        frame.focus({ preventScroll: true });
      }
    } else if (m.type === "heardsy-private:close") {
      setOpen(false);
    } else if (m.type === "heardsy-private:busy") {
      busy = !!m.busy;
    } else if (m.type === "heardsy-private:sent" && typeof m.submissionId === "string") {
      try {
        w.dispatchEvent(new CustomEvent("heardsy-private:sent", { detail: { submissionId: m.submissionId } }));
      } catch (err) {
        /* old browsers: nothing listens anyway */
      }
    }
  });

  d.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen && !busy) setOpen(false);
  });

  d.addEventListener("pointerdown", function (e) {
    var t = e.target;
    if (!isOpen || busy || t === host || (t && t.closest && t.closest("[data-heardsy-private-open]"))) return;
    setOpen(false);
  });

  // Any element with data-heardsy-private-open opens the widget.
  d.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-heardsy-private-open]") : null;
    if (!t) return;
    e.preventDefault();
    setOpen(true);
  });

  if (dark && dark.addEventListener) {
    dark.addEventListener("change", function () {
      if (cfg.theme === "auto") apply();
    });
  }

  function plainObject(v) {
    return !!v && Object.prototype.toString.call(v) === "[object Object]";
  }

  function text(v, max) {
    return typeof v === "string" && v.length <= max ? v : "";
  }

  function configure(arg) {
    if (!plainObject(arg)) return;
    if ("contact" in arg) contact = plainObject(arg.contact) ? { name: text(arg.contact.name, 100), email: text(arg.contact.email, 254) } : null;
    if ("metadata" in arg) {
      var json = null;
      try {
        json = plainObject(arg.metadata) ? JSON.stringify(arg.metadata) : null;
      } catch (err) {
        json = null;
      }
      var size = json ? new Blob([json]).size : 0;
      if (arg.metadata != null && (!json || size > MAX_METADATA)) {
        console.warn("Heardsy private widget: metadata must be a plain object of at most 8 KB as JSON; it was not sent.");
        metadata = null;
      } else metadata = arg.metadata == null ? null : JSON.parse(json);
    }
    if ("canSubmit" in arg) canSubmit = arg.canSubmit !== false;
    if (plainObject(arg.appearance)) {
      var next = {};
      for (var k in arg.appearance) {
        var v = arg.appearance[k];
        if (k === "logoUrl") {
          if (v === false || (typeof v === "string" && /^https:\/\//.test(v))) next.logoUrl = v;
          else if (preview && typeof v === "string") {
            try {
              if (new URL(v, origin).origin === origin) next.logoUrl = v;
            } catch (err) { /* invalid preview URL */ }
          }
        } else if (typeof v === "string") next[k] = v;
      }
      live = next;
    }
    apply();
  }

  function reset() {
    busy = false;
    contact = null;
    metadata = null;
    canSubmit = true;
    post({ type: "heardsy-private:reset" });
    sync();
  }

  function api(cmd, arg) {
    if (cmd === "open") setOpen(true);
    else if (cmd === "close") setOpen(false);
    else if (cmd === "toggle") setOpen(!isOpen);
    else if (cmd === "config") configure(arg);
    else if (cmd === "reset") reset();
  }

  var queue = (w.heardsyPrivate && w.heardsyPrivate.q) || [];
  apply();

  function mount() {
    fetch(origin + "/private-widget.json?workspace=" + encodeURIComponent(workspace))
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (meta) {
        if (!meta || !meta.settings) {
          console.warn("Heardsy private widget: no inbox for workspace '" + workspace + "' at " + origin + ".");
          return;
        }
        saved = meta.settings;
        mounted = true;
        d.body.appendChild(host);
        apply();
        for (var i = 0; i < queue.length; i++) api.apply(null, queue[i]);
        queue = [];
        if (ds.openOnLoad != null && ds.openOnLoad !== "false") setOpen(true);
      });
  }

  // Commands before the config arrives wait for it, in order.
  w.heardsyPrivate = function () {
    if (mounted) api.apply(null, arguments);
    else queue.push(arguments);
  };

  if (d.body) mount();
  else d.addEventListener("DOMContentLoaded", mount);
})();
