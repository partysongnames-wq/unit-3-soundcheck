/* Prime Time — lesson content (Gateway to the World B1, Unit 5, p58).
   Kept out of index.html so no answer text sits in the page DOM before the teacher reveals it. */
window.PT_DATA = {
  episodes: [
    { key: 'E0', name: 'Cold open', min: 5 },
    { key: 'E1', name: 'Guess the genre', min: 10 },
    { key: 'E2', name: 'True or false?', min: 7 },
    { key: 'E3', name: 'Positive / negative', min: 8 },
    { key: 'E4', name: 'Binge or Skip?', min: 10 },
    { key: 'E5', name: 'Pair talk', min: 8 },
    { key: 'E6', name: 'Exit ticket', min: 2 }
  ],

  coldOpen: {
    lines: [
      'When I was a teenager, all my friends had one of these in their bedroom.',
      'Doctors said it could cause health problems.',
      'Some of my friends wanted to appear on it.',
      'Our parents thought it was a bad influence on us!'
    ],
    answer: 'A TV.',
    poll: ['0–1', '2–3', '4–5', '6+']
  },

  // Ex 1 — 15 programme types. "desc" never contains a genre word.
  genres: [
    { word: 'cartoon', icon: 'cartoon', desc: 'Drawn characters, zero physics. A cat falls off a cliff and is completely fine by the next scene.', ex: 'The Simpsons' },
    { word: 'chat show', icon: 'chat', desc: 'A famous guest on a sofa. A host with questions. A studio audience that laughs slightly too much.', ex: 'The Graham Norton Show' },
    { word: 'comedy', icon: 'comedy', desc: 'Thirty minutes of awkward people in awkward situations. Built to make you laugh.', ex: 'Brooklyn Nine-Nine' },
    { word: 'crime series', icon: 'crime', desc: 'Someone is dead by minute four. A detective with a complicated past has forty minutes to find out who did it.', ex: 'Sherlock' },
    { word: 'documentary', icon: 'doc', desc: 'Real animals, real places, real facts — and one calm voice explaining all of it.', ex: 'Planet Earth / Blue Planet' },
    { word: 'drama', icon: 'drama', desc: 'Serious characters, serious problems. Family secrets, big emotions. Nobody stays happy for long.', ex: 'The Crown' },
    { word: 'fantasy series', icon: 'fantasy', desc: 'Dragons, kingdoms, magic swords. Everyone wants the throne. Do not get attached to anyone.', ex: 'Game of Thrones' },
    { word: 'film', icon: 'film', desc: 'One complete story, about two hours long. Usually shown at the cinema first.', ex: 'Spider-Man: Into the Spider-Verse' },
    { word: 'food programme', icon: 'food', desc: 'Ten ingredients. One hour. One very stressed person in an apron. Somebody has to taste it.', ex: 'MasterChef' },
    { word: 'game show', icon: 'game', desc: 'Players answer questions, hit buzzers and try to win cash — or a car.', ex: 'Who Wants to Be a Millionaire?' },
    { word: 'reality show', icon: 'reality', desc: 'Strangers live in one house. Cameras everywhere. Someone leaves every week.', ex: 'Big Brother' },
    { word: 'science-fiction series', icon: 'scifi', desc: 'Spaceships, time travel, aliens, robots. Set in the future — or in a galaxy far away.', ex: 'Doctor Who' },
    { word: 'sports programme', icon: 'sport', desc: 'Live from the stadium. Two teams, ninety minutes, and commentators who shout a lot.', ex: 'The FIFA World Cup, live' },
    { word: 'talent show', icon: 'talent', desc: 'Ordinary people sing, dance or juggle on a huge stage. Judges press buttons. The public votes.', ex: 'The Voice / Got Talent' },
    { word: 'the news', icon: 'news', desc: 'Same time every evening. What happened today, at home and around the world.', ex: 'BBC News at Ten' }
  ],

  // Ex 2a word bank
  bank: ['binge-watching', 'channel', 'contestant', 'episode', 'mobile device', 'screen', 'season', 'spoiler', 'streaming service', 'viewer'],

  // Ex 2a/2b — "a" = gap word in correct form, "v" = verdict, "fact" = teacher reveal line
  quiz: [
    { pre: 'Netflix was the first TV', post: '.', a: 'streaming service', v: false, fact: 'Hulu was the first TV streaming service (launched 2008).' },
    { pre: "It's possible to watch video content made exclusively for", post: 'such as smartphones.', a: 'mobile devices', v: true, fact: 'Yes — shows made just for phones exist.' },
    { pre: 'A television produced in 1982 had a', post: 'that was just 5 cm.', a: 'screen', v: true, fact: 'A 5 cm screen. Tiny — but true.' },
    { pre: 'In 2016, Alejandro Fragoso watched TV continuously for 94 hours and so broke the world record for', post: '.', a: 'binge-watching', v: true, fact: '94 hours. Without stopping. True.' },
    { pre: 'BBC Two was the first TV', post: 'in the UK to transmit programmes in colour.', a: 'channel', v: true, fact: 'BBC Two was first in colour. True.' },
    { pre: 'The US sitcom The Big Bang Theory stopped after 7', post: '.', a: 'seasons', v: false, fact: 'It stopped after 12 seasons (2007–2019, 281 episodes).' },
    { pre: 'There have been over 1,000', post: 'of The Simpsons.', a: 'episodes', v: false, fact: "There haven't been over 1,000 episodes — still some way off." },
    { pre: 'In 1979, about 600 million TV', post: 'around the world watched a live programme showing the first astronauts to walk on the moon.', a: 'viewers', v: false, fact: 'It was in 1969.' },
    { pre: 'The first ever', post: "to win the talent show America's Got Talent was only 11 years old.", a: 'contestant', v: true, fact: 'Only 11 years old. True.' },
    { pre: 'They filmed different endings for the very final episode of Game of Thrones to stop the possibility of', post: '.', a: 'spoilers', v: true, fact: 'Different endings, filmed on purpose. True.' }
  ],

  // Ex 3 — c: 1 = positive, 2 = negative, 3 = both
  adjectives: [
    { w: 'annoying', c: 2 }, { w: 'awful', c: 2 }, { w: 'brilliant', c: 1 }, { w: 'dull', c: 2 },
    { w: 'entertaining', c: 1 }, { w: 'funny', c: 1 }, { w: 'informative', c: 1 }, { w: 'inspiring', c: 1 },
    { w: 'moving', c: 1 }, { w: 'original', c: 1 }, { w: 'scary', c: 3 }, { w: 'violent', c: 2 }
  ],

  // E4 "Binge or Skip?" — review clues for Ex 1 + Ex 2 words only
  clues: [
    { q: 'Watching episode after episode, all in one go. "Just one more…" at 2 a.m.', a: 'binge-watching' },
    { q: 'BBC One, CNN, MTV. You switch between them with the remote.', a: 'channel' },
    { q: 'A person who competes on a game show or a talent show.', a: 'contestant' },
    { q: 'One part of a series. Usually 20 to 60 minutes long.', a: 'episode' },
    { q: 'A smartphone or a tablet. You can watch TV on it in bed.', a: 'mobile device' },
    { q: 'The flat part of a TV, phone or laptop where you see the picture.', a: 'screen' },
    { q: 'A group of episodes released together. "Number 2 drops next year."', a: 'season' },
    { q: 'Information that tells you what happens before you watch it. Unforgivable.', a: 'spoiler' },
    { q: 'You pay every month and watch online, whenever you want.', a: 'streaming service' },
    { q: 'A person who watches a TV programme.', a: 'viewer' },
    { q: 'Real life, real facts, a calm narrator. Whales, volcanoes, history.', a: 'documentary' },
    { q: 'Judges, a big stage, singers and dancers. The public votes.', a: 'talent show' },
    { q: 'People live together on camera 24/7. The audience votes them out.', a: 'reality show' },
    { q: 'A detective, a mystery, and a lot of suspects.', a: 'crime series' },
    { q: 'Today\'s events, every evening, read by a presenter at a desk.', a: 'the news' },
    { q: 'Buzzers, questions, prizes.', a: 'game show' },
    { q: 'Animated characters. Often for kids — often not.', a: 'cartoon' },
    { q: 'A host interviews celebrities on a sofa.', a: 'chat show' }
  ],
  twists: [
    { t: 'Double points', d: 'Next round is worth 2 points.' },
    { t: 'Steal', d: 'Next round: wrong answer? The next team can steal the point.' },
    { t: 'Skip', d: 'The leading team sits out the next round.' }
  ],

  // Ex 4–5 models (from the book)
  models: [
    'I think documentaries are usually informative but sometimes they\'re dull.',
    'I really like Doctor Who. It\'s a science-fiction series on the TV channel BBC One and you can also see it on the streaming service Netflix. There have been over 30 seasons so far. It\'s very original and viewers of different ages like it. It\'s really entertaining because there\'s lots of action.'
  ],
  frames: [
    'I think ____ are usually ____ but sometimes they\'re ____.',
    'I really like ____. It\'s a ____ on ____.',
    'It\'s very ____ and ____ like it.',
    'It\'s really ____ because ____.'
  ],

  // Dry host captions — no answers in any of them
  captions: {
    start: 'Tonight on Prime Time: one episode, fifty minutes, no ad breaks.',
    cold: 'Your grandparents had opinions about this. Strong ones.',
    coldAsk: 'Take a guess. Out loud. Back row included.',
    poll: 'No names. No judgement. Well — a little judgement.',
    genre: 'Read the listing. Shout the genre. Volume is encouraged.',
    often: 'Every day, sometimes, never. Be honest — we can\'t check.',
    news: 'One "news". Singular. Like your attention span after midnight.',
    bank: 'Ten words. Memorise them. They come back.',
    quiz: 'Fill the gap. Then decide: fact or fiction?',
    sort: 'Some words are compliments. Some are reviews you don\'t want.',
    game: 'Four teams. One remote. Zero mercy.',
    twist: 'Nobody saw this coming. Except the writers.',
    model: 'Steal this structure. That\'s allowed.',
    talk: 'Three minutes. Talk to your partner, not your phone.',
    exit: 'One sentence. That\'s the whole ticket.',
    wrap: 'That\'s a wrap. Same time next week.'
  }
};
