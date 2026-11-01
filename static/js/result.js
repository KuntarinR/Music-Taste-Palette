/* The result cards, in story order: what we heard (emotions) -> your aesthetic -> by the numbers -> songs.
   The cards come from one <template> and can be filled anywhere with Result.fill(root, result):
   on the result page they sit in a row that slides left and right, and on the aura page
   they come back as a stack ("See my stats"). The aesthetic card takes the user's aesthetic colour. */

const Result = (() => {
  // Each card has its own colour; the aesthetic card (2nd) uses the aesthetic's colour (null here)
  const CARD_COLOURS = ["#F7CBDE", null, "#F4B9A4", "#EAF7B0"];          // soft pastels

  let track = null;
  let current = 0;                   // index of the card in the middle

  /* A fresh copy of the 4 cards from the template */
  function makeCards() {
    return document.getElementById("result-cards").content.cloneNode(true);
  }

  const part = (root, name) => root.querySelector(`[data-part="${name}"]`);

  function init() {
    track = document.getElementById("cards-track");
    track.prepend(makeCards());                       // the 4 result cards, then the teaser card
    track.addEventListener("scroll", () => requestAnimationFrame(updateActiveCard), { passive: true });
    App.enableDragScroll(track, () => goToCard(current));   // settle on the nearest card
    enableClickToSlide();
    renderDots();
  }

  /* ---------- filling in the cards ---------- */

  /* Fill the 4 cards inside root with a result from Python. root must be on screen (some pictures measure it). */
  function fill(root, result) {
    root.querySelectorAll(".result-card").forEach((card, index) => {
      const colour = CARD_COLOURS[index] || result.aesthetic.colour;
      card.style.setProperty("--card-accent", colour);
      card.style.setProperty("--card-accent-text", Aesthetics.textColour(colour));
    });
    part(root, "kicker").textContent = `${result.name}, regardless of the rhythm, just from your lyrics… have you noticed that you might be`;
    part(root, "name").textContent = result.aesthetic.name;
    let match = `${result.aesthetic.percent}% match`;
    if (result.hybrid) match += ` · with a touch of ${result.hybrid.name} (${result.hybrid.percent}%)`;
    part(root, "match").textContent = match;
    part(root, "tagline").textContent = result.aesthetic.tagline;
    part(root, "description").textContent = result.aesthetic.description;

    showHeard(root, result);
    showRanking(root, result.ranking);
    showSongs(root, result.songs);
    showNumbers(root, result);
  }

  function show(result) {
    const screen = document.getElementById("screen-result");
    fill(track, result);

    // Start at the first card, then play the slow entrance (fade in, cards slide in from the right)
    track.scrollLeft = 0;
    current = 0;
    updateActiveCard();
    screen.classList.remove("is-entering");
    void screen.offsetWidth;                     // restart the animation every time
    screen.classList.add("is-entering");
    startTeaser();
  }

  /* Card 1: the strongest emotion as a big number, then the lyrics tapestry */
  function showHeard(root, result) {
    const [emotion, percent] = result.top_emotions[0];
    part(root, "hero-percent").textContent = `${percent}%`;
    part(root, "hero-emotion").textContent = emotion.replace("_", " ");
    Viz.tapestry(part(root, "tapestry"), part(root, "tapestry-legend"), result.word_map, result.top_emotions);
  }

  /* Card 2: the orbit, plus the full ranking written out (so names never rely on colour) */
  function showRanking(root, ranking) {
    Viz.orbit(part(root, "orbit"), ranking);
    const list = part(root, "ranking");
    list.innerHTML = "";
    ranking.forEach((aesthetic) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="orbit-ranking__dot" aria-hidden="true"></span><span></span><span></span>`;
      item.children[0].style.background = aesthetic.colour;
      item.children[0].textContent = Aesthetics.icon(aesthetic.key);
      item.children[0].style.color = Aesthetics.textColour(aesthetic.colour);
      item.children[1].textContent = aesthetic.name;
      item.title = `${aesthetic.name}: ${aesthetic.percent}%`;        // full name if it's cut short
      item.children[2].textContent = `${aesthetic.percent}%`;
      list.appendChild(item);
    });
  }

  function showSongs(root, songs) {
    const box = part(root, "songs");
    box.innerHTML = "";
    songs.forEach((song, index) => {
      const item = document.createElement("div");
      item.className = "song-item";
      item.innerHTML = `<span class="song-item__rank"></span>
        <span class="song-item__title"></span><span class="song-item__artist"></span>`;
      item.querySelector(".song-item__rank").textContent = index === 0 ? "Best match" : "Also try";
      item.querySelector(".song-item__title").textContent = song.title;
      item.querySelector(".song-item__artist").textContent = `${song.artist} · ${song.genre.replace("_", " ")}`;
      box.appendChild(item);
    });
  }

  /* ---------- card 3: by the numbers ---------- */

  function showNumbers(root, result) {
    // One hero number (words read), then three smaller ones
    const tiles = part(root, "stat-tiles");
    tiles.innerHTML = "";
    const [topWord, topCount] = result.top_word_counts[0] || ["-", 0];
    [
      [result.total_words.toLocaleString(), "words read"],
      [result.matched_words, "emotional words"],
      [`${result.coverage}%`, "carry emotion"],
      [`\u201C${topWord}\u201D \u00D7${topCount}`, "most found word"],
    ].forEach(([value, label], index) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile" + (index === 0 ? " stat-tile--hero" : "") + (index === 3 ? " stat-tile--wide" : "");
      tile.innerHTML = `<span class="stat-tile__value"></span><span class="stat-tile__label"></span>`;
      tile.querySelector(".stat-tile__value").textContent = value;
      tile.querySelector(".stat-tile__label").textContent = label;
      tiles.appendChild(tile);
    });
    Viz.staircase(part(root, "staircase"), part(root, "staircase-missing"), result.emotions);
  }

  /* ---------- sliding cards ---------- */

  function cards() {
    return [...track.querySelectorAll(".result-card")];
  }

  function goToCard(index) {
    const all = cards();
    const target = all[Math.max(0, Math.min(index, all.length - 1))];
    track.scrollTo({ left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2, behavior: "smooth" });
  }

  /* The card closest to the middle is "active": full size; the others shrink a little */
  function updateActiveCard() {
    const middle = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let closestDistance = Infinity;
    cards().forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
      if (distance < closestDistance) {
        closest = index;
        closestDistance = distance;
      }
    });
    current = closest;
    cards().forEach((card, index) => card.classList.toggle("is-active", index === current));
    document.querySelectorAll("#cards-dots .dot").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === current);
    });
  }

  function renderDots() {
    const dots = document.getElementById("cards-dots");
    cards().forEach((_, index) => {
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.setAttribute("aria-label", `Card ${index + 1}`);
      dot.addEventListener("click", () => goToCard(index));
      dots.appendChild(dot);
    });
  }

  /* The teaser card: a blurred glimpse of your real aura, until you open it (aura-preview.js draws it) */
  let teaser = null;

  function startTeaser() {
    if (!teaser) teaser = new AuraPreview(document.getElementById("teaser-canvas"));
    const feelings = App.player && App.player.aura.emotions.length ? App.player.aura.emotions : AuraPreview.SAMPLE;
    teaser.start(feelings);
  }

  function leave() {
    if (teaser) teaser.stop();
  }

  /* Click (or tap) a side card and it slides to the middle */
  function enableClickToSlide() {
    cards().forEach((card, index) => {
      card.addEventListener("click", (event) => {
        if (index === current) return;
        event.preventDefault();                // a side card (and its buttons) only comes to the middle
        event.stopImmediatePropagation();      // e.g. the teaser card doesn't open the aura page yet
        goToCard(index);
      }, true);
    });
  }

  return { init, show, leave, fill, makeCards };
})();
