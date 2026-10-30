// The built-in question bank: 100 hand-written questions that ship with
// the app, so quiz creation never depends entirely on the Open Trivia
// DB being awake. Easy/medium only, in the four categories a friend
// group actually picks: sports, history, geography, pop culture.
//
// createQuiz tries OpenTDB first; this bank is the fallback when the
// live supply fails for any reason (see createBankPuller in lib/quiz.ts
// and the category mapping in bankCategoryFor). Rows are shaped to flow
// through the exact same selection code as OpenTDB rows — the only
// differences are the `bank` tag (which section serves a quiz category)
// and no HTML entities to decode.
//
// Finite by design: a fallback set will repeat questions across quizzes
// over time. That's the accepted price of never showing a commish a
// dead create form — the live bank stays the primary supply.

export type BankCategory = "sports" | "history" | "geography" | "pop";

export interface BankQuestion {
  bank: BankCategory;
  difficulty: "easy" | "medium";
  question: string;
  correct_answer: string;
  incorrect_answers: [string, string, string];
}

export const TRIVIA_BANK: BankQuestion[] = [
  // ---------------------------------------------------------- sports (25)
  { bank: "sports", difficulty: "easy", question: "How many players does a soccer team field at one time?", correct_answer: "11", incorrect_answers: ["9", "10", "12"] },
  { bank: "sports", difficulty: "easy", question: "In which sport would you perform a slam dunk?", correct_answer: "Basketball", incorrect_answers: ["Baseball", "Tennis", "Golf"] },
  { bank: "sports", difficulty: "easy", question: "How many holes are played in a standard round of golf?", correct_answer: "18", incorrect_answers: ["9", "12", "24"] },
  { bank: "sports", difficulty: "easy", question: "The Super Bowl decides the champion of which league?", correct_answer: "NFL", incorrect_answers: ["NBA", "NHL", "MLB"] },
  { bank: "sports", difficulty: "easy", question: "In tennis, what is a score of zero called?", correct_answer: "Love", incorrect_answers: ["Nil", "Duck", "Ace"] },
  { bank: "sports", difficulty: "easy", question: "How many rings appear on the Olympic flag?", correct_answer: "5", incorrect_answers: ["4", "6", "7"] },
  { bank: "sports", difficulty: "easy", question: "Which sport is played with a puck?", correct_answer: "Ice hockey", incorrect_answers: ["Field hockey", "Lacrosse", "Water polo"] },
  { bank: "sports", difficulty: "easy", question: "A marathon is approximately how many miles long?", correct_answer: "26", incorrect_answers: ["16", "20", "31"] },
  { bank: "sports", difficulty: "easy", question: "Which boxer was known as The Greatest?", correct_answer: "Muhammad Ali", incorrect_answers: ["Mike Tyson", "Joe Frazier", "George Foreman"] },
  { bank: "sports", difficulty: "easy", question: "In American football, how many points is a touchdown worth?", correct_answer: "6", incorrect_answers: ["3", "7", "2"] },
  { bank: "sports", difficulty: "easy", question: "Which sport is played at Wimbledon?", correct_answer: "Tennis", incorrect_answers: ["Cricket", "Golf", "Rugby"] },
  { bank: "sports", difficulty: "easy", question: "How many bases are there on a baseball diamond, including home plate?", correct_answer: "4", incorrect_answers: ["3", "5", "2"] },
  { bank: "sports", difficulty: "easy", question: "The Tour de France is a famous race in which sport?", correct_answer: "Cycling", incorrect_answers: ["Rowing", "Skiing", "Auto racing"] },
  { bank: "sports", difficulty: "easy", question: "In bowling, knocking down all ten pins with the first ball is called what?", correct_answer: "A strike", incorrect_answers: ["A spare", "A turkey", "A split"] },
  { bank: "sports", difficulty: "easy", question: "Which swimmer won a record 23 Olympic gold medals?", correct_answer: "Michael Phelps", incorrect_answers: ["Mark Spitz", "Ian Thorpe", "Ryan Lochte"] },
  { bank: "sports", difficulty: "medium", question: "Which NFL team won the first Super Bowl in 1967?", correct_answer: "Green Bay Packers", incorrect_answers: ["Dallas Cowboys", "Kansas City Chiefs", "Oakland Raiders"] },
  { bank: "sports", difficulty: "medium", question: "Which city hosted the 2012 Summer Olympics?", correct_answer: "London", incorrect_answers: ["Beijing", "Rio de Janeiro", "Athens"] },
  { bank: "sports", difficulty: "medium", question: "In baseball, what does RBI stand for?", correct_answer: "Runs Batted In", incorrect_answers: ["Runs Before Innings", "Runner Bases In", "Runs By Inning"] },
  { bank: "sports", difficulty: "medium", question: "Which golfer has won the most major championships, with 18?", correct_answer: "Jack Nicklaus", incorrect_answers: ["Tiger Woods", "Arnold Palmer", "Gary Player"] },
  { bank: "sports", difficulty: "medium", question: "Which country won the first soccer World Cup in 1930?", correct_answer: "Uruguay", incorrect_answers: ["Brazil", "Argentina", "Italy"] },
  { bank: "sports", difficulty: "medium", question: "Which NBA player scored 100 points in a single game in 1962?", correct_answer: "Wilt Chamberlain", incorrect_answers: ["Kareem Abdul-Jabbar", "Bill Russell", "Elgin Baylor"] },
  { bank: "sports", difficulty: "medium", question: "In Major League Baseball, how far is it from the pitching mound to home plate?", correct_answer: "60 feet 6 inches", incorrect_answers: ["90 feet", "55 feet", "66 feet"] },
  { bank: "sports", difficulty: "medium", question: "Which country has won the most men's soccer World Cups?", correct_answer: "Brazil", incorrect_answers: ["Germany", "Argentina", "Italy"] },
  { bank: "sports", difficulty: "medium", question: "The French Open tennis tournament is played on what surface?", correct_answer: "Clay", incorrect_answers: ["Grass", "Hard court", "Carpet"] },
  { bank: "sports", difficulty: "medium", question: "Which boxer famously bit part of Evander Holyfield's ear off in a 1997 fight?", correct_answer: "Mike Tyson", incorrect_answers: ["Riddick Bowe", "Lennox Lewis", "Michael Moorer"] },

  // --------------------------------------------------------- history (25)
  { bank: "history", difficulty: "easy", question: "Who was the first President of the United States?", correct_answer: "George Washington", incorrect_answers: ["Abraham Lincoln", "Thomas Jefferson", "John Adams"] },
  { bank: "history", difficulty: "easy", question: "In which year did World War II end?", correct_answer: "1945", incorrect_answers: ["1939", "1941", "1950"] },
  { bank: "history", difficulty: "easy", question: "The Great Wall is located in which country?", correct_answer: "China", incorrect_answers: ["Japan", "India", "Mongolia"] },
  { bank: "history", difficulty: "easy", question: "Which ancient civilization built the pyramids of Giza?", correct_answer: "The Egyptians", incorrect_answers: ["The Romans", "The Aztecs", "The Greeks"] },
  { bank: "history", difficulty: "easy", question: "Who was the principal author of the Declaration of Independence?", correct_answer: "Thomas Jefferson", incorrect_answers: ["George Washington", "Benjamin Franklin", "John Hancock"] },
  { bank: "history", difficulty: "easy", question: "In which year did the Titanic sink?", correct_answer: "1912", incorrect_answers: ["1905", "1918", "1923"] },
  { bank: "history", difficulty: "easy", question: "Which country gave the Statue of Liberty to the United States?", correct_answer: "France", incorrect_answers: ["England", "Spain", "Italy"] },
  { bank: "history", difficulty: "easy", question: "Martin Luther King Jr. delivered which famous speech in 1963?", correct_answer: "I Have a Dream", incorrect_answers: ["Give Me Liberty or Give Me Death", "Ask Not What Your Country Can Do", "The Gettysburg Address"] },
  { bank: "history", difficulty: "easy", question: "What was the main language of the Roman Empire?", correct_answer: "Latin", incorrect_answers: ["Greek", "Hebrew", "Arabic"] },
  { bank: "history", difficulty: "easy", question: "Which war was fought between the North and the South in the United States?", correct_answer: "The Civil War", incorrect_answers: ["The Revolutionary War", "The War of 1812", "The Spanish-American War"] },
  { bank: "history", difficulty: "easy", question: "In which year did Neil Armstrong first walk on the Moon?", correct_answer: "1969", incorrect_answers: ["1959", "1965", "1972"] },
  { bank: "history", difficulty: "easy", question: "Which ancient people built the Colosseum?", correct_answer: "The Romans", incorrect_answers: ["The Greeks", "The Egyptians", "The Vikings"] },
  { bank: "history", difficulty: "easy", question: "In which year did the Berlin Wall fall?", correct_answer: "1989", incorrect_answers: ["1979", "1991", "1965"] },
  { bank: "history", difficulty: "easy", question: "Which ship carried the Pilgrims to America in 1620?", correct_answer: "The Mayflower", incorrect_answers: ["The Santa Maria", "The Beagle", "The Endeavour"] },
  { bank: "history", difficulty: "easy", question: "In which year did World War I begin?", correct_answer: "1914", incorrect_answers: ["1918", "1905", "1936"] },
  { bank: "history", difficulty: "medium", question: "In which year was the Magna Carta sealed?", correct_answer: "1215", incorrect_answers: ["1066", "1348", "1492"] },
  { bank: "history", difficulty: "medium", question: "Which US President issued the Emancipation Proclamation?", correct_answer: "Abraham Lincoln", incorrect_answers: ["Andrew Johnson", "Ulysses S. Grant", "James Buchanan"] },
  { bank: "history", difficulty: "medium", question: "The ancient Olympic Games were held in honor of which god?", correct_answer: "Zeus", incorrect_answers: ["Apollo", "Poseidon", "Ares"] },
  { bank: "history", difficulty: "medium", question: "Which country was the first to grant women the vote, in 1893?", correct_answer: "New Zealand", incorrect_answers: ["United States", "United Kingdom", "France"] },
  { bank: "history", difficulty: "medium", question: "In the Louisiana Purchase of 1803, the United States bought the land from which country?", correct_answer: "France", incorrect_answers: ["Spain", "Britain", "Mexico"] },
  { bank: "history", difficulty: "medium", question: "Who was crowned the first Holy Roman Emperor in the year 800?", correct_answer: "Charlemagne", incorrect_answers: ["Constantine", "Otto the Great", "Justinian"] },
  { bank: "history", difficulty: "medium", question: "The movable-type printing press was developed by whom?", correct_answer: "Johannes Gutenberg", incorrect_answers: ["Leonardo da Vinci", "Isaac Newton", "Galileo Galilei"] },
  { bank: "history", difficulty: "medium", question: "Which battle in 1066 changed the course of English history?", correct_answer: "The Battle of Hastings", incorrect_answers: ["The Battle of Agincourt", "The Battle of Bosworth", "The Battle of Tours"] },
  { bank: "history", difficulty: "medium", question: "The Cuban Missile Crisis took place in which year?", correct_answer: "1962", incorrect_answers: ["1959", "1968", "1975"] },
  { bank: "history", difficulty: "medium", question: "Which Egyptian queen allied with Julius Caesar and Mark Antony?", correct_answer: "Cleopatra", incorrect_answers: ["Nefertiti", "Hatshepsut", "Arsinoe"] },

  // ------------------------------------------------------- geography (25)
  { bank: "geography", difficulty: "easy", question: "What is the capital of France?", correct_answer: "Paris", incorrect_answers: ["London", "Rome", "Berlin"] },
  { bank: "geography", difficulty: "easy", question: "Which is the largest ocean on Earth?", correct_answer: "The Pacific Ocean", incorrect_answers: ["The Atlantic Ocean", "The Indian Ocean", "The Arctic Ocean"] },
  { bank: "geography", difficulty: "easy", question: "The Sahara Desert is located on which continent?", correct_answer: "Africa", incorrect_answers: ["Asia", "Australia", "South America"] },
  { bank: "geography", difficulty: "easy", question: "What is the capital of Japan?", correct_answer: "Tokyo", incorrect_answers: ["Kyoto", "Osaka", "Seoul"] },
  { bank: "geography", difficulty: "easy", question: "The Grand Canyon is located in which US state?", correct_answer: "Arizona", incorrect_answers: ["Utah", "Nevada", "Colorado"] },
  { bank: "geography", difficulty: "easy", question: "Mount Everest sits on the border of Nepal and which other country?", correct_answer: "China", incorrect_answers: ["India", "Bhutan", "Pakistan"] },
  { bank: "geography", difficulty: "easy", question: "Which river flows through Egypt?", correct_answer: "The Nile", incorrect_answers: ["The Amazon", "The Danube", "The Euphrates"] },
  { bank: "geography", difficulty: "easy", question: "What is the smallest US state by area?", correct_answer: "Rhode Island", incorrect_answers: ["Delaware", "Connecticut", "Vermont"] },
  { bank: "geography", difficulty: "easy", question: "Which country is also a continent?", correct_answer: "Australia", incorrect_answers: ["Brazil", "Canada", "Russia"] },
  { bank: "geography", difficulty: "easy", question: "What is the capital of Canada?", correct_answer: "Ottawa", incorrect_answers: ["Toronto", "Vancouver", "Montreal"] },
  { bank: "geography", difficulty: "easy", question: "How many continents are there on Earth?", correct_answer: "Seven", incorrect_answers: ["Five", "Six", "Eight"] },
  { bank: "geography", difficulty: "easy", question: "Most of the Amazon rainforest is located in which country?", correct_answer: "Brazil", incorrect_answers: ["Peru", "Colombia", "Venezuela"] },
  { bank: "geography", difficulty: "easy", question: "Which US state is known as the Sunshine State?", correct_answer: "Florida", incorrect_answers: ["California", "Arizona", "Texas"] },
  { bank: "geography", difficulty: "easy", question: "What is the capital of Australia?", correct_answer: "Canberra", incorrect_answers: ["Sydney", "Melbourne", "Perth"] },
  { bank: "geography", difficulty: "easy", question: "Which country has the largest population in South America?", correct_answer: "Brazil", incorrect_answers: ["Argentina", "Colombia", "Chile"] },
  { bank: "geography", difficulty: "medium", question: "What is the longest river in South America?", correct_answer: "The Amazon", incorrect_answers: ["The Parana", "The Orinoco", "The Sao Francisco"] },
  { bank: "geography", difficulty: "medium", question: "Which African country was formerly known as Abyssinia?", correct_answer: "Ethiopia", incorrect_answers: ["Sudan", "Eritrea", "Somalia"] },
  { bank: "geography", difficulty: "medium", question: "The Strait of Gibraltar separates Spain from which African country?", correct_answer: "Morocco", incorrect_answers: ["Algeria", "Tunisia", "Libya"] },
  { bank: "geography", difficulty: "medium", question: "Which country has the most natural lakes in the world?", correct_answer: "Canada", incorrect_answers: ["Russia", "United States", "Finland"] },
  { bank: "geography", difficulty: "medium", question: "What is the capital of Iceland?", correct_answer: "Reykjavik", incorrect_answers: ["Oslo", "Helsinki", "Tallinn"] },
  { bank: "geography", difficulty: "medium", question: "Mount Kilimanjaro is located in which country?", correct_answer: "Tanzania", incorrect_answers: ["Kenya", "Uganda", "Ethiopia"] },
  { bank: "geography", difficulty: "medium", question: "Which US state borders only one other state?", correct_answer: "Maine", incorrect_answers: ["Washington", "Florida", "Texas"] },
  { bank: "geography", difficulty: "medium", question: "The Danube River flows through which capital city?", correct_answer: "Vienna", incorrect_answers: ["Prague", "Warsaw", "Berlin"] },
  { bank: "geography", difficulty: "medium", question: "What is the smallest country in the world?", correct_answer: "Vatican City", incorrect_answers: ["Monaco", "San Marino", "Liechtenstein"] },
  { bank: "geography", difficulty: "medium", question: "Which US state has the longest coastline?", correct_answer: "Alaska", incorrect_answers: ["California", "Florida", "Texas"] },

  // ----------------------------------------------------- pop culture (25)
  { bank: "pop", difficulty: "easy", question: "Who played Jack Dawson in the 1997 film Titanic?", correct_answer: "Leonardo DiCaprio", incorrect_answers: ["Brad Pitt", "Matt Damon", "Tom Cruise"] },
  { bank: "pop", difficulty: "easy", question: "Which singer is known as the King of Pop?", correct_answer: "Michael Jackson", incorrect_answers: ["Elvis Presley", "Prince", "Freddie Mercury"] },
  { bank: "pop", difficulty: "easy", question: "The Beatles were formed in which English city?", correct_answer: "Liverpool", incorrect_answers: ["London", "Manchester", "Birmingham"] },
  { bank: "pop", difficulty: "easy", question: "The line May the Force be with you comes from which film series?", correct_answer: "Star Wars", incorrect_answers: ["Star Trek", "Avatar", "E.T."] },
  { bank: "pop", difficulty: "easy", question: "Who wrote the Harry Potter books?", correct_answer: "J.K. Rowling", incorrect_answers: ["J.R.R. Tolkien", "C.S. Lewis", "Suzanne Collins"] },
  { bank: "pop", difficulty: "easy", question: "The Simpsons live in which fictional town?", correct_answer: "Springfield", incorrect_answers: ["Quahog", "South Park", "Arlen"] },
  { bank: "pop", difficulty: "easy", question: "Which band recorded Bohemian Rhapsody?", correct_answer: "Queen", incorrect_answers: ["Led Zeppelin", "Pink Floyd", "The Who"] },
  { bank: "pop", difficulty: "easy", question: "In Friends, what is the name of the coffee shop the group hangs out in?", correct_answer: "Central Perk", incorrect_answers: ["The Daily Grind", "Java Joe's", "Cafe Nervosa"] },
  { bank: "pop", difficulty: "easy", question: "Which superhero is known as the Caped Crusader?", correct_answer: "Batman", incorrect_answers: ["Superman", "Spider-Man", "Iron Man"] },
  { bank: "pop", difficulty: "easy", question: "Who directed Jaws and E.T.?", correct_answer: "Steven Spielberg", incorrect_answers: ["George Lucas", "Martin Scorsese", "Ridley Scott"] },
  { bank: "pop", difficulty: "easy", question: "Who played Forrest Gump in the 1994 film?", correct_answer: "Tom Hanks", incorrect_answers: ["Robin Williams", "Bill Murray", "Kevin Costner"] },
  { bank: "pop", difficulty: "easy", question: "Which pop star recorded the hit Like a Virgin?", correct_answer: "Madonna", incorrect_answers: ["Cher", "Whitney Houston", "Cyndi Lauper"] },
  { bank: "pop", difficulty: "easy", question: "What is the name of the cowboy in Toy Story?", correct_answer: "Woody", incorrect_answers: ["Buzz", "Rex", "Slinky"] },
  { bank: "pop", difficulty: "easy", question: "Which TV series features the Iron Throne?", correct_answer: "Game of Thrones", incorrect_answers: ["Vikings", "The Witcher", "House of Cards"] },
  { bank: "pop", difficulty: "easy", question: "Elvis Presley is known as the King of what?", correct_answer: "Rock and Roll", incorrect_answers: ["Pop", "Soul", "Country"] },
  { bank: "pop", difficulty: "medium", question: "Which 1993 Steven Spielberg film won the Academy Award for Best Picture?", correct_answer: "Schindler's List", incorrect_answers: ["Jurassic Park", "Philadelphia", "The Fugitive"] },
  { bank: "pop", difficulty: "medium", question: "Who directed The Godfather?", correct_answer: "Francis Ford Coppola", incorrect_answers: ["Martin Scorsese", "Brian De Palma", "Sidney Lumet"] },
  { bank: "pop", difficulty: "medium", question: "Which album is the best-selling of all time worldwide?", correct_answer: "Thriller", incorrect_answers: ["Back in Black", "The Dark Side of the Moon", "Bat Out of Hell"] },
  { bank: "pop", difficulty: "medium", question: "In The Shawshank Redemption, what was Andy Dufresne's job before prison?", correct_answer: "Banker", incorrect_answers: ["Lawyer", "Teacher", "Engineer"] },
  { bank: "pop", difficulty: "medium", question: "Which actress played Princess Leia in Star Wars?", correct_answer: "Carrie Fisher", incorrect_answers: ["Natalie Portman", "Daisy Ridley", "Sigourney Weaver"] },
  { bank: "pop", difficulty: "medium", question: "Winter is coming is the motto of which family in Game of Thrones?", correct_answer: "House Stark", incorrect_answers: ["House Lannister", "House Baratheon", "House Targaryen"] },
  { bank: "pop", difficulty: "medium", question: "Which musician is known by the nickname The Boss?", correct_answer: "Bruce Springsteen", incorrect_answers: ["Bob Dylan", "Billy Joel", "Tom Petty"] },
  { bank: "pop", difficulty: "medium", question: "In which year was the first Star Wars film released?", correct_answer: "1977", incorrect_answers: ["1975", "1980", "1983"] },
  { bank: "pop", difficulty: "medium", question: "Who played the Joker in The Dark Knight in 2008?", correct_answer: "Heath Ledger", incorrect_answers: ["Joaquin Phoenix", "Jack Nicholson", "Jared Leto"] },
  { bank: "pop", difficulty: "medium", question: "Which was the last Beatles studio album to be released?", correct_answer: "Let It Be", incorrect_answers: ["Abbey Road", "The White Album", "Revolver"] },
];
