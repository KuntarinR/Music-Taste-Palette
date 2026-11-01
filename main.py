"""RUN THIS FILE: python3 main.py (Windows: python main.py). The app opens in your web browser by itself.
In a terminal only (e.g. inside Ed): python3 main.py --text

Web-based app (local http.server), so the browser version will NOT work inside Ed; the GUI is a browser page in static/.
No libraries outside Python's built-ins; the page uses Matter.js, included in static/vendor/.
"""

import json
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from collections import Counter

from analyser import LyricsAnalyser
from archive import Archive
from compatibility import Matcher
from models import FAMILY_OF, Aesthetic, SongEntry, Survey
from storage import load_all_data
import text_mode

HOST = "127.0.0.1"
PORT = 0
STATIC_DIR = Path(__file__).parent / "static"
PROFILES_DIR = Path(__file__).parent / "profiles"
MAX_REQUEST_BYTES = 200_000
RECOMMENDED_SONGS = 2
TOP_EMOTIONS = 3
LYRICS_MAX_CHARS = 3000
WORDS_PER_SONG = 30

MESSAGES = {
    "no_lyrics": "Looks like the lyrics box is empty. Paste in some lyrics and let's go!",
    "too_long": f"That's a bit long! Try pasting up to {LYRICS_MAX_CHARS:,} characters, about one whole song.",
    "not_enough_words": "We only found {found} emotional word{s} in these lyrics, and we need at least {need} "
                        "to read your vibe properly. Try adding another verse or the chorus!",
    "missing_answer": "Looks like you skipped a question. Answer all of them and we're good to go.",
    "genres": "Pick 1 to {max} genres you love.",
    "server_error": "Oops, something went wrong on our side. Please try again.",
    "not_found": "Hmm, we couldn't find that.",
    "bad_request": "Something went wrong sending your answers. Please try again.",
}


class MusicApp:
    """Holds the loaded data and the objects that do the work. Created once at start-up."""

    def __init__(self, data, profiles_dir=PROFILES_DIR):
        self.survey_config = data["survey"]
        self.aesthetics = {key: Aesthetic.from_dict(key, value) for key, value in data["aesthetics"].items()}
        songs = [SongEntry(**song) for song in data["songs"]]
        self.analyser = LyricsAnalyser(data["lexicon"], data["modifiers"])
        self.matcher = Matcher(self.aesthetics, songs, self.survey_config)
        self.archive = Archive(profiles_dir)


    def config(self):
        return {
            "questions": [{"key": q["key"], "lead": q["lead"], "question": q["question"],
                           "options": {key: {"label": option["label"], "description": option["description"]}
                                       for key, option in q["options"].items()}}
                          for q in self.survey_config["questions"]],
            "genres": self.survey_config["genres"],
            "genres_lead": self.survey_config["genres_lead"],
            "max_genres": self.survey_config["max_genres"],
            "aesthetics": [{"key": key, "name": a.name, "colour": a.colour} for key, a in self.aesthetics.items()],
            "emotion_families": FAMILY_OF,
        }

    def analyse(self, request):
        name = self.read_name(request)
        survey = self.read_survey(request)
        title = self.archive.clean_song_title(request.get("title", ""))
        lyrics, emotions = self.read_lyrics(request)
        word_map = self.analyser.word_map(lyrics)
        match = self.matcher.match(emotions, survey)
        songs = self.matcher.recommend(emotions, survey.genres, RECOMMENDED_SONGS)
        result = {
            "name": name.capitalize(),
            "aesthetic": self.aesthetic_info(match.aesthetic_key, match.percent),
            "hybrid": self.hybrid_info(match),
            "ranking": [self.aesthetic_info(key, percent) for key, percent in match.ranking],
            "confidence": match.confidence,
            "emotions": emotions.percentages(),
            "top_emotions": [[emotion, round(score * 100)] for emotion, score in emotions.top(TOP_EMOTIONS)
                             if round(score * 100) > 0],
            "top_words": emotions.top_words,
            "matched_words": emotions.matched_words,
            "total_words": emotions.total_words,
            "coverage": round(100 * emotions.matched_words / max(emotions.total_words, 1)),
            "top_word_counts": emotions.top_word_counts,
            "word_map": word_map,
            "answer_texts": self.matcher.answer_texts(survey),
            "songs": [{"title": s.title, "artist": s.artist, "genre": s.genre} for s in songs],
        }
        summary = {key: result[key] for key in ("name", "aesthetic", "top_emotions")}
        self.archive.add_attempt(name, summary)
        self.archive.add_song(name, title, emotions.percentages(), self.song_words(word_map), "play")
        return result

    def add_song(self, request):
        """Aura page: analyse another song's lyrics (no survey needed) and add it to your current aura."""
        name = self.read_name(request)
        title = self.archive.clean_song_title(request.get("title", ""))
        lyrics, emotions = self.read_lyrics(request)
        song = self.archive.add_song(name, title, emotions.percentages(),
                                     self.song_words(self.analyser.word_map(lyrics)), "added")
        return {"song_id": song["id"], "player": self.archive.view(name)}

    def rename_song(self, request):
        name = self.read_name(request)
        self.archive.rename_song(name, request.get("song_id"), request.get("title", ""))
        return {"player": self.archive.view(name, self.read_showing(request))}

    def delete_song(self, request):
        name = self.read_name(request)
        self.archive.delete_song(name, request.get("song_id"))
        return {"player": self.archive.view(name, self.read_showing(request))}

    def player(self, request):
        """Check the nickname (the page calls this before the survey) and return the player's saved data."""
        name = self.read_name(request)
        return {"name": name.capitalize(), "player": self.archive.view(name, self.read_showing(request))}

    def export(self, request):
        """"Export my stats": the aura's lyrics stats as a text file, written by Python (the page only saves it)."""
        name = self.read_name(request)
        filename, text = self.archive.report(name, self.read_showing(request))
        return {"filename": filename, "text": text}

    def new_aura(self, request):
        """"+ New aura": close your current aura and start an empty one, with an optional name."""
        name = self.read_name(request)
        self.archive.new_aura(name, request.get("aura_name", ""))
        return {"player": self.archive.view(name)}


    def read_survey(self, request):
        """Check the This-or-That answers and genres sent by the page."""
        answers = request.get("answers", {})
        if not isinstance(answers, dict):
            raise ValueError(MESSAGES["missing_answer"])
        for question in self.survey_config["questions"]:
            if answers.get(question["key"]) not in question["options"]:
                raise ValueError(MESSAGES["missing_answer"])
        genres = request.get("genres", [])
        if not isinstance(genres, list) or not 1 <= len(genres) <= self.survey_config["max_genres"] \
                or any(genre not in self.survey_config["genres"] for genre in genres):
            raise ValueError(MESSAGES["genres"].format(max=self.survey_config["max_genres"]))
        return Survey(**{key: answers[key] for key in Survey.QUESTION_KEYS}, genres=genres)

    def read_lyrics(self, request):
        """Check the pasted lyrics and analyse them. Returns (lyrics, EmotionResult)."""
        lyrics = str(request.get("lyrics", ""))
        if not lyrics.strip():
            raise ValueError(MESSAGES["no_lyrics"])
        if len(lyrics) > LYRICS_MAX_CHARS:
            raise ValueError(MESSAGES["too_long"])
        emotions = self.analyser.analyse(lyrics)
        if emotions.matched_words < Matcher.MIN_WORDS:
            found = emotions.matched_words
            raise ValueError(MESSAGES["not_enough_words"].format(
                found=found, s="" if found == 1 else "s", need=Matcher.MIN_WORDS))
        return lyrics, emotions

    @staticmethod
    def song_words(word_map):
        """The song's emotional words for the aura: [[word, emotion, times], ...], most found first."""
        counts = Counter((word, emotion) for word, emotion in word_map if emotion)
        return [[word, emotion, times] for (word, emotion), times in counts.most_common(WORDS_PER_SONG)]

    @staticmethod
    def read_showing(request):
        """Which aura to show: a number for a past aura, or None for your current one."""
        showing = request.get("aura")
        if showing is None:
            return None
        if not isinstance(showing, int) or isinstance(showing, bool):
            raise ValueError(MESSAGES["bad_request"])
        return showing

    @staticmethod
    def read_name(request):
        """The nickname: English letters and numbers only, up to 10 (raises a friendly ValueError)."""
        return Archive.clean_name(str(request.get("name", "")))

    def hybrid_info(self, match):
        """The close second place with its %, for "You're X (76%) with a touch of Y (70%)"."""
        if not match.hybrid_key:
            return None
        return self.aesthetic_info(match.hybrid_key, dict(match.ranking)[match.hybrid_key])

    def aesthetic_info(self, key, percent=None):
        aesthetic = self.aesthetics[key]
        info = {"key": key, "name": aesthetic.name, "tagline": aesthetic.tagline,
                "description": aesthetic.description, "colour": aesthetic.colour}
        if percent is not None:
            info["percent"] = percent
        return info


class RequestHandler(SimpleHTTPRequestHandler):
    """Serves the files in static/ and answers the /api/ requests.
    File types are set here, so pages also load on Windows computers whose settings report them wrongly."""

    app = None
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".html": "text/html", ".css": "text/css",
                      ".js": "text/javascript", ".json": "application/json", ".png": "image/png"}
    POST_ROUTES = {
        "/api/analyse": "analyse",
        "/api/player": "player",
        "/api/songs/add": "add_song",
        "/api/songs/rename": "rename_song",
        "/api/songs/delete": "delete_song",
        "/api/auras/new": "new_aura",
        "/api/export": "export",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/config":
            self.send_json(200, RequestHandler.app.config())
        else:
            super().do_GET()

    def do_POST(self):
        action = self.POST_ROUTES.get(self.path)
        if action is None:
            self.send_json(404, {"error": MESSAGES["not_found"]})
            return
        try:
            request = self.read_json()
            response = getattr(RequestHandler.app, action)(request)
            self.send_json(200, response)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            print(f"Unexpected error in {self.path}: {error!r}", file=sys.stderr)
            self.send_json(500, {"error": MESSAGES["server_error"]})

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_REQUEST_BYTES:
            raise ValueError(MESSAGES["too_long"])
        try:
            request = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            raise ValueError(MESSAGES["bad_request"]) from None
        if not isinstance(request, dict):
            raise ValueError(MESSAGES["bad_request"])
        return request

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def main():
    RequestHandler.app = MusicApp(load_all_data())
    if "--text" in sys.argv:
        try:
            text_mode.run(RequestHandler.app)
        except (KeyboardInterrupt, EOFError):
            print("\nStopped.")
        return
    try:
        server = ThreadingHTTPServer((HOST, PORT), RequestHandler)
    except OSError:
        sys.exit("Error: the app couldn't start its local server. Please try again.")
    address = f"http://{HOST}:{server.server_address[1]}"
    print(f"The app is opening in your browser. If it doesn't, open {address}")
    print("Press Ctrl+C to stop.")
    threading.Timer(0.5, webbrowser.open, args=(address,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
