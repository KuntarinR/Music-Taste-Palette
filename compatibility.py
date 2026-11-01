"""Matching: emotions -> aesthetic, and song recommendations."""

from models import MatchResult


def cosine_similarity(a, b):
    """How similar two emotion vectors are in shape: 0 (nothing alike) to 1 (identical)."""
    dot = sum(x * y for x, y in zip(a, b))
    size_a = sum(x * x for x in a) ** 0.5
    size_b = sum(y * y for y in b) ** 0.5
    if size_a == 0 or size_b == 0:
        return 0.0
    return dot / (size_a * size_b)


class Matcher:
    """Compares emotion results with the aesthetics and the songs."""

    HYBRID_GAP = 0.10
    MIN_WORDS = 8
    CONFIDENT_WORDS = 20

    def __init__(self, aesthetics, songs, survey_config):
        self.aesthetics = aesthetics
        self.songs = songs
        self.questions = survey_config["questions"]
        self.weights = survey_config["weights"]


    def match(self, emotions, survey=None):
        """Rank all aesthetics for an EmotionResult. With a survey, answers and genres add small bonuses."""
        scores = {}
        for key, aesthetic in self.aesthetics.items():
            score = cosine_similarity(emotions.vector(), aesthetic.vector())
            if survey is not None:
                score += self.weights["answer_bonus"] * self.answer_votes(survey).count(key)
                if set(survey.genres) & set(aesthetic.genres):
                    score += self.weights["aesthetic_genre_bonus"]
            scores[key] = min(score, 1.0)
        ranked = sorted(scores, key=lambda key: scores[key], reverse=True)
        best, second = ranked[0], ranked[1]
        hybrid = second if scores[best] - scores[second] <= self.HYBRID_GAP else ""
        return MatchResult(
            aesthetic_key=best,
            percent=round(scores[best] * 100),
            hybrid_key=hybrid,
            ranking=[[key, round(scores[key] * 100)] for key in ranked],
            confidence=self.confidence(emotions.matched_words, scores[best] - scores[second]),
        )

    def answer_votes(self, survey):
        """The aesthetic each chosen option points to (options with no aesthetic are skipped)."""
        votes = []
        for question in self.questions:
            option = question["options"][getattr(survey, question["key"])]
            if option["aesthetic"]:
                votes.append(option["aesthetic"])
        return votes

    def answer_texts(self, survey):
        """One result-description line per answer, e.g. "You believe the old songs hit different." """
        return [question["options"][getattr(survey, question["key"])]["result_text"]
                for question in self.questions]

    def confidence(self, matched_words, gap):
        if matched_words < self.MIN_WORDS:
            return "none"
        if matched_words < self.CONFIDENT_WORDS:
            return "low"
        return "high" if gap >= self.HYBRID_GAP else "medium"

    def recommend(self, emotions, genres, count=3):
        """The songs whose mood is closest to these emotions; songs in the user's genres get a small boost."""
        def score(song):
            bonus = self.weights["song_genre_bonus"] if song.genre in genres else 0.0
            return cosine_similarity(emotions.vector(), song.vector()) + bonus
        return sorted(self.songs, key=score, reverse=True)[:count]

