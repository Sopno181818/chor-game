const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

/*
 * Chor–Dakat–Babu–Police multiplayer game server
 *
 * This server hosts a simple yet feature‑rich four‑player game.  After four
 * players join, everyone must click a shuffle button to begin the round.
 * Each round randomly assigns one Babu (receives 900 points immediately),
 * one Police (800 points pending), one Chor (400 points pending) and one
 * Dakat (600 points pending).  The police must identify either the Chor
 * or the Dakat depending on whether the round is odd or even.  Points are
 * awarded based on the guess result:
 *   Round 1,3,5,…: Police guesses the Chor.  If correct, police gets 800 and
 *      Dakat gets 600; Chor gets 0.  If wrong, police gets 0, Chor gets 400
 *      and Dakat gets 600.
 *   Round 2,4,6,…: Police guesses the Dakat.  If correct, police gets 800 and
 *      Chor gets 400; Dakat gets 0.  If wrong, police gets 0, Chor gets 400
 *      and Dakat gets 600.
 * Babu always receives their 900 points when roles are assigned at the start
 * of each round.  After ten rounds the game ends and the highest scoring
 * player(s) win.  All scores and history reset for the next game.
 */

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Serve static assets from the client folder
app.use(express.static(path.join(__dirname, 'client')));

// Player registry.  Each connected socket gets an entry here keyed by its id.
const players = {};
// Waiting queue for players who have joined but are not currently in a game.
let waiting = [];
// Currently active players in a game (exactly four ids when a game is running).
let currentPlayers = [];
// Flag indicating whether a game is underway.
let gameStarted = false;
// Flag indicating whether the game is currently waiting on a round to finish.
// While `awaitingShuffle` is true the shuffle button is disabled; once a
// round is resolved the flag is cleared so players can start the next round.
let awaitingShuffle = false;
// Current round number (1‑based).
let currentRound = 0;
// Maximum number of rounds per game.
const MAX_ROUNDS = 10;
// History of each round's results.  An array of objects with shape:
// { round, message, gains: [{ id, name, points }], correct }
let history = [];

// Role names and their pending point values.  Babu's points are awarded
// immediately when roles are assigned.  Others are awarded based on guess
// outcomes.
const rolePoints = {
  Babu: 900,
  Police: 800,
  Chor: 400,
  Dakat: 600
};

/**
 * Assigns roles randomly to the four current players.  Babu receives their
 * points immediately.  Others have pending points that will be granted based
 * on the police's guess.  Also clears the awaitingShuffle flag.
 */
function assignRoles() {
  const roles = ['Babu', 'Police', 'Chor', 'Dakat'];
  const shuffled = roles.sort(() => Math.random() - 0.5);
  currentPlayers.forEach((id, idx) => {
    const role = shuffled[idx];
    players[id].role = role;
    players[id].pending = rolePoints[role];
    // Award Babu's points immediately
    if (role === 'Babu') {
      players[id].score += rolePoints.Babu;
    }
  });
  // Reset awaitingShuffle.  The round has not yet begun; it will be set
  // to true when startRound begins and cleared once the round is resolved.
  awaitingShuffle = false;
}

/**
 * Starts a new round: increments the round counter, assigns roles, sends
 * scoreboard and history to all current players, and prompts the police
 * player to make their guess.
 */
function startRound() {
  currentRound++;
  assignRoles();
  // Round begins; block further shuffle until resolved
  awaitingShuffle = true;
  // Build scoreboard with full role information (to allow client‑side
  // visibility filtering) and current scores.
  const scoreboard = currentPlayers.map(id => ({
    id,
    name: players[id].name,
    role: players[id].role,
    score: players[id].score
  }));
  // Notify each player of the new round, scoreboard and history
  currentPlayers.forEach(id => {
    io.to(id).emit('rolesAssigned', {
      round: currentRound,
      maxRounds: MAX_ROUNDS,
      scoreboard,
      history
    });
  });
  // Determine which role the police must guess this round
  const guessTarget = (currentRound % 2 === 1) ? 'Chor' : 'Dakat';
  // Identify the police player
  const policeId = currentPlayers.find(id => players[id].role === 'Police');
  if (policeId) {
    // Police can choose between the two non‑Babu, non‑Police players
    const suspects = currentPlayers
      .filter(id => id !== policeId && players[id].role !== 'Babu')
      .map(id => ({ id, name: players[id].name }));
    io.to(policeId).emit('policeTurn', { guessTarget, suspects });
  }
}

/**
 * Resolves the current round after the police makes a guess.  Calculates
 * points gained for each player, updates their cumulative scores, appends
 * a history entry, sends the results to all players and either prepares
 * the next round or concludes the game.
 *
 * @param {string} policeId – the socket id of the police player
 * @param {string} guessedId – the socket id of the player guessed by the police
 */
function resolveRound(policeId, guessedId) {
  // Determine the target role for this round (Chor on odd rounds, Dakat on even)
  const guessTarget = (currentRound % 2 === 1) ? 'Chor' : 'Dakat';
  const guessedPlayer = players[guessedId];
  const policePlayer = players[policeId];
  // Identify the Chor and Dakat by their socket ids
  const chorId = currentPlayers.find(id => players[id].role === 'Chor');
  const dakatId = currentPlayers.find(id => players[id].role === 'Dakat');
  let correct = false;
  let message = '';
  // Prepare gains for each player this round
  const gains = {};
  currentPlayers.forEach(id => { gains[id] = 0; });

  // Always award the Babu their points in the gains table for history.  If for some
  // reason the Babu is not found (which should not happen), no gain will be
  // recorded.  The Babu's cumulative score was already updated during role
  // assignment so we do not add to their total here.
  const babuId = currentPlayers.find(id => players[id].role === 'Babu');
  if (babuId !== undefined) {
    gains[babuId] = rolePoints.Babu;
  }

  if (guessTarget === 'Chor') {
    if (guessedId === chorId) {
      // Police guessed the Chor correctly
      correct = true;
      message = `${policePlayer.name} guessed correctly: ${players[chorId].name} is the Chor.`;
      gains[policeId] += rolePoints.Police;
      gains[dakatId] += rolePoints.Dakat;
      // Chor gets zero points
    } else {
      // Police guessed the Dakat instead of the Chor
      correct = false;
      message = `${policePlayer.name} guessed incorrectly. ${players[chorId].name} was the Chor, and ${players[dakatId].name} was the Dakat.`;
      // Police gains nothing
      gains[dakatId] += rolePoints.Dakat;
      gains[chorId] += rolePoints.Chor;
    }
  } else {
    // Guess target is Dakat
    if (guessedId === dakatId) {
      correct = true;
      message = `${policePlayer.name} guessed correctly: ${players[dakatId].name} is the Dakat.`;
      gains[policeId] += rolePoints.Police;
      gains[chorId] += rolePoints.Chor;
      // Dakat gets zero
    } else {
      // Police guessed the Chor instead of the Dakat
      correct = false;
      message = `${policePlayer.name} guessed incorrectly. ${players[dakatId].name} was the Dakat, and ${players[chorId].name} was the Chor.`;
      // Police gains nothing
      gains[dakatId] += rolePoints.Dakat;
      gains[chorId] += rolePoints.Chor;
    }
  }
  // Apply gains to players' cumulative scores.  Babu's 900 points were
  // already awarded when roles were assigned, so do not add them again to
  // the cumulative score here.
  currentPlayers.forEach(id => {
    if (players[id].role !== 'Babu') {
      players[id].score += gains[id];
    }
  });
  // Append history entry
  history.push({
    round: currentRound,
    message,
    gains: currentPlayers.map(id => ({ id, name: players[id].name, points: gains[id] })),
    correct
  });
  // Construct scoreboard after applying gains
  const scoreboard = currentPlayers.map(id => ({
    id,
    name: players[id].name,
    role: players[id].role,
    score: players[id].score
  }));
  // Send round result to all players
  currentPlayers.forEach(id => {
    io.to(id).emit('roundResult', {
      round: currentRound,
      correct,
      message,
      scoreboard,
      history,
      targetRole: guessTarget,
      policeName: policePlayer.name,
      chorName: players[chorId].name,
      dakatName: players[dakatId].name
    });
  });
  // Check if game finished
  if (currentRound >= MAX_ROUNDS) {
    // Determine winners
    const highest = Math.max(...currentPlayers.map(id => players[id].score));
    const winners = currentPlayers.filter(id => players[id].score === highest).map(id => players[id].name);
    // Send gameOver event with final standings but do not immediately reset the game.  Clients
    // should display results and provide a restart button.  Game state will be
    // cleared when a restart is requested.
    currentPlayers.forEach(id => {
      io.to(id).emit('gameOver', {
        winners,
        scoreboard,
        history
      });
    });
    // Do not reset players or game state here; wait for restart request
    // awaitingShuffle remains false so further shuffles are disabled
    awaitingShuffle = false;
  } else {
    // Prepare for next round: allow shuffle
    awaitingShuffle = false;
    currentPlayers.forEach(id => {
      io.to(id).emit('enableShuffle');
    });
  }
}

// Socket.IO connection handler
io.on('connection', socket => {
  // Register player
  players[socket.id] = { id: socket.id, name: '', score: 0, role: '', pending: 0 };
  waiting.push(socket.id);
  // Inform waiting lobby of new player list (names only)
  io.emit('updatePlayers', waiting.map(id => players[id].name).filter(Boolean));

  socket.on('join', name => {
    if (!name || typeof name !== 'string') return;
    players[socket.id].name = name.trim();
    // Broadcast updated lobby
    io.emit('updatePlayers', waiting.map(id => players[id].name).filter(Boolean));
    // If game not started and at least four named players waiting, move them to current game
    const ready = waiting.filter(id => players[id].name);
    if (!gameStarted && ready.length >= 4) {
      currentPlayers = ready.slice(0, 4);
      waiting = waiting.filter(id => !currentPlayers.includes(id));
      gameStarted = true;
      currentRound = 0;
      history = [];
      awaitingShuffle = false;
      // Clear scores and roles for players starting a new game
      currentPlayers.forEach(id => {
        players[id].score = 0;
        players[id].role = '';
        players[id].pending = 0;
      });
      // Prompt these players to shuffle to begin round 1
      currentPlayers.forEach(id => {
        io.to(id).emit('enableShuffle');
      });
    }
  });

  socket.on('shuffle', () => {
    // Only proceed if a game is active, shuffle not already pending, and sender is one of the current players
    if (!gameStarted || awaitingShuffle || !currentPlayers.includes(socket.id)) return;
    startRound();
  });

  socket.on('guess', data => {
    // Only allow if game is running and a round is in progress (awaitingShuffle true)
    if (!gameStarted || !awaitingShuffle) return;
    const policeId = socket.id;
    if (players[policeId].role !== 'Police') return;
    // Determine guessed player's id from provided id or name
    let targetId = null;
    if (data && data.id && currentPlayers.includes(data.id)) {
      targetId = data.id;
    } else if (data && data.name) {
      const candidate = currentPlayers.find(id => players[id].name === data.name);
      if (candidate) targetId = candidate;
    }
    if (!targetId) return;
    resolveRound(policeId, targetId);
  });

  socket.on('disconnect', () => {
    // If the disconnecting player is in the waiting list, remove them
    if (waiting.includes(socket.id)) {
      waiting = waiting.filter(id => id !== socket.id);
      delete players[socket.id];
      io.emit('updatePlayers', waiting.map(id => players[id].name).filter(Boolean));
      return;
    }
    // If they are in an active game
    if (currentPlayers.includes(socket.id)) {
      // Reset the game and move remaining players back to waiting
      currentPlayers = currentPlayers.filter(id => id !== socket.id);
      history = [];
      currentRound = 0;
      awaitingShuffle = false;
      gameStarted = false;
      // Reset scores and roles for remaining game players
      currentPlayers.forEach(id => {
        players[id].score = 0;
        players[id].role = '';
        players[id].pending = 0;
      });
      // Move them to waiting
      waiting = waiting.concat(currentPlayers);
      // Notify others that a player left
      io.emit('playerLeft', { message: `${players[socket.id].name || 'A player'} left. Game reset.` });
      // Broadcast updated lobby list
      io.emit('updatePlayers', waiting.map(id => players[id].name).filter(Boolean));
      // Remove from players list
      delete players[socket.id];
      return;
    }
    // Finally remove record
    delete players[socket.id];
    io.emit('updatePlayers', waiting.map(id => players[id].name).filter(Boolean));
  });

  // Handle a restart request.  After the final results have been shown,
  // any player can request the game to restart.  This moves all current
  // players back to the waiting lobby, resets their scores and roles,
  // clears history and round counters, and emits a gameReset event so
  // clients return to the waiting screen.  A subsequent shuffle will
  // begin a new game when four players are ready.
  socket.on('restart', () => {
    // Only perform a reset if there are active players (a game either
    // just finished or is in progress).  If no players are playing the
    // gameStarted flag will already be false and currentPlayers empty.
    if (currentPlayers.length === 0) {
      return;
    }
    // Move any current players back into the waiting list
    waiting = waiting.concat(currentPlayers);
    // Reset scores and roles for these players
    currentPlayers.forEach(id => {
      players[id].score = 0;
      players[id].role = '';
      players[id].pending = 0;
    });
    // Clear game state
    currentPlayers = [];
    history = [];
    currentRound = 0;
    awaitingShuffle = false;
    gameStarted = false;
    // Notify all clients that the game has been reset
    io.emit('gameReset');
    // Update lobby with names of waiting players
    io.emit('updatePlayers', waiting.map(id => players[id].name).filter(Boolean));
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});