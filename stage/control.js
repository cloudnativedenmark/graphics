/* Cloud Native Denmark — stage wall control page.
 *
 * Sends commands to stage/serve.mjs and renders the state it pushes back. It
 * keeps no show state of its own: two control pages open at once (say, the
 * wall laptop and an iPad) always agree, because both only mirror the server.
 */
(() => {
  const SHOW = window.SHOW;
  const { describe, detail } = window.CUES;
  const params = new URLSearchParams(location.search);
  const KEY = params.get("key") ?? "";
  // Which screen this page drives: the main-stage wall, or the breakout
  // room's screen (?room=breakout), each with its own operator and state.
  const ROOM = SHOW.rooms?.[params.get("room")] ? params.get("room") : "main";
  const stepsFor = (day) => window.CUES.stepsFor(day, ROOM);
  const $ = (id) => document.getElementById(id);

  if (location.protocol === "file:") {
    document.body.innerHTML =
      '<p class="banner">The control page needs the show server. Run <code>node stage/serve.mjs</code> and open the URL it prints.</p>';
    return;
  }

  let state = null;

  function banner(text) {
    $("banner").hidden = !text;
    $("banner").textContent = text ?? "";
  }
  if (!KEY) banner("Read-only: this URL has no ?key=…, so the buttons are off. Use the control URL the server printed.");

  async function send(cmd) {
    if (!KEY) return;
    const r = await fetch("/command", { method: "POST", body: JSON.stringify({ ...cmd, room: ROOM, key: KEY }) }).catch(() => null);
    if (!r) banner("Could not reach the show server.");
    else if (r.status === 403) banner("Wrong key — the server was restarted with a new one. Use the URL it printed.");
    else banner(null);
  }

  /* ── static parts ─────────────────────────────────────────────────── */

  $("live").src = `index.html?preview&room=${ROOM}`;
  $("output-link").href = `index.html?output&room=${ROOM}`;
  $("output-link").target = `cnd-${ROOM}`;
  document.title = `CND 2026 · ${SHOW.rooms?.[ROOM]?.label ?? "Main stage"} control`;
  $("room").textContent = SHOW.rooms?.[ROOM]?.label ?? "Main stage";
  const size = SHOW.rooms?.[ROOM];
  if (size) document.documentElement.style.setProperty("--aspect", `${size.width} / ${size.height}`);
  // A 16:9 preview at full width would push the buttons off the screen.
  if (ROOM === "breakout") document.documentElement.style.setProperty("--preview-max", "760px");

  $("days").innerHTML = Object.entries(SHOW.days)
    .map(([day, d]) => `<button data-day="${day}" aria-pressed="false">${d.label}</button>`)
    .join("");

  document.querySelectorAll("button").forEach((b) => (b.disabled = !KEY));

  $("next").onclick = () => send({ cmd: "next" });
  $("prev").onclick = () => send({ cmd: "prev" });
  $("panic").onclick = () => send({ cmd: "panic" });
  $("music").onclick = () => send({ cmd: "music" });
  $("vog").onclick = () => send({ cmd: "vog" });
  $("guides").onclick = () => send({ cmd: "guides" });
  $("days").onclick = (e) => {
    const day = e.target.closest("[data-day]")?.dataset.day;
    // Switching day resets to its first cue, so it is confirmed like a jump.
    if (day && day !== state?.day && confirmTap(`day-${day}`, e.target.closest("button"))) send({ cmd: "day", day });
  };
  document.querySelectorAll("[data-minutes]").forEach((b) => (b.onclick = () => send({ cmd: "countdown", minutes: Number(b.dataset.minutes) })));
  document.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => send({ cmd: "countdown", add: Number(b.dataset.add) })));
  document.querySelector("[data-clear]").onclick = () => send({ cmd: "countdown", clear: true });

  /* Jumps are two taps: the first arms the target, the second goes. A stray
   * tap on the list must never change what a thousand people are looking at. */
  let armed = null;
  let armTimer = null;
  function confirmTap(id, el) {
    if (armed === id) {
      disarm();
      return true;
    }
    disarm();
    armed = id;
    el?.closest("li, button")?.setAttribute("data-armed", "");
    armTimer = setTimeout(disarm, 3000);
    return false;
  }
  function disarm() {
    armed = null;
    clearTimeout(armTimer);
    document.querySelectorAll("[data-armed]").forEach((n) => n.removeAttribute("data-armed"));
  }

  $("cues").onclick = (e) => {
    const li = e.target.closest("li");
    if (!li || !KEY) return;
    const i = Number(li.dataset.i);
    if (i === state?.i) return;
    if (confirmTap(`cue-${i}`, li)) send({ cmd: "goto", i });
  };

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowRight" || k === " " || k === "PageDown") send({ cmd: "next" });
    else if (k === "ArrowLeft" || k === "PageUp") send({ cmd: "prev" });
    else if (k === "b") send({ cmd: "panic" });
    else if (k === "m") send({ cmd: "music" });
    else if (k === "v") send({ cmd: "vog" });
    else return;
    e.preventDefault();
  });

  /* ── render ───────────────────────────────────────────────────────── */

  const pad = (n) => String(n).padStart(2, "0");
  const hms = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  function render() {
    if (!state) return;
    const steps = stepsFor(state.day);
    const now = steps[state.i];
    const next = steps[state.i + 1];

    $("now-what").textContent = state.panic ? "Panic still" : describe(now);
    $("now-more").textContent = state.panic ? `Under it: ${describe(now)}` : detail(now);
    $("next-what").textContent = next ? describe(next) : "End of the day";
    $("next-more").textContent = next ? detail(next) : "";

    const thumb = next ? `index.html?preview&still&room=${ROOM}&day=${state.day}&step=${state.i + 1}` : "about:blank";
    if ($("next-thumb").getAttribute("src") !== thumb) $("next-thumb").setAttribute("src", thumb);

    $("next").disabled = !KEY || !next;
    autoLive();
    $("prev").disabled = !KEY || state.i === 0;
    $("panic").setAttribute("aria-pressed", state.panic);
    $("music").setAttribute("aria-pressed", state.music);
    // Sound comes out of the wall window (?output) only, never this page.
    $("music").textContent = `Music ${state.music ? "on" : "off"} · plays from the wall`;
    $("vog").setAttribute("aria-pressed", state.vog !== false);
    $("vog").textContent = `Voice of god ${state.vog !== false ? "on" : "off"}`;
    $("guides").setAttribute("aria-pressed", state.guides);
    document.querySelectorAll("[data-day]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.day === state.day));

    $("countdown-state").textContent = state.countdownTo
      ? `Running — ends at ${hms(new Date(state.countdownTo))}.`
      : "Starts at 5:00 when a countdown cue comes up.";

    const list = $("cues");
    list.innerHTML = steps
      .map(
        (s, i) =>
          `<li data-i="${i}"${i === state.i ? " data-current" : ""}${i === state.i + 1 ? " data-next" : ""}>` +
          `<button${KEY ? "" : " disabled"}><span class="n">${i + 1}</span><span>${describe(s)}</span></button></li>`,
      )
      .join("");
    list.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" });
  }

  const events = new EventSource(`/events?room=${ROOM}`);
  events.onopen = () => {
    $("status").setAttribute("data-ok", "");
    $("status-text").textContent = "Connected";
  };
  events.onerror = () => {
    $("status").removeAttribute("data-ok");
    $("status-text").textContent = "Reconnecting…";
  };
  events.onmessage = (e) => {
    state = JSON.parse(e.data);
    render();
  };

  // While a walk-on runs, Next shows how long until it goes live by itself.
  function autoLive() {
    const left = state?.autoLiveAt ? Math.ceil((state.autoLiveAt - Date.now()) / 1000) : null;
    $("next").textContent = left > 0 ? `Go live now ▶ (auto in ${left}s)` : "Next ▶";
  }

  setInterval(() => {
    $("clock").textContent = hms(new Date());
    autoLive();
  }, 250);
})();
