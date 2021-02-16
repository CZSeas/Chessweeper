// COMPLETE: Decrement hidden bombs when exploded
// COMPLETE: Handle refresh by setting up sessionId game room check

const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const cookieParser = require('cookie-parser');
const session = require('express-session')

const express = require('express');

const app = express()
const server = http.createServer(app)
const io = socketIO(server);

const publicPath = path.join(__dirname, '/../public')
const staticPath = path.join(__dirname, '/../static')

/* ------------------------EXPRESS SERVER------------------------------------- */

// Starts the server
// Change port as needed
const port = process.env.PORT || 3333;
server.listen(port, function () {
    console.log('Server started on port ' + port);
})

// Create session
const sessionMiddleware = session({
    secret: "cool calamari"
});

app.use(express.static(publicPath));
app.use('/static', express.static(staticPath));

app.use(express.urlencoded());
app.use(express.json());
app.use(cookieParser());

app.use(sessionMiddleware);

// Force HTTPS for live
app.use(function(req, res, next) {
    if ((req.get('X-Forwarded-Proto') !== 'https') && process.env.PORT) {
        res.redirect('https://' + req.get('Host') + req.url);
    } else
        next();
});

// Runs function for every socket that connects
io.use(function (socket, next) {
    // Create session for connecting socket
    sessionMiddleware(socket.request, {}, next);
});

// Redirect to home
app.get('/', function (req, res) {
    res.redirect('/home');
})

// Handles get requests (loads front page game.html)
app.get('/home', function (req, res) {
    res.sendFile(path.join(publicPath, 'html/home.html'));
})

// Redirect to play
app.post('/home', function (req, res) {
    req.session.username = req.body.username;
    req.session.roomId = req.body.roomId;
    req.session.connections = 0;
    req.session.save(() => {
        res.redirect('/play');
    })
})

app.get('/play', function (req, res) {
    res.sendFile(path.join(publicPath, 'html/game.html'));
})


/* ----------------------------SOCKET IO------------------------------------- */

const columns = 'abcdefgh';

let sessions = {}; // Set of users
let rooms = {}; // Set of rooms

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

function mapIdx(i, j) {
    let square = columns[j] + (i+1).toString();
    return square;
}

// Does something when a client connects
io.on('connection', (socket) => {

    const session = socket.request.session;
    session.connections++;
    session.save();
    sessions[session.id] = session;

    // TODO: dictionary session.id to username, set room options [WIP]

    let username = session.username;
    let sessionId = session.id;
    let roomId = session.roomId;
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

    function configureOptions (options) {
        if (options.mines) {
            let mineOptions = options.mineOptions;
            rooms[roomId][sessionId].maxFBombs = mineOptions.numFriendlyBombs;
            rooms[roomId][sessionId].maxNBombs = mineOptions.numNeutralBombs;
            rooms[roomId][sessionId].hBombs = zeros([8, 8]);
            rooms[roomId][sessionId].fBombs = zeros([8, 8]);
            rooms[roomId][sessionId].nBombs = zeros([8, 8]);
            rooms[roomId][sessionId].numFBombs = 0;
            rooms[roomId][sessionId].numNBombs = 0;
        }
    }

    // TODO: implement set bombs
    socket.on('configOptions', () => {
        configureOptions(roomOptions);
    })

    socket.on('play', () => {
        io.to(roomId).emit('play');
        rooms[roomId][sessionId].playing = true;
    })

    socket.on('ready', () => {
        rooms[roomId][sessionId].ready = true;
    })

    // Join room given by roomId and find numPlayers in room
    socket.join(roomId);

    // Pass game to other player
    socket.on('getGame', (game) => {
        let data = {
            fen: game.fen,
            color: rooms[roomId][game.sessionId].color,
            roomOptions: roomOptions,
            headerText: rooms[roomId][game.sessionId].headerText,
            ready: rooms[roomId][game.sessionId].ready,
            playing: rooms[roomId][game.sessionId].playing
        }
        socket.to(roomId).emit('loadGame', data);
    })

    // Check if room contains sessionId
    if (rooms[roomId] && sessionId in rooms[roomId]) {
        socket.to(roomId).emit('getGame', sessionId);
    }
    else {
        // If 1 player then white, if 2 players then black, otherwise full.
        // let numPlayers = io.sockets.adapter.rooms.get(roomId).size;
        let numPlayers;
        if (rooms[roomId]) {
            numPlayers = Object.keys(rooms[roomId]).length;
        } else {
            numPlayers = 0;
        }
        if (numPlayers <= 1) {
            if (numPlayers === 0) {
                rooms[roomId] = {};
            }
            rooms[roomId][sessionId] = {};
            console.log('player ' + username + ' connected to room ' + roomId);
            // the first player to join the room gets white
            if (numPlayers === 1) {
                color = 'black';
            } else {
                color = 'white';
            }
            rooms[roomId][sessionId].color = color;
            numPlayers++;
            // Send initial data to client socket
            socket.emit('player', {
                sessionId,
                numPlayers,
                color,
                roomOptions
            })

        } else {
            // TODO: redirect when full, probe room size before login
            socket.emit('full', roomId);
        }
    }


    // The client side emits a 'move' event when a valid move has been made.
    socket.on('move', function (move) {
        socket.to(roomId).emit('move', move);
        // TODO: add other bomb types
        let type = 'f'
        let [i, j] = mapFen(move.to)
        if (rooms[roomId][sessionId].hBombs !== undefined && rooms[roomId][sessionId].hBombs[i][j] === 1) {
            io.to(roomId).emit('explodeBomb', {
                square: move.to,
                type: type,
                i: i,
                j: j
            })
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
        session.connections--;
        session.save();
        // Set 3s timeout to handle refresh
        setTimeout(function () {
            if (sessions[sessionId].connections === 0) {
                // TODO: dictionary of sessionIds does nothing right now
                delete rooms[roomId][sessionId];
                console.log('player ' + sessionId + ' disconnected from Room ' + roomId);
                io.to(roomId).emit('gameOver', color === 'white' ? 'black' : 'white');
            }
        }, 3000);
        // console.log('player ' + username + ' disconnected from room ' + roomId);
        // io.to(roomId).emit('gameOver', color === 'white' ? 'black' : 'white');
    })


/* ----------------------------BOMB MECHANICS--------------------------------------------- */
    // TODO: refactor away from maxbombs == ready
    // TODO: add other bomb types
    let tempFBombs = zeros([8, 8]);
    let tempNumFBombs = 0;

    socket.on('addBomb', function (msg) {
        let square = msg.square;
        let [i, j] = mapFen(square);
        if (msg.type === 'f') {
            if (tempNumFBombs < rooms[roomId][sessionId].maxFBombs && tempFBombs[i][j] !== 1
                    && !rooms[roomId][sessionId].ready) {

                // TODO: add bombs to temporary queue until confirmation
                tempNumFBombs++;
                tempFBombs[i][j] = 1;

                socket.emit('highlightBomb', {
                    square: square,
                    type: msg.type
                })
            } else if (tempFBombs[i][j] === 1 && !rooms[roomId][sessionId].ready) {
                tempNumFBombs--;
                tempFBombs[i][j] = 0;
                socket.emit('unhighlightBomb', {
                    square: square,
                    type: msg.type
                })
            }
        } else if (msg.type === 'n') {
            // TODO: implement and fade highlight out over time;
            // if (rooms[roomId][sessionId].numNBombs < rooms[roomId][sessionId].maxNBombs) {
            //     rooms[roomId][sessionId].numNBombs++;
            //     rooms[roomId][sessionId].nBombs[i][j] = 1;
            //     socket.emit('highlightBomb', {
            //         square: square,
            //         type: msg.type
            //     })
            // }
        }
    })

    socket.on('confirmBombs', () => {
        for (let i = 0; i < tempFBombs.length; i++) {
            for (let j = 0; j < tempFBombs[0].length; j++) {
                if (tempFBombs[i][j] === 1) {
                    rooms[roomId][sessionId].numFBombs++;
                    rooms[roomId][sessionId].fBombs[i][j] = 1;
                    // Add bombs to opponent hBombs
                    socket.to(roomId).emit('addHiddenBomb', {i: i, j: j})
                }
            }
        }
        rooms[roomId][sessionId].ready = true;
        socket.to(roomId).emit('opponentReady');
    })

    socket.on('addHiddenBomb', function (msg) {
        // TODO: try to fix the rooms[roomId][sessionId].hBombs bug
        if (rooms[roomId][sessionId].hBombs) {
            rooms[roomId][sessionId].hBombs[msg.i][msg.j] = 1;
        }
    })

    socket.on('removeBomb', function (msg) {
        if (msg.type === 'f') {
            rooms[roomId][sessionId].fBombs[msg.i][msg.j] = 0;
            rooms[roomId][sessionId].hBombs[msg.i][msg.j] = 0;
        } else {
            // TODO: do something
        }
    })

    socket.on('highlightBombs', () => {
        // TODO: highlight other types of bombs
        let fBombs = rooms[roomId][sessionId].fBombs
        for (let i = 0; i < fBombs.length; i++) {
            for (let j = 0; j < fBombs[0].length; j++) {
                if (fBombs[i][j] === 1) {
                    let square = mapIdx(i, j);
                    socket.emit('highlightBomb', {
                        square: square,
                        type: 'f'
                    })
                }
            }
        }

    })

    socket.on('getBombsAdjacent', function (square) {
        let numAdjacent = getBombsAdjacent(square);
        socket.emit('getBombsAdjacent', numAdjacent);
    })


    function getBombsAdjacent (square) {
        let [row, col] = mapFen(square);
        let numAdjacent = 0;
        for (let i = Math.max(0, row - 1); i <= Math.min(7, row + 1); i++) {
            for (let j = Math.max(0, col - 1); j <= Math.min(7, col + 1); j++) {
                if (!rooms[roomId][sessionId].hBombs) break;
                if (rooms[roomId][sessionId].hBombs[i][j] === 1) {
                    numAdjacent++;
                }
                if (rooms[roomId][sessionId].fBombs[i][j] === 1) {
                    numAdjacent++;
                }
            }
        }
        return numAdjacent;
    }

/* ----------------------------VISUAL------------------------------------------------- */

    socket.on('setHeader', (str) => {
        rooms[roomId][sessionId].headerText = str;
    })

    socket.on('unhighlightBomb', (msg) => {
        socket.emit('unhighlightBomb', msg);
    })

    // Check if the move square is a bomb and returns bool
    // socket.on('checkBomb', function (target) {
    //     let isBomb = false;
    //     if (rooms[roomId][sessionId].hBombs) {
    //         let [i, j] = mapFen(target)
    //         if (rooms[roomId][sessionId].hBombs[i][j] === 1) {
    //             isBomb = true;
    //         }
    //     }
    //     socket.emit('isBomb', isBomb);
    // })

    // // explode a bomb
    // socket.on('explodeBomb', function (square) {
    //     io.to(roomId).emit('explodeBomb', square);
    // })

    // socket.on('skipTurn', () => {
    //     socket.emit('skipTurn');
    // })
})




