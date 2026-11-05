/* Cloud Native Denmark — the run of show as a flat list of steps.
 *
 * Shared by the wall (stage.js) and the control page (control.js), so both
 * agree on what "step 7" is. A talk is two steps: walk-on, then live.
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
        walkin: cue.music === "preshow" ? "Pre-show · welcome ⇄ sponsors ⇄ team, energetic music" : "Walk-in · welcome ⇄ sponsors ⇄ team, calm music",
        countdown: `Countdown · ${cue.minutes ?? 5}:00${cue.loop ? " ⇄ sponsors" : ""}`,
        break: `${cue.eyebrow} · ${cue.headline ?? `Back at ${cue.until}`}${cue.loop ? ` ⇄ ${cue.loop.slice(1).join(" ⇄ ")}` : ""}`,
        pitch: `Sponsor pitch · ${cue.sponsor} · ${cue.minutes ?? 2}:00`,
        message: `${cue.eyebrow} · ${cue.headline}`,
        sponsors: "Sponsor wall",
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
    if (cue.scene === "pitch") return "The clock starts when the cue comes up.";
    if (cue.scene === "message") return cue.body ?? "";
    return "";
  }

  return { stepsFor, cuesFor, nextIn, describe, detail, namesOf };
})();
