"""Turns song lyrics into emotion scores using the lexicon and the modifier rules."""

import re
from collections import Counter

from models import EMOTIONS, EmotionResult


class LyricsAnalyser:
    """Offline, lexicon-based analyser. Create it once with the loaded data, then reuse it."""

    WORD_PATTERN = re.compile(r"[a-z']+")
    SECTION_LABEL = re.compile(r"\[[^\]]*\]")
    SENTENCE_END = re.compile(r"[.!?;]+")
    AD_LIB = re.compile(r"\(([^)]*)\)")
    STRETCHED = re.compile(r"(.)\1{2,}")

    def __init__(self, lexicon, modifiers):
        self.lexicon = self.flatten_lexicon(lexicon)
        self.contractions = modifiers["contractions"]
        self.negations = set(modifiers["negations"])
        self.negation_exceptions = set(modifiers["negation_exceptions"])
        self.opposites = modifiers["opposites"]
        self.opposite_weight = modifiers["opposite_weight"]
        self.intensifiers = modifiers["intensifiers"]
        self.diminishers = modifiers["diminishers"]
        self.affirmations = modifiers["affirmations"]
        settings = modifiers["settings"]
        self.negation_window = settings["negation_window"]
        self.modifier_window = settings["modifier_window"]
        self.max_phrase_words = settings["max_phrase_words"]
        self.adlib_weight = settings["adlib_weight"]

    @staticmethod
    def flatten_lexicon(grouped):
        """Turn {emotion: {word: weight}} into {word: {emotion: weight}} for fast lookup."""
        flat = {}
        for emotion, words in grouped.items():
            for word, weight in words.items():
                flat.setdefault(word, {})[emotion] = weight
        return flat


    def analyse(self, lyrics):
        """Analyse one song's lyrics and return an EmotionResult."""
        return self.analyse_songs([lyrics])

    def analyse_songs(self, all_lyrics):
        """Analyse one or more songs together; songs with more emotional words count for more."""
        totals = dict.fromkeys(EMOTIONS, 0.0)
        matched = Counter()
        total_words = 0
        for lyrics in all_lyrics:
            scores, words = self.raw_scores(lyrics)
            for emotion, value in scores.items():
                totals[emotion] += value
            matched.update(words)
            total_words += self.count_words(lyrics)
        most_found = matched.most_common(5)
        return EmotionResult(totals, mode="offline", matched_words=sum(matched.values()),
                             top_words=[word for word, _ in most_found], total_words=total_words,
                             top_word_counts=[[word, count] for word, count in most_found])

    def count_words(self, lyrics):
        """How many words the lyrics have (after expanding contractions), for the stats card."""
        return sum(len(self.tokenise(line)) for line in self.clean(lyrics).split("\n"))

    def raw_scores(self, lyrics):
        """Return (raw emotion totals, Counter of matched lexicon entries) for one song."""
        totals = dict.fromkeys(EMOTIONS, 0.0)
        matched = Counter()
        times_seen = Counter()
        for line in self.clean(lyrics).split("\n"):
            if not line.strip():
                continue
            times_seen[line] += 1
            line_weight = 1 / times_seen[line] ** 0.5
            main_part = self.AD_LIB.sub(" ", line)
            ad_libs = " ".join(self.AD_LIB.findall(line))
            for text, weight in ((main_part, line_weight), (ad_libs, line_weight * self.adlib_weight)):
                for entry, scores, _, _ in self.score_line(self.tokenise(text)):
                    matched[entry] += 1
                    for emotion, value in scores.items():
                        totals[emotion] += value * weight
        return totals, matched

    def word_map(self, lyrics):
        """Every word in reading order as [word, emotion], for the lyrics tapestry."""
        words = []
        for line in self.clean(lyrics).split("\n"):
            main_part = self.AD_LIB.sub(" ", line)
            ad_libs = " ".join(self.AD_LIB.findall(line))
            for text in (main_part, ad_libs):
                tokens = self.tokenise(text)
                emotions = [None] * len(tokens)
                for _, scores, start, length in self.score_line(tokens):
                    strongest = max(scores, key=scores.get, default=None)
                    if strongest is not None and scores[strongest] > 0:
                        emotions[start:start + length] = [strongest] * length
                words.extend([token, emotion] for token, emotion in zip(tokens, emotions))
        return words


    def clean(self, lyrics):
        """Lowercase, drop section labels like [Chorus] and split the lyrics into lines."""
        text = lyrics.lower().replace("\u2019", "'").replace("\u2018", "'")
        text = self.SECTION_LABEL.sub("\n", text)
        text = self.SENTENCE_END.sub("\n", text)
        lines = [line.strip() for line in text.split("\n")]
        return "\n".join(line for line in lines if line)

    def tokenise(self, text):
        """Split text into words, expanding contractions (I'm -> i am, lovin' -> loving)."""
        tokens = []
        for word in self.WORD_PATTERN.findall(text.lower()):
            if word in self.contractions:
                tokens.extend(self.contractions[word].split())
            elif word.endswith("n't"):
                tokens.extend([word[:-3], "not"])
            elif word.endswith("in'"):
                tokens.append(word[:-1] + "g")
            elif word.endswith("'s"):
                tokens.append(word[:-2])
            else:
                word = word.strip("'")
                if word:
                    tokens.append(word)
        return tokens


    def score_line(self, tokens):
        """Match one line's words; returns (entry, scores, first word index, word count) per match."""
        results = []
        negation_at = None
        multiplier = None
        affirmation_at = None
        i = 0
        while i < len(tokens):
            pair = " ".join(tokens[i:i + 2])

            if pair in self.negation_exceptions:
                i += 2
                continue

            phrase = self.match_phrase(tokens, i)
            if phrase:
                entry, length = phrase
                scores = dict(self.lexicon[entry])
                index = i + length - 1
            elif pair in self.affirmations["prefixes"]:
                affirmation_at = i + 1
                i += 2
                continue
            elif self.any_variant(tokens[i], self.negations):
                negation_at = i
                i += 1
                continue
            elif self.modifier_value(tokens[i]) is not None:
                multiplier = (self.modifier_value(tokens[i]), i)
                i += 1
                continue
            else:
                entry = self.match_word(tokens[i])
                if entry is None:
                    i += 1
                    continue
                scores = dict(self.lexicon[entry])
                length = 1
                index = i

            negated = negation_at is not None and index - negation_at <= self.negation_window
            if negated:
                scores = self.negate(scores)
                negation_at = None
            if multiplier is not None and index - multiplier[1] <= self.modifier_window:
                scores = {emotion: value * multiplier[0] for emotion, value in scores.items()}
                multiplier = None
            if not negated and affirmation_at is not None \
                    and index - affirmation_at <= self.affirmations["window"]:
                scores = self.add_affirmation(scores)
                affirmation_at = None

            results.append((entry, scores, i, length))
            i += length
        return results

    def match_phrase(self, tokens, start):
        """Longest lexicon phrase (2 to max_phrase_words words) starting at `start`."""
        for length in range(self.max_phrase_words, 1, -1):
            if start + length <= len(tokens):
                phrase = " ".join(tokens[start:start + length])
                if phrase in self.lexicon:
                    return phrase, length
        return None

    def match_word(self, word):
        """Find a single word in the lexicon, trying common endings (crying -> cry)."""
        for candidate in self.word_variants(word):
            if candidate in self.lexicon:
                return candidate
        return None

    def unstretched(self, word):
        """The word plus versions without stretched letters: sooo -> soo -> so."""
        forms = [word]
        if self.STRETCHED.search(word):
            forms += [self.STRETCHED.sub(r"\1\1", word), self.STRETCHED.sub(r"\1", word)]
        return forms

    def word_variants(self, word):
        """The word itself, then forms without stretched letters or common endings."""
        variants = []
        for form in self.unstretched(word):
            variants.append(form)
            if form.endswith(("ies", "ied")):
                variants.append(form[:-3] + "y")
            if form.endswith("ying"):
                variants.append(form[:-4] + "ie")
            for ending in ("ing", "ed"):
                if form.endswith(ending) and len(form) > len(ending) + 2:
                    base = form[:-len(ending)]
                    variants += [base, base + "e"]
                    if len(base) > 2 and base[-1] == base[-2]:
                        variants.append(base[:-1])
            if form.endswith("es"):
                variants.append(form[:-2])
            if form.endswith("s"):
                variants.append(form[:-1])
            if form.endswith("ily"):
                variants.append(form[:-3] + "y")
            elif form.endswith("ly"):
                variants.append(form[:-2])
        return variants

    def any_variant(self, word, collection):
        """True if the word, or its un-stretched form, is in the collection."""
        return any(form in collection for form in self.unstretched(word))

    def modifier_value(self, word):
        """Multiplier for an intensifier/diminisher (so -> 1.5, kinda -> 0.6), or None."""
        for form in self.unstretched(word):
            if form in self.intensifiers:
                return self.intensifiers[form]
            if form in self.diminishers:
                return self.diminishers[form]
        return None

    def negate(self, scores):
        """A negated word loses its emotion; part of it moves to the opposite emotion."""
        flipped = {}
        for emotion, value in scores.items():
            opposite = self.opposites.get(emotion)
            if opposite:
                flipped[opposite] = flipped.get(opposite, 0.0) + value * self.opposite_weight
        return flipped

    def add_affirmation(self, scores):
        """After "i am" / "you are", positive words also add hope (I'm beautiful -> +hope)."""
        boost = sum(value for emotion, value in scores.items()
                    if emotion in self.affirmations["boost_from"])
        if boost > 0:
            target = self.affirmations["boost_to"]
            scores[target] = scores.get(target, 0.0) + boost * self.affirmations["boost"]
        return scores
