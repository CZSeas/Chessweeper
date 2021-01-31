const socket = io();

// CZ: Can probably delete this
// let roomId = 1;
// socket.emit('joined', roomId);

let game = new Chess();

let board;
let color = 'white';
let numPlayers;
let joinedRoomId;
let play = false;

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
    // see if the move is legal
    let move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    })
    if (game.game_over()) {
        socket.emit('gameOver', joinedRoomId);
    }

    // illegal move
    if (move === null) {
        return 'snapback';
    }
    // if the move is allowed, emit the move event.
    else {
        socket.emit('move', {
            move: move,
            board: game.fen(),
            roomId: joinedRoomId
        });
    }

    // updateStatus()
}

function onSnapEnd () {
    board.position(game.fen())
}

function updateStatus () {
    let status = ''

    let moveColor = 'White'
    if (game.turn() === 'b') {
        moveColor = 'Black'
    }

    // checkmate?
    if (game.in_checkmate()) {
        status = 'Game over, ' + moveColor + ' is in checkmate.'
    }

    // draw?
    else if (game.in_draw()) {
        status = 'Game over, drawn position'
    }

    // game still on
    else {
        status = moveColor + ' to move'

        // check?
        if (game.in_check()) {
            status += ', ' + moveColor + ' is in check'
        }
    }
    console.log(status)
}

socket.on('player', (msg) => {
    color = msg.color;
    numPlayers = msg.numPlayers;
    if (numPlayers === 2) {
        play = true;
        socket.emit('play', msg.roomId);
    }
    // CZ: Remove
    console.log(color)
    const config = {
        draggable: true,
        position: 'start',
        showNotation: true,
        orientation: color,
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    }
    board = Chessboard('myBoard', config);
})

// For player already in room
socket.on('play', function (msg) {
    if (msg === joinedRoomId) {
        play = true;
    }
})

// Check for moves from other player
socket.on('move', function (msg) {
    if (msg.roomId === joinedRoomId) {
        game.move(msg.move);
        board.position(game.fen());
        console.log("moved");
    }
});