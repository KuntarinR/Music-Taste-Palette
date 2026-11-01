"""Saves each player's attempts, songs and auras as one JSON file per nickname."""

import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path

from collections import Counter

from models import FAMILY_GLOWS, FAMILY_OF


class Archive:
    """Loads, changes and saves each player's file, and applies the saving rules (limits, auras, dates)."""

    MAX_ATTEMPTS = 3
    MAX_NAME_LENGTH = 10
    MAX_SONGS = 60
    MAX_SONG_TITLE = 40
    MAX_AURA_WORDS = 150
    MAX_AURAS = 10
    MAX_AURA_NAME = 30

    MESSAGES = {
        "song_title_long": f"Keep the song name to {MAX_SONG_TITLE} characters or fewer.",
        "song_title_empty": "Give the song a name.",
        "no_song": "We couldn't find that song. It may have been deleted.",
        "aura_name_long": f"Keep the aura's name to {MAX_AURA_NAME} characters or fewer.",
        "aura_empty": "Your aura is still empty. Add a song to it before starting a new one.",
        "too_many_auras": f"You can keep up to {MAX_AURAS} auras.",
        "no_aura": "We couldn't find that aura.",
        "nothing_to_export": "This aura is still empty. Add a song first, then export your stats.",
    }

    def __init__(self, folder):
        self.folder = Path(folder)
        self.folder.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()


    @classmethod
    def clean_name(cls, name):
        """Check a nickname: English letters or numbers, 1-10 characters. Returns it uppercased."""
        name = name.strip()
        if not name or len(name) > cls.MAX_NAME_LENGTH or not name.isascii() or not name.isalnum():
            raise ValueError(f"Nicknames can use English letters and numbers only, up to "
                             f"{cls.MAX_NAME_LENGTH} characters. Try something like Mint or Bank99.")
        return name.upper()

    def path(self, name):
        """The player's file. clean_name only allows letters and numbers, so it is a safe file name."""
        return self.folder / f"{self.clean_name(name).lower()}.json"

    def load(self, name):
        """The player's saved data (empty for a new player)."""
        path = self.path(name)
        try:
            with open(path, encoding="utf-8") as file:
                data = json.load(file)
        except FileNotFoundError:
            data = {}
        except json.JSONDecodeError:
            os.replace(path, path.with_suffix(".broken.json"))
            data = {}
        data.setdefault("attempt_count", 0)
        data.setdefault("attempts", [])
        data.setdefault("song_count", 0)
        data.setdefault("songs", [])
        # files from before auras existed: everything so far is aura 1
        if not data.get("auras"):
            started = data["songs"][0]["date"] if data["songs"] else self.now()
            data["auras"] = [{"number": 1, "name": "", "started": started}]
        for song in data["songs"]:
            song.setdefault("aura", 1)
        return data

    def save(self, name, data):
        """Write to a temporary file first, so a crash can never leave a half-written file."""
        path = self.path(name)
        temporary = path.with_suffix(".tmp")
        with open(temporary, "w", encoding="utf-8") as file:
            json.dump(data, file, indent=2, ensure_ascii=False)
        os.replace(temporary, path)

    def change(self, name, action):
        """Load the player's data, run action(data) and save it (nothing is saved on error)."""
        with self.lock:
            data = self.load(name)
            result = action(data)
            self.save(name, data)
            return result

    @staticmethod
    def now():
        return datetime.now().isoformat(timespec="seconds")

    @staticmethod
    def new_id():
        return uuid.uuid4().hex[:10]


    def add_attempt(self, name, summary):
        """Save a finished play; returns True if the oldest attempt was replaced."""
        def action(data):
            data["attempt_count"] += 1
            data["attempts"].append({**summary, "number": data["attempt_count"], "date": self.now()})
            replaced = len(data["attempts"]) > self.MAX_ATTEMPTS
            if replaced:
                data["attempts"].pop(0)
            return replaced
        return self.change(name, action)

    @staticmethod
    def latest_attempt(data):
        return data["attempts"][-1] if data["attempts"] else None


    def clean_song_title(self, title):
        clean = " ".join(str(title or "").split())
        if len(clean) > self.MAX_SONG_TITLE:
            raise ValueError(self.MESSAGES["song_title_long"])
        return clean

    def add_song(self, name, title, emotions, words, source):
        """Save an analysed song in your current aura, which keeps its newest MAX_SONGS."""
        clean = self.clean_song_title(title)
        def action(data):
            data["song_count"] += 1
            current = data["auras"][-1]["number"]
            song = {"id": self.new_id(), "title": clean or f"Song {data['song_count']}", "date": self.now(),
                    "source": source, "emotions": {e: p for e, p in emotions.items() if p > 0}, "words": words,
                    "aura": current}
            data["songs"].append(song)
            in_aura = [s for s in data["songs"] if s["aura"] == current]
            for old in in_aura[:-self.MAX_SONGS]:
                data["songs"].remove(old)
            return song
        return self.change(name, action)

    def new_aura(self, name, aura_name):
        """Close your current aura and start an empty one, e.g. when your music has changed a lot.
        The name is optional (an empty one shows as "Aura 2"). Old auras and their songs are kept."""
        clean = " ".join(str(aura_name or "").split())
        if len(clean) > self.MAX_AURA_NAME:
            raise ValueError(self.MESSAGES["aura_name_long"])
        def action(data):
            current = data["auras"][-1]["number"]
            if not any(s["aura"] == current for s in data["songs"]):
                raise ValueError(self.MESSAGES["aura_empty"])
            if len(data["auras"]) >= self.MAX_AURAS:
                raise ValueError(self.MESSAGES["too_many_auras"])
            aura = {"number": current + 1, "name": clean, "started": self.now()}
            data["auras"].append(aura)
            return aura
        return self.change(name, action)

    def find_song(self, data, song_id):
        song = next((s for s in data["songs"] if s["id"] == song_id), None)
        if song is None:
            raise ValueError(self.MESSAGES["no_song"])
        return song

    def rename_song(self, name, song_id, title):
        clean = self.clean_song_title(title)
        if not clean:
            raise ValueError(self.MESSAGES["song_title_empty"])
        def action(data):
            self.find_song(data, song_id)["title"] = clean
        self.change(name, action)

    def delete_song(self, name, song_id):
        def action(data):
            data["songs"].remove(self.find_song(data, song_id))
        self.change(name, action)

    def aura(self, songs):
        """Your aura for the aura page: emotions, words, songs and overall glow."""
        totals = Counter()
        for song in songs:
            totals.update(song["emotions"])
        emotions = [{"emotion": e, "percent": round(total / len(songs)), "family": FAMILY_OF[e],
                     "songs": sum(1 for s in songs if e in s["emotions"])}
                    for e, total in totals.most_common() if round(total / len(songs)) > 0]
        words = Counter()
        for song in songs:
            for word, emotion, times in song["words"]:
                words[(word, emotion)] += times
        return {
            "emotions": emotions,
            "songs": [{"id": s["id"], "title": s["title"], "source": s["source"], "date_label": self.full_date(s["date"]),
                       "top": sorted(s["emotions"].items(), key=lambda item: item[1], reverse=True)[:3],
                       "families": self.family_totals(s["emotions"]),
                       "glow": self.glow(s["emotions"]),
                       "words": [{"word": w, "emotion": e, "family": FAMILY_OF[e], "count": c} for w, e, c in s["words"]]}
                      for s in songs],
            "words": [{"word": word, "emotion": emotion, "family": FAMILY_OF[emotion], "count": count}
                      for (word, emotion), count in words.most_common(self.MAX_AURA_WORDS)],
            "glow": self.glow({e["emotion"]: e["percent"] for e in emotions}),
        }

    @staticmethod
    def glow(emotions):
        """Your overall colour and its name from {emotion: percent}, or None if empty."""
        families = Archive.family_totals(emotions)
        total = sum(families.values())
        if not total:
            return None
        ranked = sorted(families.items(), key=lambda item: item[1], reverse=True)
        first = ranked[0][0]
        second = ranked[1][0] if len(ranked) > 1 and ranked[1][1] >= total * 0.15 else first
        top_two = dict(ranked[:2])
        mixed = [0.0, 0.0, 0.0]
        for family, percent in top_two.items():
            colour = FAMILY_GLOWS[family][0]
            for i in range(3):
                mixed[i] += int(colour[1 + 2 * i:3 + 2 * i], 16) * percent / sum(top_two.values())
        return {
            "colour": "#" + "".join(f"{round(value):02X}" for value in mixed),
            "name": f"{FAMILY_GLOWS[first][1]} {FAMILY_GLOWS[second][2]}",
            "meaning": FAMILY_GLOWS[first][3],
            "families": [[family, round(100 * percent / total)] for family, percent in ranked],
        }

    @staticmethod
    def family_totals(emotions):
        """{emotion: percent} -> {family: percent}, e.g. joy 30 + hope 20 -> bright 50"""
        totals = Counter()
        for emotion, percent in emotions.items():
            totals[FAMILY_OF[emotion]] += percent
        return dict(totals)


    @staticmethod
    def full_date(iso):
        date = datetime.fromisoformat(iso)
        return f"{date.day} {date.strftime('%b %Y')}"

    def view(self, name, showing=None):
        """Everything the aura page needs, with labels and limits worked out here.
        showing: the number of a past aura to look back at (the current one if None)."""
        with self.lock:
            data = self.load(name)
        me = self.latest_attempt(data)
        auras = data["auras"]
        current = auras[-1]["number"]
        if showing is None:
            showing = current
        if not any(a["number"] == showing for a in auras):
            raise ValueError(self.MESSAGES["no_aura"])
        summaries = []
        for index, aura in enumerate(auras):
            songs = [s for s in data["songs"] if s["aura"] == aura["number"]]
            ended = auras[index + 1]["started"] if index + 1 < len(auras) else None
            summaries.append({
                "number": aura["number"],
                "label": aura["name"] or f"Aura {aura['number']}",
                "dates": self.full_date(aura["started"]) + (f" \u2013 {self.full_date(ended)}" if ended else " \u2013 now"),
                "since": self.full_date(aura["started"]),
                "songs": len(songs),
                "glow": self.aura(songs)["glow"] if songs else None,
                "current": aura["number"] == current,
            })
        return {
            "me": {key: me[key] for key in ("name", "aesthetic")} if me else None,
            "aura": self.aura([s for s in data["songs"] if s["aura"] == showing]),
            "auras": summaries,
            "showing": showing,
            "limits": {"songs": self.MAX_SONGS, "song_title": self.MAX_SONG_TITLE, "aura_name": self.MAX_AURA_NAME},
        }

    def report(self, name, showing=None):
        """Your aura's lyrics stats as a plain-text file: returns (file name, text).
        Lyrics are never saved, so the file holds only what was found in them."""
        view = self.view(name, showing)
        aura = view["aura"]
        if not aura["songs"]:
            raise ValueError(self.MESSAGES["nothing_to_export"])
        shown = next(a for a in view["auras"] if a["number"] == view["showing"])
        player = view["me"]["name"] if view["me"] else self.clean_name(name).capitalize()
        glow = aura["glow"]
        count = len(aura["songs"])
        lines = [
            f"{player.upper()}'S AURA: LYRICS STATS",
            f"{shown['label']} ({shown['dates']})",
            f"Exported {self.full_date(self.now())}",
            "",
            f"Overall colour: {glow['name']} ({glow['colour']})",
            glow["meaning"],
            "",
            f"FEELINGS (average over {count} song{'' if count == 1 else 's'})",
        ]
        width = max(len(e["emotion"]) for e in aura["emotions"])
        for e in aura["emotions"]:
            bar = "\u2588" * max(1, round(e["percent"] / 2))
            lines.append(f"  {e['emotion'].replace('_', ' '):<{width}}  {e['percent']:>3}%  {bar}")
        lines += ["", "FAMILIES"]
        lines += [f"  {family:<7} {percent:>3}%" for family, percent in glow["families"]]
        lines += ["", "MOST FOUND WORDS"]
        lines += [f"  {w['word']:<14} {w['emotion'].replace('_', ' '):<11} x{w['count']}" for w in aura["words"][:15]]
        lines += ["", "SONGS (first to latest)"]
        for number, song in enumerate(aura["songs"], start=1):
            top = ", ".join(f"{e.replace('_', ' ')} {p}%" for e, p in song["top"])
            words = ", ".join(w["word"] for w in song["words"][:8])
            source = "from a play" if song["source"] == "play" else "added"
            lines += [f"  {number}. {song['title']} \u00b7 {song['date_label']} \u00b7 {source} \u00b7 {song['glow']['name']}",
                      f"     feelings: {top}",
                      f"     words: {words or '-'}"]
        lines += ["", "Lyrics are never saved: only the feelings and words found in them."]
        slug = "".join(c if c.isalnum() else "-" for c in shown["label"].lower()).strip("-") or f"aura-{shown['number']}"
        return f"{player.lower()}-{slug}-stats.txt", "\n".join(lines) + "\n"
