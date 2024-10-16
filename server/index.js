import express from 'express'
import logger from 'morgan'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import pool from './db.js'

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
//Server es una clase de socket.io que se utiliza para crear una instancia del servidor de WebSocket. 
//Se pasa el servidor HTTP (server) como argumento al constructor de Server
const io = new Server(server, {
  connectionStateRecovery: {}  //Este es un objeto de configuración opcional. 
                            //Habilita la recuperación del estado de conexión en caso de desconexiones. 
                            //Permite que los clientes recuperen su estado anterior (por ejemplo, mensajes antiguos) cuando se reconectan. 
                            //El objeto vacío {} significa que se está habilitando la recuperación del estado sin configuraciones adicionales.
})

//Diferencia entre socket e io
//io: Se usa para emitir eventos a todos los clientes conectados, manejar conexiones y desconexiones globales, y para enviar mensajes a todos los clientes simultáneamente.
//socket: Se usa para manejar eventos específicos de un cliente, como recibir mensajes de ese cliente o emitir mensajes solo a ese cliente.
io.on('connection', async (socket) => {
  console.log('a user has connected!')

  socket.on('disconnect', () => {
    console.log('an user has disconnected')
  })

  socket.on('chat message', async (msg) => {
    const username = socket.handshake.auth.username ?? 'anonymous'
    console.log({ username })
    let result
    try {
      [result] = await pool.execute(
        'INSERT INTO messages (content, user) VALUES (?, ?)',
        [msg, username]
      );
    } catch (e) {
      console.error(e)
      return
    }

    io.emit('chat message', msg, result.insertId.toString(), username);
  })

  if (!socket.recovered) {  //Recupera los mensajes que podrian haberse perdido en una desconexion
    try {
      const [results] = await pool.execute(
        'SELECT id, content, user FROM messages WHERE id > ?',
        [socket.handshake.auth.serverOffset ?? 0]
      );

      results.forEach(row => {
        socket.emit('chat message', row.content, row.id.toString(), row.user)
      })
    } catch (e) {
      console.error(e)
    }
  }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
