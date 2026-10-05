"use strict";

/**
 * Wording for push notifications about plans. Kept pure so it can be tested without
 * the emulator. Nothing private goes into a notification: only the other person's
 * display name, the meeting time and whether it repeats. The venue and note stay in
 * the app, because notifications can show on a locked screen.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 28 Sep, 18:00" from the invitation's local date and time. */
function describeWhen(meeting) {
  const date = meeting && typeof meeting.localDate === "string" ? meeting.localDate : "";
  const time = meeting && typeof meeting.localTime === "string" ? meeting.localTime : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return time;
  const [year, month, day] = match.slice(1).map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const label = `${weekday} ${day} ${MONTHS[month - 1]}`;
  return time ? `${label}, ${time}` : label;
}

function displayName(name) {
  return typeof name === "string" && name.trim() ? name.trim() : "A language partner";
}

/** Sent to the invitee when a plan is suggested to them. */
function invitationNotice(invitation, fromName) {
  const weekly = invitation.meeting && invitation.meeting.recurrence === "weekly";
  return {
    title: displayName(fromName),
    body: `Suggested a ${weekly ? "weekly language swap" : "language swap"} on ${describeWhen(invitation.meeting)}.`,
  };
}

/** Sent to the person who suggested the plan when it is accepted. */
function acceptedNotice(invitation, toName) {
  return {
    title: displayName(toName),
    body: `Accepted your plan for ${describeWhen(invitation.meeting)}. Say hello!`,
  };
}

/** Sent to each person the day after a meetup. Asks; never says what the other answered. */
function checkInNotice(checkIn, otherName) {
  const day = describeWhen({ localDate: checkIn.occurrence && checkIn.occurrence.localDate });
  return {
    title: "How did your swap go?",
    body: `Did you meet ${displayName(otherName)} on ${day}? Tap to check in.`,
  };
}

module.exports = { describeWhen, invitationNotice, acceptedNotice, checkInNotice };
