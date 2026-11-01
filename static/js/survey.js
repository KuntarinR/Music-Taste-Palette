/* The survey: nickname -> 5 This-or-That questions -> genres.
   Questions, options and descriptions come from /api/config (data/survey.json). */

const Survey = (() => {
  // Sticker-style icons (white fill, black outline) drawn as small SVGs
  const SVG = (inner) =>
    `<svg viewBox="0 0 48 48" fill="#fff" stroke="#161616" stroke-width="2.6"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const HEART = "M24 41C10 31 4 24 4 16a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 8-6 15-20 25z";
  const ICONS = {
    new_gen: SVG('<path d="M27 4 10 27h13l-3 17 18-25H25z"/>'),
    oldies: SVG('<circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="11" fill="none"/>' +
                '<circle cx="24" cy="24" r="3.5" fill="#161616"/>'),
    heartbreak: SVG(`<path d="${HEART}"/><path d="M24 12l-4 9 7 6-5 9" fill="none"/>`),
    romantic: SVG(`<path d="${HEART}"/>`),
    main_character: SVG('<path d="M24 4l5.9 12.9L44 18.5 33.5 28l2.9 14L24 35l-12.4 7 2.9-14L4 18.5l14.1-1.6z"/>'),
    daydreamer: SVG('<path d="M14 36h22a8 8 0 0 0 0-16 12 12 0 0 0-23-2 9 9 0 0 0 1 18z"/>'),
    party: SVG('<path d="M18 34V12l20-4v22" fill="none"/><ellipse cx="13" cy="34" rx="5" ry="4"/>' +
               '<ellipse cx="33" cy="30" rx="5" ry="4"/>'),
    sunny: SVG('<circle cx="24" cy="24" r="9"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4" fill="none"/>'),
    unbothered: SVG('<rect x="5" y="18" width="16" height="12" rx="5"/><rect x="27" y="18" width="16" height="12" rx="5"/>' +
                    '<path d="M21 22h6M5 21 3 16M43 21l2-5" fill="none"/>'),
    manifesting: SVG('<path d="M22 6c2 12 6 16 18 18-12 2-16 6-18 18-2-12-6-16-18-18 12-2 16-6 18-18z"/>' +
                     '<path d="M39 4c.7 4 2 5.3 6 6-4 .7-5.3 2-6 6-.7-4-2-5.3-6-6 4-.7 5.3-2 6-6z"/>'),
  };
  // Card colours for each option (from the colour scheme)
  // Soft pastels, like the colours in an aura
  const COLOURS = {
    new_gen: "#EAF7B0", oldies: "#F9E39A",
    heartbreak: "#D2DEF1", romantic: "#F7CBDE",
    main_character: "#F4B9A4", daydreamer: "#DDD2F9",
    party: "#F7CBDE", sunny: "#F9E39A",
    unbothered: "#CBEAE7", manifesting: "#CAE8BA",
  };
  const GENRE_COLOURS = ["#F7CBDE", "#F9E39A", "#D2DEF1", "#EAF7B0", "#DDD2F9", "#F4B9A4", "#CBEAE7", "#CAE8BA"];

  const state = { name: "", answers: {}, genres: [] };
  let index = 0;                      // which question is showing
  let config = null;

  function init(appConfig) {
    config = appConfig;
    const input = document.getElementById("nickname-input");
    input.addEventListener("input", () => {
      document.getElementById("nickname-count").textContent = `${input.value.length}/10`;
      showNameHint();
    });
    document.getElementById("nickname-form").addEventListener("submit", (event) => {
      event.preventDefault();
      submitName();
    });
    document.getElementById("question-back").addEventListener("click", back);
    document.getElementById("question-confirm").addEventListener("click", next);
    document.getElementById("genres-back").addEventListener("click", () => showQuestion(config.questions.length - 1));
    document.getElementById("genres-next").addEventListener("click", submitGenres);
    renderGenres();
  }

  /* ---------- nickname ---------- */

  /* errorMessage: the message from main.py, or nothing to show the normal hint */
  function showNameHint(errorMessage) {
    const hint = document.getElementById("nickname-hint");
    hint.textContent = errorMessage || "English letters or numbers, up to 10 characters.";
    hint.classList.toggle("is-error", Boolean(errorMessage));
  }

  /* Python checks the nickname and sends back what's saved for it (songs and latest result) */
  async function submitName() {
    const name = document.getElementById("nickname-input").value;
    try {
      state.name = (await App.api("/api/player", { name })).name;
    } catch (error) {
      showNameHint(error.message);
      return;
    }
    reset();                                   // every play starts with fresh answers and lyrics
    showQuestion(0);
  }

  /* ---------- This or That ---------- */

  function showQuestion(questionIndex) {
    index = questionIndex;
    const question = config.questions[index];
    const [first, second] = Object.keys(question.options);
    const title = question.question.replace(" or ", " <em>or</em> ");

    document.getElementById("question-step").textContent = `${index + 1} / ${totalSteps()}`;
    document.getElementById("question-lead").textContent = withName(question.lead);
    document.getElementById("question-title").innerHTML = title;
    const cards = document.getElementById("choice-cards");
    cards.innerHTML = "";
    [first, second].forEach((key) => cards.appendChild(makeCard(question, key)));
    renderDots("question-dots", index);
    document.getElementById("question-confirm").disabled = !(question.key in state.answers);
    App.go("question");
  }

  function makeCard(question, key) {
    const option = question.options[key];
    const card = document.createElement("button");
    card.className = "choice-card";
    card.style.background = COLOURS[key] || "#FFFFFF";
    card.style.color = Aesthetics.textColour(COLOURS[key] || "#FFFFFF");
    card.innerHTML = `
      <span class="choice-card__label"></span>
      <span class="choice-card__description"></span>
      <span class="choice-card__icon">${ICONS[key] || ""}</span>`;
    card.querySelector(".choice-card__label").textContent = option.label;
    card.querySelector(".choice-card__description").textContent = option.description;
    if (state.answers[question.key] === key) card.classList.add("is-chosen");
    card.addEventListener("click", () => choose(question.key, key, card));
    return card;
  }

  /* Clicking a card only selects it; the user can switch freely, then confirm */
  function choose(questionKey, optionKey, card) {
    state.answers[questionKey] = optionKey;
    document.querySelectorAll(".choice-card").forEach((c) => c.classList.remove("is-chosen"));
    card.classList.add("is-chosen");
    document.getElementById("question-confirm").disabled = false;
  }

  /* "Yes, I'm sure!" */
  function next() {
    if (!(config.questions[index].key in state.answers)) return;
    if (index + 1 < config.questions.length) {
      showQuestion(index + 1);
    } else {
      showGenres();
    }
  }

  function back() {
    if (index === 0) {
      App.go("nickname");
    } else {
      showQuestion(index - 1);
    }
  }

  /* ---------- genres ---------- */

  function renderGenres() {
    const box = document.getElementById("genre-pills");
    Object.entries(config.genres).forEach(([key, label], i) => {
      const pill = document.createElement("button");
      pill.className = "genre-pill";
      pill.style.setProperty("--pill-colour", GENRE_COLOURS[i % GENRE_COLOURS.length]);
      pill.textContent = label;
      pill.setAttribute("aria-pressed", "false");
      pill.addEventListener("click", () => toggleGenre(key, pill));
      box.appendChild(pill);
    });
  }

  function toggleGenre(key, pill) {
    const chosen = state.genres.includes(key);
    if (!chosen && state.genres.length >= config.max_genres) {
      App.toast(`You can pick up to ${config.max_genres} genres. Tap one to swap it out.`);
      return;
    }
    state.genres = chosen ? state.genres.filter((g) => g !== key) : [...state.genres, key];
    pill.classList.toggle("is-chosen", !chosen);
    pill.setAttribute("aria-pressed", String(!chosen));
    document.getElementById("genres-next").disabled = state.genres.length === 0;
  }

  function showGenres() {
    document.getElementById("genres-step").textContent = `${totalSteps()} / ${totalSteps()}`;
    document.getElementById("genres-lead").textContent = withName(config.genres_lead);
    renderDots("genres-dots", totalSteps() - 1);
    App.go("genres");
  }

  function submitGenres() {
    if (state.genres.length === 0) return;
    Lyrics.setMode(null);             // a full play: the lyrics go to the result cards
    App.go("lyrics");
  }

  /* ---------- helpers ---------- */

  /* Put the user's nickname into a line like "Okay {name}, so do you like..." */
  function withName(text) {
    return (text || "").replaceAll("{name}", state.name);
  }

  function totalSteps() {
    return config.questions.length + 1;   // questions + genres
  }

  function renderDots(containerId, activeIndex) {
    const dots = document.getElementById(containerId);
    dots.innerHTML = "";
    for (let i = 0; i < totalSteps(); i++) {
      const dot = document.createElement("span");
      dot.className = "dot" + (i === activeIndex ? " is-active" : "");
      dots.appendChild(dot);
    }
  }

  /* A new play: keep the nickname, clear the answers, genres and lyrics */
  function reset() {
    state.answers = {};
    state.genres = [];
    document.querySelectorAll(".genre-pill").forEach((pill) => {
      pill.classList.remove("is-chosen");
      pill.setAttribute("aria-pressed", "false");
    });
    document.getElementById("genres-next").disabled = true;
    document.getElementById("nickname-input").value = state.name;
    document.getElementById("nickname-count").textContent = `${state.name.length}/10`;
    document.getElementById("lyrics-input").value = "";
    document.getElementById("song-name").value = "";
  }

  return { init, state, withName };
})();
