// TODO: add way to change colors using button/prompt
// TODO: add way to toggle off misc. gameClient options
// TODO: display username
// TODO: optional promotion
// TODO: checkmate text box

// COMPLETE: fixed pawn jump highlight bug by handling FEN exception
// COMPLETE: add in check condition kamikaze
// COMPLETE: add mines
// COMPLETE: add way to set username
// COMPLETE: add way to choose room
// COMPLETE: after bomb blows up reduce count
// COMPLETE: add mine setting time period
// COMPLETE: check if serverside opponentReady/ready is needed

/* ------------------------SETUP------------------------------------- */
$(document).ready(function() {

    let socket = null;
    let board = Chessboard('myBoard');

    const $board = $('#myBoard');
    const $confirmBombs = $('#confirmBombs');
    const $header = $('#header');
    let headerText = {
        waiting: '[Waiting for opponent...]',
        setting: '[Set up to 2 mines]',
        set_wait: '[Opponent setting mines...]',
        playing: '[Play]'
    }

    let color = 'white';
    let numPlayers;
    let playing = false;
    let ready = false;
    let opponentReady = false;
    let roomOptions;

    socket = io();

    /* --------------------------SERVER CONNECTION------------------------------- */

    socket.on('player', (msg) => {
        gameClient.load(msg.gameFen);
        color = msg.color;
        numPlayers = msg.numPlayers;
        roomOptions = msg.roomOptions;
        if (numPlayers === 2) {
            socket.emit('setup');
        }
        createBoard(color);
        $header.text(headerText.waiting);
        socket.emit('setHeader', headerText.waiting);
    })

    // For player already in room
    socket.on('setup', () => {
        // resetGame(color);
        socket.emit('configOptions');
        $confirmBombs.addClass('active');
        $header.text(headerText.setting);
        socket.emit('setHeader', headerText.setting);
    })

    // Load game from server
    socket.on('loadGame', (data)=> {
        roomOptions = data.roomOptions;
        color = data.color;
        createBoard(data.color);
        board.position(data.fen);
        gameClient.load(data.fen)
        $header.text(data.headerText);
        playing = data.playing;
        ready = data.ready;
        if (ready) {
            socket.emit('highlightBombs');
        } else {
            $confirmBombs.addClass('active');
        }
    })

    socket.on('error', (msg) => {
        window.location.href = '/';
        alert(msg);
    })

    socket.on('opponentReady', () => {
        console.log('Opponent ready to play');
        // TODO: change to game.playing
        opponentReady = true;
        if (ready) {
            $header.text(headerText.playing);
            socket.emit('setHeader', headerText.playing);
            socket.emit('play');
        }
    })

    socket.on('play', () => {
        playing = true;
    })

    // Check for moves from other player
    socket.on('move', function (gameFen) {
        gameClient.load(gameFen);
        board.position(gameFen);
    })

    // Game over or opponent leaves
    socket.on('gameOver', function (color) {
        console.log(`${color} wins`);
        let winnerText = `${color} wins`;
        winnerText = '[' + winnerText.charAt(0).toUpperCase() + winnerText.slice(1) + ']';
        $header.text(winnerText);
        playing = false;
        // resetGame(color);
    })

    // socket.on('skipTurn', () => {
    //     skipTurn();
    // })

    /* ------------------------GAME MECHANICS------------------------------------- */

    let gameClient = new Chess();
    const columns = 'abcdefgh';

    let currentSquare;
    let currentPiece;

    function onDragStart(source, piece, position, orientation) {

        // do not pick up pieces if the gameClient is over
        if (gameClient.game_over()) return false;

        // only pick up pieces for the side to move
        if ((gameClient.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (gameClient.turn() === 'b' && piece.search(/^w/) !== -1) ||
            (gameClient.turn() === 'w' && color === 'black') ||
            (gameClient.turn() === 'b' && color === 'white') ||
            !playing) {
            return false
        }
    }

    // Execute stuff on drop

    function onDrop(source, target) {
        removeHighlight();

        let tempGame = new Chess();
        tempGame.load(gameClient.fen());

        // see if the move is legal
        let move = tempGame.move({
            from: source,
            to: target,
            promotion: 'q'// NOTE: always promote to a queen for example simplicity
        }, {legal: false})

        // illegal move or check edge case
        if (move === null) {
            return 'snapback';
        } else { // if the move is allowed, emit the move event.
            socket.emit('move', move);
        }

    }

    function onSnapEnd() {
        board.position(gameClient.fen())
    }

    function createBoard(color) {
        const config = {
            draggable: true,
            position: 'start',
            showNotation: true,
            orientation: color,
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
            onMouseoutSquare: onMouseoutSquare,
            onMouseoverSquare: onMouseoverSquare
        }
        board = Chessboard('myBoard', config);
        populateBoard();
    }

    // TODO: refactor concept
    function resetGame(color) {
        gameClient = new Chess();
        swapColorsOnLeave();
        createBoard(color);
    }

    function swapColors() {
        color = color === 'white' ? 'black' : 'white';
    }

    // TODO: refactor this concept
    function swapColorsOnLeave() {
        if (color === 'black') {
            color = 'white';
        }
    }

/* --------------------------------BOMB MECHANICS------------------------------------- */

    $board.on('click', () => {
        // TODO: add way to toggle between n and f bombs
        let type = 'f';
        if (currentSquare !== undefined && currentPiece[0] !== (color === 'white' ? 'b' : 'w')) {
            socket.emit('addBomb', {
                square: currentSquare,
                type: type
            })
        }
    })

    socket.on('explodeBomb', function (data) {
        explodeBomb(data.gameFen);
        socket.emit('unhighlightBomb', data);
        socket.emit('removeBomb', {type: data.type, i: data.i, j: data.j});
    })

    socket.on('addHiddenBomb', function (msg) {
        socket.emit('addHiddenBomb', msg);
    })

    socket.on('getBombsAdjacent', function (numAdjacent) {
        showNumAdjacent(numAdjacent);
    })

    // socket.on('setBombs', () => {
    //     // Wait for mines to be set
    // })

    function explodeBomb(gameFen) {
        // Update board/gameClient
        board.position(gameFen);
        gameClient.load(gameFen)
        // Screen shake effect
        $board.find('.chessboard-63f37').addClass('custom-shake');
        setTimeout(() => {
            $board.find('.chessboard-63f37').removeClass('custom-shake');
        }, 300)
    }

// function skipTurn () {
//     let tokens = gameClient.fen().split(' ');
//     tokens[1] = tokens[1] === 'w' ? 'b' : 'w';
//     console.log(tokens)
//     gameClient.load(tokens.join(' '))
// }

/* ------------------------------VISUAL--------------------------------------------------------- */

    $confirmBombs.on('click', () => {
        socket.emit('confirmBombs');
        $confirmBombs.removeClass('active');
        ready = true;
        socket.emit('ready');
        if (opponentReady) {
            $header.text(headerText.playing);
            socket.emit('setHeader', headerText.playing);
            socket.emit('play');
        } else {
            $header.text(headerText.set_wait);
            socket.emit('setHeader', headerText.set_wait);
        }
    })

    socket.on('highlightBomb', function (msg) {
        if (msg.type === 'f') {
            $board.find('.square-' + msg.square).addClass('highlight-fbomb');
        } else if (msg.type === 'n') {
            $board.find('.square-' + msg.square).addClass('highlight-nbomb');
        }
    })

    socket.on('unhighlightBomb', function (msg) {
        if (msg.type === 'f') {
            $board.find('.square-' + msg.square).removeClass('highlight-fbomb');
        } else if (msg.type === 'n') {
            $board.find('.square-' + msg.square).removeClass('highlight-nbomb');
        }
    })

    function populateBoard() {
        for (let col of columns) {
            for (let i = 1; i <= 8; i++) {
                let squareFen = col + i;
                let $square = $board.find('.square-' + squareFen);
                let dot = document.createElement('h3');
                dot.setAttribute('class', 'dot dot-' + squareFen)
                if (color === 'black') {
                    dot.classList.add('black');
                }
                $square.append(dot)
            }
        }
    }

    function removeHighlight() {
        let $dot = $('#myBoard .dot');
        $dot.removeClass('active');
        $dot.removeClass('adjacency');
        $dot.text('');
    }

    function highlightSquare(square) {
        $('#myBoard .dot-' + square).addClass('active');
    }

    function showNumAdjacent(numAdjacent) {
        let $dot = $('#myBoard .dot-' + currentSquare);
        $dot.addClass('adjacency');
        $dot.text(numAdjacent);
    }

    function getLegalMoves(square) {
        let tempGame = new Chess();
        tempGame.load(gameClient.fen());
        let tokens = tempGame.fen().split(' ');
        tokens[1] = color === 'white' ? 'w' : 'b';

        // Handle En Passant
        let desiredColor = tokens[1];
        tempGame.load(tokens.join(' '));
        tokens = tempGame.fen().split(' ');
        if (tokens[1] !== desiredColor) {
            tokens[1] = desiredColor;
            tokens[3] = '-';
        }
        tempGame.load(tokens.join(' '));

        return tempGame.moves({
            square: square,
            verbose: true
        })
    }

    function onMouseoverSquare(square, piece) {
        currentSquare = square;
        currentPiece = piece;

        if (piece && roomOptions.mines && playing) {
            if (piece[0] === color[0]) {
                socket.emit('getBombsAdjacent', square);
            }
        }

        // get list of possible moves for this square
        let moves = getLegalMoves(square);

        // exit if there are no moves available for this square
        if (!piece || moves.length === 0) return;

        // highlight the possible squares for this piece
        for (let i = 0; i < moves.length; i++) {
            highlightSquare(moves[i].to)
        }
    }

    function onMouseoutSquare(square, piece) {
        removeHighlight();
    }

    window.onresize = () => {
        board.resize()
    }

// Prints shit to HTML
    function updateStatus() {
        let status = ''

        let moveColor = 'White'
        if (gameClient.turn() === 'b') {
            moveColor = 'Black'
        }

        // checkmate?
        if (gameClient.in_checkmate()) {
            status = 'Game over, ' + moveColor + ' is in checkmate.'
        } else if (gameClient.in_draw()) { // draw?
            status = 'Game over, drawn position'
        } else { // gameClient still on
            status = moveColor + ' to move'

            // check?
            if (gameClient.in_check()) {
                status += ', ' + moveColor + ' is in check'
            }
        }
        console.log(status)
    }


})