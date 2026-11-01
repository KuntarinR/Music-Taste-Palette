"""Data classes, the 14 emotions and their 5 families (with their colours and words)."""

from dataclasses import dataclass, field

EMOTIONS = ("amusement", "joy", "desire", "beauty", "relaxation", "sadness",
            "dreaminess", "triumph", "anxiety", "annoyance", "defiance",
            "pumped_up", "nostalgia", "hope")

EMOTION_FAMILIES = {
    "bright": ("joy", "amusement", "triumph", "hope"),
    "fiery": ("pumped_up", "defiance", "annoyance"),
    "tender": ("desire", "beauty", "dreaminess", "nostalgia"),
    "calm": ("relaxation",),
    "heavy": ("sadness", "anxiety"),
}
FAMILY_OF = {emotion: family for family, emotions in EMOTION_FAMILIES.items() for emotion in emotions}

FAMILY_GLOWS = {
    "bright": ("#F5CF7A", "golden", "glow", "You lean towards the light: joy, hope and little wins."),
    "fiery": ("#F4A3A0", "rose", "ember", "You run warm: energy, fire and the urge to move."),
    "tender": ("#B3A6F2", "lavender", "haze", "You feel softly and deeply: longing, beauty and memories."),
    "calm": ("#9DD6A6", "sage", "mist", "You carry a quiet calm: rest, ease and room to breathe."),
    "heavy": ("#8FDCCB", "sea-glass", "tide", "You hold heavy feelings honestly: sadness and worry, felt with care."),
}


@dataclass
class Survey:
    """A user's This-or-That answers and favourite genres."""
    era: str
    love_song: str
    spotlight: str
    vibe: str
    mindset: str
    genres: list

    QUESTION_KEYS = ("era", "love_song", "spotlight", "vibe", "mindset")

    def answers(self):
        """The five This-or-That answers as a dict, e.g. {"era": "oldies", ...}."""
        return {key: getattr(self, key) for key in Survey.QUESTION_KEYS}


@dataclass
class EmotionResult:
    """Emotion scores from analysing lyrics. Scores always add up to 1 (or are all 0)."""
    scores: dict
    mode: str = "offline"
    matched_words: int = 0
    top_words: list = field(default_factory=list)
    total_words: int = 0
    top_word_counts: list = field(default_factory=list)

    def __post_init__(self):
        scores = dict(self.scores)
        for emotion in scores:
            if emotion not in EMOTIONS:
                raise ValueError(f"Unknown emotion: {emotion}")
        total = sum(scores.values())
        normalised = {}
        for emotion in EMOTIONS:
            value = scores.get(emotion, 0.0)
            if total > 0 and abs(total - 1) > 1e-9:
                value = value / total
            normalised[emotion] = value
        self.scores = normalised

    def vector(self):
        """Scores as a list in EMOTIONS order."""
        return [self.scores[emotion] for emotion in EMOTIONS]

    def is_empty(self):
        """True if no emotional words were found."""
        return sum(self.scores.values()) == 0

    def top(self, n=3):
        """The n strongest emotions as (emotion, score) pairs."""
        ranked = sorted(self.scores.items(), key=lambda item: item[1], reverse=True)
        return ranked[:n]

    def percentages(self):
        """Scores as whole-number percentages for display."""
        return {emotion: round(score * 100) for emotion, score in self.scores.items()}


@dataclass
class Aesthetic:
    """One of the music personalities, loaded from aesthetics.json."""
    key: str
    name: str
    tagline: str
    description: str
    profile: dict
    genres: list
    colour: str

    def vector(self):
        return [self.profile.get(emotion, 0.0) for emotion in EMOTIONS]

    @classmethod
    def from_dict(cls, key, data):
        return cls(key=key, **data)


@dataclass
class SongEntry:
    """A song in the recommendation list, loaded from songs.json."""
    title: str
    artist: str
    genre: str
    era: str
    chart_rank: int
    mood: dict

    def vector(self):
        return [self.mood.get(emotion, 0.0) for emotion in EMOTIONS]


@dataclass
class MatchResult:
    """How well an emotion profile matches the aesthetics."""
    aesthetic_key: str
    percent: int
    hybrid_key: str
    ranking: list
    confidence: str = ""
