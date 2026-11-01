"""Text mode: the whole app in the terminal (python3 main.py --text), e.g. inside Ed where there is no browser.
It asks the same questions as the web page and uses the same Python logic (MusicApp), then prints the results."""


def ask(prompt, valid=None):
    """Ask until the answer is one of `valid` (any answer if valid is None)."""
    while True:
        answer = input(prompt).strip()
        if valid is None or answer in valid:
            return answer
        print(f"  Please type one of: {', '.join(valid)}")


def ask_nickname(app):
    while True:
        try:
            return app.read_name({"name": input("What should I call you? ")})
        except ValueError as error:
            print(f"  {error}")


def ask_answers(config):
    """The five This-or-That questions: type 1 or 2."""
    answers = {}
    for number, question in enumerate(config["questions"], start=1):
        options = list(question["options"].items())
        print(f"\n{number}/{len(config['questions'])}  {question['question']}")
        for index, (_, option) in enumerate(options, start=1):
            print(f"  {index}) {option['label']}: {option['description']}")
        choice = ask("Your choice (1 or 2): ", ["1", "2"])
        answers[question["key"]] = options[int(choice) - 1][0]
    return answers


def ask_genres(config):
    """1 to max_genres genres, typed as numbers separated by commas."""
    keys = list(config["genres"])
    print(f"\nPick 1 to {config['max_genres']} genres you love:")
    for index, key in enumerate(keys, start=1):
        print(f"  {index:>2}) {config['genres'][key]}")
    while True:
        picked = [part.strip() for part in input("Numbers, separated by commas: ").split(",") if part.strip()]
        if picked and all(p.isdigit() and 1 <= int(p) <= len(keys) for p in picked) \
                and len(set(picked)) <= config["max_genres"]:
            return [keys[int(p) - 1] for p in dict.fromkeys(picked)]
        print(f"  Please type 1 to {config['max_genres']} numbers from the list, e.g. 2, 5")


def ask_lyrics():
    """Lyrics can be pasted over many lines; an empty line ends them."""
    print("Paste the lyrics, then press Enter on an empty line:")
    lines = []
    while True:
        line = input()
        if not line.strip() and lines:
            return "\n".join(lines)
        if line.strip():
            lines.append(line)


def bar(percent):
    return "█" * max(1, round(percent / 4))


def show_result(result):
    print("\n" + "=" * 50)
    print(f"{result['name']}, just from your lyrics, you might be...")
    match = f"{result['aesthetic']['name'].upper()}  ({result['aesthetic']['percent']}% match)"
    if result["hybrid"]:
        match += f" with a touch of {result['hybrid']['name']} ({result['hybrid']['percent']}%)"
    print(match)
    print(result["aesthetic"]["tagline"])
    print("\nWhat we heard:")
    for emotion, percent in sorted(result["emotions"].items(), key=lambda item: item[1], reverse=True):
        if percent > 0:
            print(f"  {emotion.replace('_', ' '):<11} {percent:>3}%  {bar(percent)}")
    print(f"\n{result['total_words']} words read, {result['matched_words']} emotional words "
          f"({result['coverage']}% carry emotion)")
    print("\nSongs for your mood:")
    for song in result["songs"]:
        print(f"  - {song['title']} by {song['artist']}")


def show_aura(player):
    aura = player["aura"]
    if not aura["glow"]:
        return
    count = len(aura["songs"])
    print(f"\nYour aura: {aura['glow']['name']} ({count} song{'' if count == 1 else 's'})")
    print(aura["glow"]["meaning"])


def run(app):
    config = app.config()
    print("Discover your music taste palette, made from your songs. (Text mode)\n")
    name = ask_nickname(app)
    answers = ask_answers(config)
    genres = ask_genres(config)
    title = input("\nSong name (optional): ")
    while True:
        try:
            result = app.analyse({"name": name, "answers": answers, "genres": genres,
                                  "lyrics": ask_lyrics(), "title": title})
            break
        except ValueError as error:
            print(f"\n{error}\n")
    show_result(result)
    show_aura(app.archive.view(name))
    while ask("\nAdd another song to your aura? (y/n) ", ["y", "n", "Y", "N"]).lower() == "y":
        try:
            show_aura(app.add_song({"name": name, "title": input("Song name (optional): "),
                                    "lyrics": ask_lyrics()})["player"])
        except ValueError as error:
            print(f"\n{error}")
    print("\nThanks for playing! Run python3 main.py (without --text) to see your aura in colour.")
