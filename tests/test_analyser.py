"""Tests for analyser.py. Run from the project folder: python3 -m unittest discover tests"""

import unittest

from analyser import LyricsAnalyser
from storage import load_all_data

DATA = load_all_data()
ANALYSER = LyricsAnalyser(DATA["lexicon"], DATA["modifiers"])


def raw(lyrics):
    """Raw (not normalised) emotion totals, rounded, without the zero emotions."""
    totals, _ = ANALYSER.raw_scores(lyrics)
    return {emotion: round(value, 3) for emotion, value in totals.items() if value}


class TestCleaning(unittest.TestCase):
    def test_contractions_are_expanded(self):
        self.assertEqual(ANALYSER.tokenise("I'm gonna"), ["i", "am", "going", "to"])

    def test_contractions_without_apostrophes(self):
        self.assertEqual(ANALYSER.tokenise("Im dont"), ["i", "am", "do", "not"])

    def test_dropped_g(self):
        self.assertEqual(ANALYSER.tokenise("lovin'"), ["loving"])

    def test_curly_apostrophe_and_section_labels(self):
        self.assertEqual(ANALYSER.clean("[Chorus]\nI’m here"), "i'm here")

    def test_one_paragraph_is_split_into_lines(self):
        self.assertEqual(ANALYSER.clean("[Verse 1] I miss you. So sad! Why? [Chorus] tears"),
                         "i miss you\nso sad\nwhy\ntears")

    def test_paragraph_and_lines_give_the_same_result(self):
        as_lines = "tears\ntears\ntears\ntears"
        as_paragraph = "Tears. Tears. Tears. Tears."
        self.assertEqual(ANALYSER.raw_scores(as_lines)[0], ANALYSER.raw_scores(as_paragraph)[0])

    def test_negation_stops_at_sentence_end(self):
        totals, _ = ANALYSER.raw_scores("I'm not. Happy")
        self.assertEqual(round(totals["joy"], 3), 1.0)


class TestMatching(unittest.TestCase):
    def test_word_endings(self):
        for word in ("crying", "cried", "cries"):
            self.assertEqual(ANALYSER.match_word(word), "cry")
        self.assertEqual(ANALYSER.match_word("dreams"), "dream")
        self.assertEqual(ANALYSER.match_word("danced"), "dance")

    def test_phrase_counts_once(self):
        self.assertEqual(raw("on fire"), {"pumped_up": 0.8})

    def test_unknown_words_are_ignored(self):
        result = ANALYSER.analyse("the table is near the window")
        self.assertTrue(result.is_empty())
        self.assertEqual(result.matched_words, 0)


class TestModifiers(unittest.TestCase):
    def test_worked_example(self):
        self.assertEqual(raw("I'm not happy, I'm so lonely"), {"sadness": 1.85})

    def test_phrase_before_negation(self):
        self.assertEqual(raw("I don't care"), {"defiance": 0.9})

    def test_negation_exception(self):
        self.assertEqual(raw("no doubt"), {})

    def test_negation_window_and_line_end(self):
        self.assertEqual(raw("never felt this way so happy"), {"joy": 1.5})
        self.assertEqual(raw("not\nhappy"), {"joy": 1.0})

    def test_diminisher(self):
        self.assertEqual(raw("kinda sad"), {"sadness": 0.6})

    def test_stretched_intensifier(self):
        self.assertEqual(raw("sooo sad"), {"sadness": 1.5})

    def test_affirmation_rule(self):
        self.assertEqual(raw("I'm beautiful"), {"beauty": 1.0, "hope": 0.5})

    def test_no_affirmation_when_negated(self):
        self.assertEqual(raw("I'm not happy"), {"sadness": 0.5})

    def test_reassurance_phrases(self):
        self.assertEqual(raw("Don't worry, it'll be okay"), {"hope": 1.8})


class TestLineWeights(unittest.TestCase):
    def test_repeated_line_counts_less(self):
        total = raw("tears\ntears\ntears\ntears")["sadness"]
        self.assertAlmostEqual(total, 1 + 1 / 2 ** 0.5 + 1 / 3 ** 0.5 + 0.5, places=3)

    def test_ad_lib_counts_half(self):
        self.assertEqual(raw("(tears)"), {"sadness": 0.5})


class TestResult(unittest.TestCase):
    def test_result_is_normalised(self):
        result = ANALYSER.analyse("tears and smile")
        self.assertAlmostEqual(sum(result.scores.values()), 1.0)
        self.assertEqual(result.matched_words, 2)

    def test_word_stats(self):
        result = ANALYSER.analyse("I miss you. Tears, tears and more tears")
        self.assertEqual(result.total_words, 8)
        self.assertEqual(result.top_word_counts[0], ["tears", 3])

    def test_word_map(self):
        self.assertEqual(ANALYSER.word_map("I'm not happy. On fire (tears)"),
                         [["i", None], ["am", None], ["not", None], ["happy", "sadness"],
                          ["on", "pumped_up"], ["fire", "pumped_up"], ["tears", "sadness"]])

    def test_two_songs_add_raw_scores(self):
        result = ANALYSER.analyse_songs(["tears", "tears tears"])
        self.assertEqual(result.top(1)[0][0], "sadness")
        self.assertEqual(result.matched_words, 3)


if __name__ == "__main__":
    unittest.main()
