"""Loads the five data files (JSON) from the data folder."""

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"


def load_json(filename):
    """Read one JSON file from the data folder and return its contents."""
    path = DATA_DIR / filename
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        sys.exit(f"Error: {path} not found. Make sure the data folder is next to main.py.")
    except json.JSONDecodeError as error:
        sys.exit(f"Error: {path} is not valid JSON (line {error.lineno}, column {error.colno}).")


def load_all_data():
    """Load all five data files once, at program start."""
    return {
        "lexicon": load_json("lexicon.json"),
        "aesthetics": load_json("aesthetics.json"),
        "modifiers": load_json("modifiers.json"),
        "songs": load_json("songs.json"),
        "survey": load_json("survey.json"),
    }


if __name__ == "__main__":
    data = load_all_data()
    print("lexicon:", len(data["lexicon"]), "emotions")
    print("aesthetics:", len(data["aesthetics"]))
    print("modifiers keys:", list(data["modifiers"]))
    print("songs:", len(data["songs"]))
    print("survey questions:", len(data["survey"]["questions"]))