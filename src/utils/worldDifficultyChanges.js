import { normalizeString } from './stringSimilarity.js';

const FOLDER_TO_GAME = {
  "dancedancerevolution": "DDR",
  "dancedancerevolution2ndmix": "2nd",
  "dancedancerevolution3rdmix": "3rd",
  "dancedancerevolution4thmix": "4th",
  "dancedancerevolution4thmixplus": "4th Plus",
  "dancedancerevolution5thmix": "5th",
  "dancedancerevolution6thmix": "6th",
  "ddrmax2dancedancerevolution7thmix": "7th",
  "dancedancerevolution7thmix": "7th",
  "dancedancerevolutionextreme": "EX",
  "dancedancerevolutionsupernova": "SN1",
  "dancedancerevolutionsupernova2": "SN2",
  "dancedancerevolutionx": "X",
  "dancedancerevolutionx2": "X2",
  "dancedancerevolutionx3vs2ndmix": "X3 vs 2nd",
  "dancedancerevolution2013": "2013",
  "dancedancerevolution2014": "2014",
  "dancedancerevolutiona": "A",
  "dancedancerevolutiona20": "A20",
  "dancedancerevolutiona20plus": "A20 Plus",
  "dancedancerevolutiona3": "A3",
  "dancedancerevolutionworld": "World"
};

const WORLD_DIFFICULTY_CHANGES = [
  {
    "song": "BRILLIANT 2U",
    "folder": "DanceDanceRevolution 2ndMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "BRILLIANT 2U(Orchestra Groove)",
    "folder": "DanceDanceRevolution 2ndMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "GENOM SCREAMS",
    "folder": "DanceDanceRevolution 2ndMIX",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "AFTER THE GAME OF LOVE",
    "folder": "DanceDanceRevolution 3rdMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "AFTER THE GAME OF LOVE",
    "folder": "DanceDanceRevolution 3rdMIX",
    "mode": "single",
    "difficulty": "Basic",
    "from": 2,
    "to": 3
  },
  {
    "song": "DYNAMITE RAVE",
    "folder": "DanceDanceRevolution 3rdMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "DYNAMITE RAVE",
    "folder": "DanceDanceRevolution 3rdMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "La Señorita",
    "folder": "DanceDanceRevolution 3rdMIX",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "BABY BABY GIMME YOUR LOVE",
    "folder": "DanceDanceRevolution 4thMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "CAN'T STOP FALLIN' IN LOVE",
    "folder": "DanceDanceRevolution 4thMIX",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "CAN'T STOP FALLIN' IN LOVE",
    "folder": "DanceDanceRevolution 4thMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "CELEBRATE NITE",
    "folder": "DanceDanceRevolution 4thMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "HYSTERIA",
    "folder": "DanceDanceRevolution 4thMIX",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "PARANOIA EVOLUTION",
    "folder": "DanceDanceRevolution 4thMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Abyss",
    "folder": "DanceDanceRevolution 5thMIX",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Abyss",
    "folder": "DanceDanceRevolution 5thMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 5,
    "to": 6
  },
  {
    "song": "AFRONOVA PRIMEVAL",
    "folder": "DanceDanceRevolution 5thMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  },
  {
    "song": "DXY!",
    "folder": "DanceDanceRevolution 5thMIX",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "CANDY♥",
    "folder": "DDRMAX2 -DanceDanceRevolution 7thMIX-",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "1998",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "Dance Dance Revolution",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "HYPER EUROBEAT",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "KISS KISS KISS",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "LOVE♥SHINE",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Basic",
    "from": 5,
    "to": 6
  },
  {
    "song": "LOVE♥SHINE",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "Pink Rose",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "蒼い衝動 ～for EXTREME～",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "蒼い衝動 ～for EXTREME～",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "♥LOVE² シュガ→♥",
    "folder": "DanceDanceRevolution EXTREME",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "Baile Le Samba",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Baile Le Samba",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 10,
    "to": 9
  },
  {
    "song": "cachaca",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "LOGICAL DASH",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "MAX 300 (Super-Max-Me Mix)",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 6,
    "to": 7
  },
  {
    "song": "MIDNIGHT SPECIAL",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  },
  {
    "song": "Quickening",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "TRUE♥LOVE",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "月光蝶",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 4,
    "to": 5
  },
  {
    "song": "月光蝶",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "月光蝶",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 9
  },
  {
    "song": "月光蝶",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Expert",
    "from": 10,
    "to": 11
  },
  {
    "song": "月光蝶",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Basic",
    "from": 3,
    "to": 4
  },
  {
    "song": "月光蝶",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 9
  },
  {
    "song": "華爛漫 -Flowers-",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Basic",
    "from": 5,
    "to": 6
  },
  {
    "song": "華爛漫 -Flowers-",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "華爛漫 -Flowers-",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "華爛漫 -Flowers-",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "カゲロウ",
    "folder": "DanceDanceRevolution SuperNOVA",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "A thing called LOVE",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "Raspberry Heart (English version)",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "Raspberry Heart (English version)",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "SOUL CRASH",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Votum stellarum -forest #25 DDR RMX-",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Votum stellarum -forest #25 DDR RMX-",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Votum stellarum -forest #25 DDR RMX-",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "double",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Why not",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Why not",
    "folder": "DanceDanceRevolution SuperNOVA2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "Slip Out",
    "folder": "DanceDanceRevolution X",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "will",
    "folder": "DanceDanceRevolution X",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "BALLAD THE FEATHERS",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Crazy Control",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "dirty digital",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "dirty digital",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "dirty digital",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "dirty digital",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "dirty digital",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "DROP",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "DROP",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "DROP",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "DROP",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "I'm so Happy",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 3,
    "to": 4
  },
  {
    "song": "I'm so Happy",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 8,
    "to": 9
  },
  {
    "song": "I'm so Happy",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 8,
    "to": 9
  },
  {
    "song": "in love wit you",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "in love wit you",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 3,
    "to": 4
  },
  {
    "song": "in love wit you",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "in love wit you",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "oarfish",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Sakura Sunrise",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  },
  {
    "song": "Sakura Sunrise",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Basic",
    "from": 8,
    "to": 9
  },
  {
    "song": "Sakura Sunrise",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 10,
    "to": 11
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Basic",
    "from": 3,
    "to": 4
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 5,
    "to": 6
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Expert",
    "from": 8,
    "to": 9
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "Taking It To The Sky",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Expert",
    "from": 8,
    "to": 10
  },
  {
    "song": "ZETA～素数の世界と超越者～",
    "folder": "DanceDanceRevolution X2",
    "mode": "single",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "ZETA～素数の世界と超越者～",
    "folder": "DanceDanceRevolution X2",
    "mode": "double",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "Chronos",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Diamond Dust",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Fever",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "HEARTBREAK (Sound Selektaz remix)",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "HEARTBREAK (Sound Selektaz remix)",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "HEARTBREAK (Sound Selektaz remix)",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 6,
    "to": 7
  },
  {
    "song": "IN THE ZONE",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "LOVE IS THE POWER -Re:born-",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 3
  },
  {
    "song": "MAGIC PARADE",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "MAGIC PARADE",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "MAGIC PARADE",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "Mermaid girl",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 3
  },
  {
    "song": "Mermaid girl",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "message",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "PUT YOUR FAITH IN ME (DA's Twinkly Disco Remix)",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Rhythms Inside",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Rhythms Inside",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "Rhythms Inside",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Expert",
    "from": 9,
    "to": 10
  },
  {
    "song": "Rhythms Inside",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "Rhythms Inside",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "double",
    "difficulty": "Expert",
    "from": 9,
    "to": 10
  },
  {
    "song": "TIME",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "TWINKLE♡HEART",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "隅田川夏恋歌",
    "folder": "DanceDanceRevolution X3 VS 2ndMIX",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "Ah La La La",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Everything I Need",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Monkey Business",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Right on time (Ryu☆Remix)",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Right on time (Ryu☆Remix)",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Sucka Luva",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Sucka Luva",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Sucka Luva",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "Sucka Luva",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 8,
    "to": 9
  },
  {
    "song": "The Island Song",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "THE REASON",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 3
  },
  {
    "song": "The Wind of Gold",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "WILD SIDE",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "You",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "You",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 3,
    "to": 4
  },
  {
    "song": "You",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "double",
    "difficulty": "Basic",
    "from": 3,
    "to": 4
  },
  {
    "song": "からふるぱすてる",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Expert",
    "from": 12,
    "to": 13
  },
  {
    "song": "†渚の小悪魔ラヴリィ～レイディオ†",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "†渚の小悪魔ラヴリィ～レイディオ†",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "†渚の小悪魔ラヴリィ～レイディオ†",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "ずっとみつめていて (Ryu☆Remix)",
    "folder": "DanceDanceRevolution (2013)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Do The Evolution",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Do The Evolution",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "Elysium",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "HAPPY☆LUCKY☆YEAPPY",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "HAPPY☆LUCKY☆YEAPPY",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "double",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "Over The \"Period\"",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 15,
    "to": 16
  },
  {
    "song": "Over The \"Period\"",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 15,
    "to": 16
  },
  {
    "song": "Samurai Shogun vs. Master Ninja",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Expert",
    "from": 14,
    "to": 15
  },
  {
    "song": "ドーパミン",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "double",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "セツナトリップ",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 3
  },
  {
    "song": "灼熱Beach Side Bunny",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 3,
    "to": 4
  },
  {
    "song": "灼熱Beach Side Bunny",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  },
  {
    "song": "天空の華",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Basic",
    "from": 7,
    "to": 6
  },
  {
    "song": "天空の華",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 12,
    "to": 11
  },
  {
    "song": "天空の華",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "double",
    "difficulty": "Basic",
    "from": 7,
    "to": 6
  },
  {
    "song": "天空の華",
    "folder": "DanceDanceRevolution (2014)",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 12,
    "to": 11
  },
  {
    "song": "DANCE ALL NIGHT (DDR EDITION)",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "ENDYMION",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 15,
    "to": 16
  },
  {
    "song": "ENDYMION",
    "folder": "DanceDanceRevolution A",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 15,
    "to": 16
  },
  {
    "song": "Ha・lle・lu・jah",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "HANDS UP IN THE AIR",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "MAX 360",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 15,
    "to": 16
  },
  {
    "song": "MAX 360",
    "folder": "DanceDanceRevolution A",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 15,
    "to": 16
  },
  {
    "song": "Show me your moves",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Basic",
    "from": 5,
    "to": 6
  },
  {
    "song": "SUN² SUMMER STEP!",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "エイリアンエイリアン",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "天ノ弱",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 3,
    "to": 4
  },
  {
    "song": "無頼ック自己ライザー",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "チルノのパーフェクトさんすう教室 (EDM REMIX)",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "向日葵サンセット",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 3,
    "to": 4
  },
  {
    "song": "魔理沙は大変なものを盗んでいきました",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 3,
    "to": 4
  },
  {
    "song": "ナイト・オブ・ナイツ",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 3
  },
  {
    "song": "おねがいダーリン",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "ロールプレイングゲーム",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "幸せになれる隠しコマンドがあるらしい",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "いーあるふぁんくらぶ",
    "folder": "DanceDanceRevolution A",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Avenger",
    "folder": "DanceDanceRevolution A20",
    "mode": "double",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "CROSS",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "I'm an Albatraoz",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "I'm an Albatraoz",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 3
  },
  {
    "song": "Play Hard",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "This Beat Is.....",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "This Beat Is.....",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "This Beat Is.....",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "This Beat Is.....",
    "folder": "DanceDanceRevolution A20",
    "mode": "double",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "This Beat Is.....",
    "folder": "DanceDanceRevolution A20",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 7,
    "to": 8
  },
  {
    "song": "ナイト・オブ・ナイツ (Ryu☆Remix)",
    "folder": "DanceDanceRevolution A20",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 4,
    "to": 5
  },
  {
    "song": "BITTER CHOCOLATE STRIKER",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "BITTER CHOCOLATE STRIKER",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "double",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "Draw the Savage",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Challenge",
    "from": 16,
    "to": 15
  },
  {
    "song": "Draw the Savage",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "double",
    "difficulty": "Challenge",
    "from": 16,
    "to": 14
  },
  {
    "song": "Evans",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "double",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "GUILTY DIAMONDS",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "GUILTY DIAMONDS",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "double",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "HARD BRAIN",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Basic",
    "from": 6,
    "to": 7
  },
  {
    "song": "Poppin' Soda",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Expert",
    "from": 15,
    "to": 16
  },
  {
    "song": "春を告げる",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 2,
    "to": 3
  },
  {
    "song": "春を告げる",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "春を告げる",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Expert",
    "from": 10,
    "to": 11
  },
  {
    "song": "イノセントバイブル",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "シル・ヴ・プレジデント",
    "folder": "DanceDanceRevolution A20 PLUS",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "BONE BORN",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "BREAKING THE FUTURE",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 5,
    "to": 6
  },
  {
    "song": "BREAKING THE FUTURE",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 14,
    "to": 15
  },
  {
    "song": "BREAKING THE FUTURE",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "BREAKING THE FUTURE",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 14,
    "to": 15
  },
  {
    "song": "BREAKING THE FUTURE",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "CANDY (UFO mix)",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Expert",
    "from": 14,
    "to": 15
  },
  {
    "song": "CANDY (UFO mix)",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Expert",
    "from": 14,
    "to": 15
  },
  {
    "song": "Chromatic Burst",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Come To m1dy",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Expert",
    "from": 16,
    "to": 17
  },
  {
    "song": "Come To m1dy",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "Come To m1dy",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Expert",
    "from": 16,
    "to": 17
  },
  {
    "song": "Come To m1dy",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "Easy Peasy",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "EMOTiON TRiPPER",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "GERBERA",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Expert",
    "from": 16,
    "to": 17
  },
  {
    "song": "GERBERA",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 14,
    "to": 15
  },
  {
    "song": "GERBERA",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Expert",
    "from": 16,
    "to": 17
  },
  {
    "song": "Go Down",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Go Down",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Go Down",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Basic",
    "from": 4,
    "to": 5
  },
  {
    "song": "Heavens and the Earth",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "KING",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "KING",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  },
  {
    "song": "KING",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  },
  {
    "song": "PARADISE",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Rise As One",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "Rise As One",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Expert",
    "from": 17,
    "to": 18
  },
  {
    "song": "Something Comforting",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Basic",
    "from": 5,
    "to": 3
  },
  {
    "song": "Something Comforting",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Difficult",
    "from": 8,
    "to": 7
  },
  {
    "song": "Something Comforting",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Basic",
    "from": 5,
    "to": 3
  },
  {
    "song": "Something Comforting",
    "folder": "DanceDanceRevolution A3",
    "mode": "double",
    "difficulty": "Difficult",
    "from": 8,
    "to": 7
  },
  {
    "song": "Take Me",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "TRUE♥LOVE (Clubstar's True Club Mix)",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "Valanga",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Challenge",
    "from": 17,
    "to": 18
  },
  {
    "song": "カラフルミニッツ",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "鏡花水月楼 (DDR EDITION)",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "ポラリスノウタ",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 1,
    "to": 2
  },
  {
    "song": "ウサテイ",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Beginner",
    "from": 3,
    "to": 4
  },
  {
    "song": "ウサテイ",
    "folder": "DanceDanceRevolution A3",
    "mode": "single",
    "difficulty": "Basic",
    "from": 7,
    "to": 8
  }
];

const CHANGE_LOOKUP = new Map();

for (const change of WORLD_DIFFICULTY_CHANGES) {
  const folderKey = normalizeString(change.folder || "");
  const game = FOLDER_TO_GAME[folderKey];
  if (!game) continue;
  const titleKey = normalizeString(change.song || "");
  if (!titleKey) continue;
  const diffKey = game + "||" + titleKey + "||" + change.mode + "||" + String(change.difficulty).toLowerCase();
  CHANGE_LOOKUP.set(diffKey, change.to);
}

const getMappedFeet = ({ game, titleKey, mode, difficulty }) => {
  const diffKey = game + "||" + titleKey + "||" + mode + "||" + difficulty;
  return CHANGE_LOOKUP.get(diffKey) || null;
};

export const applyWorldDifficultyChanges = (songMeta, enabled) => {
  if (!enabled) return songMeta;
  if (!Array.isArray(songMeta) || songMeta.length === 0) return songMeta;

  return songMeta.map(song => {
    if (!song || !Array.isArray(song.difficulties)) return song;
    const titleKey = normalizeString(song.title || "");
    const titleTranslitKey = normalizeString(song.titleTranslit || "");
    if (!titleKey && !titleTranslitKey) return song;
    const game = song.game;
    if (!game) return song;

    let changed = false;
    const nextDiffs = song.difficulties.map(diff => {
      const diffName = String(diff?.difficulty || "").toLowerCase();
      const mode = diff?.mode;
      if (!diffName || !mode) return diff;

      const mapped =
        getMappedFeet({ game, titleKey, mode, difficulty: diffName }) ??
        (titleTranslitKey
          ? getMappedFeet({ game, titleKey: titleTranslitKey, mode, difficulty: diffName })
          : null);

      if (mapped && mapped !== diff.feet) {
        changed = true;
        return { ...diff, feet: mapped };
      }
      return diff;
    });

    if (!changed) return song;
    return { ...song, difficulties: nextDiffs };
  });
};

export { WORLD_DIFFICULTY_CHANGES };
