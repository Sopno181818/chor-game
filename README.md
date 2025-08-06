# Chor–Dakat–Babu–Police Web Game

This repository contains a complete implementation of a four‑player role guessing game inspired by the Bangladeshi childhood pastime “চোর পুলিশ বাবু ডাকাত”.  It consists of a Node.js/Socket.IO backend and a static front‑end written in plain HTML, CSS and JavaScript.  The game has been designed to be as user‑friendly as possible and includes everything needed to run it locally or deploy it to a platform like Render (for the backend) and Vercel (for the frontend).

## Game rules

1. **Roles and points** – At the start of each round four players are randomly assigned unique roles and corresponding points:
   
   | Role   | Description                                     | Points |
   | ------ | ----------------------------------------------- | -----: |
   | **Babu**   | Watches the game and collects a large reward.          | 1000 |
   | **Police** | Must identify the **Chor** among the other players.    |  500 |
   | **Dakat**  | A bystander with a modest reward.                      |  300 |
   | **Chor**   | The thief who hopes to avoid detection.                |    0 |

2. **Guessing** – After roles are assigned the police is shown the names of the other three players and must select who they think is the Chor.  If the guess is correct the police keeps their 500 points.  If the guess is wrong the police forfeits 500 points which are transferred to the player who was wrongly accused.

3. **Scoring** – Players accumulate points across rounds.  At the end of the game (after ten rounds by default) the player with the highest total score wins.  Scores are always visible to all players.

4. **Multiple rounds** – The game runs for a fixed number of rounds.  After each round the roles are reshuffled and players continue accumulating points.  If a player leaves mid‑game the current round is aborted and the game resets to allow new players to join.

## Project structure

```
chor‑game/
├── client/
│   ├── index.html   # Front‑end page (UI)
│   └── game.js      # Client‑side logic
├── server/
│   └── index.js     # Node.js/Socket.IO backend
└── README.md        # Instructions and game rules (this file)
```

The front‑end is intentionally lightweight: no frameworks, bundlers or build tools are required.  The backend uses Express and Socket.IO; these packages must be installed before running the server.

## Running locally

1. **Install Node.js** – You should already have Node.js installed (v22.18.0 or later).  If not, download it from [nodejs.org](https://nodejs.org).  You do *not* need to install any separate web server for the client.

2. **Install dependencies** – Open a terminal/command prompt, navigate to the `server` directory and install the necessary packages:

   ```sh
   cd chor‑game/server
   npm install express socket.io
   ```

3. **Start the backend** – Still inside the `server` directory, run the server:

   ```sh
   node index.js
   ```

   The server listens on port 3000 by default.  You should see a message like “Server listening on port 3000”.

4. **Open the front‑end** – In your browser, open the file `chor‑game/client/index.html`.  You can do this by double‑clicking it or dragging it into the address bar.  Because the front‑end is entirely static there is no need to run a separate web server; however, some browsers (notably Safari) restrict WebSocket connections for local files.  If you encounter issues you can serve the client folder via a simple HTTP server:

   ```sh
   # From inside chor‑game/client
   npx serve .
   ```

   Then navigate to the address displayed (usually http://localhost:5000) in your browser.

5. **Play the game** – Open the client page in **four separate tabs or windows** (or ask friends to join from their devices).  Enter a name in each tab and click “Join Game”.  The first four players to join will be matched into a game.  When all four have joined the round will begin automatically.

## Deploying to the internet

The game is separated into a backend (Node.js) and a front‑end (static files).  The recommended deployment strategy is to host the backend on **Render** (or any service that supports Node.js and WebSockets) and the front‑end on **Vercel** (or any static hosting service).  Below is a step‑by‑step guide for non‑technical users.  You only need to do this once; subsequent changes to the code can be redeployed automatically.

### 1. Prepare a GitHub repository

To deploy through Render and Vercel you’ll need a GitHub repository containing this project:

1. Go to [github.com](https://github.com) and sign in or create an account.
2. Click “New repository” and name it something like `chor-game`.
3. Clone the empty repository to your computer using Git or GitHub Desktop.
4. Copy the contents of the `chor‑game` folder into your repository and commit the changes.  Your repository should now contain the `client` and `server` directories and `README.md`.
5. Push your commits back to GitHub.

### 2. Deploy the backend to Render

1. Visit [render.com](https://render.com) and log in or create an account.
2. Click **“New Web Service”**.  When prompted, choose the option to connect your GitHub account and select your `chor-game` repository.
3. On the “Create a new Web Service” page, configure the service:
   - **Name:** something like `chor-game-backend`.
   - **Environment:** *Node*.
   - **Region:** choose the default or the closest location to your audience.
   - **Branch:** choose the branch where your server code lives (usually `main`).
   - **Root Directory:** `server` (type this exactly; it tells Render that the server code is inside the `server` folder).
   - **Build Command:** `npm install` (Render will run this to install dependencies).
   - **Start Command:** `node index.js` (this starts your server).
4. Click “Create Web Service”.  Render will install dependencies and start your server.  When deployment is complete you’ll see a public URL like `https://chor-game-backend.onrender.com`.
5. Note this URL – you’ll need it when configuring the front‑end.

### 3. Deploy the front‑end to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in or create an account.
2. Click **“Add New…” → “Project”** and import your `chor-game` repository from GitHub.
3. On the project configuration page:
   - **Framework Preset:** select “Other”.
   - **Root Directory:** choose `client`.  This tells Vercel to deploy only the files in the `client` folder.
   - **Build Command:** leave blank (no build step is required).
   - **Output Directory:** also leave blank (for static sites Vercel uses the root directory).
4. Click “Deploy”.  After a moment you’ll receive a URL like `https://chor-game-username.vercel.app` for your front‑end.

### 4. Configure the front‑end to connect to the backend

By default the client connects to `http://localhost:3000`, which works on your local machine but not in production.  To point the client at your deployed backend you have two options:

1. **Edit `game.js`** – Open `client/game.js` and change the line

   ```js
   const SERVER_URL = window.SERVER_URL || 'http://localhost:3000';
   ```

   to:

   ```js
   const SERVER_URL = window.SERVER_URL || 'https://chor-game-backend.onrender.com';
   ```

   replacing the URL with your actual Render domain.  Commit and push the change to GitHub; Vercel will redeploy automatically.

2. **Define `window.SERVER_URL` in HTML** – Without modifying `game.js` you can override the server URL in `index.html` by adding a script tag *before* `game.js` like this:

   ```html
   <script>
     window.SERVER_URL = 'https://chor-game-backend.onrender.com';
   </script>
   <script src="game.js"></script>
   ```

   The included `index.html` does not contain this tag by default.  You can add it by editing the file in your repository, committing, and pushing the change.

After deploying the front‑end with the correct server URL the game should be fully functional.  Simply share your Vercel URL with friends and enjoy the game together!

## Troubleshooting and tips for non‑technical users

If you’re not familiar with web development the deployment steps may seem daunting.  The key idea is that Render runs the server code and Vercel serves the static files.  Here are some general pointers:

* **Don’t share secrets.**  You should never enter your Render or Vercel password into any third‑party site.  The code provided here is safe to run on your own accounts.
* **Wait for the “Ready” status.**  Both Render and Vercel show a build log.  Wait for the service to say “Live” or “Ready” before visiting the URL.  If there are errors, recheck the build and start commands.
* **Use different browser tabs to simulate multiple players.**  To test the game yourself open the front‑end URL in four browser tabs.  Each tab should enter a different name.  After all four have joined the game will start automatically.
* **Deploy updates easily.**  Whenever you change the code (for example, to customise the UI or adjust rules) simply commit and push your changes to GitHub.  Render and Vercel will redeploy automatically.

## Future improvements

This implementation is intentionally simple to make it accessible to new developers.  There are many ways it could be expanded in the future:

* Add a chat feature so players can discuss and bluff during the game.
* Allow custom round counts or rule variations to be selected before starting.
* Persist scores between sessions using a database.
* Create a lobby system to host multiple games concurrently.

Feel free to customise and extend the game as you see fit.  Enjoy playing!