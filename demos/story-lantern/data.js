/* Story Lantern v2 — word data. All clues, sentences and line-art pictures are original.
 * Rule: a word's clue, hint, picture label and every host line must never contain any of the ten target words
 * (the tests check this), so nothing is spoiled before the reveal. */
(function () {
  /* tiny helpers to keep the art readable: c1 amber, c2 cyan, c3 magenta, c4 lime, c5 pale */
  function star(x, y, r, c) {
    var s = r / 4;
    return '<path class="' + c + '" d="M' + x + ' ' + (y - r) + ' L' + (x + s) + ' ' + (y - s) + ' L' + (x + r) + ' ' + y + ' L' + (x + s) + ' ' + (y + s) + ' L' + x + ' ' + (y + r) + ' L' + (x - s) + ' ' + (y + s) + ' L' + (x - r) + ' ' + y + ' L' + (x - s) + ' ' + (y - s) + ' Z"/>';
  }
  function svg(label, body) {
    return '<svg viewBox="0 0 400 300" role="img" aria-label="' + label + '">' + body + "</svg>";
  }
  var rows = "";
  [70, 108, 146, 184].forEach(function (y) {
    rows += '<rect class="c2" x="140" y="' + (y - 12) + '" width="24" height="24" rx="5"/><line class="c5" x1="176" y1="' + (y - 4) + '" x2="258" y2="' + (y - 4) + '"/><line class="c5 thin" x1="176" y1="' + (y + 7) + '" x2="226" y2="' + (y + 7) + '"/>';
  });
  var crowd = "";
  [244, 272, 300, 328, 356].forEach(function (x, i) {
    crowd += '<circle class="c5" cx="' + x + '" cy="262" r="11"/><line class="c4" x1="' + (x + 8) + '" y1="254" x2="' + (x + 16 - (i % 2) * 20) + '" y2="222"/><circle class="c4" cx="' + (x + 16 - (i % 2) * 20) + '" cy="216" r="5"/>';
  });
  var rain = "";
  [[44, 140], [70, 150], [96, 136], [122, 160], [58, 196], [84, 210], [110, 190], [140, 214], [40, 240], [130, 250]].forEach(function (p) {
    rain += '<line class="c2" x1="' + p[0] + '" y1="' + p[1] + '" x2="' + (p[0] - 8) + '" y2="' + (p[1] + 22) + '"/>';
  });
  var phones = "";
  [[296, 26], [344, 26], [296, 96], [344, 96], [320, 166], [368, 196]].forEach(function (p) {
    phones += '<rect class="c2" x="' + p[0] + '" y="' + p[1] + '" width="28" height="48" rx="6"/><path class="c3" d="M' + (p[0] + 14) + ' ' + (p[1] + 32) + ' l-6 -6 a4 4 0 0 1 6 -5 a4 4 0 0 1 6 5 z"/>';
  });

  window.SL_WORDS = [
    {
      word: "add", pos: "verb",
      def: "to put something with something else, so there is more",
      simple: "put in more",
      clue: "Your playlist has 49 songs. You find one more perfect track and tap “+”. Now it has 50.",
      hint: "Maths: 2 + 3. Also on social media: “Can I ___ you?”",
      example: "She decided to add a plot twist in the very last line of her story.",
      speak: "What would you add to a boring school day to make it better?",
      starter: "I would add … because …",
      challenge: "Tell a three-sentence horror story. Your partner must add one twist.",
      svg: svg("A phone playlist with a new row appearing after someone taps a big plus button",
        '<rect class="c5" x="120" y="20" width="160" height="262" rx="22"/><line class="c5" x1="182" y1="36" x2="218" y2="36"/>' + rows +
        '<rect class="c4" x="140" y="210" width="24" height="24" rx="5"/><line class="c4" x1="176" y1="218" x2="258" y2="218"/><line class="c4 thin" x1="176" y1="229" x2="226" y2="229"/>' +
        '<circle class="c1" cx="326" cy="236" r="34"/><line class="c1" x1="326" y1="216" x2="326" y2="256"/><line class="c1" x1="306" y1="236" x2="346" y2="236"/>' +
        '<path class="c1 dash" d="M292 234 Q 280 222 266 222"/>' + star(64, 90, 16, "c4") + star(96, 170, 10, "c1"))
    },
    {
      word: "although", pos: "conjunction",
      def: "used to show a contrast; it means “even though”",
      simple: "even though (a surprising idea comes next)",
      clue: "The concert is outdoors. It is pouring with rain. Thousands of fans stay and scream every lyric anyway.",
      hint: "Like “but”, at the start: “___ it was raining, the fans stayed.” It means “even though”.",
      example: "Although the film had terrible reviews, our whole class loved it.",
      speak: "Finish it with your partner: “Although I was exhausted, I still …”",
      starter: "Although I was …, I still …",
      challenge: "Make one sentence with “although” and one with “because”. What changes?",
      svg: svg("A storm cloud with lightning and rain on the left, a concert crowd with glowing lightsticks on the right",
        '<path class="c5" d="M40 104 a28 28 0 0 1 44 -34 a40 40 0 0 1 74 12 a26 26 0 0 1 2 50 h-108 a24 24 0 0 1 -12 -28 z"/>' +
        '<polyline class="c1" points="112,134 96,168 118,168 100,206"/>' + rain +
        '<line class="c3" x1="262" y1="30" x2="236" y2="206"/><line class="c3" x1="342" y1="30" x2="372" y2="206"/><rect class="c3" x="226" y="206" width="160" height="12" rx="4"/>' + crowd +
        '<line class="c1" x1="180" y1="132" x2="214" y2="132"/><line class="c1" x1="180" y1="148" x2="214" y2="148"/><line class="c1" x1="208" y1="118" x2="186" y2="162"/>')
    },
    {
      word: "belief", pos: "noun",
      def: "an idea that a person or group thinks is true (it may not be proven)",
      simple: "something people think is true",
      clue: "Half the school is sure the third-floor bathroom is haunted. Zero proof. They are still convinced.",
      hint: "A noun: a thing you hold in your head. The verb is “believe”.",
      example: "There is a popular belief that whistling at night calls ghosts.",
      speak: "Share a superstition or belief people have in Thailand or online.",
      starter: "Some people have a belief that …",
      challenge: "Belief or fact? Give one of each about the same topic.",
      svg: svg("A head in profile with a thought bubble holding a ghost and a question mark",
        '<path class="c5" d="M60 290 C60 240 46 214 58 180 C70 140 112 120 142 132 C172 144 182 172 172 192 L184 212 L170 216 C172 234 160 242 146 240 L142 290"/>' +
        '<circle class="c5" cx="190" cy="176" r="6"/><circle class="c5" cx="214" cy="150" r="10"/><ellipse class="c5" cx="292" cy="92" rx="96" ry="68"/>' +
        '<path class="c2" d="M258 136 V84 a32 32 0 0 1 64 0 V136 l-10.6 -10 l-10.6 10 l-10.6 -10 l-10.6 10 l-10.6 -10 z"/><circle class="c2" cx="278" cy="86" r="5"/><circle class="c2" cx="302" cy="86" r="5"/>' +
        '<path class="c1" d="M352 54 q10 -18 26 -6 q8 14 -12 24 v12"/><circle class="c1" cx="366" cy="98" r="3"/>')
    },
    {
      word: "collect", pos: "verb",
      def: "to bring things together from different places",
      simple: "get many things and keep them together",
      clue: "Every album drop she buys the photocards, trades the duplicates, and fills binder after binder.",
      hint: "Stamps, sneakers, photocards … people ___ them. Starts with “c”.",
      example: "My cousin collects limited-edition sneakers and never actually wears them.",
      speak: "What do you collect — or what would you love to collect?",
      starter: "I collect … because …",
      challenge: "Name the weirdest thing someone could collect. Convince your partner it is normal.",
      svg: svg("An open binder full of small cards, with more cards flying into it",
        '<rect class="c5" x="30" y="92" width="220" height="190" rx="10"/><line class="c5" x1="140" y1="92" x2="140" y2="282"/>' +
        '<circle class="c1" cx="140" cy="124" r="6"/><circle class="c1" cx="140" cy="187" r="6"/><circle class="c1" cx="140" cy="250" r="6"/>' +
        '<rect class="c2" x="46" y="110" width="76" height="74" rx="6"/><rect class="c2" x="46" y="196" width="76" height="74" rx="6"/><rect class="c2" x="158" y="110" width="76" height="74" rx="6"/><rect class="c3 dash" x="158" y="196" width="76" height="74" rx="6"/>' +
        '<rect class="c3" x="290" y="26" width="54" height="76" rx="6" transform="rotate(14 317 64)"/><rect class="c4" x="316" y="140" width="54" height="76" rx="6" transform="rotate(-10 343 178)"/>' +
        '<path class="c3" d="M317 72 l-8 -8 a5 5 0 0 1 8 -7 a5 5 0 0 1 8 7 z"/><path class="c1 dash" d="M300 110 Q 262 150 220 226"/><path class="c1 dash" d="M318 210 Q 290 238 238 238"/>')
    },
    {
      word: "magical", pos: "adjective",
      def: "having magic or special powers; seeming to work by magic",
      simple: "has magic",
      clue: "She whispers three words. The candles light themselves. The locked door swings open on its own.",
      hint: "From “magic”. Spells, wands, special powers.",
      example: "In the film, the cracked mirror is magical — it shows your future.",
      speak: "If you owned one magical object, what would it do?",
      starter: "My magical object is a … It can …",
      challenge: "Is a beautiful sunset magical? Argue yes AND no.",
      svg: svg("An open hand with a book floating above it, surrounded by sparks",
        '<path class="c5" d="M24 262 C60 252 92 250 122 232 L172 202 C186 194 198 210 186 220 L150 248 C128 266 98 278 56 286"/><path class="c5" d="M122 232 L104 206 C98 196 110 188 118 196 L140 220"/>' +
        '<path class="c2" d="M140 150 Q190 128 240 150 V78 Q190 56 140 78 Z"/><path class="c2" d="M240 150 Q290 128 340 150 V78 Q290 56 240 78 Z"/><line class="c2" x1="240" y1="78" x2="240" y2="150"/>' +
        '<line class="c5 thin" x1="160" y1="96" x2="222" y2="90"/><line class="c5 thin" x1="160" y1="114" x2="222" y2="108"/><line class="c5 thin" x1="258" y1="90" x2="320" y2="96"/><line class="c5 thin" x1="258" y1="108" x2="320" y2="114"/>' +
        '<line class="c4 dash" x1="168" y1="196" x2="196" y2="160"/><line class="c4 dash" x1="196" y1="206" x2="236" y2="164"/>' +
        star(186, 34, 16, "c1") + star(330, 30, 12, "c1") + star(366, 178, 18, "c3") + star(104, 112, 12, "c4"))
    },
    {
      word: "primarily", pos: "adverb",
      def: "mainly; mostly",
      simple: "mostly",
      clue: "80% of her phone time is music. The other 20% is everything else. So her phone is mostly for one thing.",
      hint: "It means “mainly”. Think “primary” — the first, the main.",
      example: "This app is primarily for sharing short videos.",
      speak: "What do you use your phone primarily for? Be honest.",
      starter: "I use my phone primarily for …",
      challenge: "Say a sentence with “primarily”, then swap in “mainly”. Same meaning?",
      svg: svg("A circle chart: one huge slice with a music note, one small slice, and two bars of very different length",
        '<circle class="c2" cx="150" cy="150" r="104"/><path class="c3" d="M150 150 L150 46 A104 104 0 0 1 248.9 117.9 Z"/>' +
        '<path class="c2" d="M120 214 V150 L172 138 V200"/><circle class="c2" cx="110" cy="214" r="11"/><circle class="c2" cx="162" cy="200" r="11"/>' +
        '<rect class="c2" x="290" y="96" width="24" height="24" rx="4"/><line class="c2 fat" x1="326" y1="108" x2="388" y2="108"/>' +
        '<rect class="c3" x="290" y="176" width="24" height="24" rx="4"/><line class="c3 fat" x1="326" y1="188" x2="344" y2="188"/>' +
        '<text class="t2" x="92" y="120">80%</text><text class="t3" x="186" y="98">20%</text>')
    },
    {
      word: "publish", pos: "verb",
      def: "to prepare and print or post a book, story or article so that the public can read it",
      simple: "make a book or post so many people can read it",
      clue: "At 2 a.m. she finishes her horror story and hits UPLOAD. By breakfast, 10,000 strangers have read it.",
      hint: "What companies do with books, magazines and news sites. Starts with “p”.",
      example: "The school magazine will publish the best ghost story from our class.",
      speak: "If you could publish anything — a book, a song, a comic — what would it be?",
      starter: "I would publish a … about …",
      challenge: "Anyone can publish online now. Good thing or bad thing? One reason each way.",
      svg: svg("A laptop with a cursor clicking a button, an arrow flying out to many phones full of hearts",
        '<rect class="c5" x="40" y="104" width="160" height="106" rx="8"/><path class="c5" d="M18 210 H222 L206 230 H34 Z"/>' +
        '<line class="c5 thin" x1="58" y1="128" x2="180" y2="128"/><line class="c5 thin" x1="58" y1="146" x2="160" y2="146"/><line class="c5 thin" x1="58" y1="164" x2="170" y2="164"/>' +
        '<rect class="c1" x="122" y="178" width="58" height="20" rx="7"/><path class="c4" d="M168 192 l0 28 l8 -8 l7 13 l7 -3 l-7 -13 l11 0 z"/>' +
        '<path class="c1" d="M214 150 C246 92 266 82 286 74"/><polyline class="c1" points="270,66 288,73 278,90"/>' + phones)
    },
    {
      word: "scary", pos: "adjective",
      def: "making you feel afraid",
      simple: "makes you afraid",
      clue: "Midnight. Phone on 1%. Footsteps on the stairs. But you are home alone.",
      hint: "Horror films are like this. It rhymes with “hairy”.",
      example: "The film was so scary that half the class watched it through their fingers.",
      speak: "What is the scariest film or story you know? Rate it out of 10.",
      starter: "The scariest film I know is … because …",
      challenge: "What makes something truly scary: sound, darkness, or what you cannot see? Rank them.",
      svg: svg("A dark doorway open a crack with two glowing eyes inside, a moon, and a phone battery almost empty",
        '<path class="c5" d="M352 28 a26 26 0 1 0 18 46 a22 22 0 1 1 -18 -46 z"/><rect class="c5" x="120" y="36" width="190" height="254"/>' +
        '<polygon class="c5" points="128,46 212,66 212,272 128,286"/><circle class="c5" cx="198" cy="172" r="5"/>' +
        '<ellipse class="c1" cx="248" cy="150" rx="12" ry="6"/><ellipse class="c1" cx="280" cy="150" rx="12" ry="6"/><circle class="c3" cx="248" cy="150" r="2.5"/><circle class="c3" cx="280" cy="150" r="2.5"/>' +
        '<rect class="c3" x="16" y="226" width="64" height="32" rx="6"/><rect class="c3" x="80" y="236" width="7" height="12"/><line class="c3 fat" x1="26" y1="236" x2="26" y2="248"/>' +
        '<ellipse class="c5 thin" cx="326" cy="276" rx="8" ry="4"/><ellipse class="c5 thin" cx="352" cy="262" rx="8" ry="4"/><ellipse class="c5 thin" cx="370" cy="284" rx="8" ry="4"/>')
    },
    {
      word: "suitable", pos: "adjective",
      def: "right or appropriate for a particular person, purpose or situation",
      simple: "right for this person or time",
      clue: "Flip-flops for a mountain hike? No. Hiking boots? Perfect. They are right for the job.",
      hint: "It means “appropriate”. From “suit” — when clothes suit you, they fit.",
      example: "That horror film is not suitable for my little brother. He is six.",
      speak: "Which films or games are not suitable for young kids? Why?",
      starter: "… is not suitable for kids because …",
      challenge: "Who should decide what is suitable for teenagers: parents, schools, or teens?",
      svg: svg("A padlock and a key that fits it exactly, with a big tick",
        '<rect class="c1" x="56" y="136" width="128" height="116" rx="16"/><path class="c1" d="M82 136 V100 a38 38 0 0 1 76 0 V136"/>' +
        '<circle class="c5" cx="120" cy="184" r="11"/><line class="c5" x1="120" y1="195" x2="120" y2="222"/>' +
        '<circle class="c2" cx="300" cy="196" r="24"/><circle class="c2" cx="300" cy="196" r="9"/><line class="c2" x1="276" y1="196" x2="200" y2="196"/><line class="c2" x1="214" y1="196" x2="214" y2="212"/><line class="c2" x1="230" y1="196" x2="230" y2="208"/>' +
        '<path class="c4 fat" d="M282 74 l24 24 l52 -60"/>')
    },
    {
      word: "text", pos: "noun",
      def: "the written words in a book, message, magazine or on a screen",
      simple: "written words",
      clue: "Not the photos. Not the video. Just the written words — on the page, or in your chat.",
      hint: "You read it. You also send one when you message a friend.",
      example: "The comic has almost no text; the drawings tell the whole story.",
      speak: "Do you prefer a long text or a voice message? Why?",
      starter: "I prefer … because …",
      challenge: "Count every kind of text you read today: chats, signs, menus, captions …",
      svg: svg("A phone chat full of message bubbles with lines of writing, and a crossed-out picture beside it",
        '<rect class="c5" x="150" y="14" width="170" height="272" rx="24"/>' +
        '<rect class="c2" x="166" y="48" width="112" height="48" rx="14"/><line class="c5 thin" x1="178" y1="64" x2="264" y2="64"/><line class="c5 thin" x1="178" y1="80" x2="240" y2="80"/>' +
        '<rect class="c3" x="198" y="110" width="106" height="36" rx="14"/><line class="c5 thin" x1="210" y1="128" x2="290" y2="128"/>' +
        '<rect class="c2" x="166" y="160" width="122" height="58" rx="14"/><line class="c5 thin" x1="178" y1="176" x2="274" y2="176"/><line class="c5 thin" x1="178" y1="190" x2="262" y2="190"/><line class="c5 thin" x1="178" y1="204" x2="232" y2="204"/>' +
        '<rect class="c3" x="234" y="232" width="64" height="30" rx="14"/><circle class="c4" cx="252" cy="247" r="3"/><circle class="c4" cx="266" cy="247" r="3"/><circle class="c4" cx="280" cy="247" r="3"/>' +
        '<rect class="c1" x="24" y="102" width="90" height="70" rx="6"/><polyline class="c1" points="30,166 56,136 74,152 88,140 108,166"/><circle class="c1" cx="92" cy="122" r="7"/><line class="c3 fat" x1="16" y1="92" x2="122" y2="182"/>')
    }
  ];

  /* Apply round: every word has at least one challenge. `ok` = correct index; `why` explains each option. */
  window.SL_CHALLENGES = [
    { word: "add", q: "The ending was boring, so the writer decided to ___ a talking cat.",
      opts: ["add", "publish", "collect"], ok: 0,
      why: ["Correct: “add” means put in something more. The cat is a new part of the story.",
            "“Publish” means make a book or post for people to read. You do not publish a cat into an ending.",
            "“Collect” means bring many things together. One cat is not “collected” into a story."] },
    { word: "although", q: "___ the film was two hours long, nobody checked their phone.",
      opts: ["Although", "Because"], ok: 0,
      why: ["Correct: a long film usually makes people check their phones. They did NOT. That is a contrast, so use “although”.",
            "“Because” gives a reason. Being long is not a reason to ignore your phone — the ideas contrast, so use “although”."] },
    { word: "although", q: "Mia stopped scrolling ___ she was very tired.",
      opts: ["although", "because"], ok: 1,
      why: ["“Although” shows a surprise. Stopping when tired is not a surprise — it is the normal result.",
            "Correct: being tired is the REASON she stopped. “Because” gives a reason."] },
    { word: "although", q: "Mia kept scrolling ___ she was very tired.",
      opts: ["although", "because"], ok: 0,
      why: ["Correct: tired people usually stop. She kept going — a contrast, so use “although”.",
            "Being tired is not a reason to keep scrolling. The ideas contrast, so “because” does not work."] },
    { word: "belief", q: "There is an old ___ that the school's empty music room is haunted.",
      opts: ["belief", "believe", "believed"], ok: 0,
      why: ["Correct: after “an old” we need a noun (a thing). “Belief” is the noun.",
            "“Believe” is a verb (an action). “An old believe” is not correct English.",
            "“Believed” is a past verb. We need a noun after “an old”."] },
    { word: "belief", q: "A belief is …",
      opts: ["an idea that people think is true", "a fact that scientists have proved"], ok: 0,
      why: ["Correct: a belief is what people think is true. It may or may not be proven.",
            "A proven fact is different. People can hold a belief without any proof."] },
    { word: "collect", q: "My friend likes to ___ photocards from fans in different countries.",
      opts: ["collect", "scary", "add"], ok: 0,
      why: ["Correct: she gets many cards from different places and keeps them together — that is “collect”.",
            "“Scary” is an adjective (it describes things). After “to” we need a verb.",
            "“Add” means put one more thing into something. She is gathering many cards from many places, so “collect” fits better."] },
    { word: "magical", q: "In the series, the old lantern is magical. This means it …",
      opts: ["has special powers, like granting wishes", "is very pretty and shiny", "is very old and dusty"], ok: 0,
      why: ["Correct: “magical” means having magic or special powers.",
            "Pretty and shiny things are not always magical. “Magical” is about magic powers, not just beauty.",
            "Old and dusty does not mean it has magic."] },
    { word: "primarily", q: "This festival is primarily for teenagers. “Primarily” means …",
      opts: ["mainly", "never", "quickly"], ok: 0,
      why: ["Correct: “primarily” = mainly / mostly. Most people at the festival are teenagers.",
            "“Never” is the opposite idea. The festival IS for teenagers.",
            "“Quickly” is about speed, not about who it is mostly for."] },
    { word: "publish", q: "After three years of writing, the author finally ___ her first novel.",
      opts: ["published", "collected", "suitable"], ok: 0,
      why: ["Correct: when a book is printed or posted for readers, it is “published”.",
            "She wrote the book herself; she did not gather it from other places.",
            "“Suitable” is an adjective. We need a past-tense verb here."] },
    { word: "scary", q: "The horror film was so ___ that Ben slept with the light on.",
      opts: ["scary", "suitable", "primarily"], ok: 0,
      why: ["Correct: Ben was afraid, so the film was “scary” (it made him feel afraid).",
            "“Suitable” means right for someone. That does not explain why he left the light on.",
            "“Primarily” is an adverb (mainly). After “so” here we need an adjective like “scary”."] },
    { word: "suitable", q: "This horror film is not ___ for young children. It is far too frightening.",
      opts: ["suitable", "magical"], ok: 0,
      why: ["Correct: “not suitable” = not right / not appropriate for them.",
            "A film can be magical and still be fine for children. The reason given is that it is frightening, so the idea is “not right for them”."] },
    { word: "suitable", q: "Which word is closest in meaning to “suitable”?",
      opts: ["appropriate", "available", "difficult"], ok: 0,
      why: ["Correct: “suitable” = appropriate = right for the situation.",
            "“Available” means you can get it or use it now. Something can be available but not suitable.",
            "“Difficult” means hard. It is not connected to being right for someone."] },
    { word: "text", q: "Read the ___ under the photo and underline the new words.",
      opts: ["text", "belief", "publish"], ok: 0,
      why: ["Correct: the “text” is the written words.",
            "A belief is an idea in people's minds, not words you underline.",
            "“Publish” is a verb. After “the” we need a noun."] },
    { word: "text", q: "In a webtoon, the pictures are big and the ___ is in small speech bubbles.",
      opts: ["text", "picture"], ok: 0,
      why: ["Correct: the written words are the “text”.",
            "We already talked about the pictures. The words in speech bubbles are the text."] }
  ];

  /* Create round: preset word sets (deterministic), a teen scenario, and a model story shown only on request. */
  window.SL_STORIES = [
    { words: ["magical", "scary", "although", "collect"], scene: "Horror-film sleepover. Something in the house is not a guest.",
      model: "Although the film was scary, Ploy refused to hide. Then the TV switched off by itself. A magical voice whispered, “I collect sleepovers.” Ploy replied, “Cool. I collect screenshots.” The ghost is now viral." },
    { words: ["publish", "text", "add", "primarily"], scene: "A K-pop fan group chat. One message was never meant to be seen.",
      model: "My best friend wanted to publish her fan fiction. The text was primarily about her bias, plus 300 heart emojis. I told her to add a plot. She added 300 more hearts. It now has two million views." },
    { words: ["belief", "suitable", "scary", "although"], scene: "School drama: the classroom nobody wants to enter after 4 p.m.",
      model: "There is a belief that Room 304 is cursed. Although it looks scary, the only thing that vanishes there is the Wi-Fi — every lunchtime. Our teacher says the room is “not suitable for phones”. Suspicious." },
    { words: ["collect", "magical", "publish", "suitable"], scene: "Social media: an influencer whose posts start coming true.",
      model: "Mint collects followers like photocards. One day her phone turns magical: every post comes true. She wants to publish a selfie with her idol, but first checks it is suitable. Too late — her idol is in her kitchen, eating her noodles." }
  ];

  /* Plot-twist cards (weights: higher = more common). None may contain a target word. */
  window.SL_TWISTS = [
    { id: "double", title: "Double points", icon: "×2", body: "The next point is worth TWO. Choose your moment.", weight: 3 },
    { id: "steal", title: "Steal a point", icon: "⇄", body: "The next team to score also steals 1 point from the leader.", weight: 3 },
    { id: "act", title: "Act it out", icon: "🎭", body: "Next word: answers must be acted. No words. No sounds. No mouthing.", weight: 2 },
    { id: "whisper", title: "Whisper chain", icon: "🤫", body: "Next answer travels by whisper along your row. Only the last person may say it aloud.", weight: 2 },
    { id: "sentence", title: "Sentence in 10 seconds", icon: "⏱", body: "After the next reveal, one team says a full sentence with it in 10 seconds. Fail = point to the rivals.", weight: 2 },
    { id: "swap", title: "Swap!", icon: "↯", body: "The top team and the bottom team swap points. Mercy is not on the menu.", weight: 1 }
  ];

  /* The host's dry one-liners. {team} is replaced with a team name. */
  window.SL_LINES = {
    start: ["Ten mystery words. Zero mercy.", "Lights down. Phones away. Let's begin.", "I've seen braver classes. Prove me wrong."],
    clue: ["Read it. Think. Don't embarrass me.", "Somebody knows this. Statistically.", "The flame is burning. So is my patience.", "I already know the answer. Obviously."],
    hint: ["Fine. A hint. Don't get used to it.", "I'm practically doing it for you now.", "Hint delivered. Shame optional."],
    letter: ["One letter. Generous, aren't I?", "Another letter. The tension is unbearable.", "At this point I'm just spelling it."],
    reveal: ["There it is. Act like you knew.", "Revealed. Pretend you weren't surprised.", "Called it. Well — someone did."],
    meaning: ["Write that down. Future you says thanks.", "Meaning unlocked. Use it wisely."],
    talk: ["Talk to your partner. Yes, out loud.", "Thirty seconds. Make it interesting.", "Speak. I'm listening. Always."],
    correct: ["Correct. Annoyingly good.", "Fine. That was impressive.", "Correct. I'll allow it."],
    wrong: ["Bold choice. Wrong, but bold.", "No. Read it again. Slowly.", "Interesting. Incorrect, but interesting."],
    tense: ["Ten seconds. No pressure.", "The flame is dying. Like my hope.", "Tick. Tock."],
    out: ["Lantern's out. That was painful.", "Time. The flame has left the chat."],
    score: ["Point to {team}. Don't let it go to your head.", "{team} climbs. The others watch.", "{team} scores. The tower trembles."],
    twist: ["Plot twist. Nobody is safe.", "Surprise. I live for chaos.", "Oh, this is going to hurt someone."],
    apply: ["Choose wisely. I'm watching.", "One of these is a trap. Maybe two."],
    create: ["Make it better than a soap opera. Low bar.", "Funny is good. Unhinged is better."],
    recap: ["Survivors' summary. Some of you made it.", "Here's what you've cracked so far."],
    swap: ["Swapped. Somebody is furious.", "Fortunes reversed. Delicious."]
  };
})();
