"""Builds the public Talkeven pages the app stores require. Standard library only.

    python3 site/build.py      # writes site/dist/

Published to talkeven.com with Cloudflare Pages by site/deploy.sh.
Set DRAFT = True to show a draft notice on every page.
"""
from pathlib import Path

DRAFT = False
CONTACT = "hello@talkeven.com"  # forwards to the operator through Cloudflare Email Routing
OPERATOR = "Lachlan Irving, an individual developer based in Australia"
UPDATED = "26 September 2026"
PRIVACY_UPDATED = "5 October 2026"
GUIDELINES_UPDATED = "5 October 2026"

ROOT = Path(__file__).parent
OUT = ROOT / "dist"


def page(path, title, description, body):
    draft = (
        '<div class="card draft"><strong>Draft.</strong> This page is under review and '
        "its contact details are placeholders.</div>"
        if DRAFT else ""
    )
    depth = "../" * (path.count("/") + 1) if path else ""
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="icon" href="{depth}favicon.png">
<link rel="stylesheet" href="{depth}style.css">
</head>
<body>
<main>
<header><img src="{depth}icon.svg" alt=""><a href="{depth or './'}">Talkeven</a></header>
{draft}
{body}
<footer>
<a href="{depth}privacy/">Privacy</a><a href="{depth}delete-account/">Delete your account</a><a href="{depth}support/">Support</a><a href="{depth}guidelines/">Community guidelines</a><a href="{depth}child-safety/">Safety standards</a>
<p>Talkeven is run by {OPERATOR}.</p>
</footer>
</main>
</body>
</html>
"""
    target = OUT / path / "index.html" if path else OUT / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")


HOME = f"""
<h1>Swap languages. Meet in person.</h1>
<p>Talkeven pairs you with someone who speaks the language you're learning and is learning
yours, so you help each other evenly. Suggest a meetup at a public place, once or weekly,
and chat to agree the details.</p>
<div class="card">
<p><strong>Language partners only.</strong> Talkeven is for adults and is not a dating app.
No ads, no tracking, and we never ask for your location.</p>
</div>
<p><a class="button" href="join/">Join the founding members</a></p>
<p class="muted">Launching in Sydney on 12 October 2026, on iPhone first and Android soon after.</p>
"""

PRIVACY = f"""
<h1>Privacy policy</h1>
<p class="muted">Last updated {PRIVACY_UPDATED}</p>
<p>This policy explains what Talkeven collects, why, and the choices you have. Talkeven is
run by {OPERATOR} ("we"). Contact: <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>

<h2>What we collect</h2>
<table>
<tr><th>Data</th><th>Why</th><th>Who can see it</th></tr>
<tr><td>Email address and password (the password is handled by our sign-in provider; we never see it)</td><td>To create and secure your account</td><td>Only you</td></tr>
<tr><td>First name, neighbourhood, bio, interests, languages and levels, times you can meet</td><td>To show your profile to people whose exchange works with yours</td><td>Members you match with</td></tr>
<tr><td>Profile photos, if you add any (up to 3)</td><td>So language partners can recognise you when you meet. Each photo is checked automatically for explicit or violent content before anyone else can see it</td><td>Signed-in members, except anyone you have blocked or who has blocked you. Our moderation team if a photo is reported</td></tr>
<tr><td>Date of birth</td><td>Only to confirm you're 18 or over</td><td>Only you. It is never shown to other members</td></tr>
<tr><td>Meetup invitations (place, date, time, note) and chat messages</td><td>So you and your partner can plan and talk</td><td>You and that partner</td></tr>
<tr><td>Meetup check-ins: the morning after an accepted meetup we privately ask whether it happened (yes or no) and, if you like, whether you would meet again (yes or no)</td><td>To know whether meetups are really happening, and later to show you and your partner how evenly your exchange time is balanced</td><td>Only you. Your answers are never shown to your partner</td></tr>
<tr><td>A confirmed meetup record, made only when both people say a meetup happened</td><td>The same as check-ins</td><td>Only our systems</td></tr>
<tr><td>Blocks and reports</td><td>To keep members safe and review concerns</td><td>Blocks: only you. Reports: our moderation team</td></tr>
<tr><td>A push notification token, if you turn notifications on</td><td>To tell you about new messages and invitations, and to send meetup check-ins</td><td>Only our systems</td></tr>
</table>
<p>We do <strong>not</strong> collect your location, contacts, camera or device diagnostics.
Photos are only the ones you choose to add from your library; the app re-sizes them on
your phone before upload, which drops location data embedded in the original. The
neighbourhood on your profile is whatever you type. We do not use advertising or
analytics tools, we do not track you across other apps or websites, and we do not sell or
share your data.</p>

<h2>Founding members list</h2>
<p>If you join the founding members list on this website, we keep your first name, email,
the languages you speak and are learning, your suburb (optional) and your phone type, so we
can invite you when there are partners for you. We don't share the list. Email
<a href="mailto:{CONTACT}">{CONTACT}</a> to be removed at any time.</p>

<h2>Service providers</h2>
<p>We use Google Firebase to run the app: Firebase Authentication for sign in, and a
database, photo storage and server functions hosted in Sydney, Australia. Profile photos
are screened automatically by Google Cloud Vision, which checks each new photo for
explicit, violent or racy content (this check may be processed outside Australia); a
photo that fails is deleted straight away and never shown. Nobody on our team looks at
your photos unless someone reports them. Push notifications are delivered through Expo's
push service, Apple and Google. They process data on our
behalf under their own security and privacy terms, and only to provide these services.</p>

<h2>How long we keep it</h2>
<p>We keep your data while your account exists. You can change a check-in answer for 7 days
after it arrives. When you delete your account we delete your profile, profile photos and
their screening records, date of birth, invitations, conversations and messages (for both
people in a conversation), meetup check-ins (yours, and your partners' check-ins about
meetups with you), confirmed meetup records, blocks and notification tokens. Removing a
photo from your profile deletes it too. <strong>Exception:</strong> safety reports
made by you or about you are kept after deletion so we can act on patterns of abuse; they
are only accessible to moderators.</p>

<h2>Your choices</h2>
<ul>
<li>Edit your profile at any time in the app.</li>
<li>Turn notifications off in your phone's settings.</li>
<li>Skip any check-in, or answer "no" to "would you meet again?" to stop check-ins for that
plan. That only applies to you, and your partner is not told.</li>
<li>Block anyone, which hides you from each other and cancels open plans.</li>
<li>Delete your account in the app (Profile → Delete account) or as described on the
<a href="../delete-account/">account deletion page</a>.</li>
<li>Ask us for a copy of your data or a correction by emailing <a href="mailto:{CONTACT}">{CONTACT}</a>.</li>
</ul>

<h2>Adults only</h2>
<p>Talkeven is for people aged 18 and over. We do not knowingly collect data from anyone
younger. If you believe a child is using Talkeven, please report it in the app or email us
and we will remove the account.</p>

<h2>Security</h2>
<p>Data is encrypted in transit. Access to member data is enforced on our servers, so the
app cannot read another member's private details. No system is perfectly secure; tell us
at once if you suspect a problem with your account.</p>

<h2>Changes</h2>
<p>If we change this policy we will update the date above, and tell you in the app if the
change is significant.</p>
"""

DELETE = f"""
<h1>Delete your Talkeven account</h1>
<p>You can delete your account and its data at any time.</p>

<h2>In the app</h2>
<ol>
<li>Open Talkeven and go to <strong>Profile</strong>.</li>
<li>Tap <strong>Delete account</strong>.</li>
<li>Enter your password and type <strong>DELETE</strong> to confirm.</li>
</ol>
<p>Deletion happens straight away.</p>

<h2>Without the app</h2>
<p>If you no longer have the app installed, email <a href="mailto:{CONTACT}?subject=Delete%20my%20Talkeven%20account">{CONTACT}</a>
from the address you signed up with, with the subject "Delete my Talkeven account". We will
confirm the request came from you and delete the account within 30 days, usually much sooner.</p>

<h2>What is deleted</h2>
<p>Your sign-in, profile, profile photos, date of birth, languages, availability, invitations,
conversations and messages (for both people in each conversation), meetup check-ins,
confirmed meetup records, blocks and notification tokens.</p>
<h2>What is kept</h2>
<p>Safety reports made by you or about you are kept after deletion so moderators can act on
abuse. They are not visible to other members.</p>
"""

SUPPORT = f"""
<h1>Support</h1>
<p>Questions, problems or feedback: email <a href="mailto:{CONTACT}">{CONTACT}</a>. We aim to
reply within two business days.</p>

<h2>Safety</h2>
<p>If someone makes you uncomfortable, block them from their profile or your conversation,
and use <strong>Report</strong> to tell us what happened. Reports go to a person for review.
If you are in immediate danger, contact your local emergency number (000 in Australia).
See our <a href="../guidelines/">community guidelines</a> for what we expect of everyone.</p>

<h2>Common questions</h2>
<p><strong>Why don't I see anyone?</strong> Talkeven only shows people for whom the exchange
works both ways: they speak what you're practising, natively or fluently, and are practising
what you speak. Try adding another language or more times you can meet.</p>
<p><strong>Where should we meet?</strong> Somewhere public, like a café or library. Tell a friend
where you're going.</p>
<p><strong>How do I delete my account?</strong> See <a href="../delete-account/">Delete your account</a>.</p>
"""

CHILD_SAFETY = f"""
<h1>Child safety standards</h1>
<p class="muted">Last updated {UPDATED}</p>
<p>Talkeven is an adults-only language exchange service. We have zero tolerance for child
sexual abuse and exploitation (CSAE), including child sexual abuse material (CSAM).</p>

<h2>Our standards</h2>
<ul>
<li>Members must be 18 or over. Everyone declares a date of birth at sign up, and accounts
under 18 are refused.</li>
<li>Any content or behaviour that sexualises, endangers or exploits children is prohibited
and results in immediate suspension.</li>
<li>Members can report any profile or conversation from inside the app. Reports reach our
moderation queue, where a person reviews them, can see the reported context and can
suspend the account. Actions are recorded in an audit log.</li>
<li>Blocking immediately hides both people from each other and cancels open plans.</li>
</ul>

<h2>Reporting and cooperation</h2>
<p>We remove CSAM as soon as we become aware of it and report it to the relevant authorities,
including the Australian Centre to Counter Child Exploitation (ACCCE) and, where applicable,
the National Center for Missing &amp; Exploited Children (NCMEC). We cooperate with law
enforcement requests made through proper legal channels.</p>

<h2>Contact</h2>
<p>Our designated child safety contact is {OPERATOR}: <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
"""

GUIDELINES = f"""
<h1>Community guidelines</h1>
<p class="muted">Last updated {GUIDELINES_UPDATED}</p>
<p>Talkeven helps adults in Sydney meet in person to swap languages. It works because
people show up as themselves and treat each other well. These guidelines apply in the app
and at every meetup.</p>

<h2>Adults only, and be honest</h2>
<ul>
<li>You must be 18 or over to use Talkeven.</li>
<li>Your age and language levels are what you tell us, so please be accurate. Your partner
is planning their time around the exchange you describe.</li>
<li>Use your real first name, and don't pretend to be someone else.</li>
</ul>

<h2>Language partners, not dates</h2>
<p>Talkeven is for friendly language exchange. It is not a dating app. Don't make romantic
or sexual approaches, comments or requests, in chat or in person. If someone does this to
you, please report it.</p>

<h2>Meet safely</h2>
<ul>
<li>Meet in a public place, like a café, library or park.</li>
<li>Tell a friend where you are going and who you are meeting.</li>
<li>You can leave at any time, for any reason. You don't owe anyone an explanation.</li>
</ul>

<h2>Be respectful</h2>
<p>Everyone is learning, so be patient and kind. We don't allow harassment, bullying,
threats, hate speech or discrimination of any kind, including because of race, ethnicity,
nationality, religion, gender, sexuality, disability or age. Accents and mistakes are part
of learning, never something to mock.</p>

<h2>Keep it about language</h2>
<p>No spam, selling, advertising, paid lessons, or recruiting people into businesses,
groups or causes. Talkeven is a free swap between equals.</p>

<h2>Respect privacy</h2>
<p>Don't share anyone else's private information, such as their address, phone number,
workplace, photos or messages, without their permission. Share your own contact details
only when you are comfortable.</p>

<h2>Photos</h2>
<p>Profile photos must be of you, and must be appropriate: no nudity, sexual content,
violence or other people's pictures. Every photo is screened automatically before anyone
else can see it, and photos that break these rules are removed.</p>

<h2>Report and block</h2>
<p>If someone makes you uncomfortable or breaks these guidelines, tap the
<strong>⋯</strong> menu in your chat with them or on their profile, then choose
<strong>Report</strong> or <strong>Block</strong>. Blocking stops all contact straight
away: you are hidden from each other and any open plans are cancelled.</p>

<h2>What happens after a report</h2>
<p>Every report is reviewed by a moderator, a real person. Depending on what happened, they
may warn the person, remove photos, or suspend or remove the account. Reports are kept
even if the reporter or the reported account is later deleted, so we can act on patterns
of abuse. See our <a href="../child-safety/">child safety standards</a> and
<a href="../privacy/">privacy policy</a> for more.</p>

<h2>Emergencies</h2>
<p>If you are in danger or someone is hurt, call <strong>000</strong> (police, fire or
ambulance in Australia) first, then tell us.</p>

<h2>Contact</h2>
<p>Questions or concerns: <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
"""

LANGUAGES = ["English", "Japanese", "Spanish", "Korean", "Mandarin", "Cantonese", "Portuguese",
             "French", "Italian", "German", "Vietnamese", "Thai", "Indonesian", "Hindi", "Arabic",
             "Greek", "Turkish", "Russian", "Filipino", "Nepali"]

JOIN = f"""
<h1>Join the founding members</h1>
<p>Be one of the first people in Sydney on Talkeven. We'll invite you as soon as there are
partners for your languages, and before the public launch on 12 October.</p>
<div class="card">
<ul>
<li>Early access: iPhone now, Android testing soon</li>
<li>An invite to the launch night on Saturday 17 October</li>
<li>A real say in what we build next</li>
</ul>
</div>
<form class="join" method="post" action="/api/join" id="join">
<p class="form-error" id="form-error" role="alert" hidden></p>
<label for="first_name">First name</label>
<input id="first_name" name="first_name" autocomplete="given-name" maxlength="40" required>
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>
<label for="speaks">A language you speak fluently</label>
<input id="speaks" name="speaks" list="languages" maxlength="40" placeholder="e.g. English" required>
<label for="learning">A language you're learning</label>
<input id="learning" name="learning" list="languages" maxlength="40" placeholder="e.g. Japanese" required>
<datalist id="languages">{''.join(f'<option value="{l}">' for l in LANGUAGES)}</datalist>
<label for="suburb">Suburb <span class="muted">(optional)</span></label>
<input id="suburb" name="suburb" maxlength="60" placeholder="e.g. Newtown">
<fieldset>
<legend>Your phone</legend>
<label class="choice"><input type="radio" name="platform" value="ios" required> iPhone</label>
<label class="choice"><input type="radio" name="platform" value="android"> Android</label>
</fieldset>
<label class="choice"><input type="checkbox" name="adult" required> I'm 18 or over</label>
<div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<input type="hidden" name="source" id="source">
<button type="submit">Join the founding members</button>
<p class="muted small">Language partners only. Not dating. We'll only email you about Talkeven, and you can ask to be removed any time. See our <a href="../privacy/">privacy policy</a>.</p>
</form>
<script>
(function () {{
  var params = new URLSearchParams(location.search);
  var err = params.get("error"), box = document.getElementById("form-error");
  if (err) {{ box.textContent = err; box.hidden = false; }}
  document.getElementById("source").value = params.get("from") || "";
  var form = document.getElementById("join");
  form.addEventListener("submit", function (e) {{
    e.preventDefault();
    var button = form.querySelector("button"); button.disabled = true; button.textContent = "Joining…";
    fetch("/api/join", {{ method: "POST", headers: {{ accept: "application/json" }}, body: new FormData(form) }})
      .then(function (r) {{ return r.json(); }})
      .then(function (res) {{
        if (res.ok) {{ location.href = "thanks/"; return; }}
        box.textContent = res.error || "Something went wrong. Please try again."; box.hidden = false;
        button.disabled = false; button.textContent = "Join the founding members";
      }})
      .catch(function () {{ form.submit(); }});
  }});
}})();
</script>
"""

THANKS = f"""
<h1>You're on the list</h1>
<p>Thanks for joining the founding members. We'll email you as soon as there are partners
for your languages, and with details of the launch night on Saturday 17 October.</p>
<p>Know someone who speaks the language you're learning? Send them
<a href="../">talkeven.com/join</a>. Every person on the other side is a partner for you.</p>
<p class="muted">Questions? <a href="mailto:{CONTACT}">{CONTACT}</a></p>
"""

if __name__ == "__main__":
    import shutil
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in ("style.css", "favicon.png", "icon.svg"):
        shutil.copy(ROOT / name, OUT / name)
    page("", "Talkeven: swap languages, meet in person", "Find a language partner who is learning your language.", HOME)
    page("privacy", "Privacy policy · Talkeven", "What Talkeven collects and why.", PRIVACY)
    page("delete-account", "Delete your account · Talkeven", "How to delete your Talkeven account and data.", DELETE)
    page("support", "Support · Talkeven", "Get help with Talkeven.", SUPPORT)
    page("join", "Join the founding members · Talkeven", "Be one of the first people in Sydney on Talkeven.", JOIN)
    page("join/thanks", "You're on the list · Talkeven", "Thanks for joining the Talkeven founding members.", THANKS)
    page("child-safety", "Child safety standards · Talkeven", "Talkeven's standards against child sexual abuse and exploitation.", CHILD_SAFETY)
    page("guidelines", "Community guidelines · Talkeven", "How to stay safe and respectful on Talkeven.", GUIDELINES)
    print(f"Built {len(list(OUT.rglob('index.html')))} pages in {OUT}")
