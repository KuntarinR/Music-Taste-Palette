# Discover your music taste palette

A COMP9001 final project (prototype). Paste the lyrics of a song you love and Python reads them word by word,
finds the emotions hiding inside (14 emotions, using lexicon-based sentiment analysis), matches you to one of
8 music aesthetics, and grows your **aura**: a soft cloud of colour made from every song you add, with your
overall colour (for example "lavender ember").

All the logic is in Python. The web page in `static/` only shows the results.

## How to run

Needs Python 3.9 or newer and a web browser. Nothing to install, no internet needed.

```bash
python3 main.py
```

(Windows: `python main.py`.) The app opens in your web browser by itself (if it doesn't, open the address the terminal prints). Press Ctrl+C to stop.

**No browser (e.g. inside Ed)?** Run the text mode: `python3 main.py --text`. Same questions, same Python analysis, all in the terminal.

Keep the folders as they are: `main.py` must sit next to `data/` and `static/`.
Opening `static/index.html` directly won't work, because the page needs `main.py` running.

## Run the tests

```bash
python3 -m unittest discover tests
```

## Files

| File | What it does |
|---|---|
| `main.py` | starts the web server and answers the page's requests (run this) |
| `text_mode.py` | the same app in the terminal (`python3 main.py --text`) |
| `analyser.py` | reads lyrics: cleaning, phrases, negation, intensifiers, chorus weighting |
| `compatibility.py` | matches emotions to aesthetics (cosine similarity) and recommends songs |
| `archive.py` | saves each player's songs and auras; works out each aura, its colour and the stats export |
| `models.py` | data classes, the 14 emotions and their families |
| `storage.py` | loads the data files |
| `data/` | the emotion lexicon, modifiers, aesthetics, songs and survey questions (JSON) |
| `static/` | the web page (HTML, CSS, JavaScript): only displays results |
| `tests/` | unit tests |
| `docs/lexicon_sources.csv` | where every lexicon word came from |

Lyrics are never saved, only the emotion scores and the emotional words found.

## Credits and AI use

- Matter.js 0.20.0 by liabru (MIT licence), included in `static/vendor/`.
- How AI was used is described in [AI_DISCLOSURE.txt](AI_DISCLOSURE.txt).
