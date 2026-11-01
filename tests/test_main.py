"""Tests for main.py: starts the real server on a free port and calls the API."""

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from main import MusicApp, RequestHandler
from storage import load_all_data

ANSWERS = {"era": "oldies", "love_song": "heartbreak", "spotlight": "daydreamer",
           "vibe": "sunny", "mindset": "manifesting"}

SAD = "tears, sad, cry, lonely, sorrow, grief, weep, heartbreak"
NOSTALGIC = ("I remember those summer days. Memories of childhood, back in the day, the old days, "
             "years ago. I miss you, nostalgia, rewind")
CALM = "Calm and peaceful, breathe, relax, serene, gentle, quiet, rest, cozy, unwind"


class TestServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profiles = tempfile.TemporaryDirectory()
        RequestHandler.app = MusicApp(load_all_data(), cls.profiles.name)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), RequestHandler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.profiles.cleanup()

    def call(self, path, data=None):
        """Return (status, JSON body). GET if data is None, otherwise POST."""
        body = None if data is None else json.dumps(data).encode()
        request = urllib.request.Request(self.base + path, data=body,
                                         headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def analyse(self, name, lyrics, genres=("indie",)):
        return self.call("/api/analyse", {"name": name, "answers": ANSWERS,
                                          "genres": list(genres), "lyrics": lyrics})

    def test_config(self):
        status, body = self.call("/api/config")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["questions"]), 5)
        self.assertEqual(body["max_genres"], 3)
        self.assertEqual(len(body["aesthetics"]), 8)
        self.assertTrue(body["aesthetics"][0]["colour"].startswith("#"))
        self.assertEqual(body["emotion_families"]["nostalgia"], "tender")

    def test_analyse(self):
        status, body = self.analyse("Mint", NOSTALGIC)
        self.assertEqual(status, 200)
        self.assertEqual(body["aesthetic"]["key"], "nostalgic")
        self.assertEqual(body["name"], "Mint")
        self.assertEqual(len(body["answer_texts"]), 5)
        self.assertEqual(len(body["songs"]), 2)
        self.assertIn("colour", body["aesthetic"])
        self.assertEqual(len(body["emotions"]), 14)
        self.assertEqual(len(body["ranking"]), 8)
        self.assertGreater(body["total_words"], body["matched_words"])
        self.assertTrue(0 < body["coverage"] <= 100)
        self.assertEqual(len(body["top_word_counts"][0]), 2)
        self.assertLessEqual(len(body["top_emotions"]), 3)
        self.assertTrue(all(percent > 0 for _, percent in body["top_emotions"]))
        self.assertEqual(body["top_emotions"][0][0], "nostalgia")
        first, second = body["songs"]
        self.assertTrue(first["title"] and second["title"])

    def test_analyse_errors(self):
        self.assertEqual(self.analyse("Mint Chan", "tears")[0], 400)
        self.assertEqual(self.analyse("Mint", "   ")[0], 400)
        self.assertEqual(self.analyse("Mint", "tears", genres=())[0], 400)
        status, body = self.call("/api/analyse", {"name": "Mint", "answers": {}, "genres": ["pop"],
                                                  "lyrics": "tears"})
        self.assertEqual(status, 400)
        self.assertIn("error", body)

    def test_hybrid_has_percent(self):
        answers = {"era": "new_gen", "love_song": "romantic", "spotlight": "main_character",
                   "vibe": "party", "mindset": "unbothered"}
        body = self.call("/api/analyse", {"name": "Mint", "answers": answers, "genres": ["jazz"],
                                          "lyrics": "kiss me, I want you, passion, tears, lonely, memories, "
                                                    "I remember, nostalgia, sorrow, crush"})[1]
        self.assertEqual(body["aesthetic"]["name"], "Hopeless Romantic")
        self.assertEqual(body["hybrid"]["name"], "Nostalgic")
        self.assertLessEqual(body["aesthetic"]["percent"] - body["hybrid"]["percent"], 10)

    def test_player_checks_nickname(self):
        status, body = self.call("/api/player", {"name": "mint"})
        self.assertEqual(status, 200)
        self.assertEqual(body["name"], "Mint")
        self.assertEqual(body["player"]["limits"]["songs"], 60)
        self.assertEqual(self.call("/api/player", {"name": "Mint Chan"})[0], 400)

    def test_newest_play_is_you(self):
        self.analyse("Tan", CALM)
        newest = self.analyse("Tan", SAD)[1]["aesthetic"]
        self.assertEqual(self.call("/api/player", {"name": "Tan"})[1]["player"]["me"]["aesthetic"], newest)

    def test_song_name_from_a_play_and_rename(self):
        self.call("/api/analyse", {"name": "Kai", "answers": ANSWERS, "genres": ["indie"],
                                   "lyrics": NOSTALGIC, "title": "Back to December"})
        song = self.call("/api/player", {"name": "Kai"})[1]["player"]["aura"]["songs"][0]
        self.assertEqual(song["title"], "Back to December")
        body = self.call("/api/songs/rename", {"name": "Kai", "song_id": song["id"], "title": "Rewind"})[1]
        self.assertEqual(body["player"]["aura"]["songs"][0]["title"], "Rewind")
        status, _ = self.call("/api/analyse", {"name": "Kai", "answers": ANSWERS, "genres": ["indie"],
                                               "lyrics": NOSTALGIC, "title": "x" * 41})
        self.assertEqual(status, 400)

    def test_aura_songs(self):
        self.analyse("Jay", NOSTALGIC)
        status, body = self.call("/api/songs/add", {"name": "Jay", "title": "Rainy day", "lyrics": SAD})
        self.assertEqual(status, 200)
        aura = body["player"]["aura"]
        self.assertEqual([s["source"] for s in aura["songs"]], ["play", "added"])
        self.assertEqual(aura["songs"][1]["title"], "Rainy day")
        self.assertEqual(aura["songs"][1]["glow"]["name"], "sea-glass tide")
        self.assertIn("sadness", [e["emotion"] for e in aura["emotions"]])
        self.assertTrue(any(w["word"] == "tears" for w in aura["words"]))
        self.assertEqual(self.call("/api/songs/add", {"name": "Jay", "lyrics": "tears"})[0], 400)
        self.assertEqual(self.call("/api/songs/add", {"name": "Jay", "title": "x" * 41, "lyrics": SAD})[0], 400)
        body = self.call("/api/songs/delete", {"name": "Jay", "song_id": body["song_id"]})[1]
        self.assertEqual(len(body["player"]["aura"]["songs"]), 1)

    def test_new_aura(self):
        self.analyse("Ivy", NOSTALGIC)
        status, body = self.call("/api/auras/new", {"name": "Ivy", "aura_name": "Summer"})
        self.assertEqual(status, 200)
        self.assertEqual(body["player"]["showing"], 2)
        self.assertEqual(body["player"]["aura"]["songs"], [])
        self.assertEqual([a["label"] for a in body["player"]["auras"]], ["Aura 1", "Summer"])
        self.assertIn("still empty", self.call("/api/auras/new", {"name": "Ivy"})[1]["error"])
        past = self.call("/api/player", {"name": "Ivy", "aura": 1})[1]["player"]
        self.assertEqual(len(past["aura"]["songs"]), 1)
        self.assertEqual(self.call("/api/player", {"name": "Ivy", "aura": "1"})[0], 400)

    def test_export(self):
        self.assertIn("still empty", self.call("/api/export", {"name": "Zed"})[1]["error"])
        self.analyse("Zed", SAD)
        status, body = self.call("/api/export", {"name": "Zed"})
        self.assertEqual(status, 200)
        self.assertEqual(body["filename"], "zed-aura-1-stats.txt")
        self.assertIn("sadness", body["text"])

    def test_top_emotions_skip_zero(self):
        body = self.analyse("Mint", SAD)[1]
        self.assertEqual(body["top_emotions"], [["sadness", 100]])

    def test_lyrics_too_long(self):
        self.assertEqual(self.analyse("Mint", "tears " * 1000)[0], 400)

    def test_minimum_emotional_words(self):
        status, body = self.analyse("Mint", "tears")
        self.assertEqual(status, 400)
        self.assertIn("only found 1 emotional word in", body["error"])
        status, body = self.analyse("Mint", "tears, sad, cry, lonely, sorrow, grief, weep")
        self.assertEqual(status, 400)
        self.assertIn("found 7 emotional words", body["error"])
        self.assertIn("at least 8", body["error"])
        status, body = self.analyse("Mint", SAD)
        self.assertEqual(status, 200)
        status, body = self.analyse("Mint", "la la la, oh oh, yeah yeah, baby baby baby")
        self.assertEqual(status, 400)

    def test_pages_are_not_cached(self):
        with urllib.request.urlopen(self.base + "/js/app.js") as response:
            self.assertEqual(response.headers["Cache-Control"], "no-cache")

    def test_unknown_route_and_bad_json(self):
        self.assertEqual(self.call("/api/nothing", {})[0], 404)
        request = urllib.request.Request(self.base + "/api/analyse", data=b"not json")
        with self.assertRaises(urllib.error.HTTPError) as context:
            urllib.request.urlopen(request)
        self.assertEqual(context.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
