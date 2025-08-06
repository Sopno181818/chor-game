/*
 * Client‑side logic for the Chor–Dakat–Babu–Police game.
 *
 * This script connects to the Socket.IO server, handles UI updates based on
 * server events and sends user actions (join and guess) back to the server.
 */
(function () {
  // Update this value with your deployed backend URL when hosting.  For local
  // testing it defaults to localhost:3000.  You can override SERVER_URL in
  // production by defining window.SERVER_URL before loading this script.
  const SERVER_URL = window.SERVER_URL || 'http://localhost:3000';
  const socket = io(SERVER_URL);

  // DOM elements
  const loginScreen = document.getElementById('loginScreen');
  const waitingScreen = document.getElementById('waitingScreen');
  const gameScreen = document.getElementById('gameScreen');
  const nameInput = document.getElementById('nameInput');
  const joinBtn = document.getElementById('joinBtn');
  const waitingListEl = document.getElementById('waitingList');
  const roundHeader = document.getElementById('roundHeader');
  const roleInfo = document.getElementById('roleInfo');
  const guessSection = document.getElementById('guessSection');
  const guessList = document.getElementById('guessList');
  const resultSection = document.getElementById('resultSection');
  const resultMessage = document.getElementById('resultMessage');
  const scoreTableBody = document.querySelector('#scoreTable tbody');

  // Helper to show/hide screens
  function show(element) {
    element.classList.remove('hidden');
  }
  function hide(element) {
    element.classList.add('hidden');
  }

  // Join game
  joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name.length > 0) {
      socket.emit('joinGame', name);
      hide(loginScreen);
      show(waitingScreen);
    }
  });

  /**
   * Update waiting list display when receiving the waitingList event.
   */
  socket.on('waitingList', data => {
    const { players } = data;
    waitingListEl.innerHTML = '';
    players.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.name || 'Anonymous';
      waitingListEl.appendChild(li);
    });
  });

  /**
   * Handle role assignment at the beginning of each round.
   */
  socket.on('roleAssigned', data => {
    const { role, round, maxRounds, scores } = data;
    hide(waitingScreen);
    show(gameScreen);
    resultSection.classList.add('hidden');
    guessSection.classList.add('hidden');
    // Update header and role info
    roundHeader.textContent = `Round ${round} of ${maxRounds}`;
    roleInfo.innerHTML = `<p>You are <strong>${role}</strong>.</p>`;
    // Update scoreboard
    updateScoreTable(scores);
  });

  /**
   * Show guess options to the police.
   */
  socket.on('requestGuess', data => {
    const { targets } = data;
    guessList.innerHTML = '';
    targets.forEach(t => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = t.name;
      btn.addEventListener('click', () => {
        // send guess to server
        socket.emit('guess', t.id);
        // hide guess section after a guess is made
        hide(guessSection);
      });
      li.appendChild(btn);
      guessList.appendChild(li);
    });
    show(guessSection);
  });

  /**
   * Show round result to all players.
   */
  socket.on('roundResult', data => {
    const { message, scores } = data;
    resultMessage.textContent = message;
    show(resultSection);
    // Update scoreboard with roles revealed for this round
    updateScoreTable(scores);
  });

  /**
   * Handle end of game: display winners and final scores.
   */
  socket.on('gameOver', data => {
    const { winners, scores } = data;
    let winnersText;
    if (winners.length === 1) {
      winnersText = `Winner: ${winners[0]}`;
    } else {
      winnersText = `Winners: ${winners.join(', ')}`;
    }
    alert(`${winnersText}\nThe game is over!`);
    updateScoreTable(scores);
    // Return to waiting screen for new game
    show(waitingScreen);
    hide(gameScreen);
  });

  /**
   * Handle when a player leaves and the game resets.
   */
  socket.on('playerLeft', data => {
    alert(data.message);
    // reload page to reset state
    window.location.reload();
  });

  /**
   * Reset event to clear UI and return to waiting.
   */
  socket.on('gameReset', () => {
    hide(gameScreen);
    show(waitingScreen);
  });

  /**
   * Update the scoreboard table with an array of player objects.
   * Each object should have name, role (optional) and score fields.
   */
  function updateScoreTable(scores) {
    scoreTableBody.innerHTML = '';
    scores.forEach(player => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      nameTd.textContent = player.name;
      const roleTd = document.createElement('td');
      // Show role if available; otherwise blank until revealed
      roleTd.textContent = player.role || '-';
      const scoreTd = document.createElement('td');
      scoreTd.textContent = player.score;
      tr.appendChild(nameTd);
      tr.appendChild(roleTd);
      tr.appendChild(scoreTd);
      scoreTableBody.appendChild(tr);
    });
  }
})();