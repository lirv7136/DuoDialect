"use strict";

const { makeActor, birthDateForAge } = require("./env");

/**
 * The standing cast. Every profile is created through the real upsertProfile callable,
 * so tests never seed documents the backend would have rejected.
 *
 * alex  English native, learning Japanese. Adult, dating on.
 * aiko  Japanese fluent, learning English. Adult, dating on, compatible with alex.
 * ren   Japanese native, learning English. Adult, dating off.
 * mei   Japanese intermediate only: cannot offer Japanese to anyone.
 * sam   Spanish native, learning French: no exchange with alex in either direction.
 * kai   Japanese fluent, learning English, but 16 years old by declared birth date.
 */
const CAST = {
  alex: {
    displayName: "Alex",
    bio: "Here for a weekly swap and better coffee.",
    area: "Surry Hills",
    speaks: [{ lang: "english", level: "native" }],
    learns: [{ lang: "japanese", level: "beginner" }],
    availability: ["Thursday evening", "Saturday morning"],
    interests: ["Coffee", "Design"],
    birthDate: birthDateForAge(27),
    gender: "nonbinary",
    dating: { enabled: true, genders: ["woman", "man", "nonbinary"], ageMin: 24, ageMax: 35 },
  },
  aiko: {
    displayName: "Aiko",
    area: "Surry Hills",
    speaks: [{ lang: "japanese", level: "fluent" }],
    learns: [{ lang: "english", level: "intermediate" }],
    availability: ["Thursday evening", "Saturday morning"],
    interests: ["Coffee", "Walking"],
    birthDate: birthDateForAge(26),
    gender: "woman",
    dating: { enabled: true, genders: ["woman", "man", "nonbinary"], ageMin: 22, ageMax: 36 },
  },
  ren: {
    displayName: "Ren",
    area: "Newtown",
    speaks: [{ lang: "japanese", level: "native" }],
    learns: [{ lang: "english", level: "beginner" }],
    availability: ["Thursday evening"],
    interests: ["Books"],
    birthDate: birthDateForAge(29),
    gender: "man",
    dating: { enabled: false },
  },
  mei: {
    displayName: "Mei",
    area: "Glebe",
    speaks: [{ lang: "mandarin", level: "native" }, { lang: "japanese", level: "intermediate" }],
    learns: [{ lang: "english", level: "beginner" }],
    availability: ["Saturday morning"],
    birthDate: birthDateForAge(31),
    gender: "woman",
    dating: { enabled: false },
  },
  sam: {
    displayName: "Sam",
    area: "CBD",
    speaks: [{ lang: "spanish", level: "native" }],
    learns: [{ lang: "french", level: "beginner" }],
    availability: ["Thursday evening"],
    birthDate: birthDateForAge(33),
    gender: "man",
    dating: { enabled: false },
  },
  kai: {
    displayName: "Kai",
    area: "Newtown",
    speaks: [{ lang: "japanese", level: "fluent" }],
    learns: [{ lang: "english", level: "beginner" }],
    availability: ["Saturday morning"],
    birthDate: birthDateForAge(16),
    gender: "man",
  },
};

/** Creates the named actors, each signed in, each with a real profile. */
async function castOf(...names) {
  const out = {};
  for (const name of names) {
    const spec = CAST[name];
    if (!spec) throw new Error(`Unknown cast member: ${name}`);
    const actor = await makeActor(name);
    const result = await actor.call("upsertProfile", spec);
    out[name] = Object.assign(actor, { profile: result.profile, account: result.account, spec });
  }
  return out;
}

module.exports = { CAST, castOf };
