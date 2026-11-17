/* Cloud Native Denmark — the run of show as a flat list of steps.
 *
 * Shared by the wall (stage.js) and the control page (control.js), so both
 * agree on what "step 7" is. A talk is two steps: walk-on, then live. A
 * sponsor pitch is two: the intro, with the clock held, then the clock running.
 * stage/serve.mjs counts steps the same way; keep them in step.
 */
window.CUES = (() => {
  const SHOW = window.SHOW;
  /** "A", "A & B", "A, B & C". */
  const namesOf = (talk) => {
    const n = talk.speakers.map((s) => s.name);
    return n.length > 2 ? `${n.slice(0, -1).join(", ")} & ${n.at(-1)}` : n.join(" & ");
  };

  /** The first talk in a room (its Sessionize name) starting at or after
   *  `time` on `day`, from the synced schedule. */
  const nextIn = (day, room, time) =>
    SHOW.talks[(SHOW.programme ?? []).find((p) => p.day === day && p.room === room && !p.service && p.start >= time)?.talk] ?? null;

  /** The run of show for a room: the main-stage wall, or the breakout screen. */
  const cuesFor = (day, room) => (room === "breakout" ? SHOW.days[day]?.breakout : SHOW.days[day]?.cues) ?? [];

  function stepsFor(day, room = "main") {
    const where = { day, room: SHOW.rooms?.[room]?.schedule ?? "Main stage" };
    return cuesFor(day, room).flatMap((cue, c) =>
      cue.scene === "talk"
        ? [
            ...(SHOW.clearBeforeWalkon ? [{ cue, c, state: "clear", ...where }] : []),
            { cue, c, state: "walkon", ...where },
            { cue, c, state: "live", ...where },
          ]
        : cue.scene === "pitch"
          ? [
              { cue, c, state: "intro", ...where },
              { cue, c, state: "running", ...where },
            ]
          : [{ cue, c, ...where }],
    );
  }

  /** One line for the cue list: what the wall shows at this step. */
  function describe(step) {
    const { cue, state } = step;
    if (cue.scene === "talk") {
      const t = SHOW.talks[cue.talk];
      return `${{ clear: "Clear", walkon: "Walk-on", live: "Live" }[state]} · ${namesOf(t)}`;
    }
    return (
      {
        walkin: `${cue.music === "preshow" ? "Pre-show" : "Walk-in"} · ${(cue.loop ?? ["walkin"]).map((n) => (n === "walkin" ? "welcome" : n)).join(" ⇄ ")}, ${cue.music === "preshow" ? "energetic" : "calm"} music`,
        countdown: `Countdown · ${cue.minutes ?? 5}:00${cue.loop ? " ⇄ sponsors" : ""}`,
        break: `${cue.eyebrow} · ${cue.headline ?? `Back at ${cue.until}`}${cue.loop ? ` ⇄ ${cue.loop.slice(1).join(" ⇄ ")}` : ""}`,
        pitch: `${state === "running" ? "Pitch clock" : "Sponsor pitch"} · ${cue.sponsor} · ${cue.minutes ?? 2}:00`,
        message: `${cue.eyebrow} · ${cue.headline}`,
        afterparty: `Afterparty${cue.loop ? ` ⇄ ${cue.loop.slice(1).map((n) => (n === "message" ? cue.headline : n)).join(" ⇄ ")}` : ""}, party music`,
        lyrics: `${cue.eyebrow ?? "Sing along"} · ${cue.headline ?? ""}`,
        sponsors: "Sponsor wall",
        community: "Community sponsors & partners",
      }[cue.scene] ?? cue.scene
    );
  }

  /** A second line with detail, for the control page's now / next panels. */
  function detail(step) {
    const { cue } = step;
    if (cue.scene === "talk" && step.state === "clear") return "Empty wall, no music. Next starts the walk-on.";
    if (cue.scene === "talk") return SHOW.talks[cue.talk].title;
    if (cue.scene === "countdown") return cue.title;
    if (cue.scene === "break") {
      const next = cue.next ? SHOW.talks[cue.next] : nextIn(step.day, step.room, cue.until);
      return next ? `Next: ${next.title}` : `Until ${cue.until}`;
    }
    if (cue.scene === "pitch" && step.state === "intro") return "Introduce the sponsor; the clock holds. Next starts it.";
    if (cue.scene === "pitch") return "The clock is running.";
    if (cue.scene === "message") return cue.body ?? "";
    if (cue.scene === "lyrics") return "The song starts from the top; the lines follow it.";
    if (cue.scene === "afterparty") return `${cue.party?.when ?? "Afterparty"} · starts on "The November Beat"`;
    return "";
  }

  return { stepsFor, cuesFor, nextIn, describe, detail, namesOf };
})();
