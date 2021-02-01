const express = require('express')
const http = require('http')
const socketIO = require('socket.io')
const path = require('path')

const app = express()
const server = http.createServer(app)
const io = socketIO(server)

const publicPath = path.join(__dirname, '/../public')
const staticPath = path.join(__dirname, '/../static')

app.use(express.static(publicPath))
app.use('/static', express.static(staticPath))

// Starts the server
// Change port as needed
const port = process.env.PORT || 3333;
server.listen(port, function () {
    console.log('Server started on port ' + port)
})

const columns = 'abcdefgh';

function zeros(dimensions) {
    let array = [];
    for (let i = 0; i < dimensions[0]; ++i) {
        array.push(dimensions.length === 1 ? 0 : zeros(dimensions.slice(1)));
    }
    return array;
}

function mapFen(square) {
    let i = parseInt(square[1]) - 1;
    let j = columns.indexOf(square[0]);
    return [i, j];
}

// Does something when a client connects
io.on('connection', (socket) => {

    // TODO: Update to input roomId, dictionary socket.id to username, set room options
    let playerId = Math.floor((Math.random() * 100) + 1);
    let roomId = 1;
    let color;

    // game config
    let roomOptions = {
        mines: true,
        mineOptions: {
            // Per Side
            numNeutralBombs: 0,
            numFriendlyBombs: 2,
            allowFlags: true
        }
    }

    // bombs
    let hBombs; // hidden bombs sent by opponent
    let fBombs; // keep track of friendly bombs for adjacency
    let nBombs;
    let maxFBombs;
    let maxNBombs;
    let numFBombs;
    let numNBombs;

    function configureOptions (options) {
        if (options.mines) {
            let mineOptions = options.mineOptions;
            maxFBombs = mineOptions.numFriendlyBombs;
            maxNBombs = mineOptions.numNeutralBombs;
            hBombs = zeros([8, 8]);
            fBombs = zeros([8, 8]);
            nBombs = zeros([8, 8]);
            numFBombs = 0;
            numNBombs = 0;
        }
    }

    socket.on('configOptions', () => {
        configureOptions(roomOptions);
        // Handshake with opponent
        socket.to(roomId).emit('ready');
    })

    socket.join(roomId);
    numPlayers = io.sockets.adapter.rooms.get(roomId).size;
    if (numPlayers <= 2) {
        console.log('player ' + playerId + ' connected to Room ' + roomId);
        // the first player to join the room gets white
        if (numPlayers === 2) color = 'black';
        else color = 'white';
        // Send initial data to client socket
        socket.emit('player', {
            playerId,
            numPlayers,
            color,
            roomOptions
        })
    } else {
        socket.emit('full', roomId);
        // TODO: Uncomment after wrapping in socket.on input
        // return;
    }

    // The client side emits a 'move' event when a valid move has been made.
    socket.on('move', function (move) {
        socket.to(roomId).emit('move', move);
        // TODO: add other bombs types
        let type = 'f'
        let [i, j] = mapFen(move.to)
        if (hBombs[i][j] === 1) {
            io.to(roomId).emit('explodeBomb', {
                square: move.to,
                type: type
            })
            hBombs[i][j] = 0;
        }
    })

    // 'play' is emitted when both players have joined and the game can start
    socket.on('setup', () => {
        io.to(roomId).emit('setup');
    })

    socket.on('gameOver', function (color) {
        io.to(roomId).emit('gameOver', color);
    })

    // when the user disconnects from the server, remove him from the game room
    socket.on('disconnect', function () {
        // TODO: add way to leave room without closing tab
        console.log('player ' + playerId + ' disconnected from Room ' + roomId);
        io.to(roomId).emit('gameOver', color === 'white' ? 'black' : 'white');
    })

    /**
     * BOMB STUFF
     */

    function getBombsAdjacent (square) {
        let [row, col] = mapFen(square);
        let numAdjacent = 0;
        for (let i = Math.max(0, row - 1); i <= Math.min(7, row + 1); i++) {
            for (let j = Math.max(0, col - 1); j <= Math.min(7, col + 1); j++) {
                if (!hBombs) break;
                if (hBombs[i][j] === 1) {
                    numAdjacent++;
                }
                if (fBombs[i][j] === 1) {
                    numAdjacent++;
                }
            }
        }
        return numAdjacent;
    }

    socket.on('addHiddenBomb', function (msg) {
        // TODO: try to fix the hbombs bug
        if (hBombs) {
            hBombs[msg.i][msg.j] = 1;
        }
    })

    socket.on('getBombsAdjacent', function (square) {
        let numAdjacent = getBombsAdjacent(square);
        socket.emit('getBombsAdjacent', numAdjacent);
    })

    // add a bomb
    socket.on('addBomb', function (msg) {
        let square = msg.square;
        let [i, j] = mapFen(square);
        if (msg.type === 'f') {
            if (numFBombs < maxFBombs && fBombs[i][j] !== 1) {
                numFBombs++;
                fBombs[i][j] = 1;
                // Add bombs to opponents hBombs
                socket.to(roomId).emit('addHiddenBomb', {i: i, j: j})
                socket.emit('highlightBomb', {
                    square: square,
                    type: msg.type
                })
            }
        } else if (msg.type === 'n') {
            // TODO: fade highlight out over time;
            if (numNBombs < maxNBombs) {
                numNBombs++;
                nBombs[i][j] = 1;
                socket.emit('highlightBomb', {
                    square: square,
                    type: msg.type
                })
            }
        }
    })

    // // explode a bomb
    // socket.on('explodeBomb', function (square) {
    //     io.to(roomId).emit('explodeBomb', square);
    // })

    // socket.on('skipTurn', () => {
    //     socket.emit('skipTurn');
    // })
})

// Handles get requests (loads front page index.html)
app.get('/', function (req, res) {
    res.sendFile('/index.html')
})




