import { randomInt } from "node:crypto";

// Two pronounceable groups and four digits, with no ambiguous 0/1 digits.
// This is an initial-password generator, not a password validation policy.
const consonants = "bcdfghjklmnprstvwz";
const vowels = "aeiou";
const digits = "23456789";
const pick = (alphabet) => alphabet[randomInt(alphabet.length)];
function group() {
  const value = Array.from({ length: 4 }, (_, index) =>
    pick(index % 2 === 0 ? consonants : vowels),
  ).join("");
  return value[0].toUpperCase() + value.slice(1);
}
export function readablePassword(usedPasswords = new Set()) {
  let password;
  do {
    password =
      group() +
      Array.from({ length: 4 }, () => pick(digits)).join("") +
      group();
  } while (usedPasswords.has(password));
  usedPasswords.add(password);
  return password;
}
