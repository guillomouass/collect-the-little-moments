/*
 * ─────────────────────────────────────────────────────────────
 *  PERSONALIZATION — the only file you need to edit.
 * ─────────────────────────────────────────────────────────────
 *
 *  Text placeholders you can use anywhere below:
 *    {main}       → mainCharacterName      {MAIN}   → same, in CAPITALS
 *    {second}     → secondCharacterName    {SECOND} → same, in CAPITALS
 *    {recipient}  → recipientName
 *    {creator}    → creatorName
 *    {activity}   → dateActivity
 *
 *  Empty values fall back to sensible defaults, so the game never
 *  shows "undefined" or a stray {placeholder}.
 */
window.LITTLE_MOMENTS_CONFIG = {
  gameTitle: 'Collect the Little Moments',
  subtitle: 'A tiny adventure made of little things that matter.',

  mainCharacterName: 'Mahmood',   // the playable monkey
  secondCharacterName: 'Nuwara',  // the monkey he wants to reach
  recipientName: 'Nuwara',        // the person the invitation is for
  creatorName: 'Mahmood',         // the person sending it

  // A preferred date idea, written so it completes "How about …?"
  // Examples: 'a sunset walk and ice cream', 'a picnic in the park'
  // Leave empty to show "How about we plan a cute date?"
  dateActivity: '',

  // Optional: replace the whole invitation question. Leave empty for the default.
  finalInvitation: '',

  // Small line on the start screen. Leave empty to hide it.
  dedication: 'made with 💙 for {recipient}',

  // Sound on by default? (The player's own choice is remembered afterwards.)
  soundEnabled: true,

  // Exactly five hearts, revealed in this order.
  heartMessages: [
    { title: 'A little reminder...', message: 'You deserve little moments that make you smile.' },
    { title: 'A little secret...', message: 'Your smile is kind of contagious.' },
    { title: 'Okay, one thing...', message: 'Talking to you is becoming one of my favorite things.' },
    { title: 'Between you and me...', message: 'Some people just make an ordinary day feel different.' },
    { title: 'One last thing...', message: 'Maybe we should make a little memory together?' }
  ],

  ending: {
    approach: 'Just one more little moment...',
    arrival: '{MAIN} FINALLY MADE IT TO {SECOND}... 💙',
    reflection: 'Some moments are too special to keep inside a little game.',
    invitation: '{recipient}, would you let {creator} take you on a date? 🐒💙',
    yesButton: 'Yes, why not? 💙',
    moreButton: 'Tell me more 👀',
    yesHeadline: '{MAIN} IS OFFICIALLY THE HAPPIEST MONKEY IN THE WORLD! 💙',
    yesFollowUp: "Now, let's make a real little memory together.",
    activityLine: 'How about {activity}?',
    noActivityLine: 'How about we plan a cute date?',
    moreShy: "{main} is a little shy... but he'd really love to spend some time with you. 👀",
    moreButton2: 'Okay, tell me more 💙',
    moreReveal: "Then let's choose a day and make a little memory together.",
    // Shown under the final answer. Leave empty to hide it.
    replyHint: 'Psst… take a screenshot and send it to {creator} 💌',
    playAgain: 'Play again 💙'
  }
};
