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
<a href="{depth}privacy/">Privacy</a><a href="{depth}delete-account/">Delete your account</a><a href="{depth}support/">Support</a><a href="{depth}child-safety/">Safety standards</a>
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
<p class="muted">Coming soon to the App Store and Google Play.</p>
"""

PRIVACY = f"""
<h1>Privacy policy</h1>
<p class="muted">Last updated {UPDATED}</p>
<p>This policy explains what Talkeven collects, why, and the choices you have. Talkeven is
run by {OPERATOR} ("we"). Contact: <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>

<h2>What we collect</h2>
<table>
<tr><th>Data</th><th>Why</th><th>Who can see it</th></tr>
<tr><td>Email address and password (the password is handled by our sign-in provider; we never see it)</td><td>To create and secure your account</td><td>Only you</td></tr>
<tr><td>First name, neighbourhood, bio, interests, languages and levels, times you can meet</td><td>To show your profile to people whose exchange works with yours</td><td>Members you match with</td></tr>
<tr><td>Date of birth</td><td>Only to confirm you're 18 or over</td><td>Only you. It is never shown to other members</td></tr>
<tr><td>Meetup invitations (place, date, time, note) and chat messages</td><td>So you and your partner can plan and talk</td><td>You and that partner</td></tr>
<tr><td>Blocks and reports</td><td>To keep members safe and review concerns</td><td>Blocks: only you. Reports: our moderation team</td></tr>
<tr><td>A push notification token, if you turn notifications on</td><td>To tell you about new messages and invitations</td><td>Only our systems</td></tr>
</table>
<p>We do <strong>not</strong> collect your location, contacts, photos or device diagnostics.
The neighbourhood on your profile is whatever you type. We do not use advertising or
analytics tools, we do not track you across other apps or websites, and we do not sell or
share your data.</p>

<h2>Service providers</h2>
<p>We use Google Firebase to run the app: Firebase Authentication for sign in, and a
database and server functions hosted in Sydney, Australia. Push notifications are delivered
through Expo's push service, Apple and Google. They process data on our
behalf under their own security and privacy terms, and only to provide these services.</p>

<h2>How long we keep it</h2>
<p>We keep your data while your account exists. When you delete your account we delete your
profile, date of birth, invitations, conversations and messages (for both people in a
conversation), blocks and notification tokens. <strong>Exception:</strong> safety reports
made by you or about you are kept after deletion so we can act on patterns of abuse; they
are only accessible to moderators.</p>

<h2>Your choices</h2>
<ul>
<li>Edit your profile at any time in the app.</li>
<li>Turn notifications off in your phone's settings.</li>
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
<p>Your sign-in, profile, date of birth, languages, availability, invitations,
conversations and messages (for both people in each conversation), blocks and
notification tokens.</p>
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
If you are in immediate danger, contact your local emergency number (000 in Australia).</p>

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
    page("child-safety", "Child safety standards · Talkeven", "Talkeven's standards against child sexual abuse and exploitation.", CHILD_SAFETY)
    print(f"Built {len(list(OUT.rglob('index.html')))} pages in {OUT}")
