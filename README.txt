DISCOVER YOUR MUSIC TASTE PALETTE
COMP9001 final project (prototype)
==================================

A music-emotion app. Paste the lyrics of a song you love and Python reads them word by word,
finds the emotions hiding inside (14 emotions, using lexicon-based sentiment analysis), matches
you to one of 8 music aesthetics, and grows your "aura": a soft cloud of colour made from
every song you add, with your overall colour (for example "lavender ember").

All the logic is in Python. The web page in static/ only shows the results.


SCRIPT TO RUN
-------------
    main.py


PLEASE NOTE (as asked in the submission instructions)
-----------------------------------------------------
- Web-based / networking application: YES.
  main.py starts a small local web server (Python's built-in http.server, on 127.0.0.1 only)
  and the app is used in a web browser. It will NOT work inside Ed's environment.
  Please run it on your own computer, using the steps below.
- GUI: the interface is a web page (HTML, CSS and JavaScript in the static/ folder),
  shown in the browser.
- Libraries outside Python's built-in libraries: NONE. Nothing needs to be installed.
  The web page uses one JavaScript library, Matter.js 0.20.0 (MIT licence), which is
  already included in static/vendor/ (no download or internet needed).
- Graphics libraries such as matplotlib: none. All drawing happens in the browser.
- Audio / video processing: none.


WHAT YOU NEED
-------------
- Python 3.9 or newer
- A modern web browser (Chrome, Edge, Safari or Firefox)
- No internet connection is needed


HOW TO RUN IT
-------------
1. Download / unzip all the files, keeping the folders as they are
   (main.py must sit next to the data/ and static/ folders).
2. Open a terminal in that folder.
3. Start the app:
       macOS / Linux:   python3 main.py
       Windows:         python main.py      (or: py main.py)
4. Open this address in your browser (the terminal also prints it):
       http://127.0.0.1:8000
5. To stop the app, press Ctrl+C in the terminal.

If port 8000 is already in use, the app says so. Close the other program using it and try again.

A quick way to try it:
  Get started -> type a nickname -> answer the 5 questions -> pick 1 to 3 genres ->
  paste a whole song's lyrics (at least 8 emotional words are needed) -> Read my lyrics.
  After the result cards, open "See my aura". There you can add songs, start a new aura,
  and export your lyrics stats as a text file.


RUNNING THE TESTS
-----------------
The unit tests only need Python (no browser). From the same folder:
    python3 -m unittest discover tests
(Windows: python -m unittest discover tests)
There are 64 tests, covering the Python modules and the web API
(models.py and storage.py are tested through the others).


FILES
-----
main.py            starts the web server and answers the page's requests (the JSON API)   <- run this
analyser.py        reads lyrics: cleaning, phrases, negation, intensifiers, chorus weighting
compatibility.py   matches emotions to aesthetics (cosine similarity) and recommends songs
archive.py         saves each player's songs and auras; works out each aura, its
                   overall colour, and the lyrics stats report you can export
models.py          data classes, the 14 emotions and their families
storage.py         loads the data files
data/              the emotion lexicon, modifiers, aesthetics, songs and survey questions (JSON)
static/            the web page (HTML, CSS, JavaScript): only displays results
tests/             unit tests
docs/              lexicon_sources.csv: where every lexicon word came from
AI_DISCLOSURE.txt  how AI was used in this project

When the app runs, it creates a profiles/ folder next to main.py with one JSON file per
nickname. Lyrics are never saved, only the emotion scores and the emotional words found.


CREDITS AND AI USE
------------------
- Matter.js 0.20.0 by liabru (MIT licence): https://brm.io/matter-js/
- AI use is disclosed in AI_DISCLOSURE.txt.
  The sources of the lexicon words are listed in docs/lexicon_sources.csv.
