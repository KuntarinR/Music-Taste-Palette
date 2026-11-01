"""Tests for compatibility.py. Run from the project folder: python3 -m unittest discover tests"""

import unittest

from compatibility import Matcher, cosine_similarity
from models import Aesthetic, EmotionResult, SongEntry, Survey
from storage import load_all_data

DATA = load_all_data()
AESTHETICS = {key: Aesthetic.from_dict(key, value) for key, value in DATA["aesthetics"].items()}
SONGS = [SongEntry(**song) for song in DATA["songs"]]
MATCHER = Matcher(AESTHETICS, SONGS, DATA["survey"])


class TestCosine(unittest.TestCase):
    def test_identical_and_opposite(self):
        self.assertAlmostEqual(cosine_similarity([1, 0], [2, 0]), 1.0)
        self.assertEqual(cosine_similarity([1, 0], [0, 1]), 0.0)

    def test_zero_vector_does_not_crash(self):
        self.assertEqual(cosine_similarity([0, 0], [1, 1]), 0.0)


class TestMatch(unittest.TestCase):
    def test_each_profile_matches_itself(self):
        for key, aesthetic in AESTHETICS.items():
            result = MATCHER.match(EmotionResult(aesthetic.profile))
            self.assertEqual(result.aesthetic_key, key)
            self.assertEqual(result.percent, 100)

    def test_worked_example(self):
        emotions = EmotionResult({"desire": .30, "sadness": .30, "nostalgia": .15, "anxiety": .10,
                                  "beauty": .05, "joy": .05, "relaxation": .05})
        result = MATCHER.match(emotions)
        self.assertEqual(result.aesthetic_key, "hopeless_romantic")
        self.assertEqual(result.percent, 92)
        self.assertEqual(result.ranking[1], ["nostalgic", 64])

    def test_answers_and_genres_add_bonus(self):
        emotions = EmotionResult({"dreaminess": 0.5, "joy": 0.5})
        plain = dict(MATCHER.match(emotions).ranking)
        survey = Survey("new_gen", "romantic", "daydreamer", "sunny", "manifesting", ["classical"])
        boosted = dict(MATCHER.match(emotions, survey).ranking)
        self.assertEqual(boosted["dreamer"] - plain["dreamer"], 6)

    def test_hybrid_label(self):
        result = MATCHER.match(EmotionResult({"nostalgia": 0.5, "desire": 0.5, "sadness": 0.5}))
        self.assertNotEqual(result.hybrid_key, "")

    def test_confidence(self):
        self.assertEqual(MATCHER.confidence(5, 0.5), "none")
        self.assertEqual(MATCHER.confidence(12, 0.5), "low")
        self.assertEqual(MATCHER.confidence(30, 0.05), "medium")
        self.assertEqual(MATCHER.confidence(30, 0.2), "high")

    def test_answer_texts(self):
        survey = Survey("oldies", "romantic", "daydreamer", "sunny", "manifesting", ["pop"])
        self.assertEqual(len(MATCHER.answer_texts(survey)), 5)


class TestRecommend(unittest.TestCase):
    def test_nostalgic_songs(self):
        songs = MATCHER.recommend(EmotionResult(AESTHETICS["nostalgic"].profile), ["latin"])
        self.assertEqual(len(songs), 3)
        self.assertEqual(songs[0].title, "DtMF")


if __name__ == "__main__":
    unittest.main()
