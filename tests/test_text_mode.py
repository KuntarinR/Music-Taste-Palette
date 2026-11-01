"""Tests for text_mode.py: the typed answers are fed in, and the printed text is checked."""

import io
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import text_mode
from main import MusicApp
from storage import load_all_data

SAD = "I cry alone in the rain, tears on my face, so lonely and sad, my heart is broken, I miss you"
PARTY = "Dance all night, party, jump, bounce, turn it up, feel alive, hype, rave, energy, happy"


class TestTextMode(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.app = MusicApp(load_all_data(), self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def play(self, typed):
        output = io.StringIO()
        with patch("builtins.input", side_effect=typed), redirect_stdout(output):
            text_mode.run(self.app)
        return output.getvalue()

    def test_a_whole_play_with_mistakes_on_the_way(self):
        typed = ["Bad Name", "Kai", "1", "3", "2", "2", "1", "2", "99", "2, 12", "Rainy day",
                 "hi", "", SAD, "", "y", "Party", PARTY, "", "n"]
        text = self.play(typed)
        self.assertIn("Nicknames can use English letters", text)
        self.assertIn("Please type one of: 1, 2", text)
        self.assertIn("Please type 1 to 3 numbers", text)
        self.assertIn("only found 0 emotional words", text)
        self.assertIn("Kai, just from your lyrics", text)
        self.assertIn("sadness", text)
        self.assertIn("Your aura:", text)
        self.assertEqual(len(self.app.archive.view("Kai")["aura"]["songs"]), 2)

    def test_genres_are_checked(self):
        config = self.app.config()
        with patch("builtins.input", side_effect=["1, 2, 3, 4", "1, 1", "3"]), redirect_stdout(io.StringIO()):
            self.assertEqual(text_mode.ask_genres(config), ["classical"])


if __name__ == "__main__":
    unittest.main()
