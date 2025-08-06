const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

/*
 * Chor–Dakat–Babu–Police game server
 *
 * This server implements a simple four‑player role guessing game inspired by
 * the South Asian chit game.  Each round four connected players are randomly
 * assigned one of four roles:
 *   • Babu   – receives 1000 points and simply watches
 *   • Police – receives 500 points and must guess who the Chor is
 *   • Dakat  – receives 300 points and waits quietly
 *   • Chor   – receives 0 points and hopes not to be found
 *
 * The police must identify the Chor from the remaining three players.  If the
 * guess is correct the police keeps their 500 points; otherwise those points
 * are transferred to the guessed player.  Scores accumulate across rounds and
 * a predetermined number of rounds is played.  At the end of the game the
 * player with the highest total wins.
 */

const app = express();
const server = http.createServer(app);
// Allow cross‑origin requests for development.  In production you may want to
// restrict this to your front‑end domain.
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Points awarded for each role when assigned at the beginning of a round.
const ROLE_POINTS = {
  Babu: 1000,
  Police: 500,
  Dakat: 300,
  Chor: 0
};

// Store connected players.  Keys are socket IDs, values are objects with
// properties: name, score (cumulative), role (current round), ready (joined)
const players = {};
// Maintain an ordered queue of players waiting to be matched into a game
let waitingQueue = [];

// Current game state
let gameInProgress = false;
let currentRound = 0;
const MAX_ROUNDS = 10;
let currentPlayers = []; // array of socket IDs participating in the current game

/**
 * Randomly assign roles to the currentPlayers array.  Returns a mapping from
 * socket ID to assigned role.  Also updates each player's score based on
 * ROLE_POINTS.
 */
function assignRoles() {
  const roles = ['Babu', 'Police', 'Dakat', 'Chor'];
  const shuffled = roles.sort(() => 0.5 - Math.random());
  const assignments = {};
  currentPlayers.forEach((id, index) => {
    const role = shuffled[index];
    assignments[id] = role;
    players[id].role = role;
    // Add role points to cumulative score
    players[id].score += ROLE_POINTS[role];
  });
  return assignments;
}

/**
 * Resets the game state and informs all connected players.
 */
function resetGame() {
  gameInProgress = false;
  currentRound = 0;
  currentPlayers = [];
  waitingQueue = Object.keys(players);
  // Clear roles but keep scores
  Object.values(players).forEach(p => {
    p.role = null;
  });
  io.emit('gameReset');
}

/**
 * Begins a new round: assign roles, notify players and ask the police to guess.
 */
function startRound() {
  currentRound += 1;
  const assignments = assignRoles();
  // Notify each player of their role and the current scoreboard
  currentPlayers.forEach(id => {
    const player = players[id];
    const scoreBoard = currentPlayers.map(pid => ({
      id: pid,
      name: players[pid].name,
      score: players[pid].score
    }));
    io.to(id).emit('roleAssigned', {
      role: player.role,
      round: currentRound,
      maxRounds: MAX_ROUNDS,
      scores: scoreBoard
    });
  });
  // Find the police and tell them to make a guess
  const policeId = currentPlayers.find(id => players[id].role === 'Police');
  const police = players[policeId];
  if (police) {
    // Build a list of targets excluding the police themselves
    const targets = currentPlayers
      .filter(id => id !== policeId)
      .map(id => ({ id, name: players[id].name }));
    io.to(policeId).emit('requestGuess', { targets });
  }
}

/**
 * Handles the police's guess.  Computes whether the guess is correct and
 * adjusts scores accordingly.  Notifies all players of the result.  Then
 * either starts a new round or ends the game if the maximum has been reached.
 *
 * @param {string} policeId - socket ID of the police
 * @param {string} guessedId - socket ID of the guessed player
 */
function handleGuess(policeId, guessedId) {
  const guessedPlayer = players[guessedId];
  const policePlayer = players[policeId];
  let resultMessage;
  let correct = false;
  if (!guessedPlayer || !policePlayer) return;
  // Determine whether the guessed player is the Chor
  if (guessedPlayer.role === 'Chor') {
    correct = true;
    resultMessage = `${policePlayer.name} correctly guessed that ${guessedPlayer.name} is the Chor.`;
  } else {
    // Move police's role points to the guessed player
    const pointsToTransfer = ROLE_POINTS['Police'];
    policePlayer.score -= pointsToTransfer;
    guessedPlayer.score += pointsToTransfer;
    resultMessage = `${policePlayer.name} guessed incorrectly; ${guessedPlayer.name} was the ${guessedPlayer.role}.`;
  }
  // Prepare scoreboard after guess
  const scoreBoard = currentPlayers.map(pid => ({
    id: pid,
    name: players[pid].name,
    role: players[pid].role,
    score: players[pid].score
  }));
  // Inform all players of the result
  currentPlayers.forEach(id => {
    io.to(id).emit('roundResult', {
      message: resultMessage,
      correct,
      scores: scoreBoard
    });
  });
  // Check if more rounds are remaining
  if (currentRound < MAX_ROUNDS) {
    // Brief pause before next round
    setTimeout(() => {
      // Clear roles for next round but keep scores
      currentPlayers.forEach(id => {
        players[id].role = null;
      });
      startRound();
    }, 4000);
  } else {
    // Game over
    gameInProgress = false;
    // Determine winner(s)
    let highest = -Infinity;
    currentPlayers.forEach(id => {
      if (players[id].score > highest) highest = players[id].score;
    });
    const winners = currentPlayers.filter(id => players[id].score === highest);
    const winnerNames = winners.map(id => players[id].name);
    currentPlayers.forEach(id => {
      io.to(id).emit('gameOver', {
        winners: winnerNames,
        scores: scoreBoard
      });
    });
    // Reset for next game
    resetGame();
  }
}

io.on('connection', socket => {
  console.log('Client connected', socket.id);
  players[socket.id] = {
    id: socket.id,
    name: null,
    score: 0,
    role: null
  };
  // Add to waiting queue initially; name will be set after joinGame event
  waitingQueue.push(socket.id);

  /**
   * Client sends their chosen name when joining the game.  Once a name has been
   * provided the player becomes eligible for a match.  When four players are
   * ready a new game begins automatically.
   */
  socket.on('joinGame', name => {
    if (typeof name === 'string' && name.trim().length > 0) {
      players[socket.id].name = name.trim();
      // Notify all waiting players of the updated list
      const waitingNames = waitingQueue.map(id => ({ id, name: players[id].name }))
        .filter(p => p.name);
      waitingNames.forEach(p => {
        io.to(p.id).emit('waitingList', { players: waitingNames });
      });
      // If game isn't running and we have at least 4 ready players, start the game
      if (!gameInProgress) {
        const readyPlayers = waitingQueue.filter(id => players[id].name);
        if (readyPlayers.length >= 4) {
          // Pick the first four ready players
          currentPlayers = readyPlayers.slice(0, 4);
          // Remove these from the waiting queue
          waitingQueue = waitingQueue.filter(id => !currentPlayers.includes(id));
          gameInProgress = true;
          currentRound = 0;
          // Start first round after short delay
          setTimeout(() => startRound(), 1000);
        }
      }
    }
  });

  /**
   * Police sends this event when selecting a player as the chor.
   */
  socket.on('guess', guessedId => {
    if (!gameInProgress) return;
    // Only police can make guesses
    const policeId = socket.id;
    if (players[policeId] && players[policeId].role === 'Police') {
      if (currentPlayers.includes(guessedId)) {
        handleGuess(policeId, guessedId);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    // If player was in an active game we need to stop the game
    const wasCurrent = currentPlayers.includes(socket.id);
    delete players[socket.id];
    // Remove from waiting queue
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    // Remove from current players
    currentPlayers = currentPlayers.filter(id => id !== socket.id);
    if (wasCurrent) {
      // Inform the rest of the players and reset the game
      currentPlayers.forEach(id => {
        io.to(id).emit('playerLeft', {
          message: 'A player left the game. The game has been reset.'
        });
      });
      resetGame();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});