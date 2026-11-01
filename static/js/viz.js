/* The result page's data pictures (all numbers come from Python; this file only draws them):
     tapestry   - card 1: the lyrics word by word, each emotional word highlighted in its emotion's colour
     orbit      - card 2: the 8 aesthetics as domes on an orbit, yours the big one in the middle
     staircase  - card 3: the emotions as stepped columns with a halftone texture
   Hover (or tap) a highlighted word, dome or column to see its details. */

const Viz = (() => {
  // Tapestry colours, in a fixed order: 1st, 2nd, 3rd emotion, then every other emotion.
  // Checked with a colour-blindness validator; the legend names each one, so colour is never alone.
  const TAPESTRY_COLOURS = ["#E8613C", "#8E6CE0", "#D9649F", "#C99A1A"];
  const PLAIN = "plain";
  const SVG_NS = "http://www.w3.org/2000/svg";

  const pretty = (emotion) => emotion.replace("_", " ");

  /* ---------- a small tooltip, shared by all three pictures ---------- */

  /* Any element inside box with a data-tip attribute shows that text on hover/tap */
  function enableTips(box) {
    let tip = box.querySelector(".viz-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "viz-tip";
      tip.hidden = true;
      box.appendChild(tip);
    }
    if (box.dataset.tips) return;            // listeners already added
    box.dataset.tips = "on";
    const showTip = (event) => {
      const target = event.target.closest("[data-tip]");
      if (!target || !box.contains(target)) {
        tip.hidden = true;
        return;
      }
      const area = box.getBoundingClientRect();
      const mark = target.getBoundingClientRect();
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      const left = mark.left - area.left + mark.width / 2;
      tip.style.left = `${Math.min(Math.max(left, tip.offsetWidth / 2), area.width - tip.offsetWidth / 2)}px`;
      tip.style.top = `${mark.top - area.top - 8}px`;
    };
    box.addEventListener("pointerover", showTip);
    box.addEventListener("pointerdown", showTip);
    box.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  /* The colour group of a word: 0, 1, 2 for the top 3 emotions, 3 for any other emotion, PLAIN for none */
  function groupOf(emotion, topEmotions) {
    if (!emotion) return PLAIN;
    const rank = topEmotions.findIndex(([top]) => top === emotion);
    return rank === -1 ? 3 : rank;
  }

  /* ---------- card 1: lyrics tapestry ---------- */

  /* words: [[word, emotion or null], ...] in reading order (from Python).
     topEmotions: [[emotion, percent], ...], the 1st, 2nd and 3rd emotions. */
  function tapestry(box, legend, words, topEmotions) {
    box.innerHTML = "";

    // The lyrics as running text: plain words in soft grey, emotional words highlighted in their colour
    // (dark text on a light tint, with a solid underline, so every word stays easy to read).
    // Long lyrics simply fade out at the bottom of the card; the legend still counts every word.
    const delay = Math.min(18, 1200 / Math.max(words.length, 1));   // the words appear in about 1.2s
    words.forEach(([word, emotion], index) => {
      const span = document.createElement("span");
      const group = groupOf(emotion, topEmotions);
      span.className = "lyric-word" + (group === PLAIN ? "" : " lyric-word--felt");
      if (group !== PLAIN) {
        span.style.setProperty("--felt", TAPESTRY_COLOURS[group]);
        span.dataset.tip = `${pretty(emotion)}`;
      }
      span.style.animationDelay = `${1.1 + (index * delay) / 1000}s`;
      span.textContent = word;
      box.append(span, " ");
    });
    box.classList.toggle("is-long", box.scrollHeight > box.clientHeight + 2);   // fade only if it's cut off
    enableTips(box.parentElement);

    // Legend: the 3 top emotions with their %, then "other feelings" and plain words (with counts)
    const counts = words.reduce((all, [, emotion]) => {
      const group = groupOf(emotion, topEmotions);
      all[group] = (all[group] || 0) + 1;
      return all;
    }, {});
    legend.innerHTML = "";
    const rows = topEmotions.map(([emotion, percent], rank) => [TAPESTRY_COLOURS[rank], pretty(emotion), `${percent}%`]);
    if (counts[3]) rows.push([TAPESTRY_COLOURS[3], "other feelings", `${counts[3]} word${counts[3] === 1 ? "" : "s"}`]);
    rows.push([null, "no feeling", `${counts[PLAIN] || 0} word${counts[PLAIN] === 1 ? "" : "s"}`]);
    rows.forEach(([colour, label, value]) => {
      const row = document.createElement("li");
      row.className = "tapestry-key";
      row.innerHTML = `<span class="tapestry-key__swatch"></span><span class="tapestry-key__label"></span>
        <span class="tapestry-key__value"></span>`;
      const swatch = row.querySelector(".tapestry-key__swatch");
      if (colour) swatch.style.background = colour;
      else swatch.classList.add("tapestry-key__swatch--plain");
      row.querySelector(".tapestry-key__label").textContent = label;
      row.querySelector(".tapestry-key__value").textContent = value;
      legend.appendChild(row);
    });
  }

  /* ---------- card 2: orbit of domes ---------- */

  // Where the other 7 aesthetics sit on the orbit (degrees; 90 = front, 270 = back),
  // in ranking order: 2nd place gets the most visible spot. None sit right behind your big dome.
  const ORBIT_ANGLES = [160, 20, 215, 325, 125, 55, 245];

  function svg(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  /* One dome: a half circle standing on a flat oval base, with a label pill above
     (or, for your big dome, the label written inside it) */
  function dome(aesthetic, x, y, radius, rank, label, labelInside = false) {
    const group = svg("g", { class: "dome", "data-tip": `${rank}. ${aesthetic.name}: ${aesthetic.percent}% match` });
    group.style.animationDelay = `${1.1 + rank * 0.12}s`;
    const base = radius * 0.3;
    group.append(
      svg("path", { d: `M${x - radius},${y} A${radius},${radius} 0 0 1 ${x + radius},${y}`
                     + ` A${radius},${base} 0 0 1 ${x - radius},${y}Z`,
                    fill: aesthetic.colour, class: "dome__body" }),
      svg("ellipse", { cx: x, cy: y, rx: radius, ry: base, fill: aesthetic.colour, class: "dome__base" }),
    );
    if (labelInside) {
      const text = svg("text", { x, y: y - radius * 0.38, class: "dome__label dome__label--inside" });
      text.style.fill = Aesthetics.textColour(aesthetic.colour);       // dark or white, whichever reads better
      text.textContent = label;
      group.append(text);
      return group;
    }
    // Label pill: icon + % (the full name is in the hover tip and the ranking list)
    const text = svg("text", { x, y: y - radius - 9, class: "dome__label" });
    text.textContent = label;
    const pillWidth = label.length * 7 + 16;
    group.append(
      svg("rect", { x: x - pillWidth / 2, y: y - radius - 22, width: pillWidth, height: 19, rx: 9.5, class: "dome__pill" }),
      text,
    );
    return group;
  }

  /* ranking: all 8 aesthetics with %, best first (from Python) */
  function orbit(box, ranking) {
    box.innerHTML = "";
    const W = 340, H = 250, cx = 170, cy = 150, rx = 150, ry = 58;
    const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
                               "aria-label": ranking.map((a) => `${a.name} ${a.percent}%`).join(", ") });
    chart.append(svg("ellipse", { cx, cy, rx, ry, class: "orbit__ring" }));

    const [you, ...others] = ranking;
    const lowest = others[others.length - 1].percent;
    const span = Math.max(others[0].percent - lowest, 1);
    const placed = others.map((aesthetic, index) => {
      const angle = (ORBIT_ANGLES[index] * Math.PI) / 180;
      const radius = 11 + 23 * ((aesthetic.percent - lowest) / span);   // bigger match, bigger dome
      return { aesthetic, rank: index + 2, radius, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });
    // Draw from back to front, with your big dome in between
    const back = placed.filter((d) => d.y < cy).sort((a, b) => a.y - b.y);
    const front = placed.filter((d) => d.y >= cy).sort((a, b) => a.y - b.y);
    const draw = (d) => chart.append(dome(d.aesthetic, d.x, d.y, d.radius, d.rank,
                                          `${Aesthetics.icon(d.aesthetic.key)} ${d.aesthetic.percent}%`));
    back.forEach(draw);
    chart.append(dome(you, cx, cy + 22, 74, 1, `${Aesthetics.icon(you.key)} ${you.percent}%`, true));
    front.forEach(draw);
    box.append(chart);
    enableTips(box);
  }

  /* ---------- card 3: emotion staircase ---------- */

  /* emotions: {emotion: percent} for all 14 (from Python). Shows the ones above 0%, largest first,
     each bar in its feeling's aura colour (families from Python, colours shared with aura.js). */
  function staircase(box, missing, emotions) {
    const families = App.config.emotion_families;
    box.innerHTML = "";
    const heard = Object.entries(emotions).filter(([, percent]) => percent > 0).sort((a, b) => b[1] - a[1]);
    const most = Math.max(heard.length ? heard[0][1] : 1, 1);
    box.style.setProperty("--steps", heard.length);
    heard.forEach(([emotion, percent], index) => {
      const step = document.createElement("div");
      step.className = "step";
      step.dataset.tip = `${pretty(emotion)}: ${percent}%`;
      step.innerHTML = `<span class="step__track"><span class="step__value"></span><span class="step__bar"></span></span>
        <span class="step__label"></span>`;
      step.querySelector(".step__value").textContent = percent;
      step.querySelector(".step__label").textContent = pretty(emotion);
      const bar = step.querySelector(".step__bar");
      bar.style.backgroundColor = AuraMap.PASTELS[families[emotion]];
      // The biggest fills the height (leaving 20px for the number on top)
      bar.style.height = `max(4px, calc((100% - 20px) * ${percent / most}))`;
      bar.style.animationDelay = `${1.2 + index * 0.08}s`;
      box.appendChild(step);
    });
    enableTips(box.parentElement);

    const notHeard = Object.keys(emotions).filter((emotion) => emotions[emotion] === 0).map(pretty);
    missing.textContent = notHeard.length ? `Not in these lyrics: ${notHeard.join(", ")}.` : "Every emotion showed up!";
  }

  return { tapestry, orbit, staircase };
})();
