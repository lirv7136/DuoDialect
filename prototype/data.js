export const LANGUAGES = ['English', 'Japanese', 'Spanish', 'French', 'Mandarin', 'Korean'];
export const AREAS = ['Surry Hills', 'Newtown', 'CBD', 'Glebe'];
export const SLOTS = ['Wednesday evening', 'Thursday evening', 'Saturday morning', 'Sunday afternoon'];
export const VENUES = ['A café in Surry Hills', 'A café in Newtown', 'A café in the CBD', 'A café in Glebe'];
export const GENDERS = ['Woman', 'Man', 'Nonbinary'];
export const defaultProfile = {
  name: 'Alex', age: 27, adult: true, gender: 'Nonbinary', area: 'Surry Hills',
  speaks: 'English', learns: 'Japanese', level: 'Beginner',
  availability: ['Thursday evening', 'Saturday morning'],
  interests: ['Coffee', 'Food', 'Design'], dating: false,
  datingGenders: ['Woman', 'Man', 'Nonbinary'], ageMin: 24, ageMax: 35,
};
const person = (id, name, age, gender, area, speaks, learns, bio, interests, availability, dating, colour) => ({
  id, name, age, adult: true, gender, area, speaks, learns, bio, interests, availability, dating, colour,
  fluent: true, datingGenders: ['Woman', 'Man', 'Nonbinary'], ageMin: 22, ageMax: 36,
});
// Fictional adults and illustrative venues. Nothing here is a real member or booking.
export const PEOPLE = [
  person('aiko', 'Aiko', 26, 'Woman', 'Surry Hills', 'Japanese', 'English', 'A good coffee, a new neighbourhood, and a conversation that wanders. Happy to help with everyday Japanese.', ['Coffee', 'Design', 'Walking'], ['Thursday evening', 'Saturday morning'], true, 'peach'),
  person('ren', 'Ren', 29, 'Man', 'Newtown', 'Japanese', 'English', 'Let’s swap book recommendations and stories. I’m practising English for the conversations beyond work.', ['Books', 'Food', 'Film'], ['Thursday evening', 'Sunday afternoon'], false, 'sage'),
  person('hana', 'Hana', 25, 'Nonbinary', 'Glebe', 'Japanese', 'English', 'Weekend market wanderer. Looking for a regular language partner and a reason to try a new bakery.', ['Food', 'Art', 'Walking'], ['Saturday morning'], true, 'lavender'),
  person('sora', 'Sora', 31, 'Woman', 'CBD', 'Japanese', 'English', 'One language each, equal time, plenty of laughs. I’d love to make Thursday practice a habit.', ['Coffee', 'Film', 'Music'], ['Thursday evening'], true, 'blue'),
  person('mateo', 'Mateo', 28, 'Man', 'Surry Hills', 'Spanish', 'English', 'From recipes to weekend plans, let’s practise the things we actually talk about.', ['Food', 'Music', 'Coffee'], ['Thursday evening', 'Saturday morning'], true, 'sage'),
  person('lucia', 'Lucía', 26, 'Woman', 'Newtown', 'Spanish', 'English', 'A walk, a coffee and a little less overthinking every sentence.', ['Walking', 'Art', 'Coffee'], ['Saturday morning', 'Sunday afternoon'], false, 'peach'),
  person('camille', 'Camille', 30, 'Nonbinary', 'Glebe', 'French', 'English', 'I speak French fluently and love explaining the expressions textbooks forget.', ['Books', 'Design', 'Food'], ['Thursday evening', 'Saturday morning'], true, 'lavender'),
  person('lin', 'Lin', 28, 'Woman', 'CBD', 'Mandarin', 'English', 'Here for a consistent language swap, interesting people and very good dumplings.', ['Food', 'Film', 'Design'], ['Thursday evening'], false, 'blue'),
  person('jiho', 'Jiho', 27, 'Man', 'Newtown', 'Korean', 'English', 'Let’s make room for mistakes. Happy to practise over coffee or a sketchbook.', ['Art', 'Coffee', 'Music'], ['Saturday morning'], true, 'sage'),
];
export const GROUPS = [
  { id: 'coffee-ja', title: 'Coffee & a little Japanese', pair: ['English', 'Japanese'], area: 'Surry Hills', slot: 'Saturday morning', time: '10:00', weekday: 6, capacity: 6, members: ['aiko', 'ren'], otherSeats: 1, theme: 'coffee', description: 'An easy start to the weekend. Three conversation rounds, half in each language. All learning levels welcome.' },
  { id: 'table-es', title: 'A seat at the Spanish table', pair: ['English', 'Spanish'], area: 'Newtown', slot: 'Thursday evening', time: '18:00', weekday: 4, capacity: 6, members: ['mateo', 'lucia'], otherSeats: 1, theme: 'table', description: 'Talk food, weekend plans and favourite places. Small tables, plenty of speaking time, no lesson plan needed.' },
  { id: 'walk-ja', title: 'A walk, a word, a new friend', pair: ['English', 'Japanese'], area: 'Glebe', slot: 'Thursday evening', time: '18:00', weekday: 4, capacity: 4, members: ['hana', 'sora'], otherSeats: 0, theme: 'walk', description: 'A gentle neighbourhood walk with a language swap halfway through. The meeting point is agreed before the day.' },
];
