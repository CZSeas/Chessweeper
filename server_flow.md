- Client connects to '/' and session started

- Redirect to '/home'

- Wait for login info from client post

- Save data in session and then redirect to '/play'

- Serve game html file to client

- game-client.js started clientside and synchronous AJAX get request sent to '/login'

- '/login' sends response containing data saved in session

- Client uses response data to start socket with relevant auth

- Session middleware for socket [not sure what the point of this is]

- Client joins socketIO room corresponding to roomID from auth

- Server emits 'player'

- Client emits 'setup' if both players joined

- Server broadcasts 'setup' to all players in room

- Client does nothing and emits 'configOptions' [WIP]

- Server configures room options

~~- If mines are enabled, emits 'setMines' to self client socket, else emits 'ready' to other player in room~~

- Waits for both players to set all their mines and emits ready to other player

- Play boolean set to true and game starts [WIP]



