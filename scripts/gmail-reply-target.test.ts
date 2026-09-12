import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseReplyRecipient,
  emailsEqual,
  extractEmailAddress,
} from "../lib/connectors/gmail-reply-target.ts";

test("extractEmailAddress handles bare and angled addresses", () => {
  assert.equal(extractEmailAddress("matt@warix.co"), "matt@warix.co");
  assert.equal(
    extractEmailAddress("Matthew Gross <matt@warix.co>"),
    "matt@warix.co",
  );
  assert.equal(extractEmailAddress("  "), null);
});

test("chooseReplyRecipient prefers event sender over self", () => {
  assert.equal(
    chooseReplyRecipient({
      requestedTo: "matthewdavila51@gmail.com",
      eventFromAddr: "Matthew Gross <matt@warix.co>",
      selfEmails: ["matthewdavila51@gmail.com"],
      threadFromAddrs: ["Matthew Gross <matt@warix.co>"],
    }),
    "matt@warix.co",
  );
});

test("chooseReplyRecipient keeps external requested recipient", () => {
  assert.equal(
    chooseReplyRecipient({
      requestedTo: "alice@example.com",
      eventFromAddr: "matt@warix.co",
      selfEmails: ["matthewdavila51@gmail.com"],
    }),
    "alice@example.com",
  );
});

test("emailsEqual is case-insensitive", () => {
  assert.equal(
    emailsEqual("Matt@Warix.co", "matt@warix.co"),
    true,
  );
});
