const socket = io();

// TODO: add way to change colors using button/prompt
// TODO: add way to toggle off misc. game options [WIP]
// TODO: add way to set username
// TODO: add way to choose room
// TODO: add mines [WIP]

// TODO: fix pawn jump highlight bug

/* ------------------------GAME MECHANICS------------------------------------- */

let game = new Chess();
const $board = $('#myBoard');
const columns = 'abcdefgh';

let board;
let color = 'white';
let numPlayers;
let play = false;
let roomOptions;

let currentSquare;
let currentPiece;

function onDragStart (source, piece, position, orientation) {

    // do not pick up pieces if the game is over
    if (game.game_over()) return false;

    // only pick up pieces for the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1) ||
        (game.turn() === 'w' && color === 'black') ||
        (game.turn() === 'b' && color === 'white')) {
        return false
    }
}

function onDrop (source, target) {
    removeHighlight();

    // see if the move is legal
    let move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    })
    if (game.game_over()) {
        socket.emit('gameOver', game.turn() === 'w' ? 'black' : 'white');
    }

    // illegal move
    if (move === null) {
        return 'snapback';
    } else { // if the move is allowed, emit the move event.
        socket.emit('move', move);
    }

    // updateStatus()
}

function onSnapEnd () {
    board.position(game.fen())
}

function createBoard (color) {
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

function resetGame (color) {
    game = new Chess();
    // TODO: refactor concept
    swapColorsOnLeave();
    createBoard(color);
}

function swapColors () {
    color = color === 'white' ? 'black' : 'white';
}

// TODO: refactor this concept
function swapColorsOnLeave () {
    if (color === 'black') {
        color = 'white';
    }
}

/**
 * BOMB STUFF
 */
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

function explodeBomb (square) {
    let col = columns.indexOf(square[0]);
    let row = parseInt(square[1]);
    for (let i = Math.max(0, col - 1); i <= Math.min(7, col + 1); i++) {
        for (let j = Math.max(1, row - 1); j <= Math.min(8, row + 1); j++) {
            let squareFen = `${columns[i]}${j}`;
            game.remove(squareFen);

        }
    }
    console.log('explode');
    // Update board/game
    board.position(game.fen());
    game.load(game.fen());
}

// function skipTurn () {
//     let tokens = game.fen().split(' ');
//     tokens[1] = tokens[1] === 'w' ? 'b' : 'w';
//     console.log(tokens)
//     game.load(tokens.join(' '))
// }

/* ------------------------------VISUAL--------------------------------------- */

function populateBoard () {
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

function removeHighlight () {
    let $dot = $('#myBoard .dot');
    $dot.removeClass('active');
    $dot.removeClass('adjacency');
    $dot.text('');
}

function highlightSquare (square) {
    $('#myBoard .dot-' + square).addClass('active');
}

function showNumAdjacent (numAdjacent) {
    let $dot = $('#myBoard .dot-' + currentSquare);
    $dot.addClass('adjacency');
    $dot.text(numAdjacent);
}

function getLegalMoves (square) {
    let tempGame = new Chess();
    tempGame.load(game.fen());
    console.log(game.fen())
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

function onMouseoverSquare (square, piece) {
    currentSquare = square;
    currentPiece = piece;

    if (piece && roomOptions.mines && play) {
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

function onMouseoutSquare (square, piece) {
    removeHighlight();
}

window.onresize = () => {
    board.resize()
}

// Prints shit to HTML
function updateStatus () {
    let status = ''

    let moveColor = 'White'
    if (game.turn() === 'b') {
        moveColor = 'Black'
    }

    // checkmate?
    if (game.in_checkmate()) {
        status = 'Game over, ' + moveColor + ' is in checkmate.'
    } else if (game.in_draw()) { // draw?
        status = 'Game over, drawn position'
    } else { // game still on
        status = moveColor + ' to move'

        // check?
        if (game.in_check()) {
            status += ', ' + moveColor + ' is in check'
        }
    }
    console.log(status)
}

/* --------------------------SERVER CONNECTION------------------------------- */

socket.on('player', (msg) => {
    color = msg.color;
    numPlayers = msg.numPlayers;
    roomOptions = msg.roomOptions;
    if (numPlayers === 2) {
        socket.emit('setup');
    }
    createBoard(color);
})

// For player already in room
socket.on('setup', () => {
    // resetGame(color);
    socket.emit('configOptions');
})

socket.on('ready', () => {
    console.log('Opponent ready to play');
    play = true;
    console.log(color);
})

// Check for moves from other player
socket.on('move', function (move) {
    game.move(move);
    board.position(game.fen());
    // let opponentColor = color === 'white' ? 'black' : 'white';
    // console.log(opponentColor + " moved");
})

// Game over or opponent leaves
socket.on('gameOver', function (color) {
    console.log(`${color} wins`);
    play = false;
    resetGame(color);
})

socket.on('explodeBomb', function (msg) {
    explodeBomb(msg.square);
    if (msg.type === 'f') {
        $board.find('.square-' + msg.square).removeClass('highlight-fbomb');
    } else if (msg.type === 'n') {
        $board.find('.square-' + msg.square).removeClass('highlight-nbomb');
    }
})

socket.on('highlightBomb', function (msg) {
    if (msg.type === 'f') {
        $board.find('.square-' + msg.square).addClass('highlight-fbomb');
    } else if (msg.type === 'n') {
        $board.find('.square-' + msg.square).addClass('highlight-nbomb');
    }
})

socket.on('addHiddenBomb', function (msg) {
    socket.emit('addHiddenBomb', msg);
})

socket.on('getBombsAdjacent', function (numAdjacent) {
    showNumAdjacent(numAdjacent);
})

// socket.on('skipTurn', () => {
//     skipTurn();
// })