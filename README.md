# 🎯 Dart Master — Orientation Booth Game

A mobile-first, interactive dart game built for a university orientation booth, featuring a **two-stage aiming system, server-side score validation, Student ID-based play tracking, and a live global leaderboard**.

Designed to turn a simple booth activity into a competitive, real-time experience where students can play, improve their score, and compete for the top of the leaderboard.

## ✨ Highlights

* 🎯 **Two-stage aiming system** — players lock their horizontal and vertical aim before throwing.
* 🏆 **Live global leaderboard** — scores are stored in a Supabase PostgreSQL database and displayed in real time.
* 🪪 **Student ID-based tracking** — each student is uniquely associated with their attempts.
* 🔥 **5-play limit** — each student gets a maximum of 5 attempts.
* ⭐ **Best-score system** — only the student's highest score is retained on the leaderboard.
* 🛡️ **Server-side score validation** — scores are independently calculated by the backend instead of trusting the client.
* 📱 **Mobile-first design** — optimized for students playing through their phones via QR code.
* 🖥️ **Dedicated leaderboard display** — the leaderboard can be opened separately on a laptop/TV at the booth.
* ⚡ **Serverless architecture** — deployed using Netlify Functions with no traditional backend server required.

---

## 🏗️ Architecture

```text
                 ┌──────────────────┐
                 │   Student Phone  │
                 │                  │
                 │  Dart Game UI    │
                 └────────┬─────────┘
                          │
                    Normalized
                   (x, y) coordinates
                          │
                          ▼
              ┌───────────────────────┐
              │    Netlify Function   │
              │                       │
              │  • Validate input     │
              │  • Calculate score    │
              │  • Track plays        │
              │  • Update best score  │
              │  • Calculate rank     │
              └───────────┬───────────┘
                          │
                          ▼
                ┌──────────────────┐
                │     Supabase     │
                │    PostgreSQL    │
                │                  │
                │   Leaderboard    │
                └────────┬─────────┘
                         │
                         ▼
                ┌──────────────────┐
                │ Booth TV/Laptop  │
                │                  │
                │ Global Leaderboard│
                └──────────────────┘
```

## 🛡️ Backend & Anti-Cheat System

One of the key parts of the project is that the **client does not have authority over the final score**.

Instead of sending a raw score, the game sends the normalized coordinates of the player's two aim locks:

```text
x = 0.0 → 1.0
y = 0.0 → 1.0
```

The Netlify backend independently calculates the score from these coordinates using the game's scoring rules.

This means a modified browser client cannot simply submit:

```text
score = 100
```

and expect the server to accept it.

The backend also handles:

* Input validation
* Coordinate range validation
* Student ID validation
* Maximum 5-play enforcement
* Best-score comparison and updates
* Server-side ranking
* Duplicate Student ID handling
* Rate limiting between submissions
* Sanitization of user-provided names and IDs

The Supabase database is protected with **Row Level Security**, while the secret service-role key is kept exclusively inside Netlify environment variables and never exposed to the browser.

---

## 🏆 Leaderboard Logic

Each student has a single leaderboard entry.

For every attempt:

```text
Student plays
      ↓
Attempt #1
      ↓
Score calculated by server
      ↓
Best score saved
      ↓
Attempt #2
      ↓
Compare with previous best
      ↓
Keep the higher score
      ↓
...
      ↓
Attempt #5
      ↓
Further attempts blocked
```

For example:

| Attempt | Score | Leaderboard Score |
| ------- | ----: | ----------------: |
| 1       |    40 |                40 |
| 2       |    60 |                60 |
| 3       |    20 |                60 |
| 4       |    80 |                80 |
| 5       |    60 |                80 |

This keeps the leaderboard competitive without creating multiple entries for the same student.

---

## 🎮 Gameplay

1. Scan the QR code.
2. Enter your name and Student ID.
3. Lock your horizontal aim.
4. Lock your vertical aim.
5. The dart lands at the selected position.
6. Your score is calculated.
7. Your attempt is recorded.
8. Your best score is shown on the global leaderboard.
9. You can play up to 5 times.

---

## 🧰 Tech Stack

**Frontend**

* HTML5
* CSS3
* Vanilla JavaScript

**Backend**

* Netlify Functions
* Node.js

**Database**

* Supabase
* PostgreSQL
* Row Level Security

**Deployment**

* Netlify
* GitHub

---

## 📁 Project Structure

```text
dart-game/
│
├── index.html
├── leaderboard.html
├── style.css
├── game.js
├── leaderboard.js
├── netlify.toml
├── package.json
├── README.md
│
└── netlify/
    └── functions/
        ├── submit-score.js
        └── leaderboard.js
```

### Key files

**`game.js`**
Handles the game flow, aiming mechanics, user interaction, and communication with the backend.

**`submit-score.js`**
The main server-side scoring and leaderboard function. Validates the submission, calculates the authoritative score, enforces the 5-play limit, and updates the student's best score.

**`leaderboard.js`**
Retrieves and displays the current top players.

**`leaderboard.html`**
Dedicated leaderboard interface designed for a booth laptop/TV.

---

## 🚀 Deployment

The project is designed for a simple serverless deployment:

```text
GitHub
   ↓
Netlify
   ↓
Static Frontend + Netlify Functions
   ↓
Supabase PostgreSQL
```

No traditional server or separate backend hosting is required.

---

## 🎓 Built For

**University Orientation Booth**

The project was designed specifically for an orientation environment where many students can access the game simultaneously through a QR code while a separate screen displays the live leaderboard.

The combination of **gamification + persistent player tracking + server-side validation + live rankings** turns the booth into a small competitive experience rather than just a static activity.

---

## 📌 Project Goals

This project demonstrates practical implementation of:

* Full-stack web development
* Serverless backend architecture
* Database integration
* REST-style API communication
* Server-side validation
* Basic anti-cheat design
* User/session tracking
* Leaderboard ranking systems
* Responsive UI design
* Deployment and environment management

---

## 🔗 Live Demo

**Play the game:**
https://dart-game-orientation.netlify.app/

**Leaderboard:**
https://dart-game-orientation.netlify.app/leaderboard

---

## 👨‍💻 Project

**Dart Master — Orientation Booth Game**

Built as an interactive university orientation experience with a focus on **gamification, backend reliability, and real-time competition**.
