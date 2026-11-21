/* Suggestion lists for the Angler Fish Log. Nothing here is read from the game, and nothing
   here limits what can be typed: every field is free text, and these only feed the
   suggestions beside the user's own History.

   Compiled 2026-11-20 from community sources (credited in the About box via `sources`):
   theangler.org and the codeaid/cotw-tacklebox repo agree exactly on the reserves and their
   species. Trait names and meanings are the game's text as both transcribe it.
   Unverified: Golden Ridge's state, whether "Legendary" shows as a medal on the catch card,
   and whether the game has weather at all (players said no in April 2024), so `weather`
   is empty and the field is left to the user. */
window.ANGLER_DATA = {
  sources: [
    { label: "theangler.org", url: "https://theangler.org/" },
    { label: "COTW Tacklebox (codeaid)", url: "https://github.com/codeaid/cotw-tacklebox" },
    { label: "Steam store page", url: "https://store.steampowered.com/app/1408610/" },
  ],

  // Base game first, then the reserves in release order. `legendary` fish are offered in the
  // species suggestions after the regular ones.
  reserves: [
    { id: "golden-ridge", name: "Golden Ridge Reserve", region: "United States",
      species: ["Black Crappie", "Bluegill", "Brook Trout", "Burbot", "Channel Catfish", "Cutthroat Trout",
        "Freshwater Drum", "Golden Trout", "Green Sunfish", "Kokanee Salmon", "Lake Trout", "Largemouth Bass",
        "Mountain Whitefish", "Northern Pike", "Ohrid Trout", "Rainbow Trout", "River Carpsucker", "Rock Bass",
        "Sauger", "Shovelnose Sturgeon", "Signal Crayfish", "Smallmouth Bass", "Tiger Muskie", "Walleye",
        "White Crappie", "Yellow Perch"],
      legendary: ["Big Larry", "Goldstein", "Sidewinder"] },
    { id: "trollsporet", name: "Trollsporet Nature Reserve", region: "Trøndelag, Norway",
      species: ["Alpine Bullhead", "Arctic Char", "Asp", "Atlantic Salmon", "Bream", "Brown Trout",
        "Bullhead Catfish", "Burbot", "Chub", "Common Dace", "European Bullhead", "European Perch", "Grayling",
        "Ide", "Northern Pike", "Roach", "Ruffe", "Zander"],
      legendary: ["Kalle Paul the Dominator", "Speilfinne", "Store Henrik"] },
    { id: "aguas-claras", name: "Aguas Claras Municipio", region: "Andalusia, Spain",
      species: ["Andalusian Barbel", "Brown Trout", "Comizo Barbel", "Common Carp", "Crucian Carp",
        "European Eel", "Largemouth Bass", "Mirror Carp", "Northern Pike", "Pumpkinseed", "Roach", "Rudd",
        "Tench", "Thicklip Mullet", "Thinlip Mullet", "Wels Catfish", "Zander"],
      legendary: ["El Matador", "Alejandro Magno", "La Monstrenca"] },
    { id: "izilo-zasendulo", name: "Izilo Zasendulo", region: "Mpumalanga, South Africa",
      species: ["African Mottled Eel", "African Sharptooth Catfish", "African Tigerfish", "Blue Kurper",
        "Canary Kurper", "Common Carp", "Grass Carp", "Largemouth Yellowfish", "Mirror Carp", "Moggel",
        "Purple Labeo", "Redbreast Kurper", "Rednose Labeo", "Smallmouth Bass", "Smallmouth Yellowfish",
        "Spotted Bass"],
      legendary: ["Karoo Mermaid", "Grootslang", "Mamlambo"] },
    { id: "kamuibetsu", name: "Kamuibetsu", region: "Hokkaido, Japan",
      species: ["Amur Catfish", "Ayu Sweetfish", "Brook Trout", "Cherry Salmon", "Chum Salmon",
        "Dolly Varden Trout", "Feral Koi", "Japanese Dace", "Japanese Eel", "Japanese Freshwater Crab",
        "Japanese Smelt", "Magoi", "Mozambique Tilapia", "Northern Snakehead", "Pond Loach", "Rainbow Trout",
        "Sakhalin Taimen", "Sockeye Salmon", "White Spotted Char"],
      legendary: ["Amemasu", "Koi no Takinobori", "Goto the Immortal"] },
  ],

  // Worst to best: the app ranks "best medal" by this order. Each is a per-species weight band.
  medals: ["Juvenile", "Bronze", "Silver", "Gold", "Diamond", "Legendary"],

  // The store page's time-of-day choices. Whether the game shows an HH:MM clock is unverified.
  timesOfDay: ["Morning", "Day", "Evening", "Night"],

  weather: [],

  // { name, meaning }: the meaning shows beside the suggestion. The last group are each a
  // single legendary fish's own trait.
  traits: [
    { name: "Aggressive", meaning: "Goes directly for a strike without nibbling" },
    { name: "Bottom Lurker", meaning: "Prefers swimming closer to the bottom" },
    { name: "Easily Spooked", meaning: "Gets easily scared by human presence" },
    { name: "Hard Fighter", meaning: "Tries its best to get off the hook" },
    { name: "Jumper", meaning: "Likes jumping out of the water" },
    { name: "Keen Senses", meaning: "Can sense food from a great distance and will respond well to lures" },
    { name: "Last Stand", meaning: "When close to getting caught it fights with renewed vigor" },
    { name: "Night Owl", meaning: "More active at night" },
    { name: "Sun Lover", meaning: "More active after the sun rises" },
    { name: "Spiker", meaning: "Occasionally pretends to rest, then pulls on the line with full force for a few seconds" },
    { name: "Ambusher", meaning: "Goldstein: bites only lures which have recently splashed in the water" },
    { name: "Patient Scavenger", meaning: "Big Larry: bites only baits left soaking in water for a while" },
    { name: "Daredevil", meaning: "Store Henrik: loves hanging around waterfalls and high-speed streams" },
    { name: "Rising Sun", meaning: "Speilfinne: rises to the surface in daytime, hides when it spots tackle" },
    { name: "Social Distancing", meaning: "Kalle Paul the Dominator: keeps a safe distance unless in a fight" },
    { name: "Superiority Complex", meaning: "El Matador: bites eagerly, knowing it will emerge victorious" },
    { name: "Eagle Eyed", meaning: "Alejandro Magno: won't bite until a lure has been twitched in the water" },
    { name: "Deep Speech", meaning: "La Monstrenca: rises at night and emits a deep, gurgling noise" },
    { name: "Evil Eye", meaning: "Grootslang: every so often spooks all other nearby fish" },
    { name: "Run For Your Money", meaning: "Mamlambo: keeps its distance until engaged in a fight" },
    { name: "Siren Song", meaning: "Karoo Mermaid: emits a song that tempts even seasoned anglers" },
    { name: "Dragon's Gate", meaning: "Koi no Takinobori" },
    { name: "Otashitonkuru's Rock", meaning: "Amemasu" },
    { name: "The Deepest Reaches", meaning: "Goto the Immortal" },
  ],

  // Natural, live and bottom baits, then groundbait.
  baits: ["Bread", "Cheese", "Dough", "Eggs", "Hotdog", "Liver", "Marshmallow", "Pearl Barley",
    "Bloodworm", "Leech", "Minnow", "Redworm",
    "Artificial Corn - Yellow", "Boilies - Natural", "Corn", "Dog Biscuits", "Imitation Dog Biscuits",
    "Pellets - Regular", "Wafters - White",
    "Advantage", "High Impact", "Lake Mix", "Match Blend", "Pro Performance"],

  // Lure kinds and soft plastics. Specific named lures are left to History.
  lureTypes: ["Crankbait", "Frog", "Jerkbait", "Popper", "Spinner", "Spinnerbait", "Spoon", "Swimbait",
    "Grub", "Shad", "Tube", "Worm"],
};
