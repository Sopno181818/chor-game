/*
 * Client‑side logic for the Chor–Dakat–Babu–Police game.
 * This script connects to the server via Socket.IO, handles UI state
 * transitions (join, waiting, game screens), updates the scoreboard and
 * history tables, manages the police's guessing interface, plays simple
 * audio feedback on round results and ensures a professional game feel.
 */

(() => {
  const socket = io();
  // DOM element references
  const joinScreen = document.getElementById('joinScreen');
  const waitingScreen = document.getElementById('waitingScreen');
  const gameScreen = document.getElementById('gameScreen');
  const nameInput = document.getElementById('nameInput');
  const joinButton = document.getElementById('joinButton');
  const joinError = document.getElementById('joinError');
  const waitingList = document.getElementById('waitingList');
  const waitingMessage = document.getElementById('waitingMessage');
  const shuffleButton = document.getElementById('shuffleButton');
  const nextShuffleButton = document.getElementById('nextShuffleButton');
  const restartButton = document.getElementById('restartButton');
  const roundLabel = document.getElementById('roundLabel');
  const playerInfo = document.getElementById('playerInfo');
  const scoreboardEl = document.getElementById('scoreboard');
  const messageArea = document.getElementById('messageArea');
  const guessSection = document.getElementById('guessSection');
  const guessPrompt = document.getElementById('guessPrompt');
  const guessOptions = document.getElementById('guessOptions');
  const historyContainer = document.getElementById('historyContainer');
  const historyTable = document.getElementById('historyTable');

  // State variables
  let myId = null;
  let myName = '';
  let currentRole = '';
  let currentRound = 0;
  let maxRounds = 10;
  let scoreboard = [];
  let history = [];
  // Record of points gained in the most recent round.  Used to highlight
  // scoreboard rows when a player scores points.
  let lastGains = {};
  // Current language (default English).  Updated via the language select.
  let lang = 'en';

  // Translation dictionaries.  Strings that include dynamic data are
  // assembled in code using these fragments.  Bengali translations are
  // provided in Unicode.
  const translations = {
    en: {
      title: 'Chor–Dakat–Babu–Police',
      enterName: 'Enter your name to join the game.',
      joinGame: 'Join Game',
      waitingRoom: 'Waiting Room',
      waitingForPlayers: 'Waiting for players to join…',
      shuffleStart: 'Shuffle & Start Round',
      shuffleNext: 'Shuffle for Next Round',
      scoreboard: 'Scoreboard',
      roundHistory: 'Round History',
      round: 'Round',
      of: 'of',
      name: 'Name',
      role: 'Role',
      score: 'Score',
      total: 'Total',
      yourName: 'Your Name',
      yourRole: 'Your Role',
      waitingForPolice: 'Waiting for Police to guess…',
      policeChoose: 'Police: Choose who you think is ',
      gameOver: 'Game Over!',
      winners: 'Winners: ',
      aPlayerLeft: 'A player left. Waiting for new players…',
      language: 'Language:'
      ,correctChor: '{police} guessed correctly: {player} is the Chor.',
      incorrectChor: '{police} guessed incorrectly. {chor} was the Chor, and {dakat} was the Dakat.',
      correctDakat: '{police} guessed correctly: {player} is the Dakat.',
      incorrectDakat: '{police} guessed incorrectly. {dakat} was the Dakat, and {chor} was the Chor.'
      ,restartGame: 'Restart Game'
    },
    bn: {
      title: 'চোর-ডাকাত-বাবু-পুলিশ',
      enterName: 'গেমে যোগ দিতে আপনার নাম লিখুন।',
      joinGame: 'গেমে যোগ দিন',
      waitingRoom: 'প্রতীক্ষালয়',
      waitingForPlayers: 'খেলোয়াড়দের যোগ দেওয়ার জন্য অপেক্ষা করা হচ্ছে…',
      shuffleStart: 'শাফল করুন ও রাউন্ড শুরু করুন',
      shuffleNext: 'পরবর্তী রাউন্ডের জন্য শাফল করুন',
      scoreboard: 'স্কোরবোর্ড',
      roundHistory: 'রাউন্ড ইতিহাস',
      round: 'রাউন্ড',
      of: 'এর',
      name: 'নাম',
      role: 'ভূমিকা',
      score: 'স্কোর',
      total: 'মোট',
      yourName: 'আপনার নাম',
      yourRole: 'আপনার ভূমিকা',
      waitingForPolice: 'পুলিশের অনুমানের জন্য অপেক্ষা করা হচ্ছে…',
      policeChoose: 'পুলিশ: যাকে আপনি মনে করছেন তিনি হল ',
      gameOver: 'গেম শেষ!',
      winners: 'জয়ী: ',
      aPlayerLeft: 'একজন খেলোয়াড় চলে গেছে। নতুন খেলোয়াড়দের জন্য অপেক্ষা…',
      language: 'ভাষা:'
      ,correctChor: '{police} সঠিকভাবে অনুমান করেছেন: {player} চোর।',
      incorrectChor: '{police} ভুল অনুমান করেছেন। {chor} ছিল চোর, এবং {dakat} ছিল ডাকাত।',
      correctDakat: '{police} সঠিকভাবে অনুমান করেছেন: {player} ডাকাত।',
      incorrectDakat: '{police} ভুল অনুমান করেছেন। {dakat} ছিল ডাকাত, এবং {chor} ছিল চোর।'
      ,restartGame: 'পুনরায় শুরু করুন'
    }
  };

  // Role translations and emojis for display.  These objects map the
  // canonical English role names to a language‑specific label and emoji.
  const roleTranslations = {
    en: { Babu: 'Babu', Police: 'Police', Chor: 'Chor', Dakat: 'Dakat' },
    bn: { Babu: 'বাবু', Police: 'পুলিশ', Chor: 'চোর', Dakat: 'ডাকাত' }
  };
  const roleEmojis = {
    Babu: '👑',
    Police: '👮',
    Chor: '🥷',
    Dakat: '🏴‍☠️'
  };
  const roleColors = {
    Babu: '#d29922',
    Police: '#238636',
    Chor: '#f85149',
    Dakat: '#8957e5'
  };

  // Translation helper
  function t(key) {
    const map = translations[lang] || translations.en;
    return map[key] || key;
  }

  // Update static UI texts based on current language
  function updateStaticTexts() {
    // Join screen
    const titleEl = joinScreen.querySelector('h1');
    if (titleEl) titleEl.textContent = t('title');
    const joinMsg = joinScreen.querySelector('p');
    if (joinMsg) joinMsg.textContent = t('enterName');
    joinButton.textContent = t('joinGame');
    // Waiting screen
    const waitingTitle = waitingScreen.querySelector('h2');
    if (waitingTitle) waitingTitle.textContent = t('waitingRoom');
    if (waitingMessage) waitingMessage.textContent = t('waitingForPlayers');
    shuffleButton.textContent = t('shuffleStart');
    nextShuffleButton.textContent = t('shuffleNext');
    const restartBtn = document.getElementById('restartButton');
    if (restartBtn) restartBtn.textContent = t('restartGame');
    // Game screen headings
    const scoreLabel = scoreboardEl.parentElement.querySelector('h3');
    if (scoreLabel) scoreLabel.textContent = t('scoreboard');
    const historyLabel = historyContainer.querySelector('h3');
    if (historyLabel) historyLabel.textContent = t('roundHistory');
    // Language label
    const langLabel = document.getElementById('langLabel');
    if (langLabel) langLabel.textContent = t('language');
  }

  // Utility: play a beep sound using Web Audio API
  function playBeep(frequency, duration) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, duration);
    } catch (e) {
      // Audio context might fail if user hasn't interacted yet; ignore.
    }
  }

  // Helper to update the waiting list display
  function updateWaitingList(names) {
    waitingList.innerHTML = '';
    names.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name || 'Anonymous';
      waitingList.appendChild(li);
    });
  }

  // Helper to render the scoreboard table
  function renderScoreboard() {
    // Build header row with translated column names
    let html = `<tr><th>${t('name')}</th><th>${t('role')}</th><th>${t('score')}</th></tr>`;
    scoreboard.forEach(row => {
      // Determine if this row's role should be visible: always show Babu and Police, and show your own role.
      const roleVisible = (row.role === 'Babu' || row.role === 'Police' || row.id === myId);
      // Translate role if visible, otherwise display '-'
      const displayRole = roleVisible ? roleTranslations[lang][row.role] : '-';
      // Emoji for visible roles
      const emoji = roleVisible ? (roleEmojis[row.role] || '') : '';
      // Build player name with emoji prefix if role is visible
      let nameCell = `${emoji ? emoji + ' ' : ''}${row.name}`;
      // Determine row color: highlight current player or role‑based color if visible
      let nameStyle = '';
      if (row.id === myId) {
        nameStyle = 'font-weight:bold; color:#58a6ff;';
      } else if (roleVisible) {
        nameStyle = `color:${roleColors[row.role]};`;
      }
      // Determine if this row should flash to indicate points gained
      const gained = lastGains[row.id] && lastGains[row.id] > 0;
      const rowClass = gained ? 'highlight' : '';
      html += `<tr class="${rowClass}"><td style="${nameStyle}">${nameCell}</td><td>${displayRole}</td><td>${row.score}</td></tr>`;
    });
    scoreboardEl.innerHTML = html;
    // Animate scoreboard update
    scoreboardEl.classList.remove('fade-in');
    // Force reflow for restart of animation
    void scoreboardEl.offsetWidth;
    scoreboardEl.classList.add('fade-in');
  }

  // Helper to render the history table
  function renderHistory() {
    if (!history || history.length === 0) {
      historyContainer.hidden = true;
      return;
    }
    historyContainer.hidden = false;
    // Build header row: first cell blank then each player's name
    let header = `<tr><th>${t('round')}</th>`;
    if (scoreboard.length) {
      scoreboard.forEach(row => {
        header += `<th>${row.name}</th>`;
      });
    }
    header += '</tr>';
    // Build body rows
    let body = '';
    history.forEach(entry => {
      let rowHtml = `<tr><td>${entry.round}</td>`;
      // Build map id -> points for this round
      const gainMap = {};
      entry.gains.forEach(g => { gainMap[g.id] = g.points; });
      scoreboard.forEach(row => {
        const pts = gainMap[row.id] || 0;
        const display = pts > 0 ? `+${pts}` : pts;
        rowHtml += `<td>${display}</td>`;
      });
      rowHtml += '</tr>';
      body += rowHtml;
    });
    // Compute totals for each player
    const totals = {};
    scoreboard.forEach(row => { totals[row.id] = 0; });
    history.forEach(entry => {
      entry.gains.forEach(g => {
        if (typeof totals[g.id] === 'number') {
          totals[g.id] += g.points;
        }
      });
    });
    // Build total row
    let totalRow = `<tr><td><strong>${t('total')}</strong></td>`;
    scoreboard.forEach(row => {
      const totalVal = totals[row.id] || 0;
      totalRow += `<td><strong>${totalVal}</strong></td>`;
    });
    totalRow += '</tr>';
    historyTable.innerHTML = header + body + totalRow;
    // Animate history update
    historyTable.classList.remove('fade-in');
    void historyTable.offsetWidth;
    historyTable.classList.add('fade-in');
  }

  // Language selection handler
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.value = lang;
    langSelect.addEventListener('change', () => {
      lang = langSelect.value;
      updateStaticTexts();
      renderScoreboard();
      renderHistory();
      // Update round label and player info using new language
      roundLabel.textContent = `${t('round')} ${currentRound} ${t('of')} ${maxRounds}`;
      const roleLabel = currentRole ? roleTranslations[lang][currentRole] : '';
      playerInfo.textContent = `${t('yourName')}: ${myName} | ${t('yourRole')}: ${roleLabel}`;
      // Update waiting message if not in game
      if (!gameScreen.hidden) {
        // Message remains but we need to translate dynamic message later on result events
      } else if (!waitingScreen.hidden) {
        waitingMessage.textContent = t('waitingForPlayers');
      }
    });
  }

  // Handler for join button
  joinButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
    joinError.textContent = 'Please enter a name.';
      return;
    }
    joinError.textContent = '';
    myName = name;
    socket.emit('join', name);
    // Show waiting screen
    joinScreen.hidden = true;
    waitingScreen.hidden = false;
    waitingMessage.textContent = t('waitingForPlayers');
  });

  // Socket events
  socket.on('connect', () => {
    myId = socket.id;
  });

  // Update lobby names when players join/leave
  socket.on('updatePlayers', names => {
    if (waitingScreen.hidden) return;
    updateWaitingList(names);
  });

  // Enable shuffle button (start next round)
  function showShuffle(buttonEl) {
    buttonEl.hidden = false;
    buttonEl.disabled = false;
  }
  socket.on('enableShuffle', () => {
    // If game has not started yet, show shuffleButton; otherwise show nextShuffleButton
    if (!gameScreen.hidden) {
      showShuffle(nextShuffleButton);
    } else {
      showShuffle(shuffleButton);
    }
  });

  // Roles assigned; show scoreboard and role to each player
  socket.on('rolesAssigned', data => {
    // Transition from waiting to game screen for the first time
    waitingScreen.hidden = true;
    gameScreen.hidden = false;
    // Update state
    currentRound = data.round;
    maxRounds = data.maxRounds;
    scoreboard = data.scoreboard;
    history = data.history;
    // Extract my role
    const me = scoreboard.find(r => r.id === myId);
    currentRole = me ? me.role : '';
    // Update UI
    // Localize round and player info labels
    roundLabel.textContent = `${t('round')} ${currentRound} ${t('of')} ${maxRounds}`;
    const roleLabel = currentRole ? roleTranslations[lang][currentRole] : '';
    playerInfo.textContent = `${t('yourName')}: ${myName} | ${t('yourRole')}: ${roleLabel}`;
    renderScoreboard();
    renderHistory();
    // Clear last gains at the beginning of a round so no rows are highlighted
    lastGains = {};
    // Play a subtle beep at the start of the round to signal shuffling is complete
    playBeep(523.25, 200); // C5 note
    // Reset guess and messages
    guessSection.hidden = true;
    guessOptions.innerHTML = '';
    messageArea.textContent = 'Waiting for Police to guess…';
    nextShuffleButton.hidden = true;
    // Hide restart button at the start of a new round
    if (restartButton) {
      restartButton.hidden = true;
      restartButton.disabled = false;
    }
  });

  // Police's turn: show guess options
  socket.on('policeTurn', data => {
    if (data && data.guessTarget && data.suspects) {
      // Only show to police
      if (currentRole === 'Police') {
        guessSection.hidden = false;
        // Localize the prompt: e.g. "Police: Choose who you think is Chor"
        const target = roleTranslations[lang][data.guessTarget] || data.guessTarget;
        guessPrompt.textContent = `${t('policeChoose')}${target}`;
        guessOptions.innerHTML = '';
        data.suspects.forEach(sus => {
          const btn = document.createElement('button');
          btn.textContent = sus.name;
          btn.addEventListener('click', () => {
            // Send guess; provide both id and name for safety
            socket.emit('guess', { id: sus.id, name: sus.name });
            // Hide options after choosing
            guessSection.hidden = true;
            messageArea.textContent = t('waitingForPolice');
          });
          guessOptions.appendChild(btn);
        });
      }
    }
  });

  // Round result: show message, update scoreboard & history, enable shuffle for next round
  socket.on('roundResult', data => {
    currentRound = data.round;
    scoreboard = data.scoreboard;
    history = data.history;
    // Update UI
    roundLabel.textContent = `${t('round')} ${currentRound} ${t('of')} ${maxRounds}`;
    const me = scoreboard.find(r => r.id === myId);
    currentRole = me ? me.role : '';
    const roleLabel2 = currentRole ? roleTranslations[lang][currentRole] : '';
    playerInfo.textContent = `${t('yourName')}: ${myName} | ${t('yourRole')}: ${roleLabel2}`;
    renderScoreboard();
    renderHistory();
    // Construct a localized message based on the guess outcome and target role
    let msg = data.message;
    try {
      const map = translations[lang] || translations.en;
      if (data.targetRole && data.policeName && data.chorName && data.dakatName) {
        if (data.targetRole === 'Chor') {
          if (data.correct) {
            msg = map.correctChor
              .replace('{police}', data.policeName)
              .replace('{player}', data.chorName);
          } else {
            msg = map.incorrectChor
              .replace('{police}', data.policeName)
              .replace('{chor}', data.chorName)
              .replace('{dakat}', data.dakatName);
          }
        } else if (data.targetRole === 'Dakat') {
          if (data.correct) {
            msg = map.correctDakat
              .replace('{police}', data.policeName)
              .replace('{player}', data.dakatName);
          } else {
            msg = map.incorrectDakat
              .replace('{police}', data.policeName)
              .replace('{dakat}', data.dakatName)
              .replace('{chor}', data.chorName);
          }
        }
      }
    } catch (_) {
      // fall back to server‑provided message
    }
    // Show message
    messageArea.textContent = msg;
    // Play beep: high tone if correct, low tone if wrong
    playBeep(data.correct ? 880 : 220, 300);
    // Enable shuffle for next round
    nextShuffleButton.hidden = false;
    nextShuffleButton.disabled = false;

    // Record gains from the most recent round for highlighting.  The
    // history array holds entries with a gains array; the last entry
    // corresponds to this round.  Build a map of id -> points earned.
    lastGains = {};
    if (data.history && data.history.length > 0) {
      const lastEntry = data.history[data.history.length - 1];
      if (lastEntry.gains) {
        lastEntry.gains.forEach(g => {
          lastGains[g.id] = g.points;
        });
      }
    }
    // Ensure restart button is hidden until the game ends
    if (restartButton) {
      restartButton.hidden = true;
      restartButton.disabled = false;
    }
  });

  // Game over: show final result and reset UI to waiting for shuffle
  socket.on('gameOver', data => {
    scoreboard = data.scoreboard;
    history = data.history;
    renderScoreboard();
    renderHistory();
    // Show final message
    messageArea.innerHTML = `<strong>Game Over!</strong> Winners: ${data.winners.join(', ')}`;
    // Play celebration beep
    playBeep(660, 400);
    playBeep(880, 400);
    nextShuffleButton.hidden = true;
    // Show restart button with translated label
    if (restartButton) {
      restartButton.hidden = false;
      restartButton.disabled = false;
      restartButton.textContent = t('restartGame');
    }
  });

  // A player left; show message and return to waiting screen
  socket.on('playerLeft', data => {
    messageArea.textContent = data.message || t('aPlayerLeft');
    // Reset UI back to waiting screen so players can rejoin
    joinScreen.hidden = true;
    gameScreen.hidden = true;
    waitingScreen.hidden = false;
    waitingMessage.textContent = t('aPlayerLeft');
    updateWaitingList([]);
    // Hide restart button when a player leaves
    if (restartButton) {
      restartButton.hidden = true;
      restartButton.disabled = false;
    }
  });

  // If the server resets the game while players are waiting (e.g. after game over)
  socket.on('gameReset', () => {
    // Reset UI to waiting screen
    joinScreen.hidden = true;
    gameScreen.hidden = true;
    waitingScreen.hidden = false;
    waitingMessage.textContent = t('waitingForPlayers');
    updateWaitingList([]);
    // Hide restart button after reset
    if (restartButton) {
      restartButton.hidden = true;
      restartButton.disabled = false;
    }
  });

  // Shuffle button handlers
  shuffleButton.addEventListener('click', () => {
    shuffleButton.disabled = true;
    socket.emit('shuffle');
  });
  nextShuffleButton.addEventListener('click', () => {
    nextShuffleButton.disabled = true;
    socket.emit('shuffle');
  });

  // Restart button handler: when clicked after a game ends, request a restart
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      restartButton.disabled = true;
      socket.emit('restart');
    });
  }
})();