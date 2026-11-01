"""Tests for archive.py. Each test saves into its own temporary folder, so nothing real is touched."""

import json
import tempfile
import unittest

from archive import Archive


def person(name, aesthetic="calm"):
    return {"name": name, "aesthetic": {"key": aesthetic, "name": aesthetic.title(), "colour": "#B8E0D2"},
            "top_emotions": [["calm", 60]]}


class ArchiveTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.archive = Archive(self.folder.name)
        self.archive.add_attempt("Mint", person("Mint"))

    def tearDown(self):
        self.folder.cleanup()

    def raw(self):
        """The player's saved file, as Python loads it."""
        return self.archive.load("Mint")


class TestAttempts(ArchiveTest):
    def test_keeps_last_three_and_numbers_every_play(self):
        replaced = [self.archive.add_attempt("Mint", person("Mint", f"look{n}")) for n in range(3)]
        self.assertEqual(replaced, [False, False, True])
        self.assertEqual([a["number"] for a in self.raw()["attempts"]], [2, 3, 4])
        self.assertEqual(self.archive.view("Mint")["me"]["aesthetic"]["key"], "look2")

    def test_nickname_is_not_case_sensitive(self):
        self.assertEqual(self.archive.view("MINT")["me"]["name"], "Mint")

    def test_bad_nickname_is_refused(self):
        with self.assertRaises(ValueError):
            self.archive.view("../secret")
        for name in ("", "Mint Chan", "มิ้นท์", "ABCDEFGHIJK"):
            with self.assertRaises(ValueError):
                Archive.clean_name(name)
        self.assertEqual(Archive.clean_name(" Bank99 "), "BANK99")


class TestSongs(ArchiveTest):
    def test_aura_grows_with_songs(self):
        self.assertEqual(self.archive.view("Mint")["aura"]["emotions"], [])
        self.archive.add_song("Mint", "", {"sadness": 80, "hope": 20, "joy": 0}, [["tears", "sadness", 3]], "play")
        self.archive.add_song("Mint", "Sunny", {"joy": 60, "hope": 40}, [["tears", "sadness", 1], ["smile", "joy", 2]],
                              "added")
        aura = self.archive.view("Mint")["aura"]
        self.assertEqual([s["title"] for s in aura["songs"]], ["Song 1", "Sunny"])
        strengths = {e["emotion"]: e["percent"] for e in aura["emotions"]}
        self.assertEqual(strengths, {"sadness": 40, "hope": 30, "joy": 30})
        self.assertEqual(aura["emotions"][0]["family"], "heavy")
        self.assertEqual(aura["words"][0], {"word": "tears", "emotion": "sadness", "family": "heavy", "count": 4})
        self.assertEqual(aura["songs"][1]["families"], {"bright": 100})
        self.assertEqual(aura["songs"][0]["words"][0]["word"], "tears")

    def test_overall_glow(self):
        self.assertIsNone(self.archive.view("Mint")["aura"]["glow"])
        glow = Archive.glow({"desire": 40, "nostalgia": 20, "pumped_up": 30, "joy": 10})
        self.assertEqual(glow["name"], "lavender ember")
        self.assertEqual(glow["families"][0], ["tender", 60])
        self.assertRegex(glow["colour"], r"^#[0-9A-F]{6}$")
        self.assertEqual(Archive.glow({"sadness": 95, "joy": 5})["name"], "sea-glass tide")
        self.assertEqual(Archive.glow({"joy": 100})["colour"], "#F5CF7A")
        self.assertEqual(Archive.glow({"desire": 50, "pumped_up": 50})["colour"], "#D4A4C9")

    def test_keeps_newest_songs_and_delete(self):
        for number in range(Archive.MAX_SONGS + 1):
            self.archive.add_song("Mint", f"S{number}", {"joy": 100}, [], "added")
        songs = self.archive.view("Mint")["aura"]["songs"]
        self.assertEqual(len(songs), Archive.MAX_SONGS)
        self.assertEqual(songs[0]["title"], "S1")
        self.archive.delete_song("Mint", songs[0]["id"])
        self.assertEqual(len(self.archive.view("Mint")["aura"]["songs"]), Archive.MAX_SONGS - 1)
        with self.assertRaises(ValueError):
            self.archive.delete_song("Mint", "nope")

    def test_rename(self):
        song_id = self.archive.add_song("Mint", "", {"joy": 100}, [], "play")["id"]
        self.archive.rename_song("Mint", song_id, "  Is it   a crime? ")
        self.assertEqual(self.archive.view("Mint")["aura"]["songs"][0]["title"], "Is it a crime?")
        for bad in ("   ", "x" * 41):
            with self.assertRaises(ValueError):
                self.archive.rename_song("Mint", song_id, bad)
        with self.assertRaises(ValueError):
            self.archive.rename_song("Mint", "nope", "Hello")

    def test_title_too_long(self):
        with self.assertRaises(ValueError):
            self.archive.add_song("Mint", "x" * 41, {"joy": 100}, [], "added")


class TestAuras(ArchiveTest):
    def add(self, emotion="joy"):
        return self.archive.add_song("Mint", "", {emotion: 100}, [], "added")

    def test_new_aura_starts_empty_and_keeps_the_old_one(self):
        self.add("joy")
        self.add("joy")
        self.archive.new_aura("Mint", "  Uni   era ")
        self.add("sadness")
        view = self.archive.view("Mint")
        self.assertEqual(view["showing"], 2)
        self.assertEqual([e["emotion"] for e in view["aura"]["emotions"]], ["sadness"])
        self.assertEqual([(a["label"], a["songs"], a["current"]) for a in view["auras"]],
                         [("Aura 1", 2, False), ("Uni era", 1, True)])
        old = self.archive.view("Mint", 1)
        self.assertEqual([e["emotion"] for e in old["aura"]["emotions"]], ["joy"])
        self.assertIn("now", view["auras"][1]["dates"])

    def test_new_aura_rules(self):
        with self.assertRaisesRegex(ValueError, "still empty"):
            self.archive.new_aura("Mint", "")
        self.add()
        with self.assertRaisesRegex(ValueError, "30 characters"):
            self.archive.new_aura("Mint", "x" * 31)
        for _ in range(Archive.MAX_AURAS - 1):
            self.archive.new_aura("Mint", "")
            self.add()
        with self.assertRaisesRegex(ValueError, "up to 10 auras"):
            self.archive.new_aura("Mint", "")
        with self.assertRaises(ValueError):
            self.archive.view("Mint", 99)

    def test_old_files_become_aura_1(self):
        self.archive.path("Mint").write_text(json.dumps({"songs": [
            {"id": "a", "title": "Old", "date": "2026-10-01T10:00:00", "source": "play", "emotions": {"joy": 100}, "words": []}]}))
        view = self.archive.view("Mint")
        self.assertEqual([(a["label"], a["songs"], a["since"]) for a in view["auras"]], [("Aura 1", 1, "1 Oct 2026")])


class TestExport(ArchiveTest):
    def test_report_has_the_stats_not_the_lyrics(self):
        self.archive.add_song("Mint", "Rainy day", {"sadness": 60, "nostalgia": 40}, [["tears", "sadness", 3]], "added")
        filename, text = self.archive.report("Mint")
        self.assertEqual(filename, "mint-aura-1-stats.txt")
        self.assertIn("MINT'S AURA: LYRICS STATS", text)
        self.assertIn("sea-glass haze", text)
        self.assertRegex(text, r"sadness +60% +\u2588+")
        self.assertIn("1. Rainy day", text)
        self.assertIn("tears", text)

    def test_empty_aura_and_past_aura(self):
        with self.assertRaisesRegex(ValueError, "still empty"):
            self.archive.report("Mint")
        self.archive.add_song("Mint", "Old", {"joy": 100}, [], "added")
        self.archive.new_aura("Mint", "Uni era")
        self.archive.add_song("Mint", "New", {"sadness": 100}, [], "added")
        self.assertEqual(self.archive.report("Mint")[0], "mint-uni-era-stats.txt")
        filename, text = self.archive.report("Mint", 1)
        self.assertIn("1. Old", text)
        self.assertNotIn("New", text)


class TestFiles(ArchiveTest):
    def test_damaged_file_starts_fresh(self):
        self.archive.path("Mint").write_text("{not json")
        self.assertIsNone(self.archive.view("Mint")["me"])
        self.assertTrue(self.archive.path("Mint").with_suffix(".broken.json").exists())

    def test_failed_change_saves_nothing(self):
        with self.assertRaises(ValueError):
            self.archive.delete_song("Mint", "nope")
        self.assertEqual(self.raw()["attempt_count"], 1)


if __name__ == "__main__":
    unittest.main()
